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
  AdminBanner,
  AlterarAtivoRequest,
  AlterarAtivoResponse,
  ApiErrorBody,
  AprovarRequest,
  ArvoreNode,
  ArvoreQuery,
  AtendentePerfil,
  AtivarContaPacienteRequest,
  AtualizarBannerRequest,
  AtualizarEncaminhamentoRequest,
  AtualizarRecomendacaoRequest,
  AtualizarPrefeituraRequest,
  AtualizarCondicaoCronicaRequest,
  AtualizarHistoricoFamiliarRequest,
  AtualizarMedicamentoRequest,
  AtualizarPacienteRequest,
  AtualizarUbsRequest,
  AtualizarUsuarioRequest,
  AtualizarViagemTfdRequest,
  BuscarPacientePorCpfResponse,
  CriarAlergiaRequest,
  CriarAtendimentoRequest,
  CriarBannerRequest,
  CriarCondicaoCronicaRequest,
  CriarExameRequest,
  CriarMedicamentoRequest,
  CriarRecomendacaoRequest,
  CriarVacinaRequest,
  CriarViagemTfdRequest,
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
  ListarBannersQuery,
  ListarRecomendacoesQuery,
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
  PacienteMeResponse,
  PacienteResumo,
  Prefeitura,
  Recomendacao,
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
  readonly tfd: TfdApi;

  private _onUnauthorized?: (code: string) => void;

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
    this.tfd = new TfdApi(this);
  }

  /** Registra callback disparado em qualquer resposta 401 (inclui code do erro). */
  setOnUnauthorized(cb: (code: string) => void) {
    this._onUnauthorized = cb;
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
      if (!res.ok) {
        if (res.status === 401) this._onUnauthorized?.('NAO_AUTENTICADO');
        throw new ApiError(res.status, { error: { code: 'ERRO_INTERNO', message: res.statusText } });
      }
      return (await res.text()) as T;
    }
    const body = await res.json();
    if (!res.ok) {
      const code = (body as ApiErrorBody)?.error?.code ?? 'ERRO_INTERNO';
      if (res.status === 401) this._onUnauthorized?.(code);
      throw new ApiError(res.status, body as ApiErrorBody);
    }
    return body as T;
  }

  /** GET com query opcional (objeto serializado em querystring). */
  async get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.buildUrl(path, query), { headers: this.headers() });
    return this.parse<T>(res);
  }

  /** POST JSON. Para multipart use postMultipart. */
  async post<T>(
    path: string,
    body?: unknown,
    opts?: { idempotencyKey?: string },
  ): Promise<T> {
    const extra: Record<string, string> = body ? { 'Content-Type': 'application/json' } : {};
    if (opts?.idempotencyKey) extra['X-Idempotency-Key'] = opts.idempotencyKey;
    const res = await fetch(this.buildUrl(path), {
      method: 'POST',
      headers: this.headers(extra),
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

  /** PUT JSON — substituição total (ex.: histórico familiar inteiro). */
  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.buildUrl(path), {
      method: 'PUT',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    return this.parse<T>(res);
  }

  /** DELETE. */
  async delete<T>(path: string): Promise<T> {
    const res = await fetch(this.buildUrl(path), {
      method: 'DELETE',
      headers: this.headers(),
    });
    return this.parse<T>(res);
  }

  async postMultipart<T>(
    path: string,
    form: FormData,
    opts?: { idempotencyKey?: string },
  ): Promise<T> {
    const extra: Record<string, string> = {};
    if (opts?.idempotencyKey) extra['X-Idempotency-Key'] = opts.idempotencyKey;
    const res = await fetch(this.buildUrl(path), {
      method: 'POST',
      headers: this.headers(extra), // browser define Content-Type/boundary
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
      if (res.status === 401) this._onUnauthorized?.(body.error.code);
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

  /** Editar dados do encaminhamento (apenas AGUARDANDO_REGULACAO). */
  update(id: string, req: AtualizarEncaminhamentoRequest): Promise<Encaminhamento> {
    return this.api.patch<Encaminhamento>(`/encaminhamentos/${encodeURIComponent(id)}`, req);
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

  /**
   * Download de anexo do encaminhamento (qualquer `tipo`, inclusive
   * RESPOSTA_SUS). Backend valida `scanStatus = LIMPO` antes de servir;
   * caso contrário responde 409 ANEXO_NAO_LIBERADO.
   */
  downloadAnexo(anexoId: string): Promise<{ blob: Blob; filename: string }> {
    return this.api.getBlob(`/anexos/${encodeURIComponent(anexoId)}/download`);
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
   * Busca estável por CPF (v0.6.0+).
   *
   * GET /pacientes/por-cpf/:cpf — aceita CPF formatado ou só dígitos.
   * Nunca retorna 404: sempre traz `{ existe, paciente, camposFaltantes, completo }`.
   *
   * Usado pelo wizard de novo encaminhamento para decidir se renderiza
   * o form complementar (e quais campos dele).
   */
  porCpf(cpf: string): Promise<BuscarPacientePorCpfResponse> {
    const sanitizado = cpf.replace(/\D/g, '');
    return this.api.get<BuscarPacientePorCpfResponse>(
      `/pacientes/por-cpf/${encodeURIComponent(sanitizado)}`,
    );
  }

  /** PATCH /pacientes/:id — edição direta, sobrescreve explicitamente. */
  update(id: string, req: AtualizarPacienteRequest): Promise<PacienteCompleto> {
    return this.api.patch<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(id)}`,
      req,
    );
  }

  // ════════════════════════════════════════════════════════════
  // Prontuário clínico — CRUD de sub-documentos (v0.7.0+)
  //
  // Todos retornam `PacienteCompleto` atualizado para o frontend
  // fazer um único refresh no `pacienteContext.atualizar(r)`.
  // ════════════════════════════════════════════════════════════

  // ─── Alergias ───
  addAlergia(pacienteId: string, req: CriarAlergiaRequest): Promise<PacienteCompleto> {
    return this.api.post<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/alergias`,
      req,
    );
  }
  removeAlergia(pacienteId: string, alergiaId: string): Promise<PacienteCompleto> {
    return this.api.delete<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/alergias/${encodeURIComponent(alergiaId)}`,
    );
  }

  // ─── Condições crônicas ───
  addCondicaoCronica(
    pacienteId: string,
    req: CriarCondicaoCronicaRequest,
  ): Promise<PacienteCompleto> {
    return this.api.post<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/condicoes-cronicas`,
      req,
    );
  }
  updateCondicaoCronica(
    pacienteId: string,
    condicaoId: string,
    req: AtualizarCondicaoCronicaRequest,
  ): Promise<PacienteCompleto> {
    return this.api.patch<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/condicoes-cronicas/${encodeURIComponent(condicaoId)}`,
      req,
    );
  }
  removeCondicaoCronica(
    pacienteId: string,
    condicaoId: string,
  ): Promise<PacienteCompleto> {
    return this.api.delete<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/condicoes-cronicas/${encodeURIComponent(condicaoId)}`,
    );
  }

  // ─── Medicamentos ───
  addMedicamento(
    pacienteId: string,
    req: CriarMedicamentoRequest,
  ): Promise<PacienteCompleto> {
    return this.api.post<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/medicamentos`,
      req,
    );
  }
  updateMedicamento(
    pacienteId: string,
    medicamentoId: string,
    req: AtualizarMedicamentoRequest,
  ): Promise<PacienteCompleto> {
    return this.api.patch<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/medicamentos/${encodeURIComponent(medicamentoId)}`,
      req,
    );
  }
  removeMedicamento(
    pacienteId: string,
    medicamentoId: string,
  ): Promise<PacienteCompleto> {
    return this.api.delete<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/medicamentos/${encodeURIComponent(medicamentoId)}`,
    );
  }

  // ─── Histórico familiar (lista de strings) ───
  setHistoricoFamiliar(pacienteId: string, itens: string[]): Promise<PacienteCompleto> {
    return this.api.put<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/historico-familiar`,
      { itens } satisfies AtualizarHistoricoFamiliarRequest,
    );
  }

  // ─── Atendimentos ───
  addAtendimento(
    pacienteId: string,
    req: CriarAtendimentoRequest,
  ): Promise<PacienteCompleto> {
    return this.api.post<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/atendimentos`,
      req,
    );
  }
  removeAtendimento(
    pacienteId: string,
    atendimentoId: string,
  ): Promise<PacienteCompleto> {
    return this.api.delete<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/atendimentos/${encodeURIComponent(atendimentoId)}`,
    );
  }

  // ─── Exames ───
  addExame(pacienteId: string, req: CriarExameRequest): Promise<PacienteCompleto> {
    return this.api.post<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/exames`,
      req,
    );
  }
  removeExame(pacienteId: string, exameId: string): Promise<PacienteCompleto> {
    return this.api.delete<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/exames/${encodeURIComponent(exameId)}`,
    );
  }

  // ─── Vacinação ───
  addVacina(pacienteId: string, req: CriarVacinaRequest): Promise<PacienteCompleto> {
    return this.api.post<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/vacinacoes`,
      req,
    );
  }
  removeVacina(pacienteId: string, vacinaId: string): Promise<PacienteCompleto> {
    return this.api.delete<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/vacinacoes/${encodeURIComponent(vacinaId)}`,
    );
  }

  // ─── Viagens TFD ───
  addViagemTfd(
    pacienteId: string,
    req: CriarViagemTfdRequest,
  ): Promise<PacienteCompleto> {
    return this.api.post<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/viagens`,
      req,
    );
  }
  updateViagemTfd(
    pacienteId: string,
    viagemId: string,
    req: AtualizarViagemTfdRequest,
  ): Promise<PacienteCompleto> {
    return this.api.patch<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/viagens/${encodeURIComponent(viagemId)}`,
      req,
    );
  }
  removeViagemTfd(pacienteId: string, viagemId: string): Promise<PacienteCompleto> {
    return this.api.delete<PacienteCompleto>(
      `/pacientes/${encodeURIComponent(pacienteId)}/viagens/${encodeURIComponent(viagemId)}`,
    );
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
  /** Backend v0.6.0+: PATCH /admin/prefeituras/:id */
  updatePrefeitura(id: string, req: AtualizarPrefeituraRequest): Promise<Prefeitura> {
    return this.api.patch<Prefeitura>(
      `/admin/prefeituras/${encodeURIComponent(id)}`,
      req,
    );
  }
  /** Backend v0.6.0+: DELETE /admin/prefeituras/:id (somente DESENVOLVEDOR). */
  deletePrefeitura(id: string): Promise<void> {
    return this.api.delete<void>(`/admin/prefeituras/${encodeURIComponent(id)}`);
  }

  // UBSs
  listUbs(query?: ListUbsQuery): Promise<Ubs[]> {
    return this.api.get<Ubs[]>('/admin/ubs', query as Record<string, unknown>);
  }
  createUbs(req: CriarUbsRequest): Promise<Ubs> {
    return this.api.post<Ubs>('/admin/ubs', req);
  }
  /** Backend v0.6.0+: PATCH /admin/ubs/:id */
  updateUbs(id: string, req: AtualizarUbsRequest): Promise<Ubs> {
    return this.api.patch<Ubs>(`/admin/ubs/${encodeURIComponent(id)}`, req);
  }
  /** Backend v0.6.0+: DELETE /admin/ubs/:id */
  deleteUbs(id: string): Promise<void> {
    return this.api.delete<void>(`/admin/ubs/${encodeURIComponent(id)}`);
  }
  /** Backend v0.6.0+: POST /admin/ubs/:id/ativo */
  setAtivoUbs(id: string, ativa: boolean): Promise<{ id: string; ativa: boolean }> {
    return this.api.post<{ id: string; ativa: boolean }>(
      `/admin/ubs/${encodeURIComponent(id)}/ativo`,
      { ativa },
    );
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

  // ════════════════════════════════════════════════════════════
  // Banners SMS — CMS do carrossel "Avisos da Secretaria" do app paciente.
  //
  // Backend: `/v1/admin/sms-banners/*` (5 endpoints).
  // RBAC: DEV (qualquer prefeituraId, inclusive null = global) ·
  //       ADMIN / REGULADOR_SMS (apenas própria prefeitura).
  // ════════════════════════════════════════════════════════════

  listBanners(query?: ListarBannersQuery): Promise<AdminBanner[]> {
    return this.api.get<AdminBanner[]>(
      '/admin/sms-banners',
      query as Record<string, unknown> | undefined,
    );
  }

  getBanner(id: string): Promise<AdminBanner> {
    return this.api.get<AdminBanner>(
      `/admin/sms-banners/${encodeURIComponent(id)}`,
    );
  }

  createBanner(req: CriarBannerRequest): Promise<AdminBanner> {
    return this.api.post<AdminBanner>('/admin/sms-banners', req);
  }

  updateBanner(id: string, req: AtualizarBannerRequest): Promise<AdminBanner> {
    return this.api.patch<AdminBanner>(
      `/admin/sms-banners/${encodeURIComponent(id)}`,
      req,
    );
  }

  deleteBanner(id: string): Promise<void> {
    return this.api.delete<void>(
      `/admin/sms-banners/${encodeURIComponent(id)}`,
    );
  }

  // ════════════════════════════════════════════════════════════
  // Recomendações por especialidade — "o que levar no dia" exibido
  // no detalhe do encaminhamento no app paciente.
  //
  // Backend: `/v1/admin/recomendacoes-especialidade/*` (5 endpoints).
  // RBAC: DEV, ADMIN, REGULADOR_SMS.
  // Globais (sem escopo por prefeitura).
  // ════════════════════════════════════════════════════════════

  listRecomendacoes(query?: ListarRecomendacoesQuery): Promise<Recomendacao[]> {
    return this.api.get<Recomendacao[]>(
      '/admin/recomendacoes-especialidade',
      query as Record<string, unknown> | undefined,
    );
  }

  getRecomendacao(id: string): Promise<Recomendacao> {
    return this.api.get<Recomendacao>(
      `/admin/recomendacoes-especialidade/${encodeURIComponent(id)}`,
    );
  }

  createRecomendacao(req: CriarRecomendacaoRequest): Promise<Recomendacao> {
    return this.api.post<Recomendacao>(
      '/admin/recomendacoes-especialidade',
      req,
    );
  }

  updateRecomendacao(
    id: string,
    req: AtualizarRecomendacaoRequest,
  ): Promise<Recomendacao> {
    return this.api.patch<Recomendacao>(
      `/admin/recomendacoes-especialidade/${encodeURIComponent(id)}`,
      req,
    );
  }

  deleteRecomendacao(id: string): Promise<void> {
    return this.api.delete<void>(
      `/admin/recomendacoes-especialidade/${encodeURIComponent(id)}`,
    );
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

  private getPacToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(this.PAC_TOKEN_KEY);
  }
  private setPacToken(t: string | null): void {
    if (typeof localStorage === 'undefined') return;
    if (t) localStorage.setItem(this.PAC_TOKEN_KEY, t);
    else localStorage.removeItem(this.PAC_TOKEN_KEY);
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
    return out;
  }

  async logout(): Promise<void> {
    try {
      await this.req<void>('POST', '/auth/logout');
    } finally {
      this.setPacToken(null);
    }
  }

  /** Fluxo legado — mantido para compat. v0.6.0+: conta já nasce ativa. */
  ativarConta(req: AtivarContaPacienteRequest): Promise<void> {
    return this.req<void>('POST', '/auth/ativar-conta', req);
  }

  /**
   * Troca obrigatória de senha no primeiro acesso (v0.6.0+).
   * Paciente loga com CPF+CPF e precisa chamar este endpoint antes de
   * qualquer outra navegação. Após sucesso, `senhaProvisoria` vira false.
   */
  trocarSenha(req: TrocarSenhaPacienteRequest): Promise<void> {
    return this.req<void>('POST', '/auth/trocar-senha', req);
  }

  /**
   * Inicia fluxo de recuperação de senha via web.
   * Backend sempre responde 204 (anti-enumeration — não confirma se o CPF
   * tem conta nem se há email cadastrado). Quando há, envia email com link
   * `https://app.<dominio-cliente>/redefinir?t=<token>` (TTL 30 min).
   *
   * Rate limit: 3/h por CPF + 5/15min por IP + 100/h por IP.
   *
   * @param cpf — apenas dígitos (11 chars); backend aceita formatado também.
   */
  esqueciSenhaPaciente(cpf: string): Promise<void> {
    return this.req<void>('POST', '/auth/esqueci-senha', { cpf });
  }

  /**
   * Conclui recuperação consumindo o token do email.
   *
   * Erros relevantes:
   *   - 404 TOKEN_INVALIDO — token não existe (link adulterado ou copiado errado)
   *   - 401 TOKEN_EXPIRADO — > 30 min após envio do email
   *   - 409 TOKEN_JA_USADO — link já consumido (uso único)
   *   - 422 SENHA_FRACA — < 8 chars ou padrão fraco
   *   - 422 SENHA_IGUAL_ATUAL — bate com a senha atual
   *
   * Rate limit: 10/15min por IP + 30/h por IP.
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

// ============================================================
// Face 4 — TFD / Gestão Logística
// ============================================================

import type {
  Abastecimento,
  AjudaCusto,
  AjustarSaldoAjudaCustoRequest,
  AjustarSaldoRequest,
  AlocarPassageiroRequest,
  AnexoSolicitacaoTFD,
  AporteSaldoAjudaCusto,
  AporteSaldoAjudaCustoRequest,
  AporteSaldoFrota,
  AporteSaldoFrotaRequest,
  AprovarSolicitacaoRequest,
  AprovarTfdPacienteSolicRequest,
  AtualizarMotoristaRequest,
  AtualizarVeiculoRequest,
  AtualizarViagemRequest,
  ConcluirViagemRequest,
  CriarMotoristaRequest,
  CriarSolicitacaoRequest,
  CriarVeiculoRequest,
  CriarViagemRequest,
  IniciarViagemRequest,
  ListAbastecimentosQuery,
  ListAjudasCustoQuery,
  ListAuditoriaQuery,
  ListSolicitacoesQuery,
  ListTfdPacienteSolicQuery,
  ListViagensQuery,
  MarcarPresencaRequest,
  MetodoPagamento,
  Motorista,
  RecusarTfdPacienteSolicRequest,
  RegistrarComprovanteAbastecimentoRequest,
  RegistroAuditoriaTFD,
  RelatorioEspecialidadeQuery,
  RelatorioEspecialidadeResposta,
  SaldoAjudaCusto,
  SaldoVeiculo,
  SolicitacaoTFD,
  SolicitarAbastecimentoRequest,
  SolicitarAjudaCustoRequest,
  TfdPacienteSolicAdmin,
  TipoAnexoSolicitacaoTFD,
  Veiculo,
  ViagemFrota,
} from './tfd-types';

class TfdApi {
  constructor(private readonly api: ApiClient) {}

  // ───── Veículos ─────
  veiculos = {
    /**
     * Lista veículos da prefeitura do escopo.
     *
     * **Importante**: DESENVOLVEDOR (escopo GLOBAL) recebe 403
     * `PREFEITURA_REQUERIDA` se chamar sem `prefeituraId` — o backend
     * exige escopo concreto para listagens de TFD. Use o filtro do
     * dropdown de prefeitura para passar o id selecionado.
     */
    list: (q?: { prefeituraId?: string }): Promise<Veiculo[]> =>
      this.api.get('/tfd/veiculos', q as Record<string, unknown> | undefined),
    create: (req: CriarVeiculoRequest): Promise<Veiculo> => this.api.post('/tfd/veiculos', req),
    byId: (id: string): Promise<Veiculo> =>
      this.api.get(`/tfd/veiculos/${encodeURIComponent(id)}`),
    update: (id: string, req: AtualizarVeiculoRequest): Promise<Veiculo> =>
      this.api.patch(`/tfd/veiculos/${encodeURIComponent(id)}`, req),
    manutencao: (id: string): Promise<Veiculo> =>
      this.api.post(`/tfd/veiculos/${encodeURIComponent(id)}/manutencao`),
    reativar: (id: string): Promise<Veiculo> =>
      this.api.post(`/tfd/veiculos/${encodeURIComponent(id)}/reativar`),
    remove: (id: string): Promise<void> =>
      this.api.delete(`/tfd/veiculos/${encodeURIComponent(id)}`),
  };

  // ───── Motoristas ─────
  motoristas = {
    /** Veja nota de `veiculos.list` sobre `prefeituraId` para escopo GLOBAL. */
    list: (q?: { prefeituraId?: string }): Promise<Motorista[]> =>
      this.api.get('/tfd/motoristas', q as Record<string, unknown> | undefined),
    create: (req: CriarMotoristaRequest): Promise<Motorista> =>
      this.api.post('/tfd/motoristas', req),
    byId: (id: string): Promise<Motorista> =>
      this.api.get(`/tfd/motoristas/${encodeURIComponent(id)}`),
    update: (id: string, req: AtualizarMotoristaRequest): Promise<Motorista> =>
      this.api.patch(`/tfd/motoristas/${encodeURIComponent(id)}`, req),
    afastar: (id: string): Promise<Motorista> =>
      this.api.post(`/tfd/motoristas/${encodeURIComponent(id)}/afastar`),
    reativar: (id: string): Promise<Motorista> =>
      this.api.post(`/tfd/motoristas/${encodeURIComponent(id)}/reativar`),
    remove: (id: string): Promise<void> =>
      this.api.delete(`/tfd/motoristas/${encodeURIComponent(id)}`),
  };

  // ───── Solicitações TFD ─────
  solicitacoes = {
    list: (q?: ListSolicitacoesQuery): Promise<SolicitacaoTFD[]> =>
      this.api.get('/tfd/solicitacoes', q as Record<string, unknown> | undefined),
    create: (req: CriarSolicitacaoRequest): Promise<SolicitacaoTFD> =>
      this.api.post('/tfd/solicitacoes', req),
    byId: (id: string): Promise<SolicitacaoTFD> =>
      this.api.get(`/tfd/solicitacoes/${encodeURIComponent(id)}`),
    aprovar: (id: string, req: AprovarSolicitacaoRequest = {}): Promise<SolicitacaoTFD> =>
      this.api.post(`/tfd/solicitacoes/${encodeURIComponent(id)}/aprovar`, req),
    negar: (id: string, motivo: string): Promise<SolicitacaoTFD> =>
      this.api.post(`/tfd/solicitacoes/${encodeURIComponent(id)}/negar`, { motivo }),
    anexar: (
      id: string,
      file: File,
      tipo: TipoAnexoSolicitacaoTFD,
    ): Promise<AnexoSolicitacaoTFD> => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('tipo', tipo);
      return this.api.postMultipart(
        `/tfd/solicitacoes/${encodeURIComponent(id)}/anexos`,
        fd,
      );
    },
    downloadAnexo: (anexoId: string): Promise<{ blob: Blob; filename: string }> =>
      this.api.getBlob(`/tfd/anexos/${encodeURIComponent(anexoId)}/download`),
  };

  // ───── Viagens ─────
  viagens = {
    list: (q?: ListViagensQuery): Promise<ViagemFrota[]> =>
      this.api.get('/tfd/viagens', q as Record<string, unknown> | undefined),
    create: (req: CriarViagemRequest): Promise<ViagemFrota> =>
      this.api.post('/tfd/viagens', req),
    byId: (id: string): Promise<ViagemFrota> =>
      this.api.get(`/tfd/viagens/${encodeURIComponent(id)}`),
    update: (id: string, req: AtualizarViagemRequest): Promise<ViagemFrota> =>
      this.api.patch(`/tfd/viagens/${encodeURIComponent(id)}`, req),
    iniciar: (id: string, req: IniciarViagemRequest): Promise<ViagemFrota> =>
      this.api.post(`/tfd/viagens/${encodeURIComponent(id)}/iniciar`, req),
    concluir: (id: string, req: ConcluirViagemRequest): Promise<ViagemFrota> =>
      this.api.post(`/tfd/viagens/${encodeURIComponent(id)}/concluir`, req),
    cancelar: (id: string, motivo: string): Promise<ViagemFrota> =>
      this.api.post(`/tfd/viagens/${encodeURIComponent(id)}/cancelar`, { motivo }),
    alocarPassageiro: (id: string, req: AlocarPassageiroRequest): Promise<ViagemFrota> =>
      this.api.post(`/tfd/viagens/${encodeURIComponent(id)}/passageiros`, req),
    removerPassageiro: (id: string, passageiroId: string): Promise<ViagemFrota> =>
      this.api.delete(
        `/tfd/viagens/${encodeURIComponent(id)}/passageiros/${encodeURIComponent(passageiroId)}`,
      ),
    marcarPresenca: (
      id: string,
      passageiroId: string,
      req: MarcarPresencaRequest,
    ): Promise<ViagemFrota> =>
      this.api.post(
        `/tfd/viagens/${encodeURIComponent(id)}/passageiros/${encodeURIComponent(passageiroId)}/presenca`,
        req,
      ),
  };

  // ───── Abastecimento ─────
  abastecimentos = {
    list: (q?: ListAbastecimentosQuery): Promise<Abastecimento[]> =>
      this.api.get('/tfd/abastecimentos', q as Record<string, unknown> | undefined),
    solicitar: (req: SolicitarAbastecimentoRequest): Promise<Abastecimento> =>
      this.api.post('/tfd/abastecimentos', req),
    liberar: (id: string, observacao?: string): Promise<Abastecimento> =>
      this.api.post(`/tfd/abastecimentos/${encodeURIComponent(id)}/liberar`, {
        observacao,
      }),
    negar: (id: string, motivo: string): Promise<Abastecimento> =>
      this.api.post(`/tfd/abastecimentos/${encodeURIComponent(id)}/negar`, { motivo }),
    registrarComprovante: (
      id: string,
      req: RegistrarComprovanteAbastecimentoRequest,
      opts?: { idempotencyKey?: string },
    ): Promise<Abastecimento> => {
      const fd = new FormData();
      fd.append('file', req.file);
      fd.append('litros', String(req.litros));
      fd.append('valorPorLitro', String(req.valorPorLitro));
      fd.append('valorTotal', String(req.valorTotal));
      fd.append('hodometroKm', String(req.hodometroKm));
      return this.api.postMultipart(
        `/tfd/abastecimentos/${encodeURIComponent(id)}/comprovante`,
        fd,
        opts,
      );
    },
    downloadComprovante: (id: string): Promise<{ blob: Blob; filename: string }> =>
      this.api.getBlob(`/tfd/abastecimentos/${encodeURIComponent(id)}/comprovante`),
  };

  // ───── Saldo da Frota (combustível) ─────
  saldo = {
    list: (mes?: string): Promise<SaldoVeiculo[]> =>
      this.api.get('/tfd/saldo', mes ? { mes } : undefined),
    ajustar: (req: AjustarSaldoRequest): Promise<SaldoVeiculo> =>
      this.api.post('/tfd/saldo/ajustar', req),
    /**
     * Crédito (aporte) — adiciona valor ao saldo do mês, sem sobrescrever.
     * Suporta `X-Idempotency-Key` para evitar aporte duplo.
     */
    aportar: (
      req: AporteSaldoFrotaRequest,
      opts?: { idempotencyKey?: string },
    ): Promise<AporteSaldoFrota[]> =>
      this.api.post('/tfd/saldo/aportar', req, opts),
    /** Histórico de aportes do mês (ou geral se mes não informado). */
    aportes: (mes?: string): Promise<AporteSaldoFrota[]> =>
      this.api.get('/tfd/saldo/aportes', mes ? { mes } : undefined),
  };

  // ───── Saldo de Ajuda de Custo (pacientes) ─────
  saldoAjudaCusto = {
    /** Saldo único da prefeitura no mês informado (ou mês corrente). */
    get: (mes?: string): Promise<SaldoAjudaCusto> =>
      this.api.get('/tfd/saldo-ajuda-custo', mes ? { mes } : undefined),
    ajustar: (req: AjustarSaldoAjudaCustoRequest): Promise<SaldoAjudaCusto> =>
      this.api.post('/tfd/saldo-ajuda-custo/ajustar', req),
    /** Aporta crédito — idempotente via `X-Idempotency-Key`. */
    aportar: (
      req: AporteSaldoAjudaCustoRequest,
      opts?: { idempotencyKey?: string },
    ): Promise<AporteSaldoAjudaCusto> =>
      this.api.post('/tfd/saldo-ajuda-custo/aportar', req, opts),
    aportes: (mes?: string): Promise<AporteSaldoAjudaCusto[]> =>
      this.api.get('/tfd/saldo-ajuda-custo/aportes', mes ? { mes } : undefined),
  };

  // ───── Ajuda de Custo ─────
  ajudasCusto = {
    list: (q?: ListAjudasCustoQuery): Promise<AjudaCusto[]> =>
      this.api.get('/tfd/ajudas-custo', q as Record<string, unknown> | undefined),
    byId: (id: string): Promise<AjudaCusto> =>
      this.api.get(`/tfd/ajudas-custo/${encodeURIComponent(id)}`),
    solicitar: (req: SolicitarAjudaCustoRequest): Promise<AjudaCusto> =>
      this.api.post('/tfd/ajudas-custo', req),
    autorizar: (id: string): Promise<AjudaCusto> =>
      this.api.post(`/tfd/ajudas-custo/${encodeURIComponent(id)}/autorizar`),
    pagar: (
      id: string,
      metodoPagamento: MetodoPagamento,
      file: File,
      opts?: { idempotencyKey?: string },
    ): Promise<AjudaCusto> => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('metodoPagamento', metodoPagamento);
      return this.api.postMultipart(
        `/tfd/ajudas-custo/${encodeURIComponent(id)}/pagar`,
        fd,
        opts,
      );
    },
    negar: (id: string, motivo: string): Promise<AjudaCusto> =>
      this.api.post(`/tfd/ajudas-custo/${encodeURIComponent(id)}/negar`, { motivo }),
  };

  // ───── Relatórios analíticos ─────
  relatorios = {
    /**
     * Relatório agregado por especialidade — fundamenta a decisão de
     * "contratar especialista local vs. continuar mandando paciente fora".
     */
    porEspecialidade: (
      q?: RelatorioEspecialidadeQuery,
    ): Promise<RelatorioEspecialidadeResposta> =>
      this.api.get(
        '/tfd/relatorios/especialidades',
        q as Record<string, unknown> | undefined,
      ),
  };

  // ───── Auditoria ─────
  auditoria = {
    list: (q?: ListAuditoriaQuery): Promise<RegistroAuditoriaTFD[]> =>
      this.api.get('/tfd/auditoria', q as Record<string, unknown> | undefined),
    byId: (id: string): Promise<RegistroAuditoriaTFD> =>
      this.api.get(`/tfd/auditoria/${encodeURIComponent(id)}`),
    /**
     * Verifica integridade da hash-chain.
     * `prefeituraId` é opcional — somente DESENVOLVEDOR/ADMIN_GLOBAL pode
     * apontar para outra prefeitura; quando omitido, o backend usa a do JWT.
     */
    verificar: (
      prefeituraId?: string,
    ): Promise<{ total: number; corrompidos: string[] }> =>
      this.api.get(
        '/tfd/auditoria/verificar',
        prefeituraId ? { prefeituraId } : undefined,
      ),
    /**
     * Download do ZIP do mês (manifest.json + 5 CSVs + assinatura quando ICP).
     * Retorna { blob, filename } com filename já vindo do Content-Disposition.
     */
    exportarTJ: (mes: string): Promise<{ blob: Blob; filename: string }> =>
      this.api.getBlob(`/tfd/auditoria/exportar-tj?mes=${encodeURIComponent(mes)}`),
  };

  // ───── Solicitações TFD vindas do APP PACIENTE (Face 3 → Face 4) ─────
  // Backend: `/v1/tfd/solicitacoes-paciente/*` (6 endpoints).
  // Toda transição é única e gravada na hash chain. Concorrência tratada
  // por SELECT FOR UPDATE no backend.
  solicitacoesPaciente = {
    list: (q?: ListTfdPacienteSolicQuery): Promise<TfdPacienteSolicAdmin[]> =>
      this.api.get('/tfd/solicitacoes-paciente', q as Record<string, unknown> | undefined),
    byId: (id: string): Promise<TfdPacienteSolicAdmin> =>
      this.api.get(`/tfd/solicitacoes-paciente/${encodeURIComponent(id)}`),
    aprovar: (
      id: string,
      req: AprovarTfdPacienteSolicRequest = {},
    ): Promise<TfdPacienteSolicAdmin> =>
      this.api.post(
        `/tfd/solicitacoes-paciente/${encodeURIComponent(id)}/aprovar`,
        req,
      ),
    recusar: (
      id: string,
      motivo: string,
    ): Promise<TfdPacienteSolicAdmin> =>
      this.api.post(
        `/tfd/solicitacoes-paciente/${encodeURIComponent(id)}/recusar`,
        { motivo } satisfies RecusarTfdPacienteSolicRequest,
      ),
    /** Marca embarque — APROVADA → EMBARCADA. */
    embarque: (id: string): Promise<TfdPacienteSolicAdmin> =>
      this.api.post(`/tfd/solicitacoes-paciente/${encodeURIComponent(id)}/embarque`),
    /** Marca conclusão — EMBARCADA → CONCLUIDA. */
    concluir: (id: string): Promise<TfdPacienteSolicAdmin> =>
      this.api.post(`/tfd/solicitacoes-paciente/${encodeURIComponent(id)}/concluir`),
  };
}
