/**
 * Rate limiter para download de anexos médicos (Face 3 · paciente).
 *
 * Por que: download é I/O caro (disco + rede) e dado médico pessoal. Sem cap,
 * cliente malicioso ou bug no app pode fazer flood, derrubar o servidor ou
 * exfiltrar dados em massa.
 *
 * Camadas (Redis com fallback in-memory):
 *
 *   - 60 req/15min/CONTA — paciente legítimo provavelmente baixa < 10 PDFs;
 *     60 dá folga generosa pra UX (retry, view+share, etc.).
 *   - 200 req/1h/CONTA — cap horário ampliado pra picos.
 *   - 300 req/15min/IP — proteção contra abuso de IP (ex: rede compartilhada,
 *     mas atacante coordenando contas).
 *
 * Comportamento: estourou → `429 RATE_LIMIT_EXCEDIDO` com mensagem pt-BR.
 *
 * Chaves Redis: prefixo `rl:pa:dl:` (isolado de outros rate-limiters).
 */
import { TooManyRequests } from '../../../shared/errors';
import { getCache } from '../../../infrastructure/cache/Cache';
import { logger } from '../../../infrastructure/logger';

export interface JanelaLimite {
  janelaSeg: number;
  max: number;
  mensagem: string;
}

const LIMITES_POR_CONTA: ReadonlyArray<JanelaLimite> = [
  {
    janelaSeg: 15 * 60,
    max: 60,
    mensagem: 'Muitos downloads em sequência. Aguarde alguns minutos.',
  },
  {
    janelaSeg: 60 * 60,
    max: 200,
    mensagem: 'Limite horário de downloads atingido.',
  },
];

const LIMITE_POR_IP: JanelaLimite = {
  janelaSeg: 15 * 60,
  max: 300,
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
  if (s.length <= 4) return '***';
  return s.slice(0, 4) + '***';
}

export class DownloadAnexoRateLimiter {
  /**
   * Aplica todas as camadas. Estoura na primeira que bater o cap → 429.
   * Fail-fast (testa contaId antes do IP — paciente legítimo cai aqui).
   */
  async consumir(contaId: string, ip: string | null): Promise<void> {
    for (const [idx, lim] of LIMITES_POR_CONTA.entries()) {
      const chave = `rl:pa:dl:conta:${idx}:${contaId}`;
      const hits = await incrComTtl(chave, lim.janelaSeg);
      if (hits > lim.max) {
        logger.warn(
          { contaId, camada: idx, hits, max: lim.max },
          '[rl] download-anexo conta limite excedido',
        );
        throw TooManyRequests('RATE_LIMIT_EXCEDIDO', lim.mensagem);
      }
    }

    if (ip) {
      const chave = `rl:pa:dl:ip:${ip}`;
      const hits = await incrComTtl(chave, LIMITE_POR_IP.janelaSeg);
      if (hits > LIMITE_POR_IP.max) {
        logger.warn(
          { ip: anonimizar(ip), hits, max: LIMITE_POR_IP.max },
          '[rl] download-anexo IP limite excedido',
        );
        throw TooManyRequests('RATE_LIMIT_EXCEDIDO', LIMITE_POR_IP.mensagem);
      }
    }
  }
}
