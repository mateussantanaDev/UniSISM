import { Prisma, StatusAtendimentoCentro, TipoAtendimento, TipoEventoTimeline } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { ensureUbsAcessivel } from '../../../../shared/scope';
import { sinaisVitaisCentroSchema } from '../../shared/dadosClinicosCentro';
import { NotFound, Unprocessable } from '../../../../shared/errors';

export interface RegistrarSOAPInput {
  encaminhamentoId: string;
  doctor: {
    id: string;
    nome: string;
    matricula: string;
  };
  soap: {
    exameFisico?: string;
    sinaisVitais?: Record<string, unknown>;
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

    ensureUbsAcessivel(scope, { id: row.ubsId, prefeituraId: row.ubs?.prefeituraId ?? '' });

    const escala = await prisma.escalaEspecialista.findFirst({where:{medicoId:input.doctor.id,prefeituraId:row.ubs.prefeituraId,especialidade:row.especialidadeSolicitada}});
    const now = new Date();
    const unidadeNome = input.soap.unidade || (row.canalRoteamento === 'CENTRO_ODONTOLOGICO' ? 'Centro de Especialidades Odontológicas' : 'Centro Municipal de Especialidades');

    const updated = await prisma.$transaction(async (tx) => {
      // Serializa a conclusão deste encaminhamento, inclusive entre abas/retries.
      await tx.$queryRaw`SELECT id FROM encaminhamentos WHERE id = ${row.id} FOR UPDATE`;
      const atual = await tx.encaminhamento.findUniqueOrThrow({ where: { id: row.id }, include: INCLUDE_ENCAMINHAMENTO_FULL });
      if (atual.atendimentoId && atual.statusAtendimentoCentro === 'CONCLUIDO') return atual;
      if (!atual.presencaRegistradaEm) throw Unprocessable('PRESENCA_OBRIGATORIA', 'Confirme a presença do paciente antes de atender');
      if (atual.necessitaTriagem && !atual.triagemRealizada) throw Unprocessable('TRIAGEM_OBRIGATORIA', 'Conclua a triagem de enfermagem antes de atender');
      if (atual.statusAtendimentoCentro !== 'EM_ATENDIMENTO') throw Unprocessable('ATENDIMENTO_NAO_INICIADO', 'Inicie o atendimento antes de concluir');
      const sinaisVitais = sinaisVitaisCentroSchema.parse(input.soap.sinaisVitais || atual.triagemDados || {});
      // 1. Save Atendimento SOAP record in PEC
      const atendimento = await tx.atendimento.create({
        data: {
          pacienteId: row.pacienteId!,
          data: now,
          tipo: row.canalRoteamento === 'CENTRO_ODONTOLOGICO' ? TipoAtendimento.ODONTOLOGICO : TipoAtendimento.CONSULTA_MEDICA,
          profissional: input.doctor.nome,
          registroProfissional: escala?.crm || 'Registro profissional não informado',
          especialidade: row.especialidadeSolicitada,
          unidade: unidadeNome,
          subjetivo: input.soap.subjetivo,
          objetivo: input.soap.objetivo,
          avaliacao: input.soap.avaliacao,
          plano: input.soap.plano,
          exameFisico: input.soap.exameFisico || input.soap.objetivo,
          sinaisVitais: JSON.parse(JSON.stringify(sinaisVitais)),
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
          atendimentoId: atendimento.id,
          rascunhoSOAP: Prisma.DbNull,
          rascunhoSOAPEm: null,
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
