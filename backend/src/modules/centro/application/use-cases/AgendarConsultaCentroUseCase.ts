import { StatusEncaminhamento, TipoEventoTimeline } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import { calcularOtimizacaoAgendamento } from '../../../gestao/application/use-cases/OtimizadorVagas';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { ensureUbsAcessivel } from '../../../../shared/scope';
import { NotFound, BadRequest } from '../../../../shared/errors';

export interface AgendarConsultaCentroInput {
  id: string;
  profissional?: string;
  nota?: string;
  localAgendamento?: string;
  atendente: {
    id: string;
    nome: string;
    role: string;
  };
}

export class AgendarConsultaCentroUseCase {
  async exec(input: AgendarConsultaCentroInput, scope: AccessScope): Promise<Encaminhamento> {
    const row = await prisma.encaminhamento.findUnique({
      where: { id: input.id },
      include: INCLUDE_ENCAMINHAMENTO_FULL,
    });

    if (!row) {
      throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    }

    ensureUbsAcessivel(scope, { id: row.ubsId, prefeituraId: (row as any).ubs?.prefeituraId ?? '' });

    const enc = rowParaEncaminhamento(row);

    const otimizado = await calcularOtimizacaoAgendamento({
      profissional: input.profissional,
      nota: input.nota,
      especialidade: enc.solicitacao.especialidadeSolicitada,
      prioridade: enc.solicitacao.prioridade,
    });

    const localAg = input.localAgendamento || row.localAgendamento || 'Centro Municipal de Especialidades';

    const updated = await prisma.$transaction(async (tx) => {
      // Append timeline entry
      await tx.eventoTimeline.create({
        data: {
          encaminhamentoId: row.id,
          tipo: TipoEventoTimeline.AGENDADO,
          titulo: 'Consulta Agendada · Centro de Especialidades',
          descricao: `Agendado para ${otimizado.dateStr} às ${otimizado.timeStr} no local ${localAg}. Médico: ${otimizado.doctor.nome}. ${input.nota ? `Obs: ${input.nota}` : ''}`,
          autor: input.atendente.nome,
          autorPapel: 'Recepção · Centro de Especialidades',
        },
      });

      // Update referral
      const res = await tx.encaminhamento.update({
        where: { id: row.id },
        data: {
          status: StatusEncaminhamento.APROVADO,
          agendamentoPrevisto: otimizado.dateTime,
          profissionalAgendado: otimizado.doctor.nome,
          localAgendamento: localAg,
          observacoesRegulacao: input.nota || `Agendado com ${otimizado.doctor.nome} para ${otimizado.dateStr} às ${otimizado.timeStr}`,
          statusAtendimentoCentro: 'AGENDADO',
        },
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });

      // Audit Log
      await tx.auditoriaLog.create({
        data: {
          acao: 'CENTRO_AGENDAR_CONSULTA',
          recurso: 'CENTRO_ESPECIALIDADES',
          recursoId: row.id,
          atendenteId: input.atendente.id,
          payload: {
            protocolo: row.protocolo,
            dataAgendada: otimizado.dateStr,
            horario: otimizado.timeStr,
            medico: otimizado.doctor.nome,
            local: localAg,
          },
        },
      });

      return res;
    });

    return rowParaEncaminhamento(updated);
  }
}
