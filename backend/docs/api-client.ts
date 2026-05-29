/**
 * UNISISM · UBS — Cliente HTTP tipado
 * ───────────────────────────────────────────────
 * 100% das rotas cobertas. Sem dependências externas — usa fetch nativo.
 *
 * Uso (SvelteKit):
 *   import { ApiClient } from '$lib/api/client';
 *   const api = new ApiClient(import.meta.env.VITE_API_BASE_URL);
 *   await api.auth.login({ login: 'SMS-047291', senha: '12345678' });
 *   const me = await api.auth.me();
 *
 * Persistência do token: por padrão usa localStorage. Para SSR/cookies,
 * substitua a implementação de TokenStorage no construtor.
 */

import type {
  AlterarAtivoRequest,
  AlterarAtivoResponse,
  ApiErrorBody,
  AprovarRequest,
  ArvoreNode,
  ArvoreQuery,
  AtendentePerfil,
  AtivarContaPacienteRequest,
  AtualizarEncaminhamentoRequest,
  AtualizarPacienteRequest,
  BuscarPacientePorCpfResponse,
  CriarAlergiaRequest,
  CriarAtendimentoRequest,
  CriarCondicaoCronicaRequest,
  CriarExameRequest,
  CriarMedicamentoRequest,
  CriarVacinaRequest,
  CriarViagemTfdRequest,
  AtualizarCondicaoCronicaRequest,
  AtualizarMedicamentoRequest,
  AtualizarViagemTfdRequest,
  AtualizarPrefeituraRequest,
  AtualizarUbsRequest,
  AtualizarUsuarioRequest,
  ExcluirEncaminhamentoRequest,
  ChangePasswordRequest,
  ContadorNotificacoes,
  CriarEncaminhamentoResponse,
  CriarPrefeituraRequest,
  CriarRelatorioRequest,
  CriarUbsRequest,
  CriarUsuarioRequest,
  CriarUsuarioResponse,
  Encaminhamento,
  ErrorCode,
  ExtracaoPdfResultado,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ListEncaminhamentosQuery,
  ListPacientesQuery,
  ListUbsQuery,
  ListUsuariosQuery,
  LoginRequest,
  LoginResponse,
  MeResponse,
  MetricasDashboard,
  NotificacaoPacienteDTO,
  Paciente,
  PacienteCompleto,
  PacienteLoginRequest,
  PacienteLoginResponse,
  PacienteRefreshRequest,
  PacienteRefreshResponse,
  PacienteMeResponse,
  PacienteResumo,
  Prefeitura,
  RegistrarPendenciaRequest,
  RejeitarRequest,
  Relatorio,
  ResetPasswordRequest,
  ResetPasswordResponse,
  ResetarSenhaRequest,
  RevokeOthersResponse,
  SolicitacaoMedica,
  TipoAnexo,
  TrocarSenhaPacienteRequest,
  Ubs,
  UsuarioListado,
  VerifyCodeRequest,
  VerifyCodeResponse,
} from './types';

// ============================================================
// Persistência do token
// ============================================================

export interface TokenStorage {
  get(): string | null;
  set(token: string | null): void;
}

const localStorageTokens: TokenStorage = {
  get: () => (typeof localStorage !== 'undefined' ? localStorage.getItem('unisism_token') : null),
  set: (t) => {
    if (typeof localStorage === 'undefined') return;
    if (t) localStorage.setItem('unisism_token', t);
    else localStorage.removeItem('unisism_token');
  },
};

// ============================================================
// Erros
// ============================================================

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, body: ApiErrorBody | { error?: Partial<ApiErrorBody['error']> }) {
    const code = body?.error?.code ?? 'ERRO_INTERNO';
    const msg = body?.error?.message ?? 'Erro desconhecido';
    super(msg);
    this.status = status;
    this.code = code;
    this.details = body?.error?.details;
  }
}

// ============================================================
// Anexo (multipart helper)
// ============================================================

export interface AnexoUpload {
  arquivo: File | Blob;
  nome: string;
  tipo: TipoAnexo;
}

// ============================================================
// Cliente principal
// ============================================================

export class ApiClient {
  readonly baseUrl: string;
  readonly tokens: TokenStorage;

  readonly auth: AuthApi;
  readonly perfil: PerfilApi;
  readonly dashboard: DashboardApi;
  readonly encaminhamentos: EncaminhamentosApi;
  readonly pacientes: PacientesApi;
  readonly relatorios: RelatoriosApi;
  readonly admin: AdminApi;
  readonly pacienteApp: PacienteAppApi;

  constructor(baseUrl: string, tokens: TokenStorage = localStorageTokens) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.tokens = tokens;
    this.auth = new AuthApi(this);
    this.perfil = new PerfilApi(this);
    this.dashboard = new DashboardApi(this);
    this.encaminhamentos = new EncaminhamentosApi(this);
    this.pacientes = new PacientesApi(this);
    this.relatorios = new RelatoriosApi(this);
    this.admin = new AdminApi(this);
    this.pacienteApp = new PacienteAppApi(this);
  }

  // ----- Helpers internos -----

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json', ...extra };
    const t = this.tokens.get();
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === '') continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private async parse<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      if (!res.ok) throw new ApiError(res.status, { error: { code: 'ERRO_INTERNO', message: res.statusText } });
      return (await res.text()) as T;
    }
    const body = await res.json();
    if (!res.ok) throw new ApiError(res.status, body as ApiErrorBody);
    return body as T;
  }

  /** GET com query opcional (objeto serializado em querystring). */
  async get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.buildUrl(path, query), { headers: this.headers() });
    return this.parse<T>(res);
  }

  /** POST JSON. Para multipart use postMultipart. */
  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.buildUrl(path), {
      method: 'POST',
      headers: this.headers(body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : null,
    });
    return this.parse<T>(res);
  }

  /** PATCH JSON. */
  async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.buildUrl(path), {
      method: 'PATCH',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    return this.parse<T>(res);
  }

  /** PUT JSON — usado em substituição total (ex.: histórico familiar). */
  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.buildUrl(path), {
      method: 'PUT',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    return this.parse<T>(res);
  }

  /** DELETE, opcionalmente com body JSON. */
  async delete<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.buildUrl(path), {
      method: 'DELETE',
      headers: this.headers(body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : null,
    });
    return this.parse<T>(res);
  }

  async postMultipart<T>(path: string, form: FormData): Promise<T> {
    const res = await fetch(this.buildUrl(path), {
      method: 'POST',
      headers: this.headers(), // browser define Content-Type/boundary
      body: form,
    });
    return this.parse<T>(res);
  }

  /** GET retornando o blob do arquivo (para downloads). */
  async getBlob(path: string): Promise<{ blob: Blob; filename: string }> {
    const res = await fetch(this.buildUrl(path), { headers: this.headers() });
    if (!res.ok) {
      let body: ApiErrorBody;
      try { body = await res.json(); } catch { body = { error: { code: 'ERRO_INTERNO', message: res.statusText } }; }
      throw new ApiError(res.status, body);
    }
    const cd = res.headers.get('content-disposition') ?? '';
    const fnMatch = /filename="?([^"]+)"?/i.exec(cd);
    return { blob: await res.blob(), filename: fnMatch?.[1] ?? 'download' };
  }
}

// ============================================================
// Sub-APIs
// ============================================================

class AuthApi {
  constructor(private readonly api: ApiClient) {}

  async login(req: LoginRequest): Promise<LoginResponse> {
    const out = await this.api.post<LoginResponse>('/auth/login', req);
    this.api.tokens.set(out.token);
    return out;
  }

  async logout(refreshToken?: string): Promise<void> {
    try {
      await this.api.post<void>('/auth/logout', refreshToken ? { refreshToken } : undefined);
    } finally {
      this.api.tokens.set(null);
    }
  }

  forgotPassword(req: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
    return this.api.post<ForgotPasswordResponse>('/auth/forgot-password', req);
  }

  verifyCode(req: VerifyCodeRequest): Promise<VerifyCodeResponse> {
    return this.api.post<VerifyCodeResponse>('/auth/verify-code', req);
  }

  resetPassword(req: ResetPasswordRequest): Promise<ResetPasswordResponse> {
    return this.api.post<ResetPasswordResponse>('/auth/reset-password', req);
  }

  me(): Promise<MeResponse> {
    return this.api.get<MeResponse>('/auth/me');
  }
}

class PerfilApi {
  constructor(private readonly api: ApiClient) {}

  get(): Promise<AtendentePerfil> {
    return this.api.get<AtendentePerfil>('/me/profile');
  }

  changePassword(req: ChangePasswordRequest): Promise<void> {
    return this.api.post<void>('/me/password', req);
  }

  revokeOtherSessions(): Promise<RevokeOthersResponse> {
    return this.api.post<RevokeOthersResponse>('/me/sessions/revoke-others');
  }
}

class DashboardApi {
  constructor(private readonly api: ApiClient) {}

  metrics(): Promise<MetricasDashboard> {
    return this.api.get<MetricasDashboard>('/dashboard/metrics');
  }
}

class EncaminhamentosApi {
  constructor(private readonly api: ApiClient) {}

  /** OCR + extração estruturada do PDF (não persiste). */
  async extractPdf(pdf: File | Blob): Promise<ExtracaoPdfResultado> {
    const fd = new FormData();
    fd.append('file', pdf, (pdf as File).name ?? 'solicitacao.pdf');
    return this.api.postMultipart<ExtracaoPdfResultado>('/encaminhamentos/extract-pdf', fd);
  }

  /** Consolida e envia à Regulação. */
  async create(input: {
    paciente: Paciente;
    solicitacao: SolicitacaoMedica;
    solicitacaoPdf?: File | Blob;
    anexos?: AnexoUpload[];
  }): Promise<CriarEncaminhamentoResponse> {
    const fd = new FormData();
    fd.append('payload', JSON.stringify({
      paciente: input.paciente,
      solicitacao: input.solicitacao,
    }));
    if (input.solicitacaoPdf) {
      fd.append('solicitacao', input.solicitacaoPdf, (input.solicitacaoPdf as File).name ?? 'solicitacao.pdf');
    }
    for (const a of input.anexos ?? []) {
      fd.append('anexo', a.arquivo, a.nome);
      fd.append('tipoAnexo', a.tipo);
    }
    return this.api.postMultipart<CriarEncaminhamentoResponse>('/encaminhamentos', fd);
  }

  list(query?: ListEncaminhamentosQuery): Promise<Encaminhamento[]> {
    return this.api.get<Encaminhamento[]>('/encaminhamentos', query as Record<string, unknown>);
  }

  byId(id: string): Promise<Encaminhamento> {
    return this.api.get<Encaminhamento>(`/encaminhamentos/${encodeURIComponent(id)}`);
  }

  /**
   * Editar dados do encaminhamento.
   *  - ATENDENTE/COORDENADOR: só em AGUARDANDO_REGULACAO
   *  - ADMIN/DESENVOLVEDOR: qualquer status (edição administrativa/correcional · gera evento EDITADO)
   */
  update(id: string, req: AtualizarEncaminhamentoRequest): Promise<Encaminhamento> {
    return this.api.patch<Encaminhamento>(`/encaminhamentos/${encodeURIComponent(id)}`, req);
  }

  /** Soft delete administrativo. ADMIN/DEV. Motivo obrigatório (≥ 10 caracteres). */
  delete(id: string, req: ExcluirEncaminhamentoRequest): Promise<void> {
    return this.api.delete<void>(`/encaminhamentos/${encodeURIComponent(id)}`, req);
  }

  async resolverPendencia(
    id: string,
    nota: string,
    anexos: AnexoUpload[] = [],
  ): Promise<Encaminhamento> {
    const fd = new FormData();
    fd.append('nota', nota);
    for (const a of anexos) {
      fd.append('anexo', a.arquivo, a.nome);
      fd.append('tipoAnexo', a.tipo);
    }
    return this.api.postMultipart<Encaminhamento>(
      `/encaminhamentos/${encodeURIComponent(id)}/resolve-pendencia`,
      fd,
    );
  }

  // ----- Face 2 · SMS -----

  /** Aprovar (REGULADOR_SMS / DESENVOLVEDOR). */
  aprovar(id: string, req: AprovarRequest = {}): Promise<Encaminhamento> {
    return this.api.post<Encaminhamento>(
      `/encaminhamentos/${encodeURIComponent(id)}/aprovar`,
      req,
    );
  }

  /** Solicitar correção / registrar pendência (REGULADOR_SMS / DESENVOLVEDOR). */
  registrarPendencia(id: string, req: RegistrarPendenciaRequest): Promise<Encaminhamento> {
    return this.api.post<Encaminhamento>(
      `/encaminhamentos/${encodeURIComponent(id)}/registrar-pendencia`,
      req,
    );
  }

  /** Rejeitar definitivamente (REGULADOR_SMS / DESENVOLVEDOR). Terminal. */
  rejeitar(id: string, req: RejeitarRequest): Promise<Encaminhamento> {
    return this.api.post<Encaminhamento>(
      `/encaminhamentos/${encodeURIComponent(id)}/rejeitar`,
      req,
    );
  }

  /**
   * Registrar resposta do SUS Federal (após APROVADO).
   * Anexa o PDF oficial e enriquece o registro — não muda o status.
   */
  async registrarRespostaSus(
    id: string,
    pdf: File | Blob,
    observacao: string,
  ): Promise<Encaminhamento> {
    const fd = new FormData();
    fd.append('file', pdf, (pdf as File).name ?? 'resposta-sus.pdf');
    fd.append('observacao', observacao);
    return this.api.postMultipart<Encaminhamento>(
      `/encaminhamentos/${encodeURIComponent(id)}/resposta-sus`,
      fd,
    );
  }

  /**
   * Árvore hierárquica para o file-manager da SMS.
   * - Sem params      → UBSs da prefeitura (ArvoreUbsNode[])
   * - ?ubsId          → anos                (ArvoreAnoNode[])
   * - ?ubsId&ano      → meses               (ArvoreMesNode[])
   * - ?ubsId&ano&mes  → dias                (ArvoreDiaNode[])
   */
  arvore(query: ArvoreQuery = {}): Promise<ArvoreNode[]> {
    return this.api.get<ArvoreNode[]>(
      '/encaminhamentos/arvore',
      query as Record<string, unknown>,
    );
  }
}

class PacientesApi {
  constructor(private readonly api: ApiClient) {}

  list(query?: ListPacientesQuery): Promise<PacienteResumo[]> {
    return this.api.get<PacienteResumo[]>('/pacientes', query as Record<string, unknown>);
  }

  byId(id: string): Promise<PacienteCompleto> {
    return this.api.get<PacienteCompleto>(`/pacientes/${encodeURIComponent(id)}`);
  }

  /**
   * Busca rápida por CPF. Usado no fluxo de consolidação do encaminhamento
   * pra pré-preencher o form e listar campos faltantes.
   *
   * Retorna shape padrão mesmo quando não existe — não lança 404.
   * CPF aceita formatado ou só dígitos.
   */
  porCpf(cpf: string): Promise<BuscarPacientePorCpfResponse> {
    return this.api.get<BuscarPacientePorCpfResponse>(
      `/pacientes/por-cpf/${encodeURIComponent(cpf)}`,
    );
  }

  /** Editar PEC. DEV/ADMIN/COORDENADOR_UBS/ATENDENTE_UBS (cada um no seu escopo). */
  update(id: string, req: AtualizarPacienteRequest): Promise<{ id: string; nome: string }> {
    return this.api.patch<{ id: string; nome: string }>(
      `/pacientes/${encodeURIComponent(id)}`,
      req,
    );
  }

  /** Soft delete. Bloqueia se houver encaminhamentos ativos. */
  delete(id: string): Promise<void> {
    return this.api.delete<void>(`/pacientes/${encodeURIComponent(id)}`);
  }

  // ==========================================================
  // Prontuário (CRUD de sub-documentos) · todos retornam PacienteCompleto
  // Spec: docs/PRONTUARIO_CRUD.md
  // ==========================================================

  private base(pid: string): string {
    return `/pacientes/${encodeURIComponent(pid)}`;
  }

  // Alergias
  addAlergia(pid: string, req: CriarAlergiaRequest): Promise<PacienteCompleto> {
    return this.api.post<PacienteCompleto>(`${this.base(pid)}/alergias`, req);
  }
  removeAlergia(pid: string, alergiaId: string): Promise<PacienteCompleto> {
    return this.api.delete<PacienteCompleto>(`${this.base(pid)}/alergias/${encodeURIComponent(alergiaId)}`);
  }

  // Condições crônicas
  addCondicaoCronica(pid: string, req: CriarCondicaoCronicaRequest): Promise<PacienteCompleto> {
    return this.api.post<PacienteCompleto>(`${this.base(pid)}/condicoes-cronicas`, req);
  }
  updateCondicaoCronica(
    pid: string,
    id: string,
    req: AtualizarCondicaoCronicaRequest,
  ): Promise<PacienteCompleto> {
    return this.api.patch<PacienteCompleto>(
      `${this.base(pid)}/condicoes-cronicas/${encodeURIComponent(id)}`,
      req,
    );
  }
  removeCondicaoCronica(pid: string, id: string): Promise<PacienteCompleto> {
    return this.api.delete<PacienteCompleto>(
      `${this.base(pid)}/condicoes-cronicas/${encodeURIComponent(id)}`,
    );
  }

  // Medicamentos
  addMedicamento(pid: string, req: CriarMedicamentoRequest): Promise<PacienteCompleto> {
    return this.api.post<PacienteCompleto>(`${this.base(pid)}/medicamentos`, req);
  }
  updateMedicamento(
    pid: string,
    id: string,
    req: AtualizarMedicamentoRequest,
  ): Promise<PacienteCompleto> {
    return this.api.patch<PacienteCompleto>(
      `${this.base(pid)}/medicamentos/${encodeURIComponent(id)}`,
      req,
    );
  }
  removeMedicamento(pid: string, id: string): Promise<PacienteCompleto> {
    return this.api.delete<PacienteCompleto>(
      `${this.base(pid)}/medicamentos/${encodeURIComponent(id)}`,
    );
  }

  // Histórico familiar (substituição total — PUT)
  setHistoricoFamiliar(pid: string, itens: string[]): Promise<PacienteCompleto> {
    return this.api.put<PacienteCompleto>(`${this.base(pid)}/historico-familiar`, { itens });
  }

  // Atendimentos (SOAP)
  addAtendimento(pid: string, req: CriarAtendimentoRequest): Promise<PacienteCompleto> {
    return this.api.post<PacienteCompleto>(`${this.base(pid)}/atendimentos`, req);
  }
  removeAtendimento(pid: string, id: string): Promise<PacienteCompleto> {
    return this.api.delete<PacienteCompleto>(
      `${this.base(pid)}/atendimentos/${encodeURIComponent(id)}`,
    );
  }

  // Exames
  addExame(pid: string, req: CriarExameRequest): Promise<PacienteCompleto> {
    return this.api.post<PacienteCompleto>(`${this.base(pid)}/exames`, req);
  }
  removeExame(pid: string, id: string): Promise<PacienteCompleto> {
    return this.api.delete<PacienteCompleto>(`${this.base(pid)}/exames/${encodeURIComponent(id)}`);
  }

  // Vacinação
  addVacina(pid: string, req: CriarVacinaRequest): Promise<PacienteCompleto> {
    return this.api.post<PacienteCompleto>(`${this.base(pid)}/vacinacoes`, req);
  }
  removeVacina(pid: string, id: string): Promise<PacienteCompleto> {
    return this.api.delete<PacienteCompleto>(
      `${this.base(pid)}/vacinacoes/${encodeURIComponent(id)}`,
    );
  }

  // Viagens TFD
  addViagemTfd(pid: string, req: CriarViagemTfdRequest): Promise<PacienteCompleto> {
    return this.api.post<PacienteCompleto>(`${this.base(pid)}/viagens`, req);
  }
  updateViagemTfd(
    pid: string,
    id: string,
    req: AtualizarViagemTfdRequest,
  ): Promise<PacienteCompleto> {
    return this.api.patch<PacienteCompleto>(
      `${this.base(pid)}/viagens/${encodeURIComponent(id)}`,
      req,
    );
  }
  removeViagemTfd(pid: string, id: string): Promise<PacienteCompleto> {
    return this.api.delete<PacienteCompleto>(`${this.base(pid)}/viagens/${encodeURIComponent(id)}`);
  }
}

class RelatoriosApi {
  constructor(private readonly api: ApiClient) {}

  list(): Promise<Relatorio[]> {
    return this.api.get<Relatorio[]>('/relatorios');
  }

  create(req: CriarRelatorioRequest): Promise<Relatorio> {
    return this.api.post<Relatorio>('/relatorios', req);
  }

  download(id: string): Promise<{ blob: Blob; filename: string }> {
    return this.api.getBlob(`/relatorios/${encodeURIComponent(id)}/download`);
  }

  /** Helper: cria + faz polling até DISPONIVEL ou FALHA. */
  async createAndWait(
    req: CriarRelatorioRequest,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<Relatorio> {
    const { intervalMs = 2000, timeoutMs = 60_000 } = opts;
    const inicial = await this.create(req);
    const inicio = Date.now();
    while (Date.now() - inicio < timeoutMs) {
      const lista = await this.list();
      const r = lista.find((x) => x.id === inicial.id);
      if (r && r.status !== 'PROCESSANDO') return r;
      await new Promise((res) => setTimeout(res, intervalMs));
    }
    throw new ApiError(409, { error: { code: 'RELATORIO_NAO_DISPONIVEL', message: 'Timeout aguardando relatório' } });
  }
}

class AdminApi {
  constructor(private readonly api: ApiClient) {}

  // Prefeituras
  listPrefeituras(): Promise<Prefeitura[]> {
    return this.api.get<Prefeitura[]>('/admin/prefeituras');
  }
  createPrefeitura(req: CriarPrefeituraRequest): Promise<Prefeitura> {
    return this.api.post<Prefeitura>('/admin/prefeituras', req);
  }

  // UBSs
  listUbs(query?: ListUbsQuery): Promise<Ubs[]> {
    return this.api.get<Ubs[]>('/admin/ubs', query as Record<string, unknown>);
  }
  createUbs(req: CriarUbsRequest): Promise<Ubs> {
    return this.api.post<Ubs>('/admin/ubs', req);
  }

  // Usuários
  listUsuarios(query?: ListUsuariosQuery): Promise<UsuarioListado[]> {
    return this.api.get<UsuarioListado[]>('/admin/usuarios', query as Record<string, unknown>);
  }
  createUsuario(req: CriarUsuarioRequest): Promise<CriarUsuarioResponse> {
    return this.api.post<CriarUsuarioResponse>('/admin/usuarios', req);
  }
  updateUsuario(id: string, req: AtualizarUsuarioRequest): Promise<CriarUsuarioResponse> {
    return this.api.patch<CriarUsuarioResponse>(
      `/admin/usuarios/${encodeURIComponent(id)}`,
      req,
    );
  }
  deleteUsuario(id: string): Promise<void> {
    return this.api.delete<void>(`/admin/usuarios/${encodeURIComponent(id)}`);
  }
  /** Ativar (true) ou desativar (false) usuário. */
  setAtivoUsuario(id: string, ativo: boolean): Promise<AlterarAtivoResponse> {
    return this.api.post<AlterarAtivoResponse>(
      `/admin/usuarios/${encodeURIComponent(id)}/ativo`,
      { ativo } satisfies AlterarAtivoRequest,
    );
  }
  /** Admin redefine senha (usuário será forçado a trocar no próximo login). */
  resetarSenhaUsuario(id: string, novaSenha: string): Promise<void> {
    return this.api.post<void>(
      `/admin/usuarios/${encodeURIComponent(id)}/reset-senha`,
      { novaSenha } satisfies ResetarSenhaRequest,
    );
  }

  // Prefeituras — editar/excluir
  updatePrefeitura(id: string, req: AtualizarPrefeituraRequest): Promise<Prefeitura> {
    return this.api.patch<Prefeitura>(`/admin/prefeituras/${encodeURIComponent(id)}`, req);
  }
  /** Só DESENVOLVEDOR. Bloqueia se houver UBSs/usuários ativos. */
  deletePrefeitura(id: string): Promise<void> {
    return this.api.delete<void>(`/admin/prefeituras/${encodeURIComponent(id)}`);
  }

  // UBSs — editar/excluir
  updateUbs(id: string, req: AtualizarUbsRequest): Promise<Ubs> {
    return this.api.patch<Ubs>(`/admin/ubs/${encodeURIComponent(id)}`, req);
  }
  /** DEV/ADMIN. Bloqueia se houver atendentes ativos ou encaminhamentos pendentes. */
  deleteUbs(id: string): Promise<void> {
    return this.api.delete<void>(`/admin/ubs/${encodeURIComponent(id)}`);
  }
}

// ============================================================
// Face 3 — App do Paciente
// ============================================================

/**
 * Cliente separado do backend para o app do paciente.
 * Usa seu próprio bearer token (não é JWT da Face 1/2) e token storage
 * separado por padrão (`unisism_paciente_token` em localStorage).
 */
class PacienteAppApi {
  constructor(private readonly api: ApiClient) {}

  private readonly PAC_TOKEN_KEY = 'unisism_paciente_token';
  private readonly PAC_REFRESH_KEY = 'unisism_paciente_refresh';

  private getPacToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(this.PAC_TOKEN_KEY);
  }
  private setPacToken(t: string | null): void {
    if (typeof localStorage === 'undefined') return;
    if (t) localStorage.setItem(this.PAC_TOKEN_KEY, t);
    else localStorage.removeItem(this.PAC_TOKEN_KEY);
  }

  private getPacRefresh(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(this.PAC_REFRESH_KEY);
  }
  private setPacRefresh(t: string | null): void {
    if (typeof localStorage === 'undefined') return;
    if (t) localStorage.setItem(this.PAC_REFRESH_KEY, t);
    else localStorage.removeItem(this.PAC_REFRESH_KEY);
  }

  private pacHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json', ...extra };
    const t = this.getPacToken();
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  private async req<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.api.baseUrl}/paciente-app${path}`, {
      method,
      headers: this.pacHeaders(body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : null,
    });
    if (res.status === 204) return undefined as T;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      if (!res.ok) throw new ApiError(res.status, { error: { code: 'ERRO_INTERNO', message: res.statusText } });
      return (await res.text()) as T;
    }
    const data = await res.json();
    if (!res.ok) throw new ApiError(res.status, data as ApiErrorBody);
    return data as T;
  }

  async login(req: PacienteLoginRequest): Promise<PacienteLoginResponse> {
    const out = await this.req<PacienteLoginResponse>('POST', '/auth/login', req);
    this.setPacToken(out.token);
    this.setPacRefresh(out.refreshToken);
    return out;
  }

  /**
   * Rotaciona access+refresh (v0.18.0+).
   * Salva o novo par no storage. Em caso de erro, limpa os tokens locais
   * (sessão é inválida, app deve voltar pra /login).
   *
   * Use em interceptor: quando recebe 401 num endpoint protegido,
   * chame `refresh()` antes de redirecionar pro login. Se `refresh()`
   * estourar `REFRESH_REUSE_DETECTED`, mostre alerta de segurança.
   */
  async refresh(): Promise<PacienteRefreshResponse> {
    const current = this.getPacRefresh();
    if (!current) {
      throw new ApiError(401, {
        error: { code: 'REFRESH_TOKEN_INVALIDO', message: 'Sem refresh token salvo' },
      });
    }
    try {
      const out = await this.req<PacienteRefreshResponse>('POST', '/auth/refresh', {
        refreshToken: current,
      });
      // CRITICAL: substituir AMBOS imediatamente
      this.setPacToken(out.token);
      this.setPacRefresh(out.refreshToken);
      return out;
    } catch (err) {
      // Qualquer erro → limpar (forçar re-login)
      this.setPacToken(null);
      this.setPacRefresh(null);
      throw err;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.req<void>('POST', '/auth/logout');
    } finally {
      this.setPacToken(null);
      this.setPacRefresh(null);
    }
  }

  ativarConta(req: AtivarContaPacienteRequest): Promise<void> {
    return this.req<void>('POST', '/auth/ativar-conta', req);
  }

  /**
   * Troca a senha do paciente autenticado. Use no primeiro login
   * quando `paciente.senhaProvisoria === true`.
   */
  trocarSenha(req: TrocarSenhaPacienteRequest): Promise<void> {
    return this.req<void>('POST', '/auth/trocar-senha', req);
  }

  /**
   * Inicia fluxo de recuperação. **SEMPRE 204** (anti-enumeration).
   * Rate-limited: 5 req/15min/IP + 3 req/1h/CPF (429 RATE_LIMIT_EXCEDIDO).
   */
  esqueciSenhaPaciente(cpf: string): Promise<void> {
    return this.req<void>('POST', '/auth/esqueci-senha', { cpf });
  }

  /**
   * Conclui recuperação com token do email (64 hex, TTL 30min, uso único).
   * Rate-limited: 10 req/15min/IP.
   *
   * Códigos: 404 TOKEN_INVALIDO, 409 TOKEN_JA_USADO, 401 TOKEN_EXPIRADO,
   *          422 SENHA_FRACA, 422 SENHA_IGUAL_ATUAL, 429 RATE_LIMIT_EXCEDIDO.
   */
  redefinirSenhaPaciente(token: string, novaSenha: string): Promise<void> {
    return this.req<void>('POST', '/auth/redefinir-senha', { token, novaSenha });
  }

  me(): Promise<PacienteMeResponse> {
    return this.req<PacienteMeResponse>('GET', '/me');
  }

  meusEncaminhamentos(): Promise<Encaminhamento[]> {
    return this.req<Encaminhamento[]>('GET', '/meus-encaminhamentos');
  }

  notificacoes(apenasNaoLidas = false): Promise<NotificacaoPacienteDTO[]> {
    const qs = apenasNaoLidas ? '?apenasNaoLidas=true' : '';
    return this.req<NotificacaoPacienteDTO[]>('GET', `/notificacoes${qs}`);
  }

  contadorNotificacoes(): Promise<ContadorNotificacoes> {
    return this.req<ContadorNotificacoes>('GET', '/notificacoes/count');
  }

  marcarLida(notificacaoId: string): Promise<void> {
    return this.req<void>('POST', `/notificacoes/${encodeURIComponent(notificacaoId)}/lida`);
  }

  marcarTodasLidas(): Promise<{ atualizadas: number }> {
    return this.req<{ atualizadas: number }>('POST', '/notificacoes/marcar-todas-lidas');
  }

  /** Download de anexo com auth do paciente. Só libera se scanStatus=LIMPO. */
  async downloadAnexo(anexoId: string): Promise<{ blob: Blob; filename: string }> {
    const res = await fetch(
      `${this.api.baseUrl}/paciente-app/anexos/${encodeURIComponent(anexoId)}/download`,
      { headers: this.pacHeaders() },
    );
    if (!res.ok) {
      let body: ApiErrorBody;
      try { body = await res.json(); } catch { body = { error: { code: 'ERRO_INTERNO', message: res.statusText } }; }
      throw new ApiError(res.status, body);
    }
    const cd = res.headers.get('content-disposition') ?? '';
    const fnMatch = /filename="?([^"]+)"?/i.exec(cd);
    return { blob: await res.blob(), filename: fnMatch?.[1] ?? 'documento.pdf' };
  }
}
