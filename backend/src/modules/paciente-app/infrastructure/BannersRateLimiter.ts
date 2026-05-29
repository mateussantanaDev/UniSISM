/**
 * Rate limiter para endpoints públicos de Banners (Face 3 · paciente).
 *
 * Endpoints:
 *   - GET /paciente-app/banners            (lista)
 *   - GET /paciente-app/banners/:id        (detalhe)
 *   - POST /paciente-app/banners/:id/visto (telemetria)
 *
 * Limites generosos (carrossel é polled frequentemente pelo app):
 *   - 240 req/15min/conta — abertura repetida da home
 *   - 1200 req/1h/conta
 *   - 2000 req/15min/IP — rede compartilhada
 *
 * Chaves Redis: prefixo `rl:pa:ban:`.
 */
import { TooManyRequests } from '../../../shared/errors';
import { getCache } from '../../../infrastructure/cache/Cache';
import { logger } from '../../../infrastructure/logger';

interface JanelaLimite {
  janelaSeg: number;
  max: number;
  mensagem: string;
}

const LIMITES_POR_CONTA: ReadonlyArray<JanelaLimite> = [
  {
    janelaSeg: 15 * 60,
    max: 240,
    mensagem: 'Muitas consultas aos avisos. Aguarde alguns minutos.',
  },
  {
    janelaSeg: 60 * 60,
    max: 1200,
    mensagem: 'Limite horário de consultas aos avisos atingido.',
  },
];

const LIMITE_POR_IP: JanelaLimite = {
  janelaSeg: 15 * 60,
  max: 2000,
  mensagem: 'Muitas requisições deste dispositivo. Aguarde alguns minutos.',
};

const localCounters = new Map<string, { v: number; expiraEm: number }>();

async function incrComTtl(chave: string, ttlSeconds: number): Promise<number> {
  const cache = getCache();
  if (cache.isReady()) {
    const atual = await cache.get<number>(chave);
    const novo = (atual ?? 0) + 1;
    await cache.set(chave, novo, ttlSeconds);
    return novo;
  }
  const now = Date.now();
  const slot = localCounters.get(chave);
  if (slot && slot.expiraEm > now) {
    slot.v += 1;
    return slot.v;
  }
  localCounters.set(chave, { v: 1, expiraEm: now + ttlSeconds * 1000 });
  return 1;
}

function anonimizar(s: string): string {
  return s.length <= 4 ? '***' : s.slice(0, 4) + '***';
}

export class BannersRateLimiter {
  async consumir(contaId: string, ip: string | null): Promise<void> {
    for (const [idx, lim] of LIMITES_POR_CONTA.entries()) {
      const hits = await incrComTtl(`rl:pa:ban:conta:${idx}:${contaId}`, lim.janelaSeg);
      if (hits > lim.max) {
        logger.warn(
          { contaId, camada: idx, hits, max: lim.max },
          '[rl] banners conta limite excedido',
        );
        throw TooManyRequests('RATE_LIMIT_EXCEDIDO', lim.mensagem);
      }
    }
    if (ip) {
      const hits = await incrComTtl(`rl:pa:ban:ip:${ip}`, LIMITE_POR_IP.janelaSeg);
      if (hits > LIMITE_POR_IP.max) {
        logger.warn(
          { ip: anonimizar(ip), hits, max: LIMITE_POR_IP.max },
          '[rl] banners IP limite excedido',
        );
        throw TooManyRequests('RATE_LIMIT_EXCEDIDO', LIMITE_POR_IP.mensagem);
      }
    }
  }
}
