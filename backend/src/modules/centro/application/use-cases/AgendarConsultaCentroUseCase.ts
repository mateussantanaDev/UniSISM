import { StatusEncaminhamento, TipoEventoTimeline } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import { calcularOtimizacaoAgendamento } from '../../../gestao/application/use-cases/OtimizadorVagas';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { ensureUbsAcessivel } from '../../../../shared/scope';
import { NotFound, BadRequest } from '../../../../shared/errors';
import { NotificacaoPacienteService, MENSAGENS } from '../../../../infrastructure/services/NotificacaoPacienteService';

export interface AgendarConsultaCentroInput {
  id: string;
  profissional?: string;
  nota?: string;
  localAgendamento?: string;
  dataAgendada?: string; // YYYY-MM-DD
  horaAgendada?: string; // HH:MM
  atendente: {
    id: string;
    nome: string;
    role: string;
  };
}

export class AgendarConsultaCentroUseCase {
  private readonly notificacoes = new NotificacaoPacienteService();

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

    let finalDateTime: Date;
    let finalDateStr: string;
    let finalTimeStr: string;
    let finalDoctorNome: string;

    if (input.dataAgendada && input.horaAgendada) {
      finalDateStr = input.dataAgendada;
      finalTimeStr = input.horaAgendada;
      finalDateTime = new Date(`${input.dataAgendada}T${input.horaAgendada}:00`);
      finalDoctorNome = input.profissional || enc.profissionalAgendado || 'Especialista da Escala';
    } else {
      const otimizado = await calcularOtimizacaoAgendamento({
        profissional: input.profissional,
        nota: input.nota,
        especialidade: enc.solicitacao.especialidadeSolicitada,
        prioridade: enc.solicitacao.prioridade,
      });
      finalDateStr = otimizado.dateStr;
      finalTimeStr = otimizado.timeStr;
      finalDateTime = otimizado.dateTime;
      finalDoctorNome = otimizado.doctor.nome;
    }

    const localAg = input.localAgendamento || row.localAgendamento || 'Centro Municipal de Especialidades';

    const updated = await prisma.$transaction(async (tx) => {
      // Append timeline entry
      await tx.eventoTimeline.create({
        data: {
          encaminhamentoId: row.id,
          tipo: TipoEventoTimeline.AGENDADO,
          titulo: 'Consulta Agendada · Regulação do Centro',
          descricao: `Agendado para ${finalDateStr} às ${finalTimeStr} no local ${localAg}. Especialista: ${finalDoctorNome}. ${input.nota ? `Obs: ${input.nota}` : ''}`,
          autor: input.atendente.nome,
          autorPapel: 'Regulação · Centro de Especialidades',
        },
      });

      // Update referral
      const res = await tx.encaminhamento.update({
        where: { id: row.id },
        data: {
          status: StatusEncaminhamento.APROVADO,
          agendamentoPrevisto: finalDateTime,
          profissionalAgendado: finalDoctorNome,
          localAgendamento: localAg,
          observacoesRegulacao: input.nota || `Agendado com ${finalDoctorNome} para ${finalDateStr} às ${finalTimeStr}`,
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
            dataAgendada: finalDateStr,
            horario: finalTimeStr,
            medico: finalDoctorNome,
            local: localAg,
          },
        },
      });

      return res;
    });

    void this.notificacoes
      .notificar({
        cpfPaciente: updated.pacienteCpf,
        pacienteNome: updated.pacienteNome,
        encaminhamentoId: updated.id,
        tipo: 'AGENDADO',
        ...MENSAGENS.agendado(updated.protocolo, finalDateTime.toISOString()),
        payload: {
          protocolo: updated.protocolo,
          agendamentoPrevisto: finalDateTime.toISOString(),
        },
      })
      .catch(() => {});

    return rowParaEncaminhamento(updated);
  }
}
