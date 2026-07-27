import { StatusAtendimentoCentro, TipoEventoTimeline } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { ensureUbsAcessivel } from '../../../../shared/scope';
import { NotFound, BadRequest } from '../../../../shared/errors';

export interface RegistrarPresencaInput {
  encaminhamentoId: string;
  status: 'AGUARDANDO_ATENDIMENTO' | 'EM_ATENDIMENTO' | 'CONCLUIDO' | 'FALTOU';
  observacao?: string;
  atendente: {
    id: string;
    nome: string;
  };
}

export class RegistrarPresencaPacienteUseCase {
  async exec(input: RegistrarPresencaInput, scope: AccessScope): Promise<Encaminhamento> {
    const row = await prisma.encaminhamento.findUnique({
      where: { id: input.encaminhamentoId },
      include: INCLUDE_ENCAMINHAMENTO_FULL,
    });

    if (!row) {
      throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    }

    ensureUbsAcessivel(scope, { id: row.ubsId, prefeituraId: (row as any).ubs?.prefeituraId ?? '' });

    const now = new Date();
    const updateData: any = {
      statusAtendimentoCentro: input.status as StatusAtendimentoCentro,
    };

    let eventTitle = '';
    let eventDesc = '';

    if (input.status === 'AGUARDANDO_ATENDIMENTO') {
      updateData.presencaRegistradaEm = now;
      eventTitle = 'Paciente Presente na Recepção';
      eventDesc = `Chegada confirmada na recepção às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. ${input.observacao ? `Obs: ${input.observacao}` : ''}`;
    } else if (input.status === 'EM_ATENDIMENTO') {
      updateData.atendimentoIniciadoEm = now;
      eventTitle = 'Atendimento Iniciado';
      eventDesc = `Chamado para o consultório às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
    } else if (input.status === 'CONCLUIDO') {
      updateData.atendimentoConcluidoEm = now;
      eventTitle = 'Consulta Concluída';
      eventDesc = `Consulta médica finalizada às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
    } else if (input.status === 'FALTOU') {
      eventTitle = 'Paciente Ausente (Falta)';
      eventDesc = `Registrada falta no horário agendado. ${input.observacao ? `Motivo/Obs: ${input.observacao}` : ''}`;
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.eventoTimeline.create({
        data: {
          encaminhamentoId: row.id,
          tipo: TipoEventoTimeline.OBSERVACAO,
          titulo: eventTitle,
          descricao: eventDesc,
          autor: input.atendente.nome,
          autorPapel: 'Recepção · Centro de Especialidades',
        },
      });

      const res = await tx.encaminhamento.update({
        where: { id: row.id },
        data: updateData,
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });

      await tx.auditoriaLog.create({
        data: {
          acao: 'CENTRO_REGISTRAR_PRESENCA',
          recurso: 'CENTRO_ESPECIALIDADES',
          recursoId: row.id,
          atendenteId: input.atendente.id,
          payload: {
            status: input.status,
            observacao: input.observacao,
            protocolo: row.protocolo,
          },
        },
      });

      return res;
    });

    return rowParaEncaminhamento(updated);
  }
}
