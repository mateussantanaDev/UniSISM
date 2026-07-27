import { StatusEncaminhamento, CanalRoteamento, DestinoRegulacao, PrioridadeClinica, TipoEventoTimeline } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { NotFound } from '../../../../shared/errors';

export interface EncaminhamentoIntermunicipalInput {
  pacienteId: string;
  solicitacao: {
    especialidadeSolicitada: string;
    cid10: string;
    cidDescricao: string;
    justificativaClinica: string;
    prioridade: 'ELETIVA' | 'PRIORITARIA' | 'URGENTE' | 'EMERGENCIA';
  };
  doctor: {
    id: string;
    nome: string;
    matricula: string;
  };
}

export class EncaminhamentoIntermunicipalMedicoUseCase {
  async exec(input: EncaminhamentoIntermunicipalInput, scope: AccessScope): Promise<Encaminhamento> {
    const paciente = await prisma.paciente.findUnique({
      where: { id: input.pacienteId },
      include: { ubs: true },
    });

    if (!paciente) {
      throw NotFound('PACIENTE_NAO_ENCONTRADO', 'Paciente não encontrado');
    }

    const now = new Date();
    const datePart = now.toISOString().substring(0, 10).replace(/-/g, '');
    const count = await prisma.encaminhamento.count();
    const protocolo = `ENC${datePart}-${String(count + 1).padStart(4, '0')}`;

    const createdRow = await prisma.$transaction(async (tx) => {
      const encRow = await tx.encaminhamento.create({
        data: {
          protocolo,
          status: StatusEncaminhamento.AGUARDANDO_REGULACAO,
          canalRoteamento: CanalRoteamento.SUS,
          destinoRegulacao: DestinoRegulacao.SUS,
          pacienteId: paciente.id,
          pacienteNome: paciente.nome,
          pacienteCpf: paciente.cpf,
          pacienteCartaoSus: paciente.cartaoSus || '000000000000000',
          pacienteDataNascimento: paciente.dataNascimento,
          pacienteSexo: paciente.sexo,
          pacienteTelefone: paciente.telefone || '',
          pacienteEndereco: paciente.endereco || '',
          medicoSolicitante: input.doctor.nome,
          crm: input.doctor.matricula,
          especialidadeSolicitada: input.solicitacao.especialidadeSolicitada,
          cid10: input.solicitacao.cid10,
          cidDescricao: input.solicitacao.cidDescricao,
          justificativaClinica: input.solicitacao.justificativaClinica,
          prioridade: input.solicitacao.prioridade as PrioridadeClinica,
          dataSolicitacao: now,
          unidadeOrigem: 'Centro Municipal de Especialidades',
          atendenteResponsavel: input.doctor.nome,
          ubsId: paciente.ubsId,
          atendenteId: input.doctor.id,
        },
      });

      await tx.eventoTimeline.createMany({
        data: [
          {
            encaminhamentoId: encRow.id,
            tipo: TipoEventoTimeline.CRIADO,
            titulo: 'Solicitação de Encaminhamento Intermunicipal',
            descricao: `Encaminhamento de alta complexidade/TFD gerado pelo especialista Dr(a). ${input.doctor.nome}.`,
            autor: input.doctor.nome,
            autorPapel: 'Médico Especialista',
          },
          {
            encaminhamentoId: encRow.id,
            tipo: TipoEventoTimeline.ENVIADO_REGULACAO,
            titulo: 'Enviado para Regulação SMS',
            descricao: 'Aguardando parecer da Central Municipal de Regulação.',
            autor: input.doctor.nome,
            autorPapel: 'Médico Especialista',
          },
        ],
      });

      await tx.auditoriaLog.create({
        data: {
          acao: 'CENTRO_MEDICO_ENCAMINHAMENTO_INTERMUNICIPAL',
          recurso: 'CENTRO_ESPECIALIDADES',
          recursoId: encRow.id,
          atendenteId: input.doctor.id,
          payload: {
            protocolo: encRow.protocolo,
            pacienteNome: paciente.nome,
            especialidade: input.solicitacao.especialidadeSolicitada,
          },
        },
      });

      return tx.encaminhamento.findUniqueOrThrow({
        where: { id: encRow.id },
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });
    });

    return rowParaEncaminhamento(createdRow);
  }
}
