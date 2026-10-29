import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../infrastructure/database/prisma';
import { Unauthorized } from '../../shared/errors';
import type { ITokenService, AccessTokenPayload } from '../../domain/services/ITokenService';
import { resolverTipoUnidade } from '../../shared/unitType';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AccessTokenPayload & {
      cargo?: string | null;
      funcao?: string | null;
      unidadeNome?: string | null;
    };
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
        select: {
          id: true,
          ativo: true,
          deletadoEm: true,
          trocaSenhaObrigatoria: true,
          role: true,
          ubsId: true,
          unidadeId: true,
          prefeituraId: true,
          tipoUnidade: true,
          cargo: true,
          funcao: true,
          ubs: { select: { id: true, nome: true, prefeituraId: true } },
        },
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

      const resolvedTipoUnidade = resolverTipoUnidade({
        tipoUnidade: atendente.tipoUnidade,
        cargo: atendente.cargo,
        funcao: atendente.funcao,
        role: atendente.role,
        ubs: atendente.ubs,
      });

      let prefeituraId = atendente.prefeituraId ?? atendente.ubs?.prefeituraId ?? null;
      if (!prefeituraId && atendente.role !== 'DESENVOLVEDOR') {
        const prefAtiva = await prisma.prefeitura.findFirst({
          where: { ativa: true },
          orderBy: { criadoEm: 'asc' },
          select: { id: true },
        });
        prefeituraId = prefAtiva?.id ?? 'b2ca1b67-3b6b-4a52-adbe-01df1d64cae6';
      }

      const ehCentroAuth = resolvedTipoUnidade === 'CEM' || resolvedTipoUnidade === 'CEO';

      // Normalização automática no banco em background se divergente
      if (
        (atendente.tipoUnidade !== resolvedTipoUnidade && ehCentroAuth) ||
        (prefeituraId && !atendente.prefeituraId) ||
        (ehCentroAuth && (atendente.ubsId || atendente.unidadeId))
      ) {
        prisma.atendente.update({
          where: { id: atendente.id },
          data: {
            ...(atendente.tipoUnidade !== resolvedTipoUnidade && ehCentroAuth
              ? { tipoUnidade: resolvedTipoUnidade }
              : {}),
            ...(prefeituraId && !atendente.prefeituraId ? { prefeituraId } : {}),
            ...(ehCentroAuth && (atendente.ubsId || atendente.unidadeId)
              ? { ubsId: null, unidadeId: null }
              : {}),
          },
        }).catch(() => {});
      }

      // Permissões atuais prevalecem sobre claims de sessões anteriores à alteração do usuário.
      req.auth = {
        ...payload,
        role: atendente.role,
        ubsId: ehCentroAuth ? null : (atendente.ubsId ?? (resolvedTipoUnidade === 'UBS' ? atendente.unidadeId : null)),
        prefeituraId,
        tipoUnidade: resolvedTipoUnidade,
        cargo: atendente.cargo,
        funcao: atendente.funcao,
        unidadeNome: ehCentroAuth ? null : (atendente.ubs?.nome ?? null),
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
