/**
 * Troca de senha do motorista autenticado.
 *
 * Obrigatório no primeiro login (quando `motorista.primeiroLogin=true`,
 * todas as outras rotas retornam 403 PRIMEIRO_LOGIN_PENDENTE).
 *
 * Regras:
 *   - Exige senhaAtual (zero-trust).
 *   - Nova senha ≥ 8 chars, com letras E números (anti força-bruta básico).
 *   - Nova ≠ atual.
 *
 * Efeitos: zera `primeiroLogin`. Logging na cadeia TFD.
 */
import type { Request } from 'express';
import { Conflict, Unauthorized } from '../../../../shared/errors';
import { prisma } from '../../../../infrastructure/database/prisma';
import type { IPasswordHasher } from '../../../../domain/services/IPasswordHasher';
import type { ITfdAuditLogger } from '../../../tfd/infrastructure/TfdAuditLogger';
import type { MotoristaAuthContext } from '../../presentation/middlewares/authenticateMotorista';

export class TrocarSenhaMotoristaUseCase {
  constructor(
    private readonly hasher: IPasswordHasher,
    private readonly audit: ITfdAuditLogger,
  ) {}

  async exec(
    auth: MotoristaAuthContext,
    senhaAtual: string,
    novaSenha: string,
    req: Request,
  ): Promise<void> {
    if (novaSenha.length < 8) {
      throw Conflict('SENHA_FRACA', 'Use pelo menos 8 caracteres');
    }
    if (!/[A-Za-z]/.test(novaSenha) || !/\d/.test(novaSenha)) {
      throw Conflict('SENHA_FRACA', 'A nova senha precisa misturar letras e números');
    }
    if (senhaAtual === novaSenha) {
      throw Conflict('SENHA_IGUAL', 'Escolha uma senha diferente da atual');
    }

    const atendente = await prisma.atendente.findUnique({ where: { id: auth.atendenteId } });
    if (!atendente) throw Unauthorized('TOKEN_INVALIDO', 'Sessão inválida');

    const ok = await this.hasher.compare(senhaAtual, atendente.senhaHash);
    if (!ok) throw Unauthorized('SENHA_ATUAL_INVALIDA', 'Senha atual incorreta');

    const novoHash = await this.hasher.hash(novaSenha);
    await prisma.$transaction([
      prisma.atendente.update({
        where: { id: auth.atendenteId },
        data: { senhaHash: novoHash, senhaAlteradaEm: new Date() },
      }),
      prisma.motoristaTFD.update({
        where: { id: auth.motoristaId },
        data: { primeiroLogin: false },
      }),
    ]);

    await this.audit.registrar({
      prefeituraId: auth.prefeituraId,
      acao: 'MOTORISTA_TROCOU_SENHA',
      recursoTipo: 'MOTORISTA',
      recursoId: auth.motoristaId,
      operadorId: auth.atendenteId,
      operadorNome: auth.nome,
      operadorMatricula: auth.matricula,
      operadorRole: 'MOTORISTA_TFD',
      ip: req.ip ?? '0.0.0.0',
      userAgent: req.header('user-agent') ?? 'unknown',
    });
  }
}
