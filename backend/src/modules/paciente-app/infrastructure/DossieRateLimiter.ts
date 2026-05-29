/**
 * Rate limiter para endpoints do Dossiê (paciente lendo seu próprio prontuário).
 *
 * Por que: cada `/dossie/resumo` faz 4 COUNTs paralelos no DB; `/dossie/atendimentos`
 * lê até 100 rows. Sem cap, app malicioso ou bug pode floodar.
 *
 * Limites generosos pra UX legítima:
 *   - 120 req/15min/conta — paciente pode atualizar várias vezes
 *   - 600 req/1h/conta — cap horário
 *   - 1000 req/15min/IP — proteção contra abuso de IP (rede compartilhada)
 *
 * Chaves Redis: prefixo `rl:pa:dos:` (isolado de outros rate-limiters).
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
    max: 120,
    mensagem: 'Muitas consultas ao prontuário. Aguarde alguns minutos.',
  },
  {
    janelaSeg: 60 * 60,
    max: 600,
    mensagem: 'Limite horário de consultas ao prontuário atingido.',
  },
];

const LIMITE_POR_IP: JanelaLimite = {
  janelaSeg: 15 * 60,
  max: 1000,
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

export class DossieRateLimiter {
  async consumir(contaId: string, ip: string | null): Promise<void> {
    for (const [idx, lim] of LIMITES_POR_CONTA.entries()) {
      const hits = await incrComTtl(`rl:pa:dos:conta:${idx}:${contaId}`, lim.janelaSeg);
      if (hits > lim.max) {
        logger.warn(
          { contaId, camada: idx, hits, max: lim.max },
          '[rl] dossie conta limite excedido',
        );
        throw TooManyRequests('RATE_LIMIT_EXCEDIDO', lim.mensagem);
      }
    }
    if (ip) {
      const hits = await incrComTtl(`rl:pa:dos:ip:${ip}`, LIMITE_POR_IP.janelaSeg);
      if (hits > LIMITE_POR_IP.max) {
        logger.warn(
          { ip: anonimizar(ip), hits, max: LIMITE_POR_IP.max },
          '[rl] dossie IP limite excedido',
        );
        throw TooManyRequests('RATE_LIMIT_EXCEDIDO', LIMITE_POR_IP.mensagem);
      }
    }
  }
}
