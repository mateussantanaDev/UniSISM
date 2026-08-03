/**
 * Aprovar encaminhamento (Face 2 · SMS).
 *
 * Pré-condição (gate):
 *   status === 'AGUARDANDO_REGULACAO'   → senão 409 ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO
 *
 * Isolamento:
 *   - O `scope` (derivado do JWT) é aplicado na busca; encaminhamento de outra
 *     prefeitura → 404 ENCAMINHAMENTO_NAO_ENCONTRADO (não vaza existência).
 *
 * Transição (transação atômica):
 *   1. Se `nota` (após trim) presente → cria evento OBSERVACAO
 *   2. Cria evento APROVADO (autor = regulador autenticado)
 *   3. Se `agendamentoPrevisto` presente → cria evento AGENDADO + preenche o campo
 *   4. Atualiza status para APROVADO + atualizadoEm
 *   5. (futuro) enfileira notificação à UBS de origem
 */
import { StatusEncaminhamento } from '../../../../../generated/prisma';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import { prisma } from '../../../../infrastructure/database/prisma';
import {
  INCLUDE_ENCAMINHAMENTO_FULL,
  rowParaEncaminhamento,
} from '../../../../infrastructure/database/encaminhamentoMapper';
import { whereByScopeViaUbs } from '../../../../infrastructure/database/scopeWhere';
import { Conflict, NotFound, Unprocessable } from '../../../../shared/errors';
import type { AccessScope } from '../../../../shared/scope';
import { logger } from '../../../../infrastructure/logger';
import { publicarNaTransacao } from '../../../../infrastructure/outbox/OutboxBus';
import { encaminhamentoTransicao } from '../../../../infrastructure/metrics/prometheus';
import {
  MENSAGENS,
  NotificacaoPacienteService,
} from '../../../../infrastructure/services/NotificacaoPacienteService';
import { invalidarCacheArvorePorUbs } from '../../../../infrastructure/cache/arvoreCacheInvalidator';
import { calcularOtimizacaoAgendamento } from './OtimizadorVagas';

export interface AutorRegulacao {
  nome: string;
  papel: string; // ex.: "Regulação · SMS"
}

export interface AprovarInput {
  nota?: string;
  agendamentoPrevisto?: string; // YYYY-MM-DD
  /**
   * Local físico da consulta (endereço + sala). Mostrado no bloco verde
   * "Sua consulta" do app paciente. Sugestão de formato:
   *   "CEM · Sala 3 · Av. Getúlio Vargas, 1100 - Centro"
   *
   * Opcional, mas **recomendado preencher sempre que houver agendamento**.
   */
  localAgendamento?: string;
  /**
   * Nome + CRM do profissional agendado. Mostrado no bloco verde do app.
   * Sugestão de formato: "Dra. Beatriz Lima · CRM-PE 22189".
   */
  profissionalAgendado?: string;
  /**
   * Cidade onde a consulta ocorre — EXPLÍCITA, não derivada de parsing.
   * Usada pra calcular `podeSolicitarTfd` (compara com município da UBS).
   * Default na UI: município da UBS de origem.
   */
  cidadeAgendamento?: string;
  /** UF do agendamento. Default "BA". 2 chars. */
  ufAgendamento?: string;
  canalRoteamento?: 'SUS' | 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO' | null;
  filaDestino?: 'SUS' | 'CENTRO_ESPECIALIDADES' | 'CEM' | 'CEO' | 'CENTRO_ODONTOLOGICO' | null;
  destinoRegulacao?: 'SUS' | 'CENTRO_ESPECIALIDADES' | 'CEM' | 'CEO' | 'CENTRO_ODONTOLOGICO' | null;
  dataDisponibilidade?: string | null; // YYYY-MM-DD
}

export class AprovarEncaminhamentoUseCase {
  private readonly notificacoes = new NotificacaoPacienteService();

  async exec(
    id: string,
    scope: AccessScope,
    autor: AutorRegulacao,
    input: AprovarInput,
  ): Promise<Encaminhamento> {
    const atual = await prisma.encaminhamento.findFirst({
      where: { id, ...whereByScopeViaUbs(scope) },
    });
    if (!atual) throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    if (atual.status !== StatusEncaminhamento.AGUARDANDO_REGULACAO) {
      throw Conflict(
        'ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO',
        'Encaminhamento não está aguardando regulação.',
        { statusAtual: atual.status },
      );
    }

    let agendamento: Date | null = null;
    if (input.agendamentoPrevisto) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.agendamentoPrevisto)) {
        throw Unprocessable(
          'AGENDAMENTO_INVALIDO',
          'agendamentoPrevisto deve ser uma data no formato YYYY-MM-DD',
        );
      }
      agendamento = new Date(`${input.agendamentoPrevisto}T00:00:00.000Z`);
      if (Number.isNaN(agendamento.getTime())) {
        throw Unprocessable('AGENDAMENTO_INVALIDO', 'agendamentoPrevisto inválido');
      }
      const hojeUtc = new Date();
      hojeUtc.setUTCHours(0, 0, 0, 0);
      if (agendamento < hojeUtc) {
        throw Unprocessable('AGENDAMENTO_NO_PASSADO', 'agendamentoPrevisto deve ser hoje ou no futuro');
      }
    }

    let dataDisp: Date | null | undefined = undefined;
    if (input.dataDisponibilidade !== undefined) {
      if (input.dataDisponibilidade === null || input.dataDisponibilidade === '') {
        dataDisp = null;
      } else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dataDisponibilidade)) {
          throw Unprocessable(
            'DATA_DISPONIBILIDADE_INVALIDA',
            'dataDisponibilidade deve ser uma data no formato YYYY-MM-DD',
          );
        }
        dataDisp = new Date(`${input.dataDisponibilidade}T00:00:00.000Z`);
        if (Number.isNaN(dataDisp.getTime())) {
          throw Unprocessable('DATA_DISPONIBILIDADE_INVALIDA', 'dataDisponibilidade inválida');
        }
        const hojeUtc = new Date();
        hojeUtc.setUTCHours(0, 0, 0, 0);
        if (dataDisp < hojeUtc) {
          throw Unprocessable('DATA_DISPONIBILIDADE_NO_PASSADO', 'dataDisponibilidade deve ser hoje ou no futuro');
        }
      }
    } else {
      // Auto-calcula dataDisponibilidade com base na prioridade do atendimento
      const prio = atual.prioridade;
      const days = prio === 'URGENTE' || (prio as string) === 'EMERGENCIA' ? 1 : prio === 'PRIORITARIA' ? 7 : 15;
      const target = new Date();
      target.setDate(target.getDate() + days);
      target.setUTCHours(0, 0, 0, 0);
      dataDisp = target;
    }

    let resolvedCanal: 'SUS' | 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO' | null | undefined = input.canalRoteamento;
    const rawFila = input.filaDestino;
    if (rawFila) {
      if (rawFila === 'CEO' || rawFila === 'CENTRO_ODONTOLOGICO') {
        resolvedCanal = 'CENTRO_ODONTOLOGICO';
      } else if (rawFila === 'CENTRO_ESPECIALIDADES' || rawFila === 'CEM' || rawFila === 'SUS') {
        resolvedCanal = rawFila === 'CEM' ? 'CENTRO_ESPECIALIDADES' : rawFila;
      }
    }

    let resolvedDestino: 'SUS' | 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO' | null | undefined = undefined;
    const rawDestino = input.destinoRegulacao;
    if (rawDestino) {
      if (rawDestino === 'CEO' || rawDestino === 'CENTRO_ODONTOLOGICO') {
        resolvedDestino = 'CENTRO_ODONTOLOGICO';
        resolvedCanal = 'CENTRO_ODONTOLOGICO';
      } else if (rawDestino === 'CENTRO_ESPECIALIDADES' || rawDestino === 'CEM') {
        resolvedDestino = 'CENTRO_ESPECIALIDADES';
        resolvedCanal = 'CENTRO_ESPECIALIDADES';
      } else if (rawDestino === 'SUS') {
        resolvedDestino = 'SUS';
        resolvedCanal = 'SUS';
      }
    } else if (resolvedCanal) {
      resolvedDestino = resolvedCanal;
    }

    // Auto-detect CEO vs CEM se canal/destino não for definido explicitamente
    const isDental =
      /odont|bucomaxilo|endodont|periodont|prótese|protese|estomatol|dente|dentista/i.test(atual.especialidadeSolicitada || '') ||
      /ceo|odontol/i.test(input.localAgendamento || '');

    if (!resolvedCanal && !resolvedDestino) {
      if (isDental) {
        resolvedCanal = 'CENTRO_ODONTOLOGICO';
        resolvedDestino = 'CENTRO_ODONTOLOGICO';
      } else {
        resolvedCanal = 'CENTRO_ESPECIALIDADES';
        resolvedDestino = 'CENTRO_ESPECIALIDADES';
      }
    } else if (resolvedCanal === 'CENTRO_ODONTOLOGICO' || resolvedDestino === 'CENTRO_ODONTOLOGICO') {
      resolvedCanal = 'CENTRO_ODONTOLOGICO';
      resolvedDestino = 'CENTRO_ODONTOLOGICO';
    } else if (resolvedCanal === 'CENTRO_ESPECIALIDADES' || resolvedDestino === 'CENTRO_ESPECIALIDADES') {
      resolvedCanal = 'CENTRO_ESPECIALIDADES';
      resolvedDestino = 'CENTRO_ESPECIALIDADES';
    }

    let localAg = input.localAgendamento?.trim();
    let profAg = input.profissionalAgendado?.trim();
    let cidadeAg = input.cidadeAgendamento?.trim();
    let ufAg = input.ufAgendamento?.trim().toUpperCase();
    let notaTexto = input.nota;

    const notaLimpa = notaTexto?.trim();

    // Validações leves: se profissionalAgendado vier sem CRM, alerta no log mas aceita
    // (não vamos quebrar UX por causa de formato — a UI sugere o padrão).
    if (profAg && !/CRM/i.test(profAg)) {
      logger.warn(
        { encId: id, profissionalAgendado: profAg },
        'profissionalAgendado sem CRM detectado — UX recomenda formato "Nome · CRM-UF 00000"',
      );
    }

    // UF: 2 chars maiúsculos. Se vier inválido, ignora (não bloqueia).
    if (ufAg && !/^[A-Z]{2}$/.test(ufAg)) {
      throw Unprocessable(
        'UF_INVALIDA',
        'ufAgendamento deve ser 2 letras maiúsculas (ex.: BA, SP, RJ)',
      );
    }

    const atualizado = await prisma.$transaction(async (tx) => {
      // 1. nota → OBSERVACAO
      if (notaLimpa) {
        await tx.eventoTimeline.create({
          data: {
            encaminhamentoId: id,
            tipo: 'OBSERVACAO',
            titulo: 'Observação da Regulação',
            descricao: notaLimpa,
            autor: autor.nome,
            autorPapel: autor.papel,
          },
        });
      }
      // 2. APROVADO
      await tx.eventoTimeline.create({
        data: {
          encaminhamentoId: id,
          tipo: 'APROVADO',
          titulo: 'Encaminhamento aprovado',
          descricao: notaLimpa
            ? 'Aprovado pela Regulação com observação'
            : 'Aprovado pela Regulação',
          autor: autor.nome,
          autorPapel: autor.papel,
        },
      });
      // 3. AGENDADO (opcional)
      if (agendamento) {
        await tx.eventoTimeline.create({
          data: {
            encaminhamentoId: id,
            tipo: 'AGENDADO',
            titulo: 'Agendamento previsto',
            descricao: `Atendimento previsto para ${input.agendamentoPrevisto}`,
            autor: autor.nome,
            autorPapel: autor.papel,
          },
        });
      }
      // 4. status + agendamento + detalhes do agendamento
      const upd = await tx.encaminhamento.update({
        where: { id },
        data: {
          status: StatusEncaminhamento.APROVADO,
          agendamentoPrevisto: agendamento,
          ...(localAg !== undefined ? { localAgendamento: localAg || null } : {}),
          ...(profAg !== undefined ? { profissionalAgendado: profAg || null } : {}),
          ...(cidadeAg !== undefined ? { cidadeAgendamento: cidadeAg || null } : {}),
          ...(ufAg !== undefined ? { ufAgendamento: ufAg || null } : {}),
          ...(resolvedCanal !== undefined ? { canalRoteamento: resolvedCanal } : {}),
          ...(resolvedDestino !== undefined ? { destinoRegulacao: resolvedDestino } : {}),
          ...(dataDisp !== undefined ? { dataDisponibilidade: dataDisp } : {}),
          // Aprovação limpa motivoRejeicao residual de tentativa anterior (raro).
          motivoRejeicao: null,
        },
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });

      // 5. outbox (mesma transação → atômico)
      await publicarNaTransacao(tx, {
        eventType: 'encaminhamento.aprovado',
        aggregateType: 'Encaminhamento',
        aggregateId: id,
        payload: {
          protocolo: upd.protocolo,
          ubsId: upd.ubsId,
          agendamentoPrevisto: agendamento ? agendamento.toISOString().substring(0, 10) : null,
          aprovadoPor: autor.nome,
        },
      });

      return upd;
    });

    encaminhamentoTransicao.inc({ de: 'AGUARDANDO_REGULACAO', para: 'APROVADO' });

    logger.info(
      { encId: id, protocolo: atualizado.protocolo, ubsId: atualizado.ubsId },
      'encaminhamento aprovado',
    );

    // Notificação ao paciente (fire-and-forget)
    void this.notificacoes
      .notificar({
        cpfPaciente: atualizado.pacienteCpf,
        pacienteNome: atualizado.pacienteNome,
        encaminhamentoId: id,
        tipo: 'APROVADO',
        ...MENSAGENS.aprovado(atualizado.protocolo),
        payload: { protocolo: atualizado.protocolo },
      })
      .catch((err) => logger.warn({ err }, 'notificar APROVADO falhou'));

    if (agendamento) {
      void this.notificacoes
        .notificar({
          cpfPaciente: atualizado.pacienteCpf,
          pacienteNome: atualizado.pacienteNome,
          encaminhamentoId: id,
          tipo: 'AGENDADO',
          ...MENSAGENS.agendado(atualizado.protocolo, agendamento.toISOString()),
          payload: {
            protocolo: atualizado.protocolo,
            agendamentoPrevisto: agendamento.toISOString(),
          },
        })
        .catch((err) => logger.warn({ err }, 'notificar AGENDADO falhou'));
    }

    // Invalida cache da árvore para esta UBS e globalmente
    void invalidarCacheArvorePorUbs(atualizado.ubsId);

    return rowParaEncaminhamento(atualizado);
  }
}
