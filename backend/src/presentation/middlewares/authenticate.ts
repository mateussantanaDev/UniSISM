import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../infrastructure/database/prisma';
import { Unauthorized } from '../../shared/errors';
import type { ITokenService, AccessTokenPayload } from '../../domain/services/ITokenService';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AccessTokenPayload;
  }
}

export function makeAuthenticate(tokens: ITokenService, allowPasswordChange = false) {
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
        select: { ativo: true, deletadoEm: true, trocaSenhaObrigatoria: true,
          role: true, ubsId: true, prefeituraId: true, tipoUnidade: true,
          ubs: { select: { prefeituraId: true } } },
      });

      if (!atendente || !atendente.ativo || atendente.deletadoEm) {
        return next(Unauthorized('CONTA_INATIVA', 'Usuário inativo ou não encontrado'));
      }

      const sessao = payload.sid ? await prisma.sessao.findUnique({ where: { id: payload.sid } }) : null;
      if (!sessao || sessao.atendenteId !== payload.sub || sessao.revogadaEm || sessao.expiraEm <= new Date()) {
        return next(Unauthorized('SESSAO_REVOGADA', 'Sessão encerrada. Entre novamente.'));
      }
      if (atendente.trocaSenhaObrigatoria && !allowPasswordChange) {
        return next(Unauthorized('TROCA_SENHA_OBRIGATORIA', 'Defina uma nova senha para continuar.'));
      }
      // Permissões atuais prevalecem sobre claims de sessões anteriores à alteração do usuário.
      req.auth = { ...payload, role: atendente.role, ubsId: atendente.ubsId,
        prefeituraId: atendente.prefeituraId ?? atendente.ubs?.prefeituraId ?? null,
        tipoUnidade: atendente.tipoUnidade };
      next();
    } catch (err) {
      next(err);
    }
  };
}
