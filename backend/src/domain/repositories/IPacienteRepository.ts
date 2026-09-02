import type { PacienteCompleto, PacienteResumo } from '../entities/Paciente';
import type { AccessScope } from '../../shared/scope';

export type FiltroPacienteEspecial =
  | 'COM_CRONICAS'
  | 'COM_ENCAMINHAMENTOS'
  | 'SEM_ATENDIMENTO_90D';

export interface ListarPacientesFiltro {
  scope: AccessScope;
  q?: string;
  filtro?: FiltroPacienteEspecial;
  equipeId?: string;
  microarea?: string;
  ubsId?: string;
  page?: number;
  limit?: number;
}

export interface ResultadoPaginadoPacientes {
  itens: PacienteResumo[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PacientesMetricas {
  totalCadastrados: number;
  totalCronicos: number;
  totalEncAtivos: number;
  totalSemAtendimento90d: number;
}

export interface IPacienteRepository {
  listar(filtro: ListarPacientesFiltro): Promise<PacienteResumo[]>;
  listarPaginado(filtro: ListarPacientesFiltro): Promise<ResultadoPaginadoPacientes>;
  buscarPorId(id: string, scope: AccessScope): Promise<PacienteCompleto | null>;
  contarMetricas(scope: AccessScope): Promise<PacientesMetricas>;
}
