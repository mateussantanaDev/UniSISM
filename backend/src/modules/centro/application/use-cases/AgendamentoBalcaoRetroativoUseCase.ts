import { AgendamentoBalcaoRecepcaoUseCase } from './AgendamentoBalcaoRecepcaoUseCase';
import { codigoDoProcedimento } from '../../../../shared/cadastroValidation';
import { resolverProfissionalCentro } from '../../shared/profissionalCentro';
import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';
import { ensureUbsAcessivel } from '../../../../shared/scope';
import { NotFound, Unprocessable } from '../../../../shared/errors';

export interface AgendamentoBalcaoRetroativoInput {
  pacienteId: string;
  especialidade: string;
  tipoServico?: 'CONSULTA' | 'PROCEDIMENTO';
  procedimentoSolicitado?: string;
  modoData?: 'AUTODATA' | 'MANUAL' | 'RETROATIVO';
  dataRetroativa: string; // YYYY-MM-DD
  horaRetroativa: string; // HH:mm
  statusRetroativo?: 'CONCLUIDO' | 'AGUARDANDO' | 'FALTOU';
  medicoId?: string;
  medicoNome?: string;
}

export interface AgendamentoBalcaoRetroativoOutput {
  id: string;
  protocolo: string;
  status: string;
  mensagem: string;
}

export class AgendamentoBalcaoRetroativoUseCase {
  async exec(
    input: AgendamentoBalcaoRetroativoInput,
    scope: AccessScope,
    atendenteId: string,
  ): Promise<AgendamentoBalcaoRetroativoOutput> {
    const paciente = await prisma.paciente.findUnique({
      where: { id: input.pacienteId },
      include: { ubs: true },
    });
    if (!paciente) {
      throw NotFound('PACIENTE_NAO_ENCONTRADO', 'Paciente não encontrado');
    }

    ensureUbsAcessivel(scope, { id: paciente.ubsId, prefeituraId: paciente.ubs?.prefeituraId ?? '' });

    const atendente = await prisma.atendente.findUniqueOrThrow({where:{id:atendenteId}});
    const resultado = await new AgendamentoBalcaoRecepcaoUseCase().exec({
      paciente:{ nome:paciente.nome, cpf:paciente.cpf, cartaoSus:paciente.cartaoSus || undefined, dataNascimento:paciente.dataNascimento.toISOString().slice(0,10), sexo:paciente.sexo, telefone:paciente.telefone || '', endereco:paciente.endereco || '', bairro:paciente.bairro || undefined },
      solicitacao:{medicoSolicitante:input.medicoNome || atendente.nome, crm:'Registro histórico', especialidadeSolicitada:input.especialidade, tipoServico:input.tipoServico, procedimentoSolicitado:input.procedimentoSolicitado, cid10:'Z00', cidDescricao:'Registro histórico sem diagnóstico clínico informado', justificativaClinica:'Digitalização de atendimento histórico', prioridade:'ELETIVA'},
      medicoId:input.medicoId, medicoDesejado:input.medicoNome, dataAgendada:input.dataRetroativa, horaAgendada:input.horaRetroativa,
      modoData:'RETROATIVO', statusRetroativo:input.statusRetroativo || 'CONCLUIDO', agendarDireto:true, ubsId:paciente.ubsId, atendente:{id:atendente.id,nome:atendente.nome},
    },scope);
    return {id:resultado.id, protocolo:resultado.protocolo, status:input.statusRetroativo || 'CONCLUIDO', mensagem:'Registro histórico salvo com sucesso.'};
  }
}
