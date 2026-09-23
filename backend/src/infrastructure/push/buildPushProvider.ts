/**
 * Factory que escolhe o provider de push baseado em env.
 *
 * env `PUSH_PROVIDER`:
 *   - `ntfy` (default em prod) → NtfyPushProvider
 *   - `noop` (default em dev) → NoopPushProvider
 *
 * Para ntfy:
 *   - `NTFY_BASE_URL` (obrigatório) — ex: `https://ntfy.aguasbelas.pe.gov.br`
 *   - `NTFY_AUTH_TOKEN` (opcional) — Bearer token de admin (write ACL)
 *
 * Se `PUSH_PROVIDER=ntfy` mas `NTFY_BASE_URL` ausente, faz fallback pra Noop
 * (com warn no log).
 */
import type { IPushProvider } from './IPushProvider';
import { NtfyPushProvider } from './NtfyPushProvider';
import { NoopPushProvider } from './NoopPushProvider';
import { env } from '../../shared/env';
import { logger } from '../logger';

export function buildPushProvider(): IPushProvider {
  const kind = env.PUSH_PROVIDER.toLowerCase();

  if (kind === 'ntfy') {
    const baseUrl = env.NTFY_BASE_URL;
    if (!baseUrl) {
      logger.warn(
        { kind },
        '[push] PUSH_PROVIDER=ntfy mas NTFY_BASE_URL ausente — fallback Noop',
      );
      return new NoopPushProvider();
    }
    const cfg: { baseUrl: string; authToken?: string | null; timeoutMs?: number } = {
      baseUrl,
    };
    if (env.NTFY_AUTH_TOKEN) cfg.authToken = env.NTFY_AUTH_TOKEN;
    const t = env.NTFY_TIMEOUT_MS;
    if (Number.isFinite(t) && t > 0) cfg.timeoutMs = t;
    const p = new NtfyPushProvider(cfg);
    logger.info(
      { baseUrl, authConfigured: !!cfg.authToken },
      '✓ push provider: ntfy.sh self-hosted',
    );
    return p;
  }

  logger.info({ kind }, '✓ push provider: noop (DEV / desativado)');
  return new NoopPushProvider();
}
