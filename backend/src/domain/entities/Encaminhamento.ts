/**
 * Tipos do agregado Encaminhamento — espelham o frontend (src/lib/domain/models/Encaminhamento.ts).
 * Fonte da verdade para o contrato HTTP. Não dependem de infra.
 */
export type StatusEncaminhamento =
  | 'RASCUNHO'
  | 'AGUARDANDO_REGULACAO'
  | 'PENDENCIA_DOCUMENTO'
  | 'APROVADO'
  | 'REJEITADO';

export type PrioridadeClinica = 'ELETIVA' | 'PRIORITARIA' | 'URGENTE' | 'EMERGENCIA';

export type SexoPaciente = 'M' | 'F' | 'OUTRO';

export interface Paciente {
  nome: string;
  cpf: string;
  cartaoSus: string;
  dataNascimento: string;
  sexo: SexoPaciente;
  telefone: string;
  endereco: string;
}

export interface SolicitacaoMedica {
  medicoSolicitante: string;
  crm: string;
  especialidadeSolicitada: string;
  cid10: string;
  cidDescricao: string;
  justificativaClinica: string;
  prioridade: PrioridadeClinica;
  dataSolicitacao: string;
}

export type TipoAnexo =
  | 'SOLICITACAO'
  | 'RG'
  | 'CPF'
  | 'CARTAO_SUS'
  | 'EXAME'
  | 'LAUDO'
  | 'RESPOSTA_SUS'
  | 'OUTRO';

export type StatusScanAnexo = 'PENDENTE' | 'LIMPO' | 'INFECTADO' | 'FALHOU';

export interface AnexoDocumento {
  id: string;
  nome: string;
  tipo: TipoAnexo;
  tamanhoKb: number;
  uploadEm: string;
  /** Status do scan de antivírus. Download só liberado em LIMPO. */
  scanStatus: StatusScanAnexo;
}

export type TipoEventoTimeline =
  | 'CRIADO'
  | 'DOCUMENTO_ANEXADO'
  | 'ENVIADO_REGULACAO'
  | 'PENDENCIA_REGISTRADA'
  | 'APROVADO'
  | 'REJEITADO'
  | 'AGENDADO'
  | 'OBSERVACAO'
  | 'RESPOSTA_SUS_RECEBIDA'
  | 'EDITADO';

export interface RespostaSUS {
  anexoId: string;
  observacao: string;
  registradoEm: string; // ISO 8601
  registradoPor: { id: string; nome: string; matricula: string };
}

export interface EventoTimeline {
  id: string;
  tipo: TipoEventoTimeline;
  titulo: string;
  descricao: string;
  autor: string;
  autorPapel: string;
  em: string;
}

export interface Encaminhamento {
  id: string;
  protocolo: string;
  paciente: Paciente;
  solicitacao: SolicitacaoMedica;
  anexos: AnexoDocumento[];
  status: StatusEncaminhamento;
  criadoEm: string;
  atualizadoEm: string;
  unidadeOrigem: string;
  atendenteResponsavel: string;
  timeline?: EventoTimeline[];
  observacoesRegulacao?: string;
  agendamentoPrevisto?: string | null;
  respostaSUS?: RespostaSUS | null;
  canalRoteamento?: 'SUS' | 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO' | null;

  // ───── Detalhes do agendamento (preenchidos pela Regulação) ─────
  /** Endereço/sala da consulta. App paciente mostra no bloco "Sua consulta". */
  localAgendamento?: string | null;
  /** Nome + CRM do profissional agendado. */
  profissionalAgendado?: string | null;
  /**
   * Cidade onde a consulta ocorre — EXPLÍCITA, não derivada de string parsing.
   * Usada por `podeSolicitarTfd` (compara com município da UBS de origem).
   */
  cidadeAgendamento?: string | null;
  /** UF do agendamento (default "PE" para SMS Águas Belas). 2 chars. */
  ufAgendamento?: string | null;
  /** Motivo da rejeição (flat — espelha conteúdo de timeline REJEITADO). */
  motivoRejeicao?: string | null;
  /** Recomendações "o que levar no dia". */
  recomendacoes?: string[];
}

export interface MetricasDashboard {
  encaminhamentosHoje: number;
  aguardandoRegulacao: number;
  pendenciasDocumento: number;
  aprovadosHoje: number;
  tempoMedioConsolidacaoSegundos: number;
  encaminhamentosSemana: number;
  slaRegulacaoPorcento: number;
  enviadosAguardandoResposta: number;
  respondidosTotal: number;
}

export interface ExtracaoPdfResultado {
  paciente: Paciente;
  solicitacao: SolicitacaoMedica;
  confiancaExtracao: number;
}
