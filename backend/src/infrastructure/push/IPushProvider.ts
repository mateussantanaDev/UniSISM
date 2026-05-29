/**
 * Provider abstrato de push notification.
 *
 * Implementações:
 *   - `NtfyPushProvider` — ntfy.sh self-hosted (open-source, padrão UNISISM)
 *   - `NoopPushProvider` — no-op (DEV sem ntfy + fallback quando provider down)
 *   - (futuro) `FcmPushProvider` — só se SMS decidir usar Firebase
 *   - (futuro) `WebPushProvider` — RFC 8030 para PWAs
 *
 * Contrato:
 *   - `enviar(endpoint, payload)` retorna `{ ok, retryable, providerMessageId?, erro? }`
 *   - `ok=true` → entregue ao provider (não significa que paciente VIU — push é fire-and-forget)
 *   - `ok=false + retryable=true` → falha temporária (network, 5xx) → worker tenta de novo
 *   - `ok=false + retryable=false` → falha permanente (token inválido, 4xx) → device removido
 *   - NUNCA dá throw — sempre retorna resultado pra dispatcher decidir
 */

/** Payload normalizado entre providers. */
export interface PushPayload {
  /** Título curto (≤80 chars, sanitizado). */
  titulo: string;
  /** Corpo (≤400 chars, sanitizado). */
  corpo: string;
  /** Categoria — usado pra agrupar/configurar canal Android. */
  tipo: string;
  /** Deep-link opcional (ex: `unisism://encaminhamento/uuid`). */
  deepLink?: string;
  /** Prioridade (ntfy: 1-5, FCM: high/normal). Default 4 (high). */
  prioridade?: 1 | 2 | 3 | 4 | 5;
  /** ID da notificação no DB (rastreio). */
  notificacaoId: string;
}

export interface PushResult {
  /** True se o provider aceitou o envio. */
  ok: boolean;
  /** True se a falha é temporária (worker deve tentar de novo). */
  retryable: boolean;
  /** ID da mensagem no provider (rastreio externo). */
  providerMessageId?: string;
  /** Mensagem de erro humanamente legível (vai pro audit). */
  erro?: string;
  /** HTTP status do provider (debug). */
  status?: number;
}

export interface IPushProvider {
  /** Nome do provider — usado em audit e seleção. */
  readonly name: 'NTFY' | 'FCM' | 'WEB_PUSH' | 'NOOP';

  /**
   * Envia push para o endpoint do device.
   * `endpoint` semântica depende do provider:
   *   - NTFY: nome do topic
   *   - FCM: token FCM
   *   - WEB_PUSH: JSON `{endpoint, keys}`
   */
  enviar(endpoint: string, payload: PushPayload): Promise<PushResult>;

  /** Indica se o provider está pronto (ex: env vars setadas). */
  isReady(): boolean;
}
