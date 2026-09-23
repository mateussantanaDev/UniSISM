import { TipoEventoTimeline } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import { calcularOtimizacaoAgendamento } from '../../../gestao/application/use-cases/OtimizadorVagas';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { ensureUbsAcessivel } from '../../../../shared/scope';
import { NotFound } from '../../../../shared/errors';

export interface DesmarcarReagendarInput {
  encaminhamentoId: string;
  acao: 'DESMARCAR' | 'REAGENDAR';
  motivo: string;
  atendente: {
    id: string;
    nome: string;
  };
}

export class DesmarcarReagendarConsultaUseCase {
  async exec(input: DesmarcarReagendarInput, scope: AccessScope): Promise<Encaminhamento> {
    const row = await prisma.encaminhamento.findUnique({
      where: { id: input.encaminhamentoId },
      include: INCLUDE_ENCAMINHAMENTO_FULL,
    });

    if (!row) {
      throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    }

    ensureUbsAcessivel(scope, { id: row.ubsId, prefeituraId: row.ubs?.prefeituraId ?? '' });

    if (input.acao === 'DESMARCAR') {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.eventoTimeline.create({
          data: {
            encaminhamentoId: row.id,
            tipo: TipoEventoTimeline.OBSERVACAO,
            titulo: 'Consulta Desmarcada pela Recepção',
            descricao: `Agendamento cancelado. Motivo: ${input.motivo}`,
            autor: input.atendente.nome,
            autorPapel: 'Recepção · Centro de Especialidades',
          },
        });

        const res = await tx.encaminhamento.update({
          where: { id: row.id },
          data: {
            agendamentoPrevisto: null,
            profissionalAgendado: null,
            statusAtendimentoCentro: null,
          },
          include: INCLUDE_ENCAMINHAMENTO_FULL,
        });

        await tx.auditoriaLog.create({
          data: {
            acao: 'CENTRO_DESMARCAR_CONSULTA',
            recurso: 'CENTRO_ESPECIALIDADES',
            recursoId: row.id,
            atendenteId: input.atendente.id,
            payload: {
              protocolo: row.protocolo,
              motivo: input.motivo,
            },
          },
        });

        return res;
      });

      return rowParaEncaminhamento(updated);
    } else {
      // REAGENDAR
      const enc = rowParaEncaminhamento(row);
      const otimizado = await calcularOtimizacaoAgendamento({
        profissional: row.profissionalAgendado ?? undefined,
        especialidade: enc.solicitacao.especialidadeSolicitada,
        prioridade: enc.solicitacao.prioridade,
        nota: input.motivo,
      });

      const updated = await prisma.$transaction(async (tx) => {
        await tx.eventoTimeline.create({
          data: {
            encaminhamentoId: row.id,
            tipo: TipoEventoTimeline.AGENDADO,
            titulo: 'Consulta Reagendada · Centro',
            descricao: `Reagendado para ${otimizado.dateStr} às ${otimizado.timeStr}. Médico: ${otimizado.doctor.nome}. Motivo: ${input.motivo}`,
            autor: input.atendente.nome,
            autorPapel: 'Recepção · Centro de Especialidades',
          },
        });

        const res = await tx.encaminhamento.update({
          where: { id: row.id },
          data: {
            agendamentoPrevisto: otimizado.dateTime,
            profissionalAgendado: otimizado.doctor.nome,
            statusAtendimentoCentro: 'AGENDADO',
          },
          include: INCLUDE_ENCAMINHAMENTO_FULL,
        });

        await tx.auditoriaLog.create({
          data: {
            acao: 'CENTRO_REAGENDAR_CONSULTA',
            recurso: 'CENTRO_ESPECIALIDADES',
            recursoId: row.id,
            atendenteId: input.atendente.id,
            payload: {
              protocolo: row.protocolo,
              novaData: otimizado.dateStr,
              horario: otimizado.timeStr,
              medico: otimizado.doctor.nome,
              motivo: input.motivo,
            },
          },
        });

        return res;
      });

      return rowParaEncaminhamento(updated);
    }
  }
}
