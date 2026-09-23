import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../shared/env';

export function isValidApiKey(provided: string | undefined, expected: string): boolean {
  if (!provided || !expected) return false;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function apiKeyGuard(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'OPTIONS') {
    return next();
  }

  if (!env.API_KEY || env.API_KEY.length === 0) {
    return next();
  }

  const exemptPaths = new Set(['/v1/health', '/metrics']);
  if (exemptPaths.has(req.path)) {
    return next();
  }

  const provided = req.get(env.API_KEY_HEADER) ?? req.get('x-api-key');

  if (isValidApiKey(provided, env.API_KEY)) {
    return next();
  }

  return res.status(401).json({
    error: {
      code: 'API_KEY_INVALIDA',
      message: 'Chave de API ausente ou inválida.',
    },
  });
}
