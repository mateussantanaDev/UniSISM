import { StatusAtendimentoCentro, TipoEventoTimeline } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { ensureUbsAcessivel } from '../../../../shared/scope';
import { NotFound } from '../../../../shared/errors';

export interface ChamarPacienteInput {
  encaminhamentoId: string;
  doctor: {
    id: string;
    nome: string;
    crm?: string;
  };
}

export class ChamarPacienteMedicoUseCase {
  async exec(input: ChamarPacienteInput, scope: AccessScope): Promise<Encaminhamento> {
    const row = await prisma.encaminhamento.findUnique({
      where: { id: input.encaminhamentoId },
      include: INCLUDE_ENCAMINHAMENTO_FULL,
    });

    if (!row) {
      throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    }

    ensureUbsAcessivel(scope, { id: row.ubsId, prefeituraId: row.ubs?.prefeituraId ?? '' });

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      await tx.eventoTimeline.create({
        data: {
          encaminhamentoId: row.id,
          tipo: TipoEventoTimeline.OBSERVACAO,
          titulo: 'Paciente Chamado para o Consultório',
          descricao: `Chamado pelo Dr(a). ${input.doctor.nome}${input.doctor.crm ? ` (CRM ${input.doctor.crm})` : ''} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
          autor: input.doctor.nome,
          autorPapel: 'Médico Especialista',
        },
      });

      const res = await tx.encaminhamento.update({
        where: { id: row.id },
        data: {
          statusAtendimentoCentro: StatusAtendimentoCentro.EM_ATENDIMENTO,
          atendimentoIniciadoEm: now,
        },
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });

      await tx.auditoriaLog.create({
        data: {
          acao: 'CENTRO_MEDICO_CHAMAR_PACIENTE',
          recurso: 'CENTRO_ESPECIALIDADES',
          recursoId: row.id,
          atendenteId: input.doctor.id,
          payload: {
            protocolo: row.protocolo,
            pacienteNome: row.pacienteNome,
            medicoNome: input.doctor.nome,
          },
        },
      });

      return res;
    });

    return rowParaEncaminhamento(updated);
  }
}
