import { TipoEventoTimeline } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { BadRequest, NotFound } from '../../../../shared/errors';

export interface RemarcarEncaminhamentoInput {
  encaminhamentoId: string;
  novaData: string; // YYYY-MM-DD
  novoHorario: string; // HH:mm
  unidadeDestino?: string;
  motivo: string;
  atendente: {
    id: string;
    nome: string;
  };
}

export class RemarcarEncaminhamentoRegulacaoUseCase {
  async exec(input: RemarcarEncaminhamentoInput, scope: AccessScope): Promise<Encaminhamento> {
    if (!input.motivo || input.motivo.trim().length < 5) {
      throw BadRequest('MOTIVO_OBRIGATORIO', 'Descreva o motivo da remarcação (mínimo 5 caracteres).');
    }

    if (!input.novaData || !input.novoHorario) {
      throw BadRequest('DATA_HORARIO_OBRIGATORIOS', 'Informe a nova data e novo horário.');
    }

    const row = await prisma.encaminhamento.findUnique({
      where: { id: input.encaminhamentoId },
      include: INCLUDE_ENCAMINHAMENTO_FULL,
    });

    if (!row) {
      throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não localizado na fila de regulação.');
    }

    const newAgendamentoDate = new Date(`${input.novaData}T${input.novoHorario}:00.000Z`);

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Insere evento de auditoria no histórico da timeline (tipo: REMARCACAO)
      await tx.eventoTimeline.create({
        data: {
          encaminhamentoId: row.id,
          tipo: (TipoEventoTimeline as any).REMARCACAO || TipoEventoTimeline.AGENDADO,
          titulo: 'Atendimento Remarcado na Regulação',
          descricao: `Remarcado para ${input.novaData} às ${input.novoHorario}. Unidade: ${input.unidadeDestino || row.localAgendamento || 'Centro de Especialidades'}. Motivo: ${input.motivo}`,
          autor: input.atendente.nome,
          autorPapel: 'Regulação / Recepção · Centro de Especialidades',
        },
      });

      // 2. Atualiza agendamentoPrevisto preservando criadoEm, prioridade e posição na fila
      const res = await tx.encaminhamento.update({
        where: { id: row.id },
        data: {
          agendamentoPrevisto: newAgendamentoDate,
          ...(input.unidadeDestino && { localAgendamento: input.unidadeDestino }),
          statusAtendimentoCentro: 'AGENDADO',
        },
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });

      await tx.auditoriaLog.create({
        data: {
          acao: 'ENCAMINHAMENTO_REMARCAR_REGULACAO',
          recurso: 'REGULACAO',
          recursoId: row.id,
          atendenteId: input.atendente.id,
          payload: {
            protocolo: row.protocolo,
            novaData: input.novaData,
            novoHorario: input.novoHorario,
            motivo: input.motivo,
            prioridadePreservada: row.prioridade,
            criadoEmPreservado: row.criadoEm,
          },
        },
      });

      return res;
    });

    return rowParaEncaminhamento(updated);
  }
}
