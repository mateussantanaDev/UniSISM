/**
 * Refresh token rotativo do app paciente (Face 3 · v0.18.0).
 *
 * Protocolo:
 *   1. App envia `refreshToken` (string opaca base64url).
 *   2. Backend valida e consome:
 *      - Hash + lookup em `paciente_refresh_tokens`.
 *      - Confere `revogadoEm == null`, `expiraEm > now`, `usadoEm == null`,
 *        e `conta.ativo == true`.
 *      - Marca o token como `usadoEm = now`.
 *      - Cria novo par: novo access (`SessaoPaciente`, TTL 30 min) +
 *        novo refresh (`PacienteRefreshToken`, TTL 30 dias).
 *      - Link encadeado: `usado.substituidoPorId = novo.id`.
 *      - Mantém `ip/userAgent` da NOVA request.
 *   3. App descarta o refresh antigo e usa o novo par.
 *
 * Detecção de reuse (token vazado / clonado):
 *   - Se `usadoEm != null` quando consumido → REVOGA TODA A CADEIA da conta.
 *     Motivo: `REUSE_DETECTED` (no token apresentado) +
 *             `CHAIN_COMPROMISED` (nos demais tokens vivos da conta).
 *   - Erro retornado: `401 REFRESH_REUSE_DETECTED`.
 *   - Audit log emitido para investigação.
 *
 * Política:
 *   - Access TTL: 30 min (era 24h fixo)
 *   - Refresh TTL: 30 dias
 *   - Rate limit: aproveita o `genericoRL` (30 req/15min/IP da Face 3)
 *   - LGPD: refresh tokens armazenam só hash (SHA-256); plaintext NUNCA persiste.
 */
import crypto from 'node:crypto';
import { prisma } from '../../../../infrastructure/database/prisma';
import { Unauthorized, Forbidden } from '../../../../shared/errors';
import { formatarCpf } from '../../../../infrastructure/services/NotificacaoPacienteService';
import type { IAuditLogger } from '../../../../infrastructure/audit/PrismaAuditLogger';

const ACCESS_TTL_MS = 30 * 60 * 1000;          // 30 min
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const ACCESS_EXPIRES_IN_S = 30 * 60;

/**
 * Shape canônico do paciente nas respostas auth — v0.18.1+
 * Espelha CONTRATO_BACKEND.md §4.1 (idêntico ao do login).
 */
export interface RefreshPacientePayload {
  id: string;
  nome: string;
  cpf: string;
  cpfFormatado: string;
  dataNascimento: string | null;
  cartaoSus: string | null;
  email: string | null;
  telefone: string | null;
  fotoUrl: string | null;
  ubsVinculadaId: string | null;
  ubsVinculadaNome: string | null;
  senhaProvisoria: boolean;
}

export interface RefreshOutput {
  /** v0.18.1+ · nome canônico do contrato */
  accessToken: string;
  /** Alias legado v0.18.0 */
  token: string;
  refreshToken: string;
  expiresIn: number;          // segundos até access expirar (1800)
  /** ISO 8601 v0.18.1+ */
  expiresAt: string;
  refreshExpiresIn: number;   // segundos até refresh expirar (2592000)
  paciente: RefreshPacientePayload;
}

export interface RefreshInput {
  refreshToken: string;
  ip?: string;
  userAgent?: string;
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function gerarTokenOpaco(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export class RefreshTokenPacienteUseCase {
  constructor(private readonly audit: IAuditLogger) {}

  async exec({ refreshToken, ip, userAgent }: RefreshInput): Promise<RefreshOutput> {
    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.length < 32) {
      throw Unauthorized('REFRESH_TOKEN_INVALIDO', 'Refresh token inválido.');
    }

    const tokenHash = sha256(refreshToken);
    const found = await prisma.pacienteRefreshToken.findUnique({
      where: { tokenHash },
      include: { conta: true },
    });

    if (!found) {
      throw Unauthorized('REFRESH_TOKEN_INVALIDO', 'Refresh token inválido.');
    }

    // --- Detecção de reuse (token já consumido sendo apresentado de novo) ---
    if (found.usadoEm !== null) {
      // Revoga TODA a cadeia da conta — sinal de vazamento/clone.
      await prisma.pacienteRefreshToken.updateMany({
        where: {
          contaId: found.contaId,
          revogadoEm: null,
        },
        data: {
          revogadoEm: new Date(),
          motivoRevogacao: 'CHAIN_COMPROMISED',
        },
      });
      // E também todas as sessões ativas (forçar re-login)
      await prisma.sessaoPaciente.updateMany({
        where: { contaId: found.contaId, revogadaEm: null },
        data: { revogadaEm: new Date() },
      });

      await this.audit.registrar({
        acao: 'REFRESH_REUSE_DETECTED',
        recurso: 'PacienteRefreshToken',
        atendenteId: null,
        payload: {
          contaId: found.contaId,
          refreshTokenId: found.id,
          usadoOriginalmenteEm: found.usadoEm,
          substituidoPorId: found.substituidoPorId,
          ip,
          userAgent,
        },
      });

      throw Unauthorized(
        'REFRESH_REUSE_DETECTED',
        'Refresh token reutilizado — sessões revogadas por segurança. Faça login novamente.',
      );
    }

    if (found.revogadoEm !== null) {
      throw Unauthorized('REFRESH_TOKEN_REVOGADO', 'Refresh token revogado.');
    }

    if (found.expiraEm <= new Date()) {
      throw Unauthorized('REFRESH_TOKEN_EXPIRADO', 'Refresh token expirado.');
    }

    if (!found.conta.ativo) {
      // Revoga também — não emitir novo
      await prisma.pacienteRefreshToken.update({
        where: { id: found.id },
        data: { revogadoEm: new Date(), motivoRevogacao: 'CONTA_INATIVA' },
      });
      throw Forbidden(
        'CONTA_DESATIVADA',
        'Conta desativada. Procure sua UBS para reativação.',
      );
    }

    // --- Tudo OK · rotacionar atomicamente ---
    const novoAccess = gerarTokenOpaco();
    const novoRefresh = gerarTokenOpaco();
    const accessHash = sha256(novoAccess);
    const refreshHash = sha256(novoRefresh);
    const now = new Date();
    const accessExpira = new Date(now.getTime() + ACCESS_TTL_MS);
    const refreshExpira = new Date(now.getTime() + REFRESH_TTL_MS);

    const novoRefreshRow = await prisma.$transaction(async (tx) => {
      // 1. Cria o novo refresh
      const novoR = await tx.pacienteRefreshToken.create({
        data: {
          contaId: found.contaId,
          tokenHash: refreshHash,
          expiraEm: refreshExpira,
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        },
      });

      // 2. Cria a nova sessão (access) ligada ao novo refresh
      await tx.sessaoPaciente.create({
        data: {
          contaId: found.contaId,
          tokenHash: accessHash,
          ip: ip ?? null,
          userAgent: userAgent ?? null,
          expiraEm: accessExpira,
          refreshTokenId: novoR.id,
        },
      });

      // 3. Marca o antigo como usado + link da cadeia
      await tx.pacienteRefreshToken.update({
        where: { id: found.id },
        data: {
          usadoEm: now,
          substituidoPorId: novoR.id,
        },
      });

      return novoR;
    });

    // Audit não-bloqueante (fora da transação)
    await this.audit.registrar({
      acao: 'REFRESH_TOKEN_ROTACIONADO',
      recurso: 'PacienteRefreshToken',
      atendenteId: null,
      payload: {
        contaId: found.contaId,
        antigoId: found.id,
        novoId: novoRefreshRow.id,
        ip,
      },
    });

    // LEFT JOIN com UBS + Paciente pra shape completo do contrato (v0.18.1+)
    const contaWithUbs = await prisma.pacienteConta.findUnique({
      where: { id: found.conta.id },
      select: { ubsVinculadaId: true, ubsVinculada: { select: { nome: true } } },
    });
    const pac = await prisma.paciente.findUnique({
      where: { cpf: found.conta.cpf },
      select: { dataNascimento: true, cartaoSus: true },
    });

    const paciente: RefreshPacientePayload = {
      id: found.conta.id,
      nome: found.conta.nome,
      cpf: found.conta.cpf,
      cpfFormatado: found.conta.cpfFormatado || formatarCpf(found.conta.cpf),
      dataNascimento: pac?.dataNascimento ? pac.dataNascimento.toISOString().slice(0, 10) : null,
      cartaoSus: pac?.cartaoSus ?? null,
      email: found.conta.email,
      telefone: found.conta.telefone,
      fotoUrl: null,
      ubsVinculadaId: contaWithUbs?.ubsVinculadaId ?? null,
      ubsVinculadaNome: contaWithUbs?.ubsVinculada?.nome ?? null,
      senhaProvisoria: found.conta.senhaProvisoria,
    };

    return {
      accessToken: novoAccess,
      token: novoAccess, // alias legado
      refreshToken: novoRefresh,
      expiresIn: ACCESS_EXPIRES_IN_S,
      expiresAt: accessExpira.toISOString(),
      refreshExpiresIn: Math.floor(REFRESH_TTL_MS / 1000),
      paciente,
    };
  }
}
