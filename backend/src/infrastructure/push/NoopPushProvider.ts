/**
 * No-op provider de push — usado quando:
 *   - DEV sem ntfy configurado
 *   - PUSH_PROVIDER=noop em env
 *   - Provider primário não está pronto (fallback)
 *
 * Loga o envio mas não faz nada. Sempre retorna `ok: true` pra não bloquear
 * a fila do worker (caso contrário ficaria tentando indefinidamente em DEV).
 */
import type { IPushProvider, PushPayload, PushResult } from './IPushProvider';
import { logger } from '../logger';

export class NoopPushProvider implements IPushProvider {
  readonly name = 'NOOP' as const;

  isReady(): boolean {
    return true;
  }

  async enviar(endpoint: string, payload: PushPayload): Promise<PushResult> {
    logger.info(
      {
        endpoint: endpoint.slice(0, 16) + '***',
        titulo: payload.titulo,
        tipo: payload.tipo,
        notificacaoId: payload.notificacaoId,
      },
      '[push-noop] simulando envio (provider real desativado)',
    );
    return {
      ok: true,
      retryable: false,
      providerMessageId: `noop-${Date.now()}`,
    };
  }
}
