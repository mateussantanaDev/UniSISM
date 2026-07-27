import { StatusAtendimentoCentro, TipoAtendimento, TipoEventoTimeline } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { ensureUbsAcessivel } from '../../../../shared/scope';
import { NotFound, Unprocessable } from '../../../../shared/errors';

export interface RegistrarSOAPInput {
  encaminhamentoId: string;
  doctor: {
    id: string;
    nome: string;
    matricula: string;
  };
  soap: {
    subjetivo?: string;
    objetivo?: string;
    avaliacao?: string;
    plano?: string;
    queixaPrincipal: string;
    diagnostico: string;
    cid10: string;
    conduta: string;
    prescricaoResumo?: string;
    unidade?: string;
  };
}

export class RegistrarConsultaSOAPMedicoUseCase {
  async exec(input: RegistrarSOAPInput, scope: AccessScope): Promise<Encaminhamento> {
    const row = await prisma.encaminhamento.findUnique({
      where: { id: input.encaminhamentoId },
      include: INCLUDE_ENCAMINHAMENTO_FULL,
    });

    if (!row) {
      throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    }

    if (!row.pacienteId) {
      throw Unprocessable('PACIENTE_NAO_VINCULADO', 'O encaminhamento deve possuir um paciente vinculado no PEC');
    }

    ensureUbsAcessivel(scope, { id: row.ubsId, prefeituraId: (row as any).ubs?.prefeituraId ?? '' });

    const now = new Date();
    const unidadeNome = input.soap.unidade || (row.canalRoteamento === 'CENTRO_ODONTOLOGICO' ? 'Centro de Especialidades Odontológicas' : 'Centro Municipal de Especialidades');

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Save Atendimento SOAP record in PEC
      await tx.atendimento.create({
        data: {
          pacienteId: row.pacienteId!,
          data: now,
          tipo: row.canalRoteamento === 'CENTRO_ODONTOLOGICO' ? TipoAtendimento.ODONTOLOGICO : TipoAtendimento.CONSULTA_MEDICA,
          profissional: input.doctor.nome,
          registroProfissional: input.doctor.matricula,
          especialidade: row.especialidadeSolicitada,
          unidade: unidadeNome,
          queixaPrincipal: input.soap.queixaPrincipal,
          diagnostico: input.soap.diagnostico,
          cid10: input.soap.cid10,
          conduta: input.soap.conduta,
          prescricaoResumo: input.soap.prescricaoResumo || null,
        },
      });

      // 2. Timeline event
      const resumoSOAP = `CID: ${input.soap.cid10} - ${input.soap.diagnostico}. Conduta: ${input.soap.conduta}.`;
      await tx.eventoTimeline.create({
        data: {
          encaminhamentoId: row.id,
          tipo: TipoEventoTimeline.OBSERVACAO,
          titulo: 'Atendimento Especializado Concluído',
          descricao: `Consulta médica realizada por Dr(a). ${input.doctor.nome} (${input.doctor.matricula}). ${resumoSOAP}`,
          autor: input.doctor.nome,
          autorPapel: 'Médico Especialista',
        },
      });

      // 3. Update Referral Status
      const res = await tx.encaminhamento.update({
        where: { id: row.id },
        data: {
          statusAtendimentoCentro: StatusAtendimentoCentro.CONCLUIDO,
          atendimentoConcluidoEm: now,
        },
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });

      // 4. Audit Log
      await tx.auditoriaLog.create({
        data: {
          acao: 'CENTRO_MEDICO_REGISTRAR_SOAP',
          recurso: 'CENTRO_ESPECIALIDADES',
          recursoId: row.id,
          atendenteId: input.doctor.id,
          payload: {
            protocolo: row.protocolo,
            pacienteNome: row.pacienteNome,
            cid10: input.soap.cid10,
            diagnostico: input.soap.diagnostico,
            conduta: input.soap.conduta,
          },
        },
      });

      return res;
    });

    return rowParaEncaminhamento(updated);
  }
}
