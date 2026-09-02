import type { PacienteResumo } from '../../domain/entities/Paciente';
import type {
  FiltroPacienteEspecial,
  IPacienteRepository,
  PacientesMetricas,
  ResultadoPaginadoPacientes,
} from '../../domain/repositories/IPacienteRepository';
import type { AccessScope } from '../../shared/scope';

export interface ListPacientesInput {
  scope: AccessScope;
  q?: string;
  filtro?: FiltroPacienteEspecial;
  equipeId?: string;
  microarea?: string;
  ubsId?: string;
  page?: number;
  limit?: number;
}

export class ListPacientesUseCase {
  constructor(private readonly repo: IPacienteRepository) {}

  exec(input: ListPacientesInput): Promise<PacienteResumo[]> {
    return this.repo.listar(input);
  }

  execPaginado(input: ListPacientesInput): Promise<ResultadoPaginadoPacientes> {
    return this.repo.listarPaginado(input);
  }

  metricas(scope: AccessScope): Promise<PacientesMetricas> {
    return this.repo.contarMetricas(scope);
  }
}
