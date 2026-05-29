/**
 * Provider de push via **ntfy.sh self-hosted**.
 *
 * ntfy.sh é um servidor open-source (MIT) que recebe HTTP POST e envia push
 * para devices subscritos via WebSocket/SSE/HTTP polling. Sem vendor, sem Firebase.
 *
 * Self-hosted:
 *   - Roda em Docker (`docker run binwiederhier/ntfy serve --auth-file ...`)
 *   - URL pública: `https://ntfy.aguasbelas.pe.gov.br` (env `NTFY_BASE_URL`)
 *   - Auth via bearer token de admin (env `NTFY_AUTH_TOKEN`) — opcional
 *
 * Cliente Flutter:
 *   - Subscreve via WebSocket: `wss://ntfy.host/<topic>/ws` (foreground)
 *   - Opcional: instalar app ntfy + adicionar topic (UnifiedPush, background real)
 *   - Fallback: paciente vê na lista in-app ao abrir
 *
 * Documentação: https://docs.ntfy.sh/publish/
 *
 * Endpoint semântica: `endpoint` = nome do topic (UUID gerado por device).
 * Topic é PUBLIC por design no ntfy — segurança via:
 *   - Topic name = UUIDv4 (256 bits, não-guessable)
 *   - Auth opcional (ntfy ACL: read = paciente conhece topic; write = só backend token)
 */
import type { IPushProvider, PushPayload, PushResult } from './IPushProvider';
import { logger } from '../logger';

export interface NtfyConfig {
  baseUrl: string;
  authToken?: string | null;
  /** Timeout ms (default 5000). */
  timeoutMs?: number;
}

export class NtfyPushProvider implements IPushProvider {
  readonly name = 'NTFY' as const;
  private readonly baseUrl: string;
  private readonly authToken: string | null;
  private readonly timeoutMs: number;

  constructor(config: NtfyConfig) {
    // Normaliza: remove trailing slash
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.authToken = config.authToken ?? null;
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  isReady(): boolean {
    return this.baseUrl.length > 0 && this.baseUrl.startsWith('http');
  }

  async enviar(endpoint: string, payload: PushPayload): Promise<PushResult> {
    if (!this.isReady()) {
      return {
        ok: false,
        retryable: false,
        erro: 'NTFY_NOT_CONFIGURED: baseUrl ausente ou inválida',
      };
    }
    // Sanity: topic name (UUIDv4 ou alphanumeric+hyphen)
    if (!/^[a-zA-Z0-9_-]{4,64}$/.test(endpoint)) {
      return {
        ok: false,
        retryable: false,
        erro: `NTFY_TOPIC_INVALIDO: ${endpoint}`,
      };
    }

    const url = `${this.baseUrl}/${endpoint}`;
    // Headers conforme docs ntfy
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      Title: this._toAsciiHeader(payload.titulo),
      Priority: String(payload.prioridade ?? 4),
      Tags: this._toAsciiHeader(payload.tipo),
    };
    if (payload.deepLink) {
      // ntfy `Click` action — abre URL ao tocar na notificação
      headers['Click'] = payload.deepLink;
      // Para apps Flutter que não usam ntfy app, o deepLink vai no body também
    }
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const body = JSON.stringify({
      message: payload.corpo,
      // Estes campos vão pro body JSON pra clientes WebSocket parsearem
      meta: {
        tipo: payload.tipo,
        deepLink: payload.deepLink ?? null,
        notificacaoId: payload.notificacaoId,
      },
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      if (res.ok) {
        let providerMessageId: string | undefined;
        // ntfy retorna `{"id": "abc123", ...}` em JSON quando Content-Type pede.
        const ctype = res.headers.get('content-type') ?? '';
        if (ctype.includes('application/json')) {
          try {
            const data = (await res.json()) as { id?: string };
            providerMessageId = data.id;
          } catch {
            // Ignora — sucesso sem ID estruturado é OK
          }
        }
        return {
          ok: true,
          retryable: false,
          status: res.status,
          ...(providerMessageId ? { providerMessageId } : {}),
        };
      }

      const erroBody = await res.text().catch(() => '');
      // 4xx → falha permanente (token/topic inválido). 5xx → retryable.
      const retryable = res.status >= 500 && res.status < 600;
      logger.warn(
        { status: res.status, endpoint, erro: erroBody.slice(0, 200) },
        '[ntfy] envio falhou',
      );
      return {
        ok: false,
        retryable,
        status: res.status,
        erro: `ntfy ${res.status}: ${erroBody.slice(0, 200)}`,
      };
    } catch (err) {
      // AbortError (timeout) e network errors são retryable
      const isAbort = (err as { name?: string })?.name === 'AbortError';
      logger.warn({ err, endpoint }, '[ntfy] envio falhou (network/timeout)');
      return {
        ok: false,
        retryable: true,
        erro: isAbort
          ? `ntfy timeout (${this.timeoutMs}ms)`
          : `ntfy network: ${(err as Error).message ?? 'unknown'}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Headers HTTP só aceitam ISO-8859-1 (latin-1). Caracteres não-ASCII causam
   * `Invalid character in header content`. Trocamos por equivalente ASCII safe.
   * Body (JSON) preserva UTF-8 normalmente.
   */
  private _toAsciiHeader(s: string): string {
    return s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\x20-\x7E]/g, '?')
      .slice(0, 200);
  }
}
