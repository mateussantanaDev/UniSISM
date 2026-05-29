/**
 * Conclui o fluxo de recuperação de senha: paciente envia token (vindo do email)
 * + nova senha → backend valida, troca, invalida sessões antigas, **invalida
 * outros tokens recovery ativos da mesma conta** (anti dual-use).
 *
 * Garantias:
 *
 *   1. Rate limit por IP (PasswordRecoveryRateLimiter) — ANTES de qualquer query.
 *   2. Token de uso único + TTL 30min (status: válido, usado, expirado).
 *   3. Nova senha passa por `validarSenhaForte` (mínimo + sequências + CPF).
 *   4. Nova senha não pode ser igual à atual.
 *   5. Após sucesso, INVALIDA: todas as sessões ativas (revogadaEm) + todos os
 *      outros recovery tokens ativos da conta (defesa em profundidade).
 *   6. Audit log em todas as transições (sucesso, token inválido, expirado,
 *      já usado, senha fraca, senha igual à atual).
 */
import crypto from 'node:crypto';
import { prisma } from '../../../../infrastructure/database/prisma';
import { Conflict, NotFound, Unauthorized, Unprocessable } from '../../../../shared/errors';
import { logger } from '../../../../infrastructure/logger';
import type { IPasswordHasher } from '../../../../domain/services/IPasswordHasher';
import type { IAuditLogger } from '../../../../infrastructure/audit/PrismaAuditLogger';
import type { PasswordRecoveryRateLimiter } from '../../infrastructure/PasswordRecoveryRateLimiter';
import { validarSenhaForte } from '../../../../shared/senhaForte';

export interface RedefinirSenhaContext {
  ip?: string | null;
  userAgent?: string | null;
}

export class RedefinirSenhaPacienteUseCase {
  constructor(
    private readonly hasher: IPasswordHasher,
    private readonly audit: IAuditLogger,
    private readonly rateLimiter: PasswordRecoveryRateLimiter,
  ) {}

  async exec(token: string, novaSenha: string, ctx: RedefinirSenhaContext = {}): Promise<void> {
    // 1. Rate limit por IP (anti brute force de token).
    await this.rateLimiter.consumirRedefinirSenha(ctx.ip ?? null);

    // 2. Sanity checks formais antes de queries.
    if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
      await this._audit('REDEFINIR_SENHA_TOKEN_MALFORMADO', null, ctx, {
        tokenLen: typeof token === 'string' ? token.length : 0,
      });
      throw NotFound('TOKEN_INVALIDO', 'Link inválido. Solicite um novo.');
    }
    // Token deve ser hex puro (gerado por randomBytes.toString('hex')).
    if (!/^[a-f0-9]+$/i.test(token)) {
      await this._audit('REDEFINIR_SENHA_TOKEN_MALFORMADO', null, ctx, {
        tokenLen: token.length,
        motivo: 'NAO_HEX',
      });
      throw NotFound('TOKEN_INVALIDO', 'Link inválido. Solicite um novo.');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const recovery = await prisma.pacienteRecoveryToken.findUnique({
      where: { tokenHash },
      include: {
        conta: { select: { id: true, senhaHash: true, cpf: true } },
      },
    });

    if (!recovery) {
      await this._audit('REDEFINIR_SENHA_TOKEN_NAO_EXISTE', null, ctx);
      throw NotFound('TOKEN_INVALIDO', 'Link inválido. Solicite um novo.');
    }
    if (recovery.usadoEm) {
      await this._audit('REDEFINIR_SENHA_TOKEN_JA_USADO', recovery.contaId, ctx, {
        usadoEm: recovery.usadoEm.toISOString(),
      });
      throw Conflict('TOKEN_JA_USADO', 'Este link já foi usado. Solicite um novo se precisar.');
    }
    if (recovery.expiraEm.getTime() < Date.now()) {
      await this._audit('REDEFINIR_SENHA_TOKEN_EXPIRADO', recovery.contaId, ctx, {
        expiraEm: recovery.expiraEm.toISOString(),
      });
      throw Unauthorized('TOKEN_EXPIRADO', 'O link expirou. Solicite um novo.');
    }

    // 3. Senha forte (estrutural + não-CPF).
    const motivoSenhaFraca = validarSenhaForte(novaSenha, { cpf: recovery.conta.cpf });
    if (motivoSenhaFraca) {
      await this._audit('REDEFINIR_SENHA_FRACA', recovery.contaId, ctx, {
        motivo: motivoSenhaFraca,
      });
      throw Unprocessable('SENHA_FRACA', motivoSenhaFraca);
    }

    // 4. Senha nova ≠ atual.
    const igualAtual = await this.hasher.compare(novaSenha, recovery.conta.senhaHash);
    if (igualAtual) {
      await this._audit('REDEFINIR_SENHA_IGUAL_ATUAL', recovery.contaId, ctx);
      throw Unprocessable('SENHA_IGUAL_ATUAL', 'A nova senha deve ser diferente da atual');
    }

    // 5. Troca + invalidação em transação atômica.
    // **Defesa contra race condition**: 2 requests simultâneos com mesmo token
    // podem ambos passar o `findUnique` acima. Por isso, o UPDATE do token usa
    // `where: { id, usadoEm: null }` (check-and-set atômico). Se outro request
    // já marcou `usadoEm`, o updateMany retorna `count: 0` e detectamos a race.
    const novoHash = await this.hasher.hash(novaSenha);
    const agora = new Date();

    let revogadas: { count: number };
    let outrosTokens: { count: number };
    try {
      const result = await prisma.$transaction(async (tx) => {
        // 5.1 — atomic check-and-set no token (vence quem chegar primeiro).
        const consumido = await tx.pacienteRecoveryToken.updateMany({
          where: { id: recovery.id, usadoEm: null },
          data: { usadoEm: agora },
        });
        if (consumido.count === 0) {
          // Race detectada: outro request consumiu o token entre `findUnique` e aqui.
          throw new _TokenRaceError();
        }

        // 5.2 — troca de senha
        await tx.pacienteConta.update({
          where: { id: recovery.contaId },
          data: { senhaHash: novoHash, senhaProvisoria: false },
        });

        // 5.3 — revoga sessões ativas
        const rev = await tx.sessaoPaciente.updateMany({
          where: { contaId: recovery.contaId, revogadaEm: null },
          data: { revogadaEm: agora },
        });

        // 5.4 — invalida outros recovery tokens
        const outros = await tx.pacienteRecoveryToken.updateMany({
          where: {
            contaId: recovery.contaId,
            id: { not: recovery.id },
            usadoEm: null,
            expiraEm: { gt: agora },
          },
          data: { usadoEm: agora },
        });

        return { rev, outros };
      });
      revogadas = result.rev;
      outrosTokens = result.outros;
    } catch (err) {
      if (err instanceof _TokenRaceError) {
        // Race detectada — outro request já consumiu o token.
        await this._audit('REDEFINIR_SENHA_TOKEN_RACE_DETECTADA', recovery.contaId, ctx);
        throw Conflict(
          'TOKEN_JA_USADO',
          'Este link já foi usado. Solicite um novo se precisar.',
        );
      }
      throw err;
    }

    await this._audit('REDEFINIR_SENHA_OK', recovery.contaId, ctx, {
      sessoesRevogadas: revogadas.count,
      outrosTokensInvalidados: outrosTokens.count,
    });

    logger.info(
      {
        contaId: recovery.contaId,
        sessoesRevogadas: revogadas.count,
        outrosTokensInvalidados: outrosTokens.count,
      },
      '[redefinir-senha] sucesso',
    );
  }

  private async _audit(
    acao: string,
    contaId: string | null,
    ctx: RedefinirSenhaContext,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.registrar({
      acao,
      recurso: 'PacienteConta',
      recursoId: contaId ?? undefined,
      atendenteId: null,
      payload: extra ?? {},
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  }
}

/** Sentinela interna para sinalizar race condition no consumo do token. */
class _TokenRaceError extends Error {
  constructor() {
    super('Recovery token race detected');
    this.name = '_TokenRaceError';
  }
}
