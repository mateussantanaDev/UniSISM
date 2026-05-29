import crypto from 'node:crypto';
import { TooManyRequests } from '../../shared/errors';
import type { IAtendenteRepository } from '../../domain/repositories/IAtendenteRepository';
import type { IPasswordResetRepository } from '../../domain/repositories/IPasswordResetRepository';
import type { IPasswordHasher } from '../../domain/services/IPasswordHasher';
import type { IEmailService } from '../../infrastructure/email/EmailService';
import { logger } from '../../infrastructure/logger';

export class ForgotPasswordUseCase {
  constructor(
    private readonly atendentes: IAtendenteRepository,
    private readonly resets: IPasswordResetRepository,
    private readonly hasher: IPasswordHasher,
    private readonly email: IEmailService,
  ) {}

  /**
   * Sempre retorna `tokenEnviado: true` (anti-enumeration).
   * Internamente: gera código de 6 dígitos, hasheia, persiste, dispara email.
   *
   * Email é enviado fire-and-forget — falha de SMTP não vaza pro caller
   * (anti-enumeration: usuário não pode descobrir se email existe pelo timing).
   */
  async exec(login: string): Promise<{ tokenEnviado: true }> {
    const atendente = await this.atendentes.buscarPorLogin(login);
    if (!atendente) return { tokenEnviado: true };

    const recentes = await this.resets.solicitacoesRecentes(atendente.id, 60);
    if (recentes >= 1) {
      throw TooManyRequests('RATE_LIMIT', 'Aguarde 60s antes de solicitar novamente');
    }

    const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const codigoHash = await this.hasher.hash(codigo);
    const expiraEm = new Date(Date.now() + 10 * 60_000);

    await this.resets.criar({ atendenteId: atendente.id, codigoHash, expiraEm });

    void this.email
      .enviarCodigoRedefinicao({
        para: atendente.email,
        nome: atendente.nome,
        codigo,
        expiraEm,
      })
      .catch((err) =>
        logger.error(
          { err, matricula: atendente.matricula },
          'falha ao enviar email de redefinição (código foi gravado, retry possível)',
        ),
      );

    return { tokenEnviado: true };
  }
}
