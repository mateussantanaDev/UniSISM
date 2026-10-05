import { CalcularAlocacaoVagaCentroUseCase } from './CalcularAlocacaoVagaCentroUseCase';
import { validarReservaCentro } from '../../shared/reservaCentro';
import { dataHoraRecife } from '../../shared/dataCentro';
import { resolverProfissionalCentro } from '../../shared/profissionalCentro';
import { StatusEncaminhamento, TipoEventoTimeline } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import { calcularOtimizacaoAgendamento } from '../../../gestao/application/use-cases/OtimizadorVagas';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { ensureUbsAcessivel } from '../../../../shared/scope';
import { NotFound, Unprocessable } from '../../../../shared/errors';
import { NotificacaoPacienteService, MENSAGENS } from '../../../../infrastructure/services/NotificacaoPacienteService';

export interface AgendarConsultaCentroInput {
  id: string;
  profissional?: string;
  profissionalId?: string;
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

    if (['EM_ATENDIMENTO','CONCLUIDO'].includes(row.statusAtendimentoCentro || '')) throw Unprocessable('ATENDIMENTO_INICIADO','Não é possível reagendar um atendimento já iniciado');
    const enc = rowParaEncaminhamento(row);

    let finalDateTime: Date;
    let finalDateStr: string;
    let finalTimeStr: string;
    let finalDoctorNome: string;

    if (input.dataAgendada && input.horaAgendada) {
      finalDateStr = input.dataAgendada;
      finalTimeStr = input.horaAgendada;
      finalDateTime = dataHoraRecife(input.dataAgendada, input.horaAgendada);
      finalDoctorNome = input.profissional || enc.profissionalAgendado || 'Especialista da Escala';
    } else {
      const resultado = await new CalcularAlocacaoVagaCentroUseCase().exec({ medicoNome:input.profissional, medicoId:input.profissionalId, especialidade:row.especialidadeSolicitada, tipoServico:row.tipoServico, centro:row.canalRoteamento === 'CENTRO_ODONTOLOGICO' ? 'CEO' : 'CEM' }, scope);
      if (!resultado.sucesso || !resultado.alocacao) throw Unprocessable('SEM_VAGA_DISPONIVEL', resultado.mensagem || 'Não há vaga disponível');
      finalDateStr = resultado.alocacao.data; finalTimeStr = resultado.alocacao.hora;
      finalDateTime = dataHoraRecife(finalDateStr, finalTimeStr); finalDoctorNome = resultado.alocacao.medicoNome;
    }

    const profissional = await resolverProfissionalCentro(row.ubsId, finalDoctorNome, input.profissionalId);
    if (profissional) finalDoctorNome = profissional.nome;

    const localAg = input.localAgendamento || row.localAgendamento || 'Centro Municipal de Especialidades';

    const updated = await prisma.$transaction(async (tx) => {
      if (!profissional) throw Unprocessable('PROFISSIONAL_OBRIGATORIO','Selecione um profissional com escala cadastrada');
      const escala = await validarReservaCentro(tx, {prefeituraId:row.ubs.prefeituraId, profissionalId:profissional.id, especialidade:row.especialidadeSolicitada, tipoServico:row.tipoServico, data:finalDateTime, ignorarId:row.id});
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
          profissionalAgendadoId: profissional?.id ?? null,
          localAgendamento: localAg,
          observacoesRegulacao: input.nota || `Agendado com ${finalDoctorNome} para ${finalDateStr} às ${finalTimeStr}`,
          statusAtendimentoCentro: 'AGENDADO',
          necessitaTriagem: escala.necessitaTriagem,
          presencaRegistradaEm: null, triagemRealizada: false, triagemEm:null, chamadaTriagemEm:null, chamadaMedicoEm:null,
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
