import type { AtendimentoUbsItem, StatusAtendimentoUbs } from '../../domain/entities/AtendimentoUbsFila';
import { filaUbsRepository, FilaUbsRepository } from '../../infrastructure/repositories/FilaUbsRepository';
import type { AccessScope } from '../../../../shared/scope';

export interface ListarFilaDiaUbsInput {
  data?: string;
  ubsId?: string;
  medicoId?: string;
  status?: StatusAtendimentoUbs;
  busca?: string;
}

export interface ListarFilaDiaUbsOutput {
  itens: AtendimentoUbsItem[];
  total: number;
  aguardando: number;
  chamados: number;
  emAtendimento: number;
  concluidos: number;
  faltas: number;
}

export class ListarFilaDiaUbsUseCase {
  constructor(private readonly repo: FilaUbsRepository = filaUbsRepository) {}

  async exec(input: ListarFilaDiaUbsInput, scope: AccessScope): Promise<ListarFilaDiaUbsOutput> {
    let ubsId = input.ubsId;
    if (!ubsId && scope.kind === 'UBS') {
      ubsId = scope.ubsId;
    }

    const todos = await this.repo.listar({
      data: input.data,
      ubsId,
      medicoId: input.medicoId,
      busca: input.busca,
    });

    const itens = input.status ? todos.filter((i) => i.status === input.status) : todos;

    return {
      itens,
      total: todos.length,
      aguardando: todos.filter((i) => i.status === 'AGUARDANDO').length,
      chamados: todos.filter((i) => i.status === 'CHAMADO').length,
      emAtendimento: todos.filter((i) => i.status === 'EM_ATENDIMENTO').length,
      concluidos: todos.filter((i) => i.status === 'CONCLUIDO').length,
      faltas: todos.filter((i) => i.status === 'FALTOU').length,
    };
  }
}
