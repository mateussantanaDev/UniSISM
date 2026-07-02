import type { Encaminhamento, StatusEncaminhamento } from '../../domain/entities/Encaminhamento';
import type { IEncaminhamentoRepository } from '../../domain/repositories/IEncaminhamentoRepository';
import type { AccessScope } from '../../shared/scope';

export interface ListEncaminhamentosInput {
  scope: AccessScope;
  status?: StatusEncaminhamento;
  pacienteId?: string;
  desde?: Date;
  ate?: Date;
  limit?: number;
  respostaSUS?: boolean;
}

export class ListEncaminhamentosUseCase {
  constructor(private readonly repo: IEncaminhamentoRepository) {}

  exec(input: ListEncaminhamentosInput): Promise<Encaminhamento[]> {
    return this.repo.listar(input);
  }
}
