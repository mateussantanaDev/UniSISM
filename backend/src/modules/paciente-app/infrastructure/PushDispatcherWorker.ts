/**
 * Worker dispatcher de push notifications.
 *
 * Polling loop que processa `NotificacaoPaciente` com `pushStatus=PENDENTE`,
 * envia pro `IPushProvider` configurado, atualiza status.
 *
 * Estratégia:
 *   - Lê em batch (default 50) por iteração
 *   - Para cada notificação: busca dispositivos da conta → envia em paralelo
 *   - Retry exponencial: 0min, 1min, 5min, 30min (4 tentativas máx)
 *   - Após esgotar tentativas → `EXCEDIDO` (dead-letter)
 *   - Sem dispositivo → `SEM_DEVICE` (não-retry)
 *   - Falha permanente (token inválido) → remove device + marca `FALHOU`
 *
 * Loop default: 15s. Override via env `PUSH_DISPATCHER_INTERVAL_MS`.
 *
 * Stop graceful: aguarda batch atual terminar antes de parar.
 *
 * Audit: cada envio gera entrada em `auditoria_logs`:
 *   - `PUSH_ENVIADO_OK` (sucesso, batch level)
 *   - `PUSH_TENTATIVA_FALHOU` (retryable, vai tentar de novo)
 *   - `PUSH_EXCEDIDO` (dead-letter — alerta operacional)
 *   - `PUSH_DEVICE_REMOVIDO_FALHA_PERMANENTE`
 */
import { prisma } from '../../../infrastructure/database/prisma';
import { logger } from '../../../infrastructure/logger';
import type { IPushProvider, PushPayload } from '../../../infrastructure/push/IPushProvider';
import type { IAuditLogger } from '../../../infrastructure/audit/PrismaAuditLogger';
import type { IEmailService } from '../../../infrastructure/email/EmailService';

/** Tipos de notificação que devem ter fallback por email (alta prioridade). */
const TIPOS_FALLBACK_EMAIL = new Set([
  'APROVADO',
  'REJEITADO',
  'AGENDADO',
  'PENDENCIA_REGISTRADA',
  'RESPOSTA_SUS_DISPONIVEL',
]);

const MAX_TENTATIVAS = 4;
// Backoff em minutos: 0 (first try), 1, 5, 30
const BACKOFF_MIN = [0, 1, 5, 30] as const;
const BATCH_SIZE = 50;
const DEFAULT_INTERVAL_MS = 15 * 1000;

export class PushDispatcherWorker {
  private timer: NodeJS.Timeout | null = null;
  private rodando = false;
  private parando = false;

  constructor(
    private readonly provider: IPushProvider,
    private readonly audit: IAuditLogger,
    private readonly email?: IEmailService,
  ) {}

  start(): void {
    const intervalMs = Number(process.env['PUSH_DISPATCHER_INTERVAL_MS']) || DEFAULT_INTERVAL_MS;
    if (!this.provider.isReady()) {
      logger.warn({ provider: this.provider.name }, '[push-worker] provider não pronto — worker ativo mas sem envios');
    }
    logger.info(
      { provider: this.provider.name, intervalMs },
      '✓ push dispatcher worker iniciado',
    );

    const tick = async () => {
      if (this.parando || this.rodando) return;
      this.rodando = true;
      try {
        await this._processarBatch();
      } catch (err) {
        logger.error({ err }, '[push-worker] erro em _processarBatch');
      } finally {
        this.rodando = false;
      }
    };

    // Tick inicial + intervalo
    void tick();
    this.timer = setInterval(() => void tick(), intervalMs);
  }

  async stop(): Promise<void> {
    this.parando = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Aguarda batch corrente terminar
    const tInicio = Date.now();
    while (this.rodando && Date.now() - tInicio < 10_000) {
      await new Promise((r) => setTimeout(r, 100));
    }
    logger.info('push dispatcher worker parado');
  }

  /** Processa UMA batch. Exportado para smoke test rodar manualmente. */
  async _processarBatch(): Promise<{ processadas: number; ok: number; falhas: number }> {
    const agora = new Date();
    // Pega TODAS as PENDENTE (filtro de backoff é feito no app side abaixo, pois
    // o cálculo depende de `pushTentativas` + tabela `BACKOFF_MIN` JS-only).
    const candidatos = await prisma.notificacaoPaciente.findMany({
      where: { pushStatus: 'PENDENTE' },
      take: BATCH_SIZE,
      orderBy: { criadaEm: 'asc' },
    });

    if (candidatos.length === 0) return { processadas: 0, ok: 0, falhas: 0 };

    let ok = 0;
    let falhas = 0;
    for (const notif of candidatos) {
      // Backoff check
      const tentativas = notif.pushTentativas;
      if (tentativas > 0 && notif.pushUltimaTentativaEm) {
        const backoffMin = BACKOFF_MIN[Math.min(tentativas, BACKOFF_MIN.length - 1)] ?? 30;
        const proximaEm =
          notif.pushUltimaTentativaEm.getTime() + backoffMin * 60_000;
        if (proximaEm > agora.getTime()) continue; // ainda em backoff
      }

      const resultado = await this._processarNotificacao(notif);
      if (resultado === 'ok') ok++;
      else if (resultado === 'falha') falhas++;
    }

    return { processadas: candidatos.length, ok, falhas };
  }

  /** Processa UMA notificação. Retorna `ok | falha | skip`. */
  private async _processarNotificacao(notif: {
    id: string;
    contaId: string;
    tipo: string;
    titulo: string;
    corpo: string;
    payload: unknown;
    pushTentativas: number;
  }): Promise<'ok' | 'falha' | 'skip'> {
    // 1. Busca dispositivos da conta
    const dispositivos = await prisma.pacienteDispositivo.findMany({
      where: { contaId: notif.contaId },
      select: { id: true, endpoint: true, provider: true, falhasConsecutivas: true },
    });

    if (dispositivos.length === 0) {
      await prisma.notificacaoPaciente.update({
        where: { id: notif.id },
        data: {
          pushStatus: 'SEM_DEVICE',
          pushUltimaTentativaEm: new Date(),
        },
      });
      // Fallback: tipos urgentes vão por email se possível
      if (TIPOS_FALLBACK_EMAIL.has(notif.tipo)) {
        await this._enviarFallbackEmail(notif);
      }
      return 'skip';
    }

    // 2. Constrói payload comum
    const deepLink = this._extrairDeepLink(notif.payload);
    const pushPayload: PushPayload = {
      titulo: notif.titulo,
      corpo: notif.corpo,
      tipo: notif.tipo,
      notificacaoId: notif.id,
      prioridade: this._prioridadePorTipo(notif.tipo),
      ...(deepLink ? { deepLink } : {}),
    };

    // 3. Envia em paralelo pra todos os devices (filtrando os do mesmo provider configurado).
    //    Devices de provider != configurado são pulados (push fica `EXCEDIDO` se for o único provider).
    const dispDoProviderAtual = dispositivos.filter(
      (d) => d.provider === this.provider.name,
    );

    if (dispDoProviderAtual.length === 0) {
      // Não tem device do provider atual — marca SEM_DEVICE pra esse tipo de envio
      await prisma.notificacaoPaciente.update({
        where: { id: notif.id },
        data: {
          pushStatus: 'SEM_DEVICE',
          pushUltimaTentativaEm: new Date(),
          pushErro: `Sem device do provider ${this.provider.name} (devices: ${dispositivos.map((d) => d.provider).join(',')})`,
        },
      });
      return 'skip';
    }

    const envios = await Promise.all(
      dispDoProviderAtual.map((d) =>
        this.provider.enviar(d.endpoint, pushPayload).then((r) => ({ dispositivo: d, r })),
      ),
    );

    const algumOk = envios.some((e) => e.r.ok);
    const algumRetryable = envios.some((e) => !e.r.ok && e.r.retryable);

    // 4. Atualiza devices: reset falhas em sucesso, incrementa em falha permanente
    for (const { dispositivo, r } of envios) {
      if (r.ok) {
        await prisma.pacienteDispositivo.update({
          where: { id: dispositivo.id },
          data: {
            falhasConsecutivas: 0,
            ultimoSucessoEm: new Date(),
            ultimaAtividade: new Date(),
          },
        });
      } else if (!r.retryable) {
        // Falha permanente (token inválido, topic não existe)
        const novasFalhas = dispositivo.falhasConsecutivas + 1;
        if (novasFalhas >= 3) {
          // 3 falhas permanentes → remove device
          await prisma.pacienteDispositivo.delete({ where: { id: dispositivo.id } });
          await this.audit.registrar({
            acao: 'PUSH_DEVICE_REMOVIDO_FALHA_PERMANENTE',
            recurso: 'PacienteDispositivo',
            recursoId: dispositivo.id,
            atendenteId: null,
            payload: { erro: r.erro, status: r.status, falhasConsecutivas: novasFalhas },
          });
        } else {
          await prisma.pacienteDispositivo.update({
            where: { id: dispositivo.id },
            data: { falhasConsecutivas: novasFalhas },
          });
        }
      }
    }

    // 5. Atualiza status da notificação
    const novasTentativas = notif.pushTentativas + 1;
    const ultimaTentativa = new Date();

    if (algumOk) {
      await prisma.notificacaoPaciente.update({
        where: { id: notif.id },
        data: {
          pushStatus: 'ENVIADO',
          pushTentativas: novasTentativas,
          pushUltimaTentativaEm: ultimaTentativa,
          pushEnviadoEm: ultimaTentativa,
          pushErro: null,
        },
      });
      await this.audit.registrar({
        acao: 'PUSH_ENVIADO_OK',
        recurso: 'NotificacaoPaciente',
        recursoId: notif.id,
        atendenteId: null,
        payload: {
          provider: this.provider.name,
          devices: envios.length,
          tentativa: novasTentativas,
          tipo: notif.tipo,
        },
      });
      return 'ok';
    }

    // Todos os envios falharam
    const erroAgregado = envios
      .map((e) => `${e.dispositivo.endpoint.slice(0, 12)}***: ${e.r.erro ?? 'unknown'}`)
      .join(' | ');

    if (algumRetryable && novasTentativas < MAX_TENTATIVAS) {
      // Mantém PENDENTE, incrementa tentativas, será retry na próxima iteração
      await prisma.notificacaoPaciente.update({
        where: { id: notif.id },
        data: {
          pushStatus: 'PENDENTE',
          pushTentativas: novasTentativas,
          pushUltimaTentativaEm: ultimaTentativa,
          pushErro: erroAgregado.slice(0, 1000),
        },
      });
      await this.audit.registrar({
        acao: 'PUSH_TENTATIVA_FALHOU',
        recurso: 'NotificacaoPaciente',
        recursoId: notif.id,
        atendenteId: null,
        payload: {
          tentativa: novasTentativas,
          maxTentativas: MAX_TENTATIVAS,
          erro: erroAgregado.slice(0, 500),
        },
      });
    } else {
      // Esgotou tentativas OU todos não-retryable → dead-letter
      await prisma.notificacaoPaciente.update({
        where: { id: notif.id },
        data: {
          pushStatus: novasTentativas >= MAX_TENTATIVAS ? 'EXCEDIDO' : 'FALHOU',
          pushTentativas: novasTentativas,
          pushUltimaTentativaEm: ultimaTentativa,
          pushErro: erroAgregado.slice(0, 1000),
        },
      });
      await this.audit.registrar({
        acao: novasTentativas >= MAX_TENTATIVAS ? 'PUSH_EXCEDIDO' : 'PUSH_FALHOU_PERMANENTE',
        recurso: 'NotificacaoPaciente',
        recursoId: notif.id,
        atendenteId: null,
        payload: {
          tentativa: novasTentativas,
          erro: erroAgregado.slice(0, 500),
        },
      });
      // Fallback email para tipos urgentes
      if (TIPOS_FALLBACK_EMAIL.has(notif.tipo)) {
        await this._enviarFallbackEmail(notif);
      }
    }
    return 'falha';
  }

  /**
   * Envia notificação via email quando push falha/não tem device.
   * Best-effort: falha silenciosa (audit registra resultado).
   */
  private async _enviarFallbackEmail(notif: {
    id: string;
    contaId: string;
    tipo: string;
    titulo: string;
    corpo: string;
  }): Promise<void> {
    if (!this.email) return;
    try {
      const conta = await prisma.pacienteConta.findUnique({
        where: { id: notif.contaId },
        select: { email: true, nome: true },
      });
      if (!conta?.email) return;
      const primeiroNome = conta.nome.trim().split(/\s+/)[0] ?? '';
      await this.email.enviar({
        to: conta.email,
        subject: `UNISISM · ${notif.titulo}`,
        text:
          `Olá, ${primeiroNome}.\n\n` +
          `${notif.corpo}\n\n` +
          `Abra o app UNISISM para mais detalhes.\n\n` +
          `Secretaria Municipal de Saúde · Águas Belas / PE`,
      });
      await this.audit.registrar({
        acao: 'PUSH_FALLBACK_EMAIL_OK',
        recurso: 'NotificacaoPaciente',
        recursoId: notif.id,
        atendenteId: null,
        payload: { tipo: notif.tipo },
      });
    } catch (err) {
      logger.warn({ err, notificacaoId: notif.id }, '[push-worker] email fallback falhou');
      await this.audit.registrar({
        acao: 'PUSH_FALLBACK_EMAIL_FALHOU',
        recurso: 'NotificacaoPaciente',
        recursoId: notif.id,
        atendenteId: null,
        payload: { tipo: notif.tipo, erro: (err as Error).message },
      });
    }
  }

  /** Prioridade ntfy (1-5) baseada no tipo da notificação. */
  private _prioridadePorTipo(tipo: string): 1 | 2 | 3 | 4 | 5 {
    if (tipo === 'AGENDADO' || tipo === 'PENDENCIA_REGISTRADA') return 5; // max — sino + vibra
    if (tipo === 'APROVADO' || tipo === 'REJEITADO') return 4; // high
    if (tipo === 'RESPOSTA_SUS_DISPONIVEL') return 4;
    return 3; // default
  }

  private _extrairDeepLink(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as { protocolo?: string; encaminhamentoId?: string };
    if (p.encaminhamentoId) {
      return `unisism://encaminhamento/${p.encaminhamentoId}`;
    }
    return null;
  }
}
