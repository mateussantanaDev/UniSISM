/**
 * Registra/revoga dispositivo push do paciente.
 *
 * v0.16: provider-agnostic (`endpoint` + `provider` no schema).
 *
 * Estratégia:
 *   - Endpoint UNIQUE globalmente. Se cidadão trocar de conta no mesmo device,
 *     UPSERT transfere o registro (com audit `PUSH_DEVICE_TRANSFERIDO`).
 *   - Provider padrão NTFY (env `PUSH_PROVIDER`). FCM mantido só como legacy.
 *   - Topic ntfy = UUIDv4 gerado pelo backend e devolvido ao cliente.
 *
 * Para ntfy: o cliente Flutter chama `POST /me/push-token` com a plataforma e
 * recebe `{topic, subscribeUrl}`. Cliente subscreve via WebSocket nesse topic.
 */
import crypto from 'node:crypto';
import { prisma } from '../../../../infrastructure/database/prisma';
import { Unprocessable } from '../../../../shared/errors';
import { logger } from '../../../../infrastructure/logger';
import { env } from '../../../../shared/env';
import type {
  PlataformaPush,
  PushProvider as PushProviderEnum,
} from '../../../../../generated/prisma';
import type { IAuditLogger } from '../../../../infrastructure/audit/PrismaAuditLogger';

export interface RegistrarPushInput {
  /**
   * Para NTFY: opcional — backend gera UUID se ausente. Se cliente já tem,
   * envia pra reusar (ex: app reabriu após reset).
   * Para FCM: obrigatório (token vem do Firebase Console).
   */
  endpoint?: string | null;
  provider: PushProviderEnum; // 'NTFY' | 'FCM' | 'WEB_PUSH'
  plataforma: 'android' | 'ios';
  appVersion?: string | null;
}

export interface RegistrarPushOutput {
  endpoint: string;          // topic (NTFY) ou token (FCM) que cliente vai subscrever
  provider: PushProviderEnum;
  subscribeUrl?: string;     // só pra NTFY: URL WebSocket pra subscribe
}

export interface AuditCtx {
  ip?: string | null;
  userAgent?: string | null;
}

/** Valida endpoint conforme provider. */
function _validarEndpoint(provider: PushProviderEnum, endpoint: string): void {
  if (provider === 'NTFY') {
    // Topic name: UUIDv4 sem hifens OU com hifens (32-36 chars), alfanum + _ -
    if (!/^[a-zA-Z0-9_-]{4,64}$/.test(endpoint)) {
      throw Unprocessable(
        'ENDPOINT_INVALIDO',
        'NTFY topic deve ter 4-64 chars (alfanuméricos + _ -)',
      );
    }
  } else if (provider === 'FCM') {
    // FCM tokens são longos (140+ chars)
    if (endpoint.length < 20) {
      throw Unprocessable('ENDPOINT_INVALIDO', 'FCM token muito curto');
    }
  } else if (provider === 'WEB_PUSH') {
    // Espera JSON serializado: { endpoint, keys: { p256dh, auth } }
    try {
      const obj = JSON.parse(endpoint) as { endpoint?: string };
      if (!obj.endpoint || !obj.endpoint.startsWith('https://')) {
        throw new Error('endpoint ausente ou não-https');
      }
    } catch {
      throw Unprocessable(
        'ENDPOINT_INVALIDO',
        'WEB_PUSH endpoint deve ser JSON {endpoint, keys}',
      );
    }
  }
}

export class RegistrarPushDispositivoUseCase {
  constructor(private readonly audit: IAuditLogger) {}

  async exec(
    contaId: string,
    input: RegistrarPushInput,
    ctx: AuditCtx = {},
  ): Promise<RegistrarPushOutput> {
    const provider = input.provider;
    const plataforma = input.plataforma.toUpperCase() as PlataformaPush;
    if (plataforma !== 'ANDROID' && plataforma !== 'IOS') {
      throw Unprocessable('PLATAFORMA_INVALIDA', 'plataforma deve ser android ou ios');
    }

    // Para NTFY: cliente pode pedir reuso de topic OU backend gera novo
    let endpoint: string;
    if (provider === 'NTFY') {
      if (input.endpoint && input.endpoint.trim().length > 0) {
        endpoint = input.endpoint.trim();
      } else {
        // Gera topic seguro: prefixo + UUIDv4 (sem hífens) → 36 chars total
        endpoint = `unisism-${crypto.randomUUID().replace(/-/g, '')}`;
      }
    } else {
      if (!input.endpoint || input.endpoint.trim().length === 0) {
        throw Unprocessable(
          'ENDPOINT_OBRIGATORIO',
          `endpoint é obrigatório para provider ${provider}`,
        );
      }
      endpoint = input.endpoint.trim();
    }
    _validarEndpoint(provider, endpoint);

    // UPSERT: se endpoint já existe (potencialmente em outra conta), transfere.
    const existente = await prisma.pacienteDispositivo.findUnique({
      where: { endpoint },
      select: { id: true, contaId: true, provider: true },
    });

    const transferiu = existente !== null && existente.contaId !== contaId;

    const registro = await prisma.pacienteDispositivo.upsert({
      where: { endpoint },
      create: {
        contaId,
        endpoint,
        provider,
        plataforma,
        appVersion: input.appVersion ?? null,
      },
      update: {
        contaId,
        provider,
        plataforma,
        appVersion: input.appVersion ?? null,
        ultimaAtividade: new Date(),
        // Reset falhas ao re-registrar (cliente provavelmente teve token renovado)
        falhasConsecutivas: 0,
      },
    });

    if (transferiu) {
      await this.audit.registrar({
        acao: 'PUSH_DEVICE_TRANSFERIDO',
        recurso: 'PacienteDispositivo',
        recursoId: registro.id,
        atendenteId: null,
        payload: {
          contaIdAnterior: existente!.contaId,
          contaIdNovo: contaId,
          provider,
        },
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
    } else {
      await this.audit.registrar({
        acao: existente ? 'PUSH_DEVICE_ATUALIZADO' : 'PUSH_DEVICE_REGISTRADO',
        recurso: 'PacienteDispositivo',
        recursoId: registro.id,
        atendenteId: null,
        payload: { provider, plataforma },
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
    }

    logger.debug(
      { contaId, provider, plataforma, transferiu },
      '[push] device registrado',
    );

    const out: RegistrarPushOutput = { endpoint, provider };
    if (provider === 'NTFY' && env.NTFY_BASE_URL) {
      const base = env.NTFY_BASE_URL.replace(/\/+$/, '');
      // Cliente Flutter usa wss:// pra WebSocket persistente
      out.subscribeUrl = `${base.replace(/^http/, 'ws')}/${endpoint}/ws`;
    }
    return out;
  }
}

export class RevogarPushDispositivoUseCase {
  constructor(private readonly audit: IAuditLogger) {}

  async exec(
    contaId: string,
    endpoint: string | null,
    ctx: AuditCtx = {},
  ): Promise<{ removidos: number }> {
    let removidos = 0;
    if (endpoint) {
      // Remove um device específico (logout daquele device)
      const r = await prisma.pacienteDispositivo.deleteMany({
        where: { contaId, endpoint },
      });
      removidos = r.count;
    } else {
      // Sem endpoint → remove TODOS os devices da conta (logout total)
      const r = await prisma.pacienteDispositivo.deleteMany({ where: { contaId } });
      removidos = r.count;
    }

    await this.audit.registrar({
      acao: 'PUSH_DEVICE_REVOGADO',
      recurso: 'PacienteDispositivo',
      recursoId: undefined,
      atendenteId: null,
      payload: {
        contaId,
        endpointMasked: endpoint ? endpoint.slice(0, 12) + '***' : null,
        removidos,
        modo: endpoint ? 'specific' : 'all',
      },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    logger.debug({ contaId, removidos }, '[push] devices removidos');
    return { removidos };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Adapters para retrocompat: rotas antigas `/me/fcm-token` recebiam
// `{fcmToken, plataforma, appVersion}`. Mantemos handlers que delegam pros
// novos use cases mapeando `fcmToken → endpoint` + `provider: FCM`.
// ─────────────────────────────────────────────────────────────────────────

export class RegistrarFcmPacienteUseCase {
  constructor(private readonly inner: RegistrarPushDispositivoUseCase) {}
  async exec(
    contaId: string,
    fcmToken: string,
    plataforma: 'android' | 'ios',
    appVersion: string | null,
  ): Promise<void> {
    await this.inner.exec(contaId, {
      provider: 'FCM',
      endpoint: fcmToken,
      plataforma,
      appVersion,
    });
  }
}

export class RevogarFcmPacienteUseCase {
  constructor(private readonly inner: RevogarPushDispositivoUseCase) {}
  async exec(contaId: string, fcmToken: string | null): Promise<void> {
    await this.inner.exec(contaId, fcmToken);
  }
}
