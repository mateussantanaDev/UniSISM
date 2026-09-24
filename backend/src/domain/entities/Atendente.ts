/**
 * Tipos do atendente autenticado. Espelham parte de userApi.ts do frontend.
 */
export type RoleAtendente =
  | 'ATENDENTE_UBS'
  | 'COORDENADOR_UBS'
  | 'REGULADOR_SMS'
  | 'ADMIN';

export interface AtendenteResumo {
  id: string;
  nome: string;
  matricula: string;
  iniciais: string;
  unidade?: string;
  cargo?: string;
}

export interface AtendentePerfilProducaoDia {
  dia: string;
  volume: number;
}

export interface AtendentePerfilProducaoEspec {
  nome: string;
  volume: number;
}

export interface AtendentePerfilProducao {
  hoje: number;
  semana: number;
  mes: number;
  ano: number;
  tempoMedio: string;
  taxaAprovacao: number;
  ranking: number;
  totalAtendentes: number;
  metaMes: number;
  porDia: AtendentePerfilProducaoDia[];
  porEspecialidade: AtendentePerfilProducaoEspec[];
}

export interface AtendentePerfilSeguranca {
  senhaAlteradaEm: string;
  twoFAAtivo: boolean;
  metodoTwoFA: string;
  ultimoAcesso: string;
  ipUltimoAcesso: string;
  dispositivo: string;
  localUltimoAcesso: string;
  tentativasFalhasSemana: number;
  sessoesAtivas: number;
  sessaoInatividade: string;
  sessaoExpiraEm: string;
}

export interface AtendentePerfilAtividade {
  em: string;
  acao: string;
  alvo?: string;
}

export interface AtendentePerfil {
  nome: string;
  iniciais: string;
  matricula: string;
  email: string;
  cpf: string;
  telefone: string;
  dataNascimento: string;
  cargo: string;
  funcao: string;
  role?: string;
  tipoUnidade?: string;
  lotacao: string;
  unidade: string;
  dataAdmissao: string;

  producao: AtendentePerfilProducao;
  seguranca: AtendentePerfilSeguranca;
  atividadeRecente: AtendentePerfilAtividade[];
}
