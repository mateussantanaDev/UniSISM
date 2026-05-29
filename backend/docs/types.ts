/**
 * UNISISM · UBS — Contratos TypeScript da API
 * ───────────────────────────────────────────────
 * Arquivo único, sem dependências externas. Pode ser copiado
 * direto para `frontend/src/lib/api/types.ts` (ou similar).
 *
 * Mantém-se em sincronia com o backend através do mesmo shape
 * exposto em `src/domain/entities/*.ts`. Qualquer divergência
 * — a API HTTP é a fonte da verdade.
 */

// ============================================================
// ENUMS
// ============================================================

export type Role =
  | 'DESENVOLVEDOR'
  | 'ADMIN'
  | 'COORDENADOR_UBS'
  | 'ATENDENTE_UBS'
  | 'REGULADOR_SMS';

export type Escopo = 'GLOBAL' | 'PREFEITURA' | 'UBS';

export type Sexo = 'M' | 'F' | 'OUTRO';

export type StatusEncaminhamento =
  | 'RASCUNHO'
  | 'AGUARDANDO_REGULACAO'
  | 'PENDENCIA_DOCUMENTO'
  | 'APROVADO'
  | 'REJEITADO';

export type PrioridadeClinica = 'ELETIVA' | 'PRIORITARIA' | 'URGENTE' | 'EMERGENCIA';

export type TipoAnexo =
  | 'SOLICITACAO'
  | 'RG'
  | 'CPF'
  | 'CARTAO_SUS'
  | 'EXAME'
  | 'LAUDO'
  | 'RESPOSTA_SUS'
  | 'OUTRO';

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

export type TipoNotificacaoPaciente =
  | 'ENCAMINHAMENTO_CRIADO'
  | 'PENDENCIA_REGISTRADA'
  | 'PENDENCIA_RESOLVIDA'
  | 'APROVADO'
  | 'AGENDADO'
  | 'REJEITADO'
  | 'RESPOSTA_SUS_DISPONIVEL';

/** Status do scan de antivírus em um anexo.
 *  - PENDENTE  → upload recente, scan em fila
 *  - LIMPO     → liberado para download
 *  - INFECTADO → bloqueado, mostrar aviso na UI
 *  - FALHOU    → scanner indisponível; tratar como inseguro por padrão
 */
export type StatusScanAnexo = 'PENDENTE' | 'LIMPO' | 'INFECTADO' | 'FALHOU';

export type GrupoSanguineo =
  | 'A+' | 'A-'
  | 'B+' | 'B-'
  | 'AB+' | 'AB-'
  | 'O+' | 'O-'
  | 'NAO_INFORMADO';

export type EstadoCivil =
  | 'SOLTEIRO' | 'CASADO' | 'DIVORCIADO'
  | 'VIUVO' | 'UNIAO_ESTAVEL' | 'OUTRO';

export type RacaCor =
  | 'BRANCA' | 'PRETA' | 'PARDA' | 'AMARELA' | 'INDIGENA' | 'NAO_INFORMADA';

export type TipoAtendimento =
  | 'CONSULTA_MEDICA' | 'ENFERMAGEM' | 'VACINACAO'
  | 'CURATIVO' | 'ODONTOLOGICO' | 'PROCEDIMENTO' | 'ACOLHIMENTO';

export type StatusViagemTFD = 'AGENDADA' | 'REALIZADA' | 'CANCELADA' | 'EM_ANDAMENTO';

export type ResultadoExame = 'NORMAL' | 'ALTERADO' | 'CRITICO' | 'PENDENTE';

export type FiltroPacienteEspecial =
  | 'COM_CRONICAS'
  | 'COM_ENCAMINHAMENTOS'
  | 'SEM_ATENDIMENTO_90D';

export type TipoRelatorio =
  | 'PRODUCAO_INDIVIDUAL'
  | 'ENCAMINHAMENTOS_POR_ESPECIALIDADE'
  | 'FILA_REGULACAO'
  | 'PENDENCIAS_RESOLVIDAS'
  | 'TFD_CUSTOS'
  | 'VACINACAO_UBS'
  | 'BUSCA_ATIVA';

export type FormatoRelatorio = 'PDF' | 'CSV' | 'XLSX';
export type StatusRelatorio = 'DISPONIVEL' | 'PROCESSANDO' | 'FALHA';

// ============================================================
// AUTH
// ============================================================

export interface LoginRequest {
  login: string;        // matrícula ("SMS-047291") ou email
  senha: string;
  lembrar?: boolean;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  expiresIn: number;    // segundos
  atendente: {
    id: string;
    nome: string;
    matricula: string;
    iniciais: string;
  };
}

export interface MeResponse {
  id: string;
  nome: string;
  matricula: string;
  iniciais: string;
  role: Role;
  unidade: string | null;
  prefeitura: string | null;
  cargo: string;
  escopo: Escopo;
}

export interface ForgotPasswordRequest { login: string; }
export interface ForgotPasswordResponse { tokenEnviado: true; }

export interface VerifyCodeRequest { login: string; codigo: string; }
export interface VerifyCodeResponse { valido: boolean; resetToken?: string; }

export interface ResetPasswordRequest { resetToken: string; novaSenha: string; }
export interface ResetPasswordResponse { sucesso: true; }

export interface ChangePasswordRequest { senhaAtual: string; novaSenha: string; }

export interface RevokeOthersResponse { encerradas: number; }

// ============================================================
// PERFIL
// ============================================================

export interface AtendentePerfilProducaoDia { dia: string; volume: number; }
export interface AtendentePerfilProducaoEspec { nome: string; volume: number; }

export interface AtendentePerfilProducao {
  hoje: number;
  semana: number;
  mes: number;
  ano: number;
  tempoMedio: string;       // ex.: "3m 02s"
  taxaAprovacao: number;    // 0..100
  ranking: number;          // 1-based
  totalAtendentes: number;
  metaMes: number;
  porDia: AtendentePerfilProducaoDia[];
  porEspecialidade: AtendentePerfilProducaoEspec[];
}

export interface AtendentePerfilSeguranca {
  senhaAlteradaEm: string;        // YYYY-MM-DD
  twoFAAtivo: boolean;
  metodoTwoFA: string;
  ultimoAcesso: string;           // já formatado pt-BR
  ipUltimoAcesso: string;
  dispositivo: string;
  localUltimoAcesso: string;
  tentativasFalhasSemana: number;
  sessoesAtivas: number;
  sessaoInatividade: string;
  sessaoExpiraEm: string;
}

export interface AtendentePerfilAtividade {
  em: string;                     // já formatado pt-BR
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
  lotacao: string;
  unidade: string;
  dataAdmissao: string;
  producao: AtendentePerfilProducao;
  seguranca: AtendentePerfilSeguranca;
  atividadeRecente: AtendentePerfilAtividade[];
}

// ============================================================
// DASHBOARD
// ============================================================

export interface MetricasDashboard {
  encaminhamentosHoje: number;
  aguardandoRegulacao: number;
  pendenciasDocumento: number;
  aprovadosHoje: number;
  tempoMedioConsolidacaoSegundos: number;
  encaminhamentosSemana: number;
}

// ============================================================
// ENCAMINHAMENTOS
// ============================================================

export interface Paciente {
  nome: string;
  cpf: string;
  cartaoSus: string;
  dataNascimento: string;   // YYYY-MM-DD
  sexo: Sexo;
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
  dataSolicitacao: string;  // YYYY-MM-DD
}

export interface AnexoDocumento {
  id: string;
  nome: string;
  tipo: TipoAnexo;
  tamanhoKb: number;
  uploadEm: string;           // ISO 8601
  scanStatus: StatusScanAnexo; // ver: sub-seção "Scan de antivírus" no API.md
}

export interface EventoTimeline {
  id: string;
  tipo: TipoEventoTimeline;
  titulo: string;
  descricao: string;
  autor: string;
  autorPapel: string;
  em: string;               // ISO 8601
}

export interface RespostaSUS {
  anexoId: string;
  observacao: string;
  registradoEm: string; // ISO 8601
  registradoPor: { id: string; nome: string; matricula: string };
}

export interface Encaminhamento {
  id: string;
  protocolo: string;        // "UBS-2026-100137"
  status: StatusEncaminhamento;
  paciente: Paciente;
  solicitacao: SolicitacaoMedica;
  anexos: AnexoDocumento[];
  timeline: EventoTimeline[];
  unidadeOrigem: string;
  atendenteResponsavel: string;
  observacoesRegulacao?: string;
  agendamentoPrevisto?: string | null;
  /** Endereço/sala da consulta (preenchido na aprovação Face 2). */
  localAgendamento?: string | null;
  /** Nome + CRM do profissional ("Dra. X · CRM-PE 00000"). */
  profissionalAgendado?: string | null;
  /** Cidade da consulta — EXPLÍCITA. Usada para podeSolicitarTfd no app paciente. */
  cidadeAgendamento?: string | null;
  /** UF do agendamento (2 chars maiúsculos, ex.: "PE"). */
  ufAgendamento?: string | null;
  /** Motivo da rejeição (flat — espelha conteúdo de timeline REJEITADO). */
  motivoRejeicao?: string | null;
  /** Recomendações "o que levar no dia" (vindo de EspecialidadeRecomendacao). */
  recomendacoes?: string[];
  respostaSUS?: RespostaSUS | null;
  criadoEm: string;
  atualizadoEm: string;
}

// ---- Face 2 · Regulação SMS ----

export interface AprovarRequest {
  nota?: string;
  agendamentoPrevisto?: string; // YYYY-MM-DD
  /** Endereço/sala da consulta. Recomendado quando há agendamento. */
  localAgendamento?: string;
  /** Profissional + CRM ("Dra. X · CRM-PE 00000"). */
  profissionalAgendado?: string;
  /** Cidade da consulta. Default: município da UBS de origem. */
  cidadeAgendamento?: string;
  /** UF do agendamento. 2 chars maiúsculos. Default: "PE". */
  ufAgendamento?: string;
}

export interface RegistrarPendenciaRequest {
  observacao: string;
}

export interface RejeitarRequest {
  motivo: string;
}

// ---- Face 2 · Árvore (file-manager) ----

export interface StatusContagem {
  aguardando: number;
  pendencia: number;
  aprovado: number;
  rejeitado: number;
}

export interface ArvoreUbsNode {
  ubsId: string;
  nome: string;
  totalEncaminhamentos: number;
  anoMaisRecente: number | null;
  statusContagem: StatusContagem;
}
export interface ArvoreAnoNode {
  ano: number;
  totalEncaminhamentos: number;
  statusContagem: StatusContagem;
}
export interface ArvoreMesNode {
  mes: number;
  totalEncaminhamentos: number;
  statusContagem: StatusContagem;
}
export interface ArvoreDiaNode {
  dia: number;
  totalEncaminhamentos: number;
  statusContagem: StatusContagem;
}
export type ArvoreNode = ArvoreUbsNode | ArvoreAnoNode | ArvoreMesNode | ArvoreDiaNode;

export interface ArvoreQuery {
  ubsId?: string;
  ano?: number;
  mes?: number;
}

export interface ExtracaoPdfResultado {
  paciente: Paciente;
  solicitacao: SolicitacaoMedica;
  confiancaExtracao: number; // 0..1
}

export interface CriarEncaminhamentoResponse {
  id: string;
  protocolo: string;
}

export interface ListEncaminhamentosQuery {
  status?: StatusEncaminhamento;
  pacienteId?: string;
  desde?: string;            // ISO date
  ate?: string;              // ISO date
  limit?: number;
}

// ============================================================
// PACIENTE / PEC
// ============================================================

export interface Alergia {
  substancia: string;
  tipo: 'MEDICAMENTO' | 'ALIMENTO' | 'AMBIENTAL' | 'OUTRO';
  gravidade: 'LEVE' | 'MODERADA' | 'GRAVE';
  observacao?: string;
}

export interface CondicaoCronica {
  cid10: string;
  descricao: string;
  desde: string;             // YYYY-MM-DD
  ativo: boolean;
  observacao?: string;
}

export interface MedicamentoEmUso {
  nome: string;
  dosagem: string;
  frequencia: string;
  desde: string;
  prescritor: string;
  ativo: boolean;
}

export interface Atendimento {
  id: string;
  data: string;              // ISO 8601
  tipo: TipoAtendimento;
  profissional: string;
  registroProfissional: string;
  especialidade: string;
  unidade: string;
  queixaPrincipal: string;
  diagnostico: string;
  cid10: string;
  conduta: string;
  prescricaoResumo?: string;
}

export interface ViagemTFD {
  id: string;
  protocolo: string;
  dataIda: string;
  dataVolta: string;
  destino: string;
  unidadeDestino: string;
  motivo: string;
  especialidade: string;
  acompanhante: boolean;
  transporte: 'VAN_SMS' | 'AMBULANCIA' | 'PASSAGEM_RODOVIARIA' | 'PASSAGEM_AEREA';
  status: StatusViagemTFD;
  custoEstimadoBRL: number;
}

export interface ExameRealizado {
  id: string;
  data: string;
  tipo: string;
  categoria: 'LABORATORIAL' | 'IMAGEM' | 'FUNCIONAL' | 'OUTROS';
  solicitante: string;
  unidadeExecutora: string;
  resultado: ResultadoExame;
  observacao?: string;
}

export interface VacinaAplicada {
  id: string;
  data: string;
  vacina: string;
  dose: string;
  lote: string;
  aplicador: string;
  unidade: string;
  via: 'INTRAMUSCULAR' | 'SUBCUTANEA' | 'ORAL' | 'INTRADERMICA';
}

export interface MedicoAtendente {
  nome: string;
  registro: string;
  especialidade: string;
  unidade: string;
  ultimaConsulta: string;
  totalConsultas: number;
}

export interface PacienteResumo {
  id: string;
  nome: string;
  nomeSocial?: string;
  cpf: string;
  cartaoSus: string;
  dataNascimento: string;
  sexo: Sexo;
  telefone: string;
  unidadeVinculada: string;
  equipeSaudeFamilia?: string;
  ultimoAtendimento?: string;
  condicoesCronicasAtivas: number;
  encaminhamentosAtivos: number;
  cadastradoEm: string;
}

export interface PacienteCompleto extends PacienteResumo {
  nomeMae: string;
  nomePai?: string;
  estadoCivil: EstadoCivil;
  escolaridade: string;
  profissao?: string;
  racaCor: RacaCor;
  endereco: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  telefoneSecundario?: string;
  email?: string;
  grupoSanguineo: GrupoSanguineo;
  alergias: Alergia[];
  condicoesCronicas: CondicaoCronica[];
  medicamentosEmUso: MedicamentoEmUso[];
  historicoFamiliar: string[];
  agenteComunitario?: string;
  microarea?: string;
  atendimentos: Atendimento[];
  viagensTFD: ViagemTFD[];
  exames: ExameRealizado[];
  vacinacoes: VacinaAplicada[];
  medicosAtendentes: MedicoAtendente[];
  encaminhamentosIds: string[];
}

export interface ListPacientesQuery {
  q?: string;
  filtro?: FiltroPacienteEspecial;
  equipeId?: string;
  microarea?: string;
}

// ============================================================
// RELATÓRIOS
// ============================================================

export interface Relatorio {
  id: string;
  titulo: string;
  tipo: TipoRelatorio;
  periodo: string;          // "01/04/2026 – 22/04/2026"
  formato: FormatoRelatorio;
  geradoEm: string;
  tamanhoKb: number;
  status: StatusRelatorio;
}

export interface CriarRelatorioRequest {
  tipo: TipoRelatorio;
  dataInicial: string;      // YYYY-MM-DD
  dataFinal: string;
  formato: FormatoRelatorio;
  filtros?: Record<string, unknown>;
}

// ============================================================
// ADMIN
// ============================================================

export interface Prefeitura {
  id: string;
  nome: string;
  municipio: string;
  uf: string;
  cnpj?: string | null;
  ativa: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface CriarPrefeituraRequest {
  nome: string;
  municipio: string;
  uf: string;
  cnpj?: string;
}

/** Horário de funcionamento de um dia (HH:MM `abre` e `fecha`). `null` = fechado. */
export interface DiaHorario {
  abre: string;
  fecha: string;
}

/** Mapa de horários por dia da semana. Chaves omitidas = não cadastrado. */
export interface HorariosFuncionamento {
  segunda?: DiaHorario | null;
  terca?: DiaHorario | null;
  quarta?: DiaHorario | null;
  quinta?: DiaHorario | null;
  sexta?: DiaHorario | null;
  sabado?: DiaHorario | null;
  domingo?: DiaHorario | null;
}

export interface Ubs {
  id: string;
  nome: string;
  municipio: string;
  uf: string;
  endereco?: string | null;
  cnes?: string | null;
  ativa: boolean;
  prefeituraId: string;
  prefeitura?: Prefeitura;
  /** Campos novos v0.13. */
  bairro?: string | null;
  cep?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  horarios?: HorariosFuncionamento | null;
  observacoes?: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface CriarUbsRequest {
  nome: string;
  municipio: string;
  uf: string;
  prefeituraId: string;
  endereco?: string;
  cnes?: string;
  /** Campos novos v0.13. */
  bairro?: string;
  cep?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  latitude?: number;
  longitude?: number;
  horarios?: HorariosFuncionamento;
  observacoes?: string;
}

export interface ListUbsQuery {
  prefeituraId?: string;
}

export interface UsuarioListado {
  id: string;
  nome: string;
  matricula: string;
  email: string;
  cpf: string;
  role: Role;
  ativo: boolean;
  criadoEm: string;
  ubs: { id: string; nome: string; prefeitura: { id: string; nome: string } } | null;
  prefeitura: { id: string; nome: string } | null;
}

export interface CriarUsuarioRequest {
  nome: string;
  email: string;
  matricula: string;
  cpf: string;
  senha: string;
  role: Role;
  ubsId?: string;          // exigido para ATENDENTE_UBS / COORDENADOR_UBS
  prefeituraId?: string;   // exigido para ADMIN / REGULADOR_SMS
  telefone?: string;
  cargo?: string;
  funcao?: string;
}

export interface CriarUsuarioResponse {
  id: string;
  nome: string;
  matricula: string;
  email: string;
  role: Role;
  ubs: { id: string; nome: string } | null;
  prefeitura: { id: string; nome: string } | null;
}

export interface ListUsuariosQuery {
  q?: string;
  role?: Role;
  ubsId?: string;
  prefeituraId?: string;
  ativo?: boolean;
}

// ============================================================
// ERROS
// ============================================================

export type ErrorCode =
  // Auth
  | 'CREDENCIAIS_INVALIDAS' | 'USUARIO_INATIVO' | 'USUARIO_BLOQUEADO'
  | 'SENHA_EXPIRADA' | 'SENHA_FRACA' | 'SENHA_ATUAL_INCORRETA'
  | 'TOKEN_AUSENTE' | 'TOKEN_EXPIRADO' | 'TOKEN_INVALIDO'
  | 'NAO_AUTENTICADO' | 'SESSAO_INDETERMINADA'
  // Escopo / RBAC
  | 'PERMISSAO_INSUFICIENTE' | 'FORA_DO_ESCOPO'
  | 'USUARIO_SEM_UBS' | 'USUARIO_SEM_PREFEITURA'
  // Uploads
  | 'ARQUIVO_INVALIDO' | 'ARQUIVO_MUITO_GRANDE' | 'MIME_NAO_SUPORTADO'
  // Payload
  | 'PAYLOAD_AUSENTE' | 'PAYLOAD_INVALIDO' | 'DADOS_OBRIGATORIOS_AUSENTES'
  // Encaminhamentos
  | 'ENCAMINHAMENTO_NAO_ENCONTRADO' | 'ENCAMINHAMENTO_NAO_EM_PENDENCIA' | 'NENHUMA_ACAO_FORNECIDA'
  | 'DATA_NASCIMENTO_INVALIDA' | 'DATA_SOLICITACAO_INVALIDA'
  // Face 2 — Regulação
  | 'ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO' | 'OBSERVACAO_OBRIGATORIA' | 'MOTIVO_OBRIGATORIO'
  | 'AGENDAMENTO_INVALIDO' | 'AGENDAMENTO_NO_PASSADO'
  | 'ENCAMINHAMENTO_NAO_APROVADO' | 'RESPOSTA_SUS_JA_REGISTRADA' | 'PDF_RESPOSTA_OBRIGATORIO'
  | 'PARAMS_INCOMPATIVEIS' | 'UBS_NAO_ENCONTRADA'
  // CRUD usuários extended
  | 'AUTO_EXCLUSAO_PROIBIDA' | 'AUTO_DESATIVACAO_PROIBIDA'
  | 'PREFEITURA_COM_DEPENDENCIAS' | 'UBS_COM_DEPENDENCIAS'
  | 'PACIENTE_DUPLICADO' | 'PACIENTE_COM_ENCAMINHAMENTOS_ATIVOS'
  | 'MOTIVO_OBRIGATORIO'
  // Edição de encaminhamento
  | 'EDICAO_NAO_PERMITIDA' | 'NENHUMA_ALTERACAO' | 'JUSTIFICATIVA_VAZIA'
  // App do paciente
  | 'CONTA_NAO_ATIVADA' | 'CONTA_JA_ATIVADA' | 'CONTA_NAO_ENCONTRADA'
  | 'CONTA_INATIVA' | 'CONFIRMACAO_INVALIDA'
  | 'ANEXO_NAO_ENCONTRADO' | 'ANEXO_NAO_LIBERADO'
  | 'NOTIFICACAO_NAO_ENCONTRADA'
  // Pacientes
  | 'PACIENTE_NAO_ENCONTRADO'
  // Relatórios
  | 'RELATORIO_NAO_ENCONTRADO' | 'RELATORIO_NAO_DISPONIVEL'
  // Admin
  | 'PREFEITURA_OBRIGATORIA' | 'UBS_OBRIGATORIA'
  | 'PREFEITURA_DUPLICADA' | 'PREFEITURA_NAO_ENCONTRADA'
  | 'UBS_DUPLICADA' | 'UBS_NAO_ENCONTRADA'
  | 'USUARIO_DUPLICADO' | 'ATENDENTE_NAO_ENCONTRADO'
  // Generic
  | 'RATE_LIMIT' | 'ERRO_INTERNO';

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ============================================================
// ADMIN · CRUD completo de usuários (novos endpoints)
// ============================================================

export interface AtualizarUsuarioRequest {
  nome?: string;
  email?: string;
  telefone?: string;
  cargo?: string;
  funcao?: string;
  ubsId?: string | null;
  prefeituraId?: string | null;
}

export interface AtualizarPrefeituraRequest {
  nome?: string;
  municipio?: string;
  uf?: string;
  cnpj?: string | null;
  ativa?: boolean;
}

export interface AtualizarUbsRequest {
  nome?: string;
  municipio?: string;
  uf?: string;
  endereco?: string | null;
  cnes?: string | null;
  ativa?: boolean;
  /** Campos novos v0.13. `null` limpa o valor existente. */
  bairro?: string | null;
  cep?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  horarios?: HorariosFuncionamento | null;
  observacoes?: string | null;
}

export interface AtualizarPacienteRequest {
  nome?: string;
  nomeSocial?: string | null;
  cartaoSus?: string | null;
  dataNascimento?: string; // YYYY-MM-DD
  sexo?: Sexo;
  telefone?: string | null;
  telefoneSecundario?: string | null;
  email?: string | null;
  nomeMae?: string | null;
  nomePai?: string | null;
  estadoCivil?: EstadoCivil;
  escolaridade?: string | null;
  profissao?: string | null;
  racaCor?: RacaCor;
  endereco?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  grupoSanguineo?: GrupoSanguineo;
  historicoFamiliar?: string[];
  agenteComunitario?: string | null;
  microarea?: string | null;
  equipeSaudeFamilia?: string | null;
}

export interface ExcluirEncaminhamentoRequest {
  motivo: string; // mínimo 10 caracteres
}

export interface AlterarAtivoRequest { ativo: boolean; }
export interface AlterarAtivoResponse { id: string; ativo: boolean; }

export interface ResetarSenhaRequest { novaSenha: string; }

// ============================================================
// ENCAMINHAMENTOS · edição (PATCH)
// ============================================================

export interface AtualizarEncaminhamentoRequest {
  pacienteNome?: string;
  pacienteTelefone?: string;
  pacienteEndereco?: string;
  justificativaClinica?: string;
  prioridade?: PrioridadeClinica;
  cidDescricao?: string;
  especialidadeSolicitada?: string;
  cid10?: string;
}

// ============================================================
// PACIENTES · CRUD de sub-documentos (prontuário)
// ============================================================
// Contrato completo em docs/PRONTUARIO_CRUD.md.
// Todos os endpoints de mutação abaixo retornam `PacienteCompleto`.

// Alergias
export interface CriarAlergiaRequest {
  substancia: string;
  tipo: 'MEDICAMENTO' | 'ALIMENTO' | 'AMBIENTAL' | 'OUTRO';
  gravidade: 'LEVE' | 'MODERADA' | 'GRAVE';
  observacao?: string;
}

// Condições crônicas
export interface CriarCondicaoCronicaRequest {
  cid10: string;
  descricao: string;
  desde: string; // YYYY-MM-DD
  observacao?: string;
}
export interface AtualizarCondicaoCronicaRequest {
  descricao?: string;
  ativo?: boolean;
  observacao?: string | null;
}

// Medicamentos
export interface CriarMedicamentoRequest {
  nome: string;
  dosagem: string;
  frequencia: string;
  desde: string; // YYYY-MM-DD
  prescritor: string;
}
export interface AtualizarMedicamentoRequest {
  ativo?: boolean;
  dosagem?: string;
  frequencia?: string;
  prescritor?: string;
}

// Histórico familiar
export interface AtualizarHistoricoFamiliarRequest {
  itens: string[];
}

// Atendimentos (SOAP)
export interface CriarAtendimentoRequest {
  data: string; // ISO
  tipo:
    | 'CONSULTA_MEDICA'
    | 'ENFERMAGEM'
    | 'VACINACAO'
    | 'CURATIVO'
    | 'ODONTOLOGICO'
    | 'PROCEDIMENTO'
    | 'ACOLHIMENTO';
  profissional: string;
  registroProfissional: string;
  especialidade: string;
  unidade: string;
  queixaPrincipal: string;
  diagnostico: string;
  cid10: string;
  conduta: string;
  prescricaoResumo?: string;
}

// Exames
export interface CriarExameRequest {
  data: string; // ISO
  tipo: string;
  categoria: 'LABORATORIAL' | 'IMAGEM' | 'FUNCIONAL' | 'OUTROS';
  solicitante: string;
  unidadeExecutora: string;
  resultado: 'NORMAL' | 'ALTERADO' | 'CRITICO' | 'PENDENTE';
  observacao?: string;
}

// Vacinação
export interface CriarVacinaRequest {
  data: string; // ISO
  vacina: string;
  dose: string;
  lote: string;
  aplicador: string;
  unidade: string;
  via: 'INTRAMUSCULAR' | 'SUBCUTANEA' | 'ORAL' | 'INTRADERMICA';
}

// Viagens TFD
export interface CriarViagemTfdRequest {
  dataIda: string; // ISO
  dataVolta: string; // ISO
  destino: string;
  unidadeDestino: string;
  motivo: string;
  especialidade: string;
  acompanhante: boolean;
  transporte: 'VAN_SMS' | 'AMBULANCIA' | 'PASSAGEM_RODOVIARIA' | 'PASSAGEM_AEREA';
  custoEstimadoBRL?: number;
}
export interface AtualizarViagemTfdRequest {
  status?: 'AGENDADA' | 'EM_ANDAMENTO' | 'REALIZADA' | 'CANCELADA';
  dataIda?: string;
  dataVolta?: string;
  destino?: string;
  unidadeDestino?: string;
  custoEstimadoBRL?: number;
}

// ============================================================
// BUSCA RÁPIDA POR CPF (apoio ao fluxo de consolidar encaminhamento)
// ============================================================

/**
 * Campos "essenciais" pra um cadastro de paciente ser considerado completo.
 * O backend lista em `BuscarPacientePorCpfResponse.camposFaltantes` os que
 * ainda não foram preenchidos — o frontend deve renderizar SOMENTE esses
 * no formulário complementar.
 */
export type CampoPacienteEssencial =
  | 'nome'
  | 'dataNascimento'
  | 'sexo'
  | 'telefone'
  | 'nomeMae'
  | 'endereco'
  | 'bairro'
  | 'municipio'
  | 'uf'
  | 'cep';

export interface PacienteCadastroParcial {
  id: string;
  nome: string;
  nomeSocial: string | null;
  cpf: string;           // sempre dígitos
  cpfFormatado: string;  // 123.456.789-00
  cartaoSus: string | null;
  dataNascimento: string | null;  // YYYY-MM-DD (null quando placeholder 1970-01-01)
  sexo: 'M' | 'F' | 'OUTRO';
  telefone: string | null;
  telefoneSecundario: string | null;
  email: string | null;
  nomeMae: string | null;
  nomePai: string | null;
  estadoCivil: 'SOLTEIRO' | 'CASADO' | 'DIVORCIADO' | 'VIUVO' | 'UNIAO_ESTAVEL' | 'OUTRO';
  escolaridade: string | null;
  profissao: string | null;
  racaCor: 'BRANCA' | 'PRETA' | 'PARDA' | 'AMARELA' | 'INDIGENA' | 'NAO_INFORMADA';
  endereco: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  grupoSanguineo: string;
  ubsId: string;
}

export interface BuscarPacientePorCpfResponse {
  existe: boolean;
  paciente: PacienteCadastroParcial | null;
  camposFaltantes: CampoPacienteEssencial[];
  completo: boolean;
}

// ============================================================
// APP DO PACIENTE (Face 3)
// ============================================================

export interface PacienteLoginRequest { cpf: string; senha: string; }

/**
 * Resposta de login do paciente (v0.18.0+).
 *
 * Mudanças vs v0.17.x:
 *   - `expiresIn` agora retorna **1800** (30 min) — era 86400 (24h).
 *   - Novos campos `refreshToken` e `refreshExpiresIn` (30 dias rotativo).
 *
 * Apps que ignorarem `refreshToken` continuam funcionando, mas o usuário
 * precisará logar a cada 30 min. Recomendado implementar refresh.
 */
export interface PacienteLoginResponse {
  /** Access token opaco Base64URL · TTL 30 min */
  token: string;
  /** Refresh token rotativo Base64URL · TTL 30 dias · uso único (v0.18.0+) */
  refreshToken: string;
  /** Segundos até access expirar (1800) */
  expiresIn: number;
  /** Segundos até refresh expirar (2592000 = 30 dias) (v0.18.0+) */
  refreshExpiresIn: number;
  paciente: {
    id: string;
    cpf: string;
    cpfFormatado: string;
    nome: string;
    email: string | null;
    telefone: string | null;
    /**
     * `true` quando a senha ainda é o CPF (padrão da conta recém-criada
     * automaticamente pelo backend). O app DEVE redirecionar pra tela de
     * troca de senha antes de liberar navegação.
     */
    senhaProvisoria: boolean;
  };
}

/** Refresh token rotativo do paciente (v0.18.0+). */
export interface PacienteRefreshRequest {
  /** Refresh token opaco salvo no secure storage do app. */
  refreshToken: string;
}

/**
 * Resposta do refresh — MESMO SHAPE do login (token + refreshToken NOVOS).
 * App deve substituir AMBOS no secure storage imediatamente.
 *
 * Após esta chamada, o `refreshToken` da request fica permanentemente marcado
 * como usado — tentar usá-lo de novo dispara `REFRESH_REUSE_DETECTED` e revoga
 * toda a cadeia.
 */
export type PacienteRefreshResponse = PacienteLoginResponse;

/** [legado/roadmap] ativação manual por CPF + data de nascimento. */
export interface AtivarContaPacienteRequest {
  cpf: string;
  dataNascimento: string; // YYYY-MM-DD
  senha: string;
  nome?: string;
}

/** Troca a senha provisória. Obrigatório no primeiro login. */
export interface TrocarSenhaPacienteRequest {
  senhaAtual: string;
  novaSenha: string; // min 8 chars, diferente da atual
}

export interface PacienteMeResponse {
  id: string;
  nome: string;
  cpf: string;
  cpfFormatado: string;
  senhaProvisoria: boolean;
  email: string | null;
  telefone: string | null;
}

export interface NotificacaoPacienteDTO {
  id: string;
  tipo: TipoNotificacaoPaciente;
  titulo: string;
  corpo: string;
  encaminhamentoId: string | null;
  protocolo: string | null;
  payload: Record<string, unknown> | null;
  criadaEm: string;
  lidaEm: string | null;
}

export interface ContadorNotificacoes { naoLidas: number; }

// ============================================================
// BANNERS SMS — CMS admin (v0.15+)
// Endpoints: /v1/admin/sms-banners[/{id}]
// RBAC: DESENVOLVEDOR (global) | ADMIN/REGULADOR_SMS (própria prefeitura)
// ============================================================

export type BannerTone = 'URGENTE' | 'CAMPANHA' | 'INFO' | 'ATENCAO';

export interface AdminBanner {
  id: string;
  titulo: string;
  corpo: string;
  tone: BannerTone;
  publicadoEm: string;
  expiraEm: string | null;
  imagemUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  prioridadeOrdem: number;
  ativo: boolean;
  prefeituraId: string | null;
  totalVisualizacoes: number;
  criadoPorId: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface CriarBannerRequest {
  titulo: string;
  corpo: string;
  tone: BannerTone;
  publicadoEm?: string;
  expiraEm?: string | null;
  imagemUrl?: string | null;   // HTTPS-only
  ctaLabel?: string | null;
  ctaUrl?: string | null;      // HTTPS-only
  prioridadeOrdem?: number;
  prefeituraId?: string | null; // só DEV pode setar null
}

export interface AtualizarBannerRequest {
  titulo?: string;
  corpo?: string;
  tone?: BannerTone;
  publicadoEm?: string;
  expiraEm?: string | null;
  imagemUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  prioridadeOrdem?: number;
  ativo?: boolean;
}
