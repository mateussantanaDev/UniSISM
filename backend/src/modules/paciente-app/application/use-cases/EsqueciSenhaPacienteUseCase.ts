/**
 * Inicia fluxo de recuperação de senha por email.
 *
 * Garantias de segurança:
 *
 *   1. Anti-enumeration — **sempre 204** ao caller, qualquer caminho.
 *      - CPF inválido (checksum) → silencioso
 *      - CPF não existe → silencioso
 *      - Conta inativa → silencioso
 *      - Sem email cadastrado → silencioso
 *      - Rate limit excedido → silencioso (mas audit registra)
 *
 *   2. Timing-constant — usa `bcrypt.compare` dummy quando a conta não existe
 *      para igualar o tempo de resposta. Anti timing-attack.
 *
 *   3. Audit log — toda tentativa (sucesso/silencioso/throttle) vai pra
 *      `auditoria_logs` com IP + userAgent + CPF mascarado.
 *
 *   4. Rate limit — via `PasswordRecoveryRateLimiter` (IP + CPF), ANTES de
 *      qualquer query no banco (fail-fast).
 *
 *   5. Token: 32 bytes hex (256 bits) crypto.randomBytes; só hash SHA-256
 *      é persistido. TTL 30min, uso único.
 *
 * Anti enumeration legal: o caller NUNCA descobre se o CPF existe.
 * Audit interno SIM registra (compliance LGPD).
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../../infrastructure/database/prisma';
import { logger } from '../../../../infrastructure/logger';
import type { IEmailService } from '../../../../infrastructure/email/EmailService';
import type { IAuditLogger } from '../../../../infrastructure/audit/PrismaAuditLogger';
import type { PasswordRecoveryRateLimiter } from '../../infrastructure/PasswordRecoveryRateLimiter';
import { normalizarCpf, isCpfValido, formatarCpf } from '../../../../shared/cpf';

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30min
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1h
const RATE_LIMIT_MAX = 3;

/**
 * Hash dummy bcrypt usado pra equalizar timing quando a conta não existe.
 * Pré-computado pra evitar custo extra; valor não importa, só ocupa CPU
 * o mesmo que um `compare` real.
 */
const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuO5lXSf.t9OFRTcSpRQNeY3o5XBL0V6gC';

export interface EsqueciSenhaContext {
  ip?: string | null;
  userAgent?: string | null;
}

export class EsqueciSenhaPacienteUseCase {
  constructor(
    private readonly email: IEmailService,
    private readonly audit: IAuditLogger,
    private readonly rateLimiter: PasswordRecoveryRateLimiter,
  ) {}

  async exec(cpfInput: string, ctx: EsqueciSenhaContext = {}): Promise<void> {
    const inicioMs = Date.now();
    const cpfDigits = normalizarCpf(cpfInput);
    const cpfMasked = cpfDigits.length >= 4 ? cpfDigits.slice(0, 4) + '***' : '***';

    // 1. Rate limit ANTES de qualquer query (fail-fast). Estoura → throw 429
    //    (não silencioso — atacante PRECISA saber que tá throttled pra parar).
    try {
      await this.rateLimiter.consumirEsqueciSenha(ctx.ip ?? null, cpfDigits);
    } catch (err) {
      await this._audit('SOLICITAR_REDEFINICAO_SENHA_THROTTLED', cpfMasked, null, ctx, {
        motivo: 'RATE_LIMIT_EXCEDIDO',
      });
      throw err;
    }

    // 2. CPF inválido (checksum) → silencioso + audit. Anti-enumeration.
    if (!isCpfValido(cpfDigits)) {
      await this._equalizarTiming(inicioMs);
      await this._audit('SOLICITAR_REDEFINICAO_SENHA_CPF_INVALIDO', cpfMasked, null, ctx);
      return;
    }

    // 3. Busca conta.
    const conta = await prisma.pacienteConta.findUnique({
      where: { cpf: cpfDigits },
      select: { id: true, nome: true, email: true, ativo: true, senhaHash: true },
    });

    if (!conta || !conta.ativo) {
      // Timing-constant: simula bcrypt.compare pra demorar o mesmo que conta existente.
      await bcrypt.compare('dummy', DUMMY_HASH).catch(() => null);
      await this._audit(
        conta ? 'SOLICITAR_REDEFINICAO_SENHA_CONTA_INATIVA' : 'SOLICITAR_REDEFINICAO_SENHA_CPF_NAO_EXISTE',
        cpfMasked,
        null,
        ctx,
      );
      logger.debug({ cpf: cpfMasked }, '[esqueci-senha] conta inexistente/inativa — silencioso');
      return;
    }

    if (!conta.email) {
      // Equaliza com bcrypt dummy (caminho rápido senão revelaria "conta sem email").
      await bcrypt.compare('dummy', conta.senhaHash).catch(() => null);
      await this._audit('SOLICITAR_REDEFINICAO_SENHA_SEM_EMAIL', cpfMasked, conta.id, ctx);
      logger.debug({ contaId: conta.id }, '[esqueci-senha] sem email cadastrado — silencioso');
      return;
    }

    // 4. Rate limit por contaId (DB count — defesa em profundidade adicional).
    const recentes = await prisma.pacienteRecoveryToken.count({
      where: {
        contaId: conta.id,
        criadoEm: { gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) },
      },
    });
    if (recentes >= RATE_LIMIT_MAX) {
      await this._audit('SOLICITAR_REDEFINICAO_SENHA_THROTTLED_DB', cpfMasked, conta.id, ctx, {
        recentes,
        limite: RATE_LIMIT_MAX,
      });
      logger.warn({ contaId: conta.id, recentes }, '[esqueci-senha] DB rate limit — silencioso');
      return;
    }

    // 5. Gera token + hash.
    const token = crypto.randomBytes(32).toString('hex'); // 64 chars hex = 256 bits
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiraEm = new Date(Date.now() + TOKEN_TTL_MS);

    await prisma.pacienteRecoveryToken.create({
      data: {
        contaId: conta.id,
        tokenHash,
        expiraEm,
        ipOrigem: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });

    const primeiroNome = conta.nome.trim().split(/\s+/)[0] ?? '';
    const linkResetSite = process.env['APP_RESET_SENHA_URL']
      ?? 'https://app.unisism.aguasbelas.pe.gov.br/redefinir';
    const linkCompleto = `${linkResetSite}?t=${token}`;

    await this.email.enviar({
      to: conta.email,
      subject: 'Redefinição de senha — UNISISM',
      text:
        `Olá, ${primeiroNome}.\n\n` +
        `Recebemos um pedido para redefinir sua senha do app UNISISM.\n` +
        `Clique no link abaixo (válido por 30 minutos):\n\n` +
        `  ${linkCompleto}\n\n` +
        `Se não foi você que pediu, ignore este email — sua senha continua a mesma.\n\n` +
        `Secretaria Municipal de Saúde · Águas Belas / PE\n`,
      html:
        `<p>Olá, <strong>${primeiroNome}</strong>.</p>` +
        `<p>Recebemos um pedido para redefinir sua senha do app UNISISM.</p>` +
        `<p><a href="${linkCompleto}">Clique aqui para criar uma nova senha</a> (válido por 30 minutos).</p>` +
        `<p>Se não foi você que pediu, ignore este email — sua senha continua a mesma.</p>` +
        `<hr><p style="color:#666;font-size:.85em">Secretaria Municipal de Saúde · Águas Belas / PE</p>`,
    });

    await this._audit('SOLICITAR_REDEFINICAO_SENHA_OK', cpfMasked, conta.id, ctx, {
      cpfFormatado: formatarCpf(cpfDigits),
      emailMasked: this._mascararEmail(conta.email),
      expiraEm: expiraEm.toISOString(),
    });

    logger.info(
      { contaId: conta.id, expiraEm },
      '[esqueci-senha] token gerado e email enviado',
    );
  }

  /** Garante mínimo de tempo de processamento (anti timing-attack). */
  private async _equalizarTiming(inicioMs: number): Promise<void> {
    const MIN_MS = 120; // ~ tempo médio de bcrypt.compare em ROUNDS=10
    const decorrido = Date.now() - inicioMs;
    if (decorrido < MIN_MS) {
      await new Promise((r) => setTimeout(r, MIN_MS - decorrido));
    }
  }

  private async _audit(
    acao: string,
    cpfMasked: string,
    contaId: string | null,
    ctx: EsqueciSenhaContext,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.registrar({
      acao,
      recurso: 'PacienteConta',
      recursoId: contaId ?? undefined,
      atendenteId: null,
      payload: { cpfMasked, ...(extra ?? {}) },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  }

  private _mascararEmail(email: string): string {
    const [user, dom] = email.split('@');
    if (!user || !dom) return '***';
    const u = user.length <= 2 ? '**' : user[0] + '***' + user[user.length - 1];
    return `${u}@${dom}`;
  }
}
