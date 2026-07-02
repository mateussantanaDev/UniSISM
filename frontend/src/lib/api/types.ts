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
  | 'REGULADOR_SMS'
  | 'GESTOR_TFD'
  | 'REGULADOR_TFD';

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
  /**
   * v0.9.1 — APROVADOS sem `respostaSUS` (aguardando retorno do SUS Federal).
   * Alimenta o card "Enviados" do dashboard simplificado.
   */
  enviadosAguardandoResposta: number;
  /**
   * v0.9.1 — Aprovados com resposta do SUS registrada.
   * Alimenta o card "Respondidos" do dashboard simplificado.
   */
  respondidosTotal: number;
  slaRegulacaoPorcento: number;
}

// ============================================================
// ENCAMINHAMENTOS
// ============================================================

/**
 * Shape do paciente enviado no POST /encaminhamentos.
 *
 * Obrigatórios: nome, cpf, cartaoSus, dataNascimento, sexo, telefone, endereco.
 * Complementares (v0.6.0+): todos os demais — backend preenche só se o campo
 * correspondente do Paciente existente estiver vazio. Nada que o atendente já
 * preencheu é sobrescrito por OCR ruim.
 */
export interface Paciente {
  nome: string;
  cpf: string;
  cartaoSus: string;
  dataNascimento: string;   // YYYY-MM-DD
  sexo: Sexo;
  telefone: string;
  endereco: string;

  // ─── Complementares opcionais (cadastro incremental) ───
  nomeSocial?: string;
  telefoneSecundario?: string;
  email?: string;
  nomeMae?: string;
  nomePai?: string;
  estadoCivil?: EstadoCivil;
  escolaridade?: string;
  profissao?: string;
  racaCor?: RacaCor;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
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
  respostaSUS?: RespostaSUS | null;
  criadoEm: string;
  atualizadoEm: string;
}

// ---- Face 2 · Regulação SMS ----

export interface AprovarRequest {
  nota?: string;
  agendamentoPrevisto?: string; // YYYY-MM-DD
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
  /** v0.9.1 — filtra contagens por presença de resposta SUS. */
  respostaSUS?: boolean;
  /** v0.9.1 — quando true, exclui encaminhamentos `RASCUNHO` da árvore. */
  excluirRascunho?: boolean;
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
  /** v0.9.1 — filtra por presença de resposta SUS no encaminhamento. */
  respostaSUS?: boolean;
}

// ============================================================
// PACIENTE / PEC
// ============================================================

export interface Alergia {
  id: string;                // atribuído pelo backend
  substancia: string;
  tipo: 'MEDICAMENTO' | 'ALIMENTO' | 'AMBIENTAL' | 'OUTRO';
  gravidade: 'LEVE' | 'MODERADA' | 'GRAVE';
  observacao?: string;
}

export interface CondicaoCronica {
  id: string;                // atribuído pelo backend
  cid10: string;
  descricao: string;
  desde: string;             // YYYY-MM-DD
  ativo: boolean;
  observacao?: string;
}

export interface MedicamentoEmUso {
  id: string;                // atribuído pelo backend
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

/**
 * Campos "essenciais" do cadastro — definidos pelo backend como a lista
 * canônica em `GET /pacientes/por-cpf/:cpf`. Se algum destes estiver vazio
 * (ou com sentinela tipo OUTRO / NAO_INFORMADA / dataNascimento = 1970-01-01),
 * o backend lista no `camposFaltantes`.
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

/**
 * Snapshot parcial retornado por `GET /pacientes/por-cpf/:cpf` quando o
 * paciente existe no banco. Contém o que está salvo hoje (alguns campos
 * podem ser null) + ubsId. Usado para pré-preencher o form complementar
 * no wizard de novo encaminhamento.
 */
export interface PacienteCadastroParcial {
  id: string;
  nome: string;
  nomeSocial: string | null;
  cpf: string;              // sempre dígitos (11 chars)
  cpfFormatado: string;
  cartaoSus: string | null;
  dataNascimento: string | null;  // YYYY-MM-DD ou null se foi placeholder
  sexo: Sexo;
  telefone: string | null;
  telefoneSecundario: string | null;
  email: string | null;
  nomeMae: string | null;
  nomePai: string | null;
  estadoCivil: EstadoCivil;
  escolaridade: string | null;
  profissao: string | null;
  racaCor: RacaCor;
  endereco: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  grupoSanguineo: string;
  ubsId: string;
}

/**
 * Resposta estável de `GET /pacientes/por-cpf/:cpf`.
 * NUNCA retorna 404 — sempre traz esse shape com `existe: false` quando
 * o CPF é novo, inválido ou fora do escopo do usuário.
 */
export interface BuscarPacientePorCpfResponse {
  existe: boolean;
  paciente: PacienteCadastroParcial | null;
  camposFaltantes: CampoPacienteEssencial[];
  completo: boolean;        // true quando camposFaltantes está vazio
}

/**
 * Contrato de atualização parcial (PATCH) de Paciente.
 * Backend: PATCH /pacientes/:id
 *
 * Diferente do upsert-via-encaminhamento (que só preenche se vazio),
 * este endpoint **sobrescreve** explicitamente o campo — é edição direta
 * pelo usuário. Permitido para ATENDENTE_UBS (sua UBS), COORDENADOR_UBS,
 * ADMIN e DESENVOLVEDOR.
 *
 * CPF, Cartão SUS e ubsId NÃO podem ser alterados via este endpoint
 * (identidade / transferência tem endpoint próprio).
 */
export interface AtualizarPacienteRequest {
  nome?: string;
  nomeSocial?: string | null;
  nomeMae?: string;
  nomePai?: string | null;
  dataNascimento?: string;
  sexo?: Sexo;
  estadoCivil?: EstadoCivil;
  escolaridade?: string;
  profissao?: string | null;
  racaCor?: RacaCor;
  telefone?: string;
  telefoneSecundario?: string | null;
  email?: string | null;
  endereco?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  grupoSanguineo?: GrupoSanguineo;
  agenteComunitario?: string | null;
  microarea?: string | null;
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

/**
 * Contrato de atualização parcial (PATCH) de Prefeitura.
 * Backend (v0.6.0+) deve expor: PATCH /admin/prefeituras/:id
 */
export interface AtualizarPrefeituraRequest {
  nome?: string;
  municipio?: string;
  uf?: string;
  cnpj?: string | null;
  ativa?: boolean;
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
}

/**
 * Contrato de atualização parcial (PATCH) de UBS.
 * Backend (v0.6.0+) deve expor: PATCH /admin/ubs/:id
 */
export interface AtualizarUbsRequest {
  nome?: string;
  municipio?: string;
  uf?: string;
  endereco?: string | null;
  cnes?: string | null;
  ativa?: boolean;
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
  matricula?: string;
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
  // Face 2 — Regulação
  | 'ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO' | 'OBSERVACAO_OBRIGATORIA' | 'MOTIVO_OBRIGATORIO'
  | 'AGENDAMENTO_INVALIDO' | 'AGENDAMENTO_NO_PASSADO'
  | 'ENCAMINHAMENTO_NAO_APROVADO' | 'RESPOSTA_SUS_JA_REGISTRADA' | 'PDF_RESPOSTA_OBRIGATORIO'
  | 'PARAMS_INCOMPATIVEIS' | 'UBS_NAO_ENCONTRADA'
  // CRUD usuários extended
  | 'AUTO_EXCLUSAO_PROIBIDA' | 'AUTO_DESATIVACAO_PROIBIDA'
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
// PACIENTES · CRUD de sub-documentos do prontuário
// Backend v0.7.0+ · ver backend/docs/PRONTUARIO_CRUD.md
// ============================================================

// ─── Quadro clínico ───

export interface CriarAlergiaRequest {
  substancia: string;
  tipo: 'MEDICAMENTO' | 'ALIMENTO' | 'AMBIENTAL' | 'OUTRO';
  gravidade: 'LEVE' | 'MODERADA' | 'GRAVE';
  observacao?: string;
}

export interface CriarCondicaoCronicaRequest {
  cid10: string;
  descricao: string;
  desde: string;             // YYYY-MM-DD
  ativo?: boolean;           // default true
  observacao?: string;
}

export interface AtualizarCondicaoCronicaRequest {
  descricao?: string;
  ativo?: boolean;
  observacao?: string | null;
}

export interface CriarMedicamentoRequest {
  nome: string;
  dosagem: string;
  frequencia: string;
  desde: string;             // YYYY-MM-DD
  prescritor: string;
  ativo?: boolean;           // default true
}

export interface AtualizarMedicamentoRequest {
  dosagem?: string;
  frequencia?: string;
  prescritor?: string;
  ativo?: boolean;           // suspender/reativar
}

/**
 * Substitui toda a lista de histórico familiar — o backend grava as
 * strings na ordem fornecida. Use string vazia pra "limpar".
 */
export interface AtualizarHistoricoFamiliarRequest {
  itens: string[];
}

// ─── Atendimentos ───

export interface CriarAtendimentoRequest {
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

// ─── Exames ───

export interface CriarExameRequest {
  data: string;              // YYYY-MM-DD (data da coleta/realização)
  tipo: string;              // nome/descrição do exame
  categoria: 'LABORATORIAL' | 'IMAGEM' | 'FUNCIONAL' | 'OUTROS';
  solicitante: string;
  unidadeExecutora: string;
  resultado: ResultadoExame;
  observacao?: string;
}

// ─── Vacinação ───

export interface CriarVacinaRequest {
  data: string;              // YYYY-MM-DD
  vacina: string;
  dose: string;              // "1ª Dose", "Reforço", etc.
  lote: string;
  aplicador: string;
  unidade: string;
  via: 'INTRAMUSCULAR' | 'SUBCUTANEA' | 'ORAL' | 'INTRADERMICA';
}

// ─── Viagens TFD ───

export interface CriarViagemTfdRequest {
  protocolo: string;
  dataIda: string;
  dataVolta: string;
  destino: string;
  unidadeDestino: string;
  motivo: string;
  especialidade: string;
  acompanhante: boolean;
  transporte: 'VAN_SMS' | 'AMBULANCIA' | 'PASSAGEM_RODOVIARIA' | 'PASSAGEM_AEREA';
  status?: StatusViagemTFD;  // default AGENDADA
  custoEstimadoBRL: number;
}

export interface AtualizarViagemTfdRequest {
  dataIda?: string;
  dataVolta?: string;
  destino?: string;
  unidadeDestino?: string;
  motivo?: string;
  especialidade?: string;
  acompanhante?: boolean;
  transporte?: 'VAN_SMS' | 'AMBULANCIA' | 'PASSAGEM_RODOVIARIA' | 'PASSAGEM_AEREA';
  status?: StatusViagemTFD;
  custoEstimadoBRL?: number;
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
// APP DO PACIENTE (Face 3)
// ============================================================

export interface PacienteLoginRequest { cpf: string; senha: string; }
export interface PacienteLoginResponse {
  token: string;
  expiresIn: number;
  paciente: {
    id: string;
    cpf: string;
    cpfFormatado: string;
    nome: string;
    email: string | null;
    telefone: string | null;
    /**
     * true quando o paciente ainda está com a senha inicial (igual ao CPF).
     * App deve forçar tela de troca de senha BLOQUEANTE antes de qualquer
     * outra navegação.
     */
    senhaProvisoria: boolean;
  };
}

/**
 * Fluxo legado — o backend continua aceitando pra manter compat, mas o
 * fluxo principal da v0.6.0+ é login direto com CPF+CPF e trocar senha
 * via `POST /paciente-app/auth/trocar-senha`.
 */
export interface AtivarContaPacienteRequest {
  cpf: string;
  dataNascimento: string; // YYYY-MM-DD
  senha: string;
  nome?: string;
}

/** Troca de senha obrigatória no primeiro acesso (v0.6.0+). */
export interface TrocarSenhaPacienteRequest {
  senhaAtual: string;
  novaSenha: string;      // min 8 chars, diferente da atual
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
// ADMIN · BANNERS SMS (CMS do app paciente)
// ============================================================
// Alimentam o carrossel "Avisos da Secretaria" no app paciente (Face 3).
//
// RBAC:
//   - DESENVOLVEDOR (GLOBAL): qualquer banner; pode setar `prefeituraId: null`
//     para criar banner GLOBAL (visto por todos os pacientes).
//   - ADMIN/REGULADOR_SMS (PREFEITURA): banners da própria prefeitura apenas.
//     Tentar `prefeituraId: null` → 403 FORA_DO_ESCOPO.
//
// Endpoints: GET/POST `/v1/admin/sms-banners` · GET/PATCH/DELETE `/:id`

/** Tom semântico do banner — usado pelo app para cor/ícone do card. */
export type BannerTone = 'URGENTE' | 'CAMPANHA' | 'INFO' | 'ATENCAO';

/** DTO retornado pelo backend nas rotas admin de banners. */
export interface AdminBanner {
  id: string;
  titulo: string;
  corpo: string;
  tone: BannerTone;
  publicadoEm: string;           // ISO 8601 UTC
  expiraEm: string | null;       // ISO 8601 UTC ou null (sem validade)
  imagemUrl: string | null;      // HTTPS obrigatório
  ctaLabel: string | null;       // exige ctaUrl pareado
  ctaUrl: string | null;         // HTTPS obrigatório
  prioridadeOrdem: number;       // [-100, 1000]; maior = mais alto no carrossel
  ativo: boolean;
  /**
   * `null` = banner GLOBAL (visível para pacientes de qualquer prefeitura).
   * Setar `null` só é permitido para DESENVOLVEDOR.
   */
  prefeituraId: string | null;
  totalVisualizacoes: number;    // contagem agregada em sms_banner_views
  criadoPorId: string;
  criadoEm: string;
  atualizadoEm: string;
}

/** Filtros aceitos por GET /v1/admin/sms-banners. */
export interface ListarBannersQuery {
  /** Filtra por `ativo = true|false`. Omitir = traz todos. */
  ativo?: boolean;
  /**
   * Filtra por expiração:
   *   `true`  → SÓ expirados (expiraEm < now)
   *   `false` → exclui expirados (expiraEm null OU > now)
   *   omitir  → todos
   */
  expirados?: boolean;
}

/** Body do POST /v1/admin/sms-banners. */
export interface CriarBannerRequest {
  titulo: string;                // 3-80 chars (sanitizado)
  corpo: string;                 // 3-400 chars (sanitizado)
  tone: BannerTone;
  publicadoEm?: string;          // ISO 8601; default now()
  expiraEm?: string | null;      // ISO 8601 ou null; deve ser > publicadoEm
  imagemUrl?: string | null;     // HTTPS, ≤500 chars
  ctaLabel?: string | null;      // ≤30 chars; exige ctaUrl
  ctaUrl?: string | null;        // HTTPS, ≤500 chars; exige ctaLabel
  prioridadeOrdem?: number;      // [-100, 1000]; default 0
  /**
   * DEV pode setar `null` para criar banner global.
   * ADMIN/REGULADOR_SMS: backend deriva do scope; passar valor diferente do
   * próprio prefeituraId → 403.
   */
  prefeituraId?: string | null;
}

/**
 * Body do PATCH /v1/admin/sms-banners/:id.
 *
 * Nota: `prefeituraId` NÃO é editável (mudaria o escopo do banner — para isso,
 * exclua e crie um novo). O backend rejeita silenciosamente esse campo.
 */
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

// ============================================================
// ADMIN · RECOMENDAÇÕES POR ESPECIALIDADE
// ============================================================
// "O que levar no dia" — exibidas no detalhe do encaminhamento no app paciente
// (Face 3). Globais (não escopadas por prefeitura) — uma especialidade tem um
// único conjunto de recomendações compartilhado entre todos os tenants.
//
// Endpoints: GET/POST `/v1/admin/recomendacoes-especialidade` ·
//            GET/PATCH/DELETE `/:id`
// RBAC: DEV, ADMIN, REGULADOR_SMS.

/** DTO retornado pelo backend nas rotas admin. */
export interface Recomendacao {
  id: string;
  /** Nome da especialidade (ex.: "Cardiologia"). 3-80 chars, único. */
  especialidade: string;
  /** Lista de frases curtas (≤200 chars cada). 1-10 itens. */
  recomendacoes: string[];
  ativo: boolean;
  criadoEm: string;   // ISO 8601 UTC
  atualizadoEm: string;
}

/** Filtros aceitos por GET /v1/admin/recomendacoes-especialidade. */
export interface ListarRecomendacoesQuery {
  /** Quando true, exclui recomendações inativas. Omitir = traz todas. */
  somenteAtivos?: boolean;
}

/** Body do POST. Erro 409 `ESPECIALIDADE_DUPLICADA` se já existir. */
export interface CriarRecomendacaoRequest {
  especialidade: string;          // 3-80 chars
  recomendacoes: string[];        // 1-10 itens, ≤200 chars cada
}

/** Body do PATCH. Todos os campos opcionais. */
export interface AtualizarRecomendacaoRequest {
  especialidade?: string;
  recomendacoes?: string[];
  ativo?: boolean;
}
