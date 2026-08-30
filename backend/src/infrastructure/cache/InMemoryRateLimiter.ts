/**
 * Helper centralizado de incremento de rate limit com TTL e proteção contra memory leaks.
 *
 * Se Redis estiver disponível, delega para Redis.
 * Se Redis estiver indisponível (NoOp / dev), utiliza armazenamento in-memory com:
 *  1. Limpeza periódica de chaves expiradas (sweep unref).
 *  2. Capacidade máxima com descarte de chaves antigas (LRU/FIFO) para impedir estouro de heap.
 */
import { getCache } from './Cache';

interface Slot {
  v: number;
  expiraEm: number;
}

const MAX_KEYS = 10_000;
const memoryStore = new Map<string, Slot>();

// Sweep periódico a cada 60s para remover chaves expiradas
const sweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [k, slot] of memoryStore.entries()) {
    if (slot.expiraEm <= now) {
      memoryStore.delete(k);
    }
  }
}, 60_000);

// Evita segurar o processo Node no shutdown
if (typeof sweepInterval.unref === 'function') {
  sweepInterval.unref();
}

function purgeExpired(now: number): void {
  for (const [k, slot] of memoryStore.entries()) {
    if (slot.expiraEm <= now) {
      memoryStore.delete(k);
    }
  }
}

export async function incrWithTtl(chave: string, ttlSeconds: number): Promise<number> {
  const cache = getCache();
  if (cache.isReady()) {
    const atual = await cache.get<number>(chave);
    const novo = (atual ?? 0) + 1;
    await cache.set(chave, novo, ttlSeconds);
    return novo;
  }

  // Fallback in-memory seguro
  const now = Date.now();
  const slot = memoryStore.get(chave);

  if (slot && slot.expiraEm > now) {
    slot.v += 1;
    return slot.v;
  }

  // Se atingiu capacidade máxima, expurga expirados
  if (memoryStore.size >= MAX_KEYS) {
    purgeExpired(now);
    // Se ainda estiver cheio após expurgo, remove a chave mais antiga
    if (memoryStore.size >= MAX_KEYS) {
      const oldestKey = memoryStore.keys().next().value;
      if (oldestKey) memoryStore.delete(oldestKey);
    }
  }

  memoryStore.set(chave, { v: 1, expiraEm: now + ttlSeconds * 1000 });
  return 1;
}
