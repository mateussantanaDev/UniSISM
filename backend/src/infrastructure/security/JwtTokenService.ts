import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../shared/env';
import { Unauthorized } from '../../shared/errors';
import type {
  AccessTokenPayload,
  ITokenService,
} from '../../domain/services/ITokenService';

function parseDuration(v: string): number {
  // aceita formatos "30m", "7d", "1h", "120s", ou número puro em segundos
  const m = /^(\d+)([smhd])$/.exec(v);
  if (!m) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 1800;
  }
  const n = Number(m[1]);
  switch (m[2]) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'h':
      return n * 60 * 60;
    case 'd':
      return n * 60 * 60 * 24;
    default:
      return 1800;
  }
}

export class JwtTokenService implements ITokenService {
  private readonly accessSecret = env.JWT_SECRET;
  private readonly accessExpiresSeconds = parseDuration(env.JWT_EXPIRES_IN);
  private readonly refreshExpiresSeconds = parseDuration(env.JWT_REFRESH_EXPIRES_IN);

  /**
   * Assina um token de acesso. Para o app do motorista, passe
   * `ttlSecondsOverride` (ex.: 30 dias) — apps mobile precisam de sessão longa.
   */
  assinarAccess(payload: AccessTokenPayload, ttlSecondsOverride?: number): string {
    const options: SignOptions = {
      expiresIn: ttlSecondsOverride ?? this.accessExpiresSeconds,
    };
    return jwt.sign(payload, this.accessSecret, options);
  }

  verificarAccess(token: string): AccessTokenPayload {
    try {
      const decoded = jwt.verify(token, this.accessSecret) as unknown;
      if (typeof decoded !== 'object' || decoded === null) {
        throw Unauthorized('TOKEN_INVALIDO', 'Token inválido');
      }
      const payload = decoded as Record<string, unknown>;
      const sub = payload['sub'];
      const role = payload['role'];
      if (typeof sub !== 'string' || typeof role !== 'string') {
        throw Unauthorized('TOKEN_INVALIDO', 'Token inválido');
      }
      const result: AccessTokenPayload = { sub, role };
      const ubsId = payload['ubsId'];
      const prefeituraId = payload['prefeituraId'];
      const sid = payload['sid'];
      const motoristaId = payload['motoristaId'];
      const primeiroLogin = payload['primeiroLogin'];
      if (typeof ubsId === 'string') result.ubsId = ubsId;
      if (typeof prefeituraId === 'string') result.prefeituraId = prefeituraId;
      if (typeof sid === 'string') result.sid = sid;
      if (typeof motoristaId === 'string') result.motoristaId = motoristaId;
      if (typeof primeiroLogin === 'boolean') result.primeiroLogin = primeiroLogin;
      return result;
    } catch (err) {
      if (err instanceof Error && err.name === 'TokenExpiredError') {
        throw Unauthorized('TOKEN_EXPIRADO', 'Token expirado');
      }
      throw Unauthorized('TOKEN_INVALIDO', 'Token inválido');
    }
  }

  gerarRefresh(): { token: string; hash: string; expiraEm: Date } {
    const token = crypto.randomBytes(48).toString('base64url');
    const hash = this.hashRefresh(token);
    const expiraEm = new Date(Date.now() + this.refreshExpiresSeconds * 1000);
    return { token, hash, expiraEm };
  }

  hashRefresh(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  ttlAccessSeconds(): number {
    return this.accessExpiresSeconds;
  }
}
