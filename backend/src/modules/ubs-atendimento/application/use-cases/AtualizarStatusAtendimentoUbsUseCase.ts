import type { AtendimentoUbsItem, StatusAtendimentoUbs } from '../../domain/entities/AtendimentoUbsFila';
import { filaUbsRepository, FilaUbsRepository } from '../../infrastructure/repositories/FilaUbsRepository';
import type { AccessScope } from '../../../../shared/scope';
import { NotFound } from '../../../../shared/errors';

export interface AtualizarStatusAtendimentoUbsInput {
  atendimentoId: string;
  status: StatusAtendimentoUbs;
  observacao?: string;
  doctor?: {
    id: string;
    nome: string;
    crm?: string;
  };
}

export class AtualizarStatusAtendimentoUbsUseCase {
  constructor(private readonly repo: FilaUbsRepository = filaUbsRepository) {}

  async exec(input: AtualizarStatusAtendimentoUbsInput, _scope?: AccessScope): Promise<AtendimentoUbsItem> {
    const item = await this.repo.obterPorId(input.atendimentoId);
    if (!item) {
      throw NotFound('ATENDIMENTO_NAO_ENCONTRADO', 'Atendimento não encontrado na fila da UBS');
    }

    const nowIso = new Date().toISOString();
    const partial: Partial<AtendimentoUbsItem> = {
      status: input.status,
    };

    if (input.status === 'EM_ATENDIMENTO') {
      partial.iniciadoEm = nowIso;
      if (input.doctor) {
        partial.medicoId = input.doctor.id;
        partial.medicoNome = input.doctor.nome;
        partial.crm = input.doctor.crm || item.crm;
      }
    } else if (input.status === 'CONCLUIDO') {
      partial.finalizadoEm = nowIso;
    }

    const atualizado = await this.repo.atualizar(item.id, partial);
    return atualizado!;
  }
}
