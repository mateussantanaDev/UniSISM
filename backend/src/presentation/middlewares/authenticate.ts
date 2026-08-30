import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../infrastructure/database/prisma';
import { Unauthorized } from '../../shared/errors';
import type { ITokenService, AccessTokenPayload } from '../../domain/services/ITokenService';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AccessTokenPayload;
  }
}

export function makeAuthenticate(tokens: ITokenService) {
  return async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const header = req.header('authorization') ?? '';
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m || !m[1]) {
      return next(Unauthorized('TOKEN_AUSENTE', 'Token não enviado'));
    }
    try {
      const payload = tokens.verificarAccess(m[1]);

      const atendente = await prisma.atendente.findUnique({
        where: { id: payload.sub },
        select: { ativo: true },
      });

      if (!atendente || !atendente.ativo) {
        return next(Unauthorized('CONTA_INATIVA', 'Usuário inativo ou não encontrado'));
      }

      req.auth = payload;
      next();
    } catch (err) {
      next(err);
    }
  };
}
