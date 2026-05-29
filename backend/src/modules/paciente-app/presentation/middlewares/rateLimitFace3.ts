/**
 * Middlewares Express de rate limit para endpoints públicos da Face 3
 * (app paciente). Aplicados ANTES de qualquer middleware mais caro.
 *
 * 3 camadas:
 *
 *   - `rateLimitEsqueciSenha` — endpoint `/auth/esqueci-senha`
 *     - 5 req/15min/IP + 100 req/1h/IP (no use case adicional: 3 req/1h/CPF)
 *
 *   - `rateLimitRedefinirSenha` — endpoint `/auth/redefinir-senha`
 *     - 10 req/15min/IP + 30 req/1h/IP
 *
 *   - `rateLimitFace3Generico` — para login/ativar-conta
 *     - 30 req/15min/IP (mais permissivo — usuário legítimo pode errar senha)
 *
 * Em caso de excesso: 429 JSON `{ error: { code, message } }`.
 *
 * Implementação: delega para `PasswordRecoveryRateLimiter` (Redis com fallback).
 *
 * Trust proxy: o app precisa estar com `app.set('trust proxy', ...)` configurado
 * para `req.ip` refletir o IP real do cliente atrás de Caddy/proxies.
 */
import type { Request, Response, NextFunction } from 'express';
import type { PasswordRecoveryRateLimiter } from '../../infrastructure/PasswordRecoveryRateLimiter';
import type { DownloadAnexoRateLimiter } from '../../infrastructure/DownloadAnexoRateLimiter';
import type { DossieRateLimiter } from '../../infrastructure/DossieRateLimiter';
import type { BannersRateLimiter } from '../../infrastructure/BannersRateLimiter';
import { normalizarCpf } from '../../../../shared/cpf';
import { logger } from '../../../../infrastructure/logger';

/** Factory: gera middleware vinculado ao rateLimiter compartilhado. */
export function buildFace3RateLimitMiddlewares(rl: PasswordRecoveryRateLimiter): {
  esqueciSenha: (req: Request, res: Response, next: NextFunction) => void;
  redefinirSenha: (req: Request, res: Response, next: NextFunction) => void;
  generico: (acao: string) => (req: Request, res: Response, next: NextFunction) => void;
} {
  const esqueciSenha = (req: Request, res: Response, next: NextFunction): void => {
    const body = (req.body ?? {}) as { cpf?: unknown };
    const cpfDigits = typeof body.cpf === 'string' ? normalizarCpf(body.cpf) : '';
    rl.consumirEsqueciSenha(req.ip ?? null, cpfDigits)
      .then(() => next())
      .catch((err) => _handleRateError(err, res));
  };

  const redefinirSenha = (req: Request, res: Response, next: NextFunction): void => {
    rl.consumirRedefinirSenha(req.ip ?? null)
      .then(() => next())
      .catch((err) => _handleRateError(err, res));
  };

  const generico = (acao: string) =>
    (req: Request, res: Response, next: NextFunction): void => {
      rl.consumirGenericoFace3(req.ip ?? null, acao)
        .then(() => next())
        .catch((err) => _handleRateError(err, res));
    };

  return { esqueciSenha, redefinirSenha, generico };
}

/**
 * Middleware autenticado de rate limit para download de anexos.
 * Precisa ser aplicado APÓS `authenticatePaciente` (lê `req.pacienteAuth!.contaId`).
 */
export function buildDownloadAnexoRateLimitMiddleware(
  rl: DownloadAnexoRateLimiter,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.pacienteAuth;
    if (!auth) {
      // Defesa em profundidade: se middleware veio antes do auth, falha explícito.
      res.status(500).json({
        error: {
          code: 'CONFIG_ERROR',
          message: 'Rate limit aplicado antes do auth.',
        },
      });
      return;
    }
    rl.consumir(auth.contaId, req.ip ?? null)
      .then(() => next())
      .catch((err) => _handleRateError(err, res));
  };
}

/**
 * Middleware autenticado de rate limit para endpoints do Dossiê.
 * Aplicado APÓS `authenticatePaciente`.
 */
export function buildDossieRateLimitMiddleware(
  rl: DossieRateLimiter,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.pacienteAuth;
    if (!auth) {
      res.status(500).json({
        error: { code: 'CONFIG_ERROR', message: 'Rate limit aplicado antes do auth.' },
      });
      return;
    }
    rl.consumir(auth.contaId, req.ip ?? null)
      .then(() => next())
      .catch((err) => _handleRateError(err, res));
  };
}

/**
 * Middleware autenticado de rate limit para endpoints de Banners (Face 3).
 * Aplicado APÓS `authenticatePaciente`.
 */
export function buildBannersRateLimitMiddleware(
  rl: BannersRateLimiter,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.pacienteAuth;
    if (!auth) {
      res.status(500).json({
        error: { code: 'CONFIG_ERROR', message: 'Rate limit aplicado antes do auth.' },
      });
      return;
    }
    rl.consumir(auth.contaId, req.ip ?? null)
      .then(() => next())
      .catch((err) => _handleRateError(err, res));
  };
}

function _handleRateError(err: unknown, res: Response): void {
  if (
    err &&
    typeof err === 'object' &&
    'statusCode' in err &&
    (err as { statusCode?: number }).statusCode === 429
  ) {
    const e = err as { code?: string; message?: string };
    res.status(429).json({
      error: {
        code: e.code ?? 'RATE_LIMIT_EXCEDIDO',
        message: e.message ?? 'Muitas requisições. Aguarde alguns minutos.',
      },
    });
    return;
  }
  logger.error({ err }, '[rate-limit] erro inesperado — passando 503');
  res.status(503).json({
    error: {
      code: 'SERVICO_INDISPONIVEL',
      message: 'Falha temporária. Tente novamente.',
    },
  });
}
