export type TipoAtendimentoUbs =
  | 'CONSULTA_MEDICA'
  | 'ENFERMAGEM'
  | 'ACOLHIMENTO_TRIAGEM'
  | 'PRE_NATAL'
  | 'HIPERDIA'
  | 'PUERICULTURA'
  | 'VACINACAO'
  | 'CURATIVO'
  | 'ODONTOLOGIA';

export type PrioridadeUbs =
  | 'URGENCIA'
  | 'SUPER_PRIORIDADE_80'
  | 'GESTANTE_LACTANTE'
  | 'PCD'
  | 'TEA'
  | 'IDOSO_60'
  | 'NORMAL';

export type StatusAtendimentoUbs =
  | 'AGUARDANDO'
  | 'CHAMADO'
  | 'EM_ATENDIMENTO'
  | 'CONCLUIDO'
  | 'FALTOU'
  | 'CANCELADO';

export interface AtendimentoUbsItem {
  id: string;
  senha: string;
  ubsId: string;
  ubsNome?: string;
  prefeituraId?: string;
  data: string; // YYYY-MM-DD
  horarioChegada: string; // ISO string
  pacienteId: string;
  pacienteNome: string;
  pacienteCpf: string;
  pacienteCartaoSus?: string;
  pacienteDataNasc?: string;
  pacienteSexo?: string;
  pacienteTelefone?: string;
  tipoAtendimento: TipoAtendimentoUbs;
  prioridade: PrioridadeUbs;
  medicoId?: string | null;
  medicoNome?: string | null;
  crm?: string | null;
  consultorio: string; // Ex: "Consultório 01" ou "Sala de Triagem"
  queixaBreve?: string;
  status: StatusAtendimentoUbs;
  chamadoEm?: string | null;
  iniciadoEm?: string | null;
  finalizadoEm?: string | null;
  criadoPorId?: string;
  criadoPorNome?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ChamadaPainelUbs {
  id: string;
  atendimentoId: string;
  senha: string;
  pacienteNome: string;
  medicoNome: string;
  crm?: string;
  consultorio: string;
  tipoAtendimento: TipoAtendimentoUbs;
  prioridade: PrioridadeUbs;
  chamadoEm: string;
  ubsId: string;
  ubsNome?: string;
}

export const PRIORIDADE_PESO: Record<PrioridadeUbs, number> = {
  URGENCIA: 1,
  SUPER_PRIORIDADE_80: 2,
  GESTANTE_LACTANTE: 3,
  PCD: 4,
  TEA: 5,
  IDOSO_60: 6,
  NORMAL: 7,
};

export const PRIORIDADE_LABEL: Record<PrioridadeUbs, string> = {
  URGENCIA: 'Urgência / Risco',
  SUPER_PRIORIDADE_80: 'Superprioridade (80+)',
  GESTANTE_LACTANTE: 'Gestante / Lactante',
  PCD: 'PCD (Deficiência)',
  TEA: 'Autismo (TEA)',
  IDOSO_60: 'Idoso (60-79 anos)',
  NORMAL: 'Normal (Ordem de Chegada)',
};

export const TIPO_ATENDIMENTO_LABEL: Record<TipoAtendimentoUbs, string> = {
  CONSULTA_MEDICA: 'Consulta Médica (Clínica Geral)',
  ENFERMAGEM: 'Atendimento de Enfermagem',
  ACOLHIMENTO_TRIAGEM: 'Acolhimento / Triagem',
  PRE_NATAL: 'Pré-Natal / Saúde da Mulher',
  HIPERDIA: 'Hiperdia (Hipertensão/Diabetes)',
  PUERICULTURA: 'Puericultura / Pediatria',
  VACINACAO: 'Vacinação / Imunização',
  CURATIVO: 'Curativo / Procedimento',
  ODONTOLOGIA: 'Odontologia / Saúde Bucal',
};
