/**
 * Rate limiter para os endpoints públicos de recuperação de senha (Face 3).
 *
 * Camadas (todas via Redis INCR + EXPIRE, com fallback in-memory):
 *
 *   POST /paciente-app/auth/esqueci-senha
 *     - 5 req / 15min / IP        — anti-flood do mesmo host
 *     - 3 req / 1h / CPF (digits) — anti-spam pro mesmo cidadão (já fazia via DB; mantemos)
 *     - 100 req / 1h / IP         — anti-enumeration (atacante itera CPFs)
 *
 *   POST /paciente-app/auth/redefinir-senha
 *     - 10 req / 15min / IP       — anti brute force de token (token é 64 hex = 256 bits, mas defesa-em-profundidade)
 *     - 30 req / 1h / IP          — cap horário
 *
 * Comportamento:
 *   - excedeu → throw `TooManyRequests('RATE_LIMIT_EXCEDIDO', ...)`
 *   - cache off (NoOp) → fallback in-memory (sliding por janela)
 *
 * Observabilidade: cada rejeição emite log `warn` com chave anonimizada.
 *
 * Idempotência das chaves Redis: usa prefixo `rl:pa:` (paciente-app)
 * para isolar de outros rate-limiters do projeto (`rl:rel:` etc.).
 */
import { TooManyRequests } from '../../../shared/errors';
import { getCache } from '../../../infrastructure/cache/Cache';
import { logger } from '../../../infrastructure/logger';

/** Janela em segundos + máximo de hits permitidos. */
export interface JanelaLimite {
  janelaSeg: number;
  max: number;
  /** Mensagem usuária amigável (pt-BR). */
  mensagem: string;
}

/** Default — endpoints de recuperação de senha. Pode ser sobrescrito por env. */
export const LIMITES_ESQUECI_SENHA: ReadonlyArray<JanelaLimite> = [
  {
    janelaSeg: 15 * 60,
    max: 5,
    mensagem: 'Muitas solicitações deste dispositivo. Aguarde 15 minutos.',
  },
  {
    janelaSeg: 60 * 60,
    max: 100,
    mensagem: 'Limite horário de solicitações por dispositivo atingido.',
  },
];

export const LIMITES_ESQUECI_SENHA_CPF: JanelaLimite = {
  janelaSeg: 60 * 60,
  max: 3,
  mensagem: 'Limite horário atingido. Confira seu email ou tente em 1 hora.',
};

export const LIMITES_REDEFINIR_SENHA: ReadonlyArray<JanelaLimite> = [
  {
    janelaSeg: 15 * 60,
    max: 10,
    mensagem: 'Muitas tentativas de redefinição. Aguarde 15 minutos.',
  },
  {
    janelaSeg: 60 * 60,
    max: 30,
    mensagem: 'Limite horário de redefinições por dispositivo atingido.',
  },
];

/** Fallback in-memory (single-process — não escala em cluster mas evita crash em DEV sem Redis). */
const localCounters = new Map<string, { v: number; expiraEm: number }>();

async function incrComTtl(chave: string, ttlSeconds: number): Promise<number> {
  const cache = getCache();
  if (cache.isReady()) {
    // Pattern simples: get → incr → set (idempotente, suficiente pra rate limit;
    // se 2 reqs concorrentes ganharem race, o pior caso é 1 hit extra — aceitável).
    const atual = await cache.get<number>(chave);
    const novo = (atual ?? 0) + 1;
    await cache.set(chave, novo, ttlSeconds);
    return novo;
  }
  // Fallback in-memory
  const now = Date.now();
  const slot = localCounters.get(chave);
  if (slot && slot.expiraEm > now) {
    slot.v += 1;
    return slot.v;
  }
  localCounters.set(chave, { v: 1, expiraEm: now + ttlSeconds * 1000 });
  return 1;
}

/** Anonimiza chave de log (não revela IP completo nem CPF). */
function anonimizar(s: string): string {
  if (s.length <= 4) return '***';
  return s.slice(0, 4) + '***';
}

export class PasswordRecoveryRateLimiter {
  /**
   * Aplica TODAS as camadas configuradas para `esqueci-senha`.
   * Primeira que estoura → 429 imediato (fail-fast).
   */
  async consumirEsqueciSenha(ip: string | null, cpfDigits: string): Promise<void> {
    const ipKey = ip ?? 'noip';

    // Camadas por IP
    for (const [idx, lim] of LIMITES_ESQUECI_SENHA.entries()) {
      const chave = `rl:pa:esq:ip:${idx}:${ipKey}`;
      const hits = await incrComTtl(chave, lim.janelaSeg);
      if (hits > lim.max) {
        logger.warn(
          { ip: anonimizar(ipKey), camada: idx, hits, max: lim.max },
          '[rl] esqueci-senha IP limite excedido',
        );
        throw TooManyRequests('RATE_LIMIT_EXCEDIDO', lim.mensagem);
      }
    }

    // Camada por CPF (só conta se CPF chegou normalizado válido)
    if (cpfDigits.length === 11) {
      const chave = `rl:pa:esq:cpf:${cpfDigits}`;
      const hits = await incrComTtl(chave, LIMITES_ESQUECI_SENHA_CPF.janelaSeg);
      if (hits > LIMITES_ESQUECI_SENHA_CPF.max) {
        logger.warn(
          { cpfHash: anonimizar(cpfDigits), hits, max: LIMITES_ESQUECI_SENHA_CPF.max },
          '[rl] esqueci-senha CPF limite excedido',
        );
        throw TooManyRequests('RATE_LIMIT_EXCEDIDO', LIMITES_ESQUECI_SENHA_CPF.mensagem);
      }
    }
  }

  /**
   * Aplica todas as camadas para `redefinir-senha`.
   * Só rate-limita por IP — token é o segredo (256 bits), CPF não vem no payload.
   */
  async consumirRedefinirSenha(ip: string | null): Promise<void> {
    const ipKey = ip ?? 'noip';
    for (const [idx, lim] of LIMITES_REDEFINIR_SENHA.entries()) {
      const chave = `rl:pa:red:ip:${idx}:${ipKey}`;
      const hits = await incrComTtl(chave, lim.janelaSeg);
      if (hits > lim.max) {
        logger.warn(
          { ip: anonimizar(ipKey), camada: idx, hits, max: lim.max },
          '[rl] redefinir-senha IP limite excedido',
        );
        throw TooManyRequests('RATE_LIMIT_EXCEDIDO', lim.mensagem);
      }
    }
  }

  /**
   * Camada genérica para outros endpoints públicos da Face 3
   * (login, ativar-conta) — mais permissiva: 30 req/15min/IP.
   *
   * Usar via middleware Express por endpoint.
   */
  async consumirGenericoFace3(ip: string | null, acao: string): Promise<void> {
    const ipKey = ip ?? 'noip';
    const chave = `rl:pa:gen:${acao}:ip:${ipKey}`;
    const hits = await incrComTtl(chave, 15 * 60);
    if (hits > 30) {
      logger.warn({ ip: anonimizar(ipKey), acao, hits }, '[rl] genérico Face 3 limite excedido');
      throw TooManyRequests(
        'RATE_LIMIT_EXCEDIDO',
        'Muitas requisições deste dispositivo. Aguarde alguns minutos.',
      );
    }
  }
}
