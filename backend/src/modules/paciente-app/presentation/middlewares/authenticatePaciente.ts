/**
 * Autenticação do app do paciente por bearer token opaco (gerenciado por SessaoPaciente).
 * Popula req.pacienteAuth.
 */
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../../../infrastructure/database/prisma';
import { Unauthorized } from '../../../../shared/errors';

export interface PacienteAuthContext {
  contaId: string;
  cpfDigits: string;
  cpfFormatado: string;
  nome: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    pacienteAuth?: PacienteAuthContext;
  }
}

export async function authenticatePaciente(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.header('authorization') ?? '';
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m || !m[1]) return next(Unauthorized('TOKEN_AUSENTE', 'Token ausente'));

    const tokenHash = crypto.createHash('sha256').update(m[1]).digest('hex');
    const sessao = await prisma.sessaoPaciente.findUnique({
      where: { tokenHash },
      include: { conta: true },
    });
    if (!sessao || sessao.revogadaEm || sessao.expiraEm < new Date()) {
      return next(Unauthorized('TOKEN_INVALIDO', 'Sessão inválida ou expirada'));
    }
    if (!sessao.conta.ativo) {
      return next(Unauthorized('CONTA_INATIVA', 'Conta inativa'));
    }
    req.pacienteAuth = {
      contaId: sessao.contaId,
      cpfDigits: sessao.conta.cpf,
      cpfFormatado: sessao.conta.cpfFormatado,
      nome: sessao.conta.nome,
    };
    next();
  } catch (err) {
    next(err);
  }
}
