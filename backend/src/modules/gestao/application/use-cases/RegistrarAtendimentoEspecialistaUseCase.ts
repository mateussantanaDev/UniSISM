import { prisma } from '../../../../infrastructure/database/prisma';
import { NotFound, Unprocessable } from '../../../../shared/errors';
import { whereByScopeViaUbs } from '../../../../infrastructure/database/scopeWhere';
import type { AccessScope } from '../../../../shared/scope';
import { TipoAtendimento } from '../../../../../generated/prisma';

export interface RegistrarAtendimentoInput {
  queixaPrincipal: string;
  diagnostico: string;
  cid10: string;
  conduta: string;
  prescricaoResumo?: string;
  tipoAtendimento?: 'CONSULTA_MEDICA' | 'ODONTOLOGICO';
  unidade?: string;
}

export class RegistrarAtendimentoEspecialistaUseCase {
  async exec(
    encaminhamentoId: string,
    scope: AccessScope,
    doctor: { nome: string; matricula: string },
    input: RegistrarAtendimentoInput
  ): Promise<void> {
    const enc = await prisma.encaminhamento.findFirst({
      where: { id: encaminhamentoId, ...whereByScopeViaUbs(scope) },
    });
    if (!enc) throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    if (!enc.pacienteId) throw Unprocessable('PACIENTE_NAO_VINCULADO', 'O encaminhamento deve ter um paciente cadastrado');

    const tipo = input.tipoAtendimento || 
      (enc.canalRoteamento === 'CENTRO_ODONTOLOGICO' ? TipoAtendimento.ODONTOLOGICO : TipoAtendimento.CONSULTA_MEDICA);

    await prisma.$transaction(async (tx) => {
      // 1. Create Atendimento
      await tx.atendimento.create({
        data: {
          pacienteId: enc.pacienteId!,
          data: new Date(),
          tipo,
          profissional: doctor.nome,
          registroProfissional: doctor.matricula,
          especialidade: enc.especialidadeSolicitada,
          unidade: input.unidade || (enc.canalRoteamento === 'CENTRO_ODONTOLOGICO' ? 'Centro de Especialidades Odontológicas' : 'Centro de Especialidades Municipal'),
          queixaPrincipal: input.queixaPrincipal,
          diagnostico: input.diagnostico,
          cid10: input.cid10,
          conduta: input.conduta,
          prescricaoResumo: input.prescricaoResumo || null,
        },
      });

      // 2. Create OBSERVACAO event in the referral timeline
      await tx.eventoTimeline.create({
        data: {
          encaminhamentoId,
          tipo: 'OBSERVACAO',
          titulo: 'Atendimento Especializado Realizado',
          descricao: `Consulta realizada pelo Dr(a). ${doctor.nome} (${doctor.matricula}). Conduta: ${input.conduta}.`,
          autor: doctor.nome,
          autorPapel: 'Médico Especialista',
        },
      });
    });
  }
}
