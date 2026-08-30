import type { AtendimentoUbsItem, ChamadaPainelUbs } from '../../domain/entities/AtendimentoUbsFila';
import { filaUbsRepository, FilaUbsRepository } from '../../infrastructure/repositories/FilaUbsRepository';
import type { AccessScope } from '../../../../shared/scope';
import { NotFound } from '../../../../shared/errors';
import { randomUUID } from 'crypto';

export interface ChamarPacienteUbsInput {
  atendimentoId: string;
  doctor: {
    id: string;
    nome: string;
    crm?: string;
  };
  consultorio?: string;
}

export class ChamarPacienteUbsUseCase {
  constructor(private readonly repo: FilaUbsRepository = filaUbsRepository) {}

  async exec(input: ChamarPacienteUbsInput, scope: AccessScope): Promise<{
    atendimento: AtendimentoUbsItem;
    chamada: ChamadaPainelUbs;
  }> {
    const item = await this.repo.obterPorId(input.atendimentoId);
    if (!item) {
      throw NotFound('ATENDIMENTO_NAO_ENCONTRADO', 'Atendimento não encontrado na fila da UBS');
    }

    const nowIso = new Date().toISOString();
    const consultorioFinal = input.consultorio || item.consultorio || 'Consultório 01';

    const atualizado = await this.repo.atualizar(item.id, {
      status: 'CHAMADO',
      chamadoEm: nowIso,
      medicoId: input.doctor.id,
      medicoNome: input.doctor.nome,
      crm: input.doctor.crm || item.crm,
      consultorio: consultorioFinal,
    });

    const chamada: ChamadaPainelUbs = {
      id: randomUUID(),
      atendimentoId: item.id,
      senha: item.senha,
      pacienteNome: item.pacienteNome,
      medicoNome: input.doctor.nome,
      crm: input.doctor.crm || item.crm || undefined,
      consultorio: consultorioFinal,
      tipoAtendimento: item.tipoAtendimento,
      prioridade: item.prioridade,
      chamadoEm: nowIso,
      ubsId: item.ubsId,
      ubsNome: item.ubsNome,
    };

    await this.repo.registrarChamada(chamada);

    return {
      atendimento: atualizado!,
      chamada,
    };
  }
}
