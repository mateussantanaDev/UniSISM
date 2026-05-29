/**
 * Auth do app do motorista (Face 4 · mobile).
 *
 * - Valida o JWT (mesmo formato do `authenticate` da Face 1/2, com claims extras
 *   `motoristaId` e `primeiroLogin`).
 * - Exige role `MOTORISTA_TFD`.
 * - Verifica que o `MotoristaTFD` e o `Atendente` vinculado ainda estão ATIVOS
 *   (proteção contra desativação durante a sessão de 30 dias).
 * - Popula `req.motoristaAuth` para os controllers / use cases.
 */
import type { Request, Response, NextFunction } from 'express';
import { Forbidden, Unauthorized } from '../../../../shared/errors';
import { prisma } from '../../../../infrastructure/database/prisma';
import type { ITokenService } from '../../../../domain/services/ITokenService';

export interface MotoristaAuthContext {
  atendenteId: string;
  motoristaId: string;
  prefeituraId: string;
  primeiroLogin: boolean;
  /** Matrícula do atendente — usada em audit log. */
  matricula: string;
  nome: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    motoristaAuth?: MotoristaAuthContext;
  }
}

export function makeAuthenticateMotorista(tokens: ITokenService) {
  return async function authenticateMotorista(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const header = req.header('authorization') ?? '';
      const m = /^Bearer\s+(.+)$/i.exec(header);
      if (!m || !m[1]) return next(Unauthorized('TOKEN_AUSENTE', 'Token ausente'));

      const payload = tokens.verificarAccess(m[1]);
      if (payload.role !== 'MOTORISTA_TFD') {
        return next(Forbidden('ROLE_NAO_PERMITIDO', 'Esta rota é apenas para motoristas'));
      }
      if (!payload.motoristaId) {
        return next(Unauthorized('TOKEN_INVALIDO', 'Token sem motoristaId'));
      }

      // Snapshot autoritativo: motorista pode ter sido AFASTADO/INATIVO/deletado.
      const motorista = await prisma.motoristaTFD.findUnique({
        where: { id: payload.motoristaId },
        include: {
          atendente: { select: { id: true, ativo: true, matricula: true, nome: true } },
        },
      });
      if (!motorista || motorista.deletadoEm) {
        return next(Unauthorized('TOKEN_INVALIDO', 'Motorista não encontrado'));
      }
      if (!motorista.atendente || motorista.atendente.id !== payload.sub) {
        return next(Unauthorized('TOKEN_INVALIDO', 'Vínculo motorista↔atendente inválido'));
      }
      if (!motorista.atendente.ativo || motorista.status !== 'ATIVO') {
        return next(Forbidden('MOTORISTA_INATIVO', 'Motorista inativo'));
      }

      req.motoristaAuth = {
        atendenteId: motorista.atendente.id,
        motoristaId: motorista.id,
        prefeituraId: motorista.prefeituraId,
        primeiroLogin: motorista.primeiroLogin,
        matricula: motorista.atendente.matricula,
        nome: motorista.atendente.nome,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Bloqueador: usado em rotas que NÃO podem ser chamadas antes da troca de
 * senha (todas exceto `/auth/trocar-senha` e `/auth/logout`).
 */
export function bloquearPrimeiroLogin(req: Request, _res: Response, next: NextFunction): void {
  const a = req.motoristaAuth;
  if (!a) return next(Unauthorized('TOKEN_AUSENTE', 'Não autenticado'));
  if (a.primeiroLogin) {
    return next(
      Forbidden(
        'PRIMEIRO_LOGIN_PENDENTE',
        'Você precisa trocar a senha provisória antes de continuar',
      ),
    );
  }
  next();
}
