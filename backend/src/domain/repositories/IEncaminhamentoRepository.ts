import type {
  Encaminhamento,
  MetricasDashboard,
  Paciente,
  SolicitacaoMedica,
  StatusEncaminhamento,
  TipoAnexo,
  TipoEventoTimeline,
} from '../entities/Encaminhamento';
import type { AccessScope } from '../../shared/scope';

/**
 * Campos cadastrais adicionais do paciente. Todos opcionais. Quando presentes,
 * são usados pra:
 *   - criar o paciente, se ele ainda não existe
 *   - preencher SOMENTE campos vazios, se o paciente já existe (não sobrescreve
 *     dados já cadastrados)
 */
export interface PacienteComplemento {
  nomeSocial?: string;
  telefoneSecundario?: string;
  email?: string;
  nomeMae?: string;
  nomePai?: string;
  estadoCivil?: 'SOLTEIRO' | 'CASADO' | 'DIVORCIADO' | 'VIUVO' | 'UNIAO_ESTAVEL' | 'OUTRO';
  escolaridade?: string;
  profissao?: string;
  racaCor?: 'BRANCA' | 'PRETA' | 'PARDA' | 'AMARELA' | 'INDIGENA' | 'NAO_INFORMADA';
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
}

export interface CriarEncaminhamentoInput {
  paciente: Paciente;
  pacienteComplemento?: PacienteComplemento;
  solicitacao: SolicitacaoMedica;
  ubsId: string;
  atendenteId: string;
  unidadeOrigem: string;
  atendenteResponsavel: string;
  anexos: Array<{
    nome: string;
    tipo: TipoAnexo;
    tamanhoKb: number;
    mimeType: string;
    caminho: string;
  }>;
}

export interface ListarEncaminhamentosFiltro {
  scope: AccessScope;
  status?: StatusEncaminhamento;
  pacienteId?: string;
  desde?: Date;
  ate?: Date;
  limit?: number;
  respostaSUS?: boolean;
}

export interface AdicionarEventoInput {
  tipo: TipoEventoTimeline;
  titulo: string;
  descricao: string;
  autor: string;
  autorPapel: string;
}

export interface ResolverPendenciaInput {
  nota: string;
  autor: string;
  autorPapel: string;
  novosAnexos: Array<{
    nome: string;
    tipo: TipoAnexo;
    tamanhoKb: number;
    mimeType: string;
    caminho: string;
  }>;
}

export interface IEncaminhamentoRepository {
  criar(input: CriarEncaminhamentoInput): Promise<Encaminhamento>;
  buscarPorId(id: string, scope: AccessScope): Promise<Encaminhamento | null>;
  listar(filtro: ListarEncaminhamentosFiltro): Promise<Encaminhamento[]>;
  resolverPendencia(
    id: string,
    scope: AccessScope,
    input: ResolverPendenciaInput,
  ): Promise<Encaminhamento>;
  metricas(scope: AccessScope): Promise<MetricasDashboard>;
  proximoProtocolo(): Promise<string>;
}
