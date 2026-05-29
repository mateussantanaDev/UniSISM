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

export interface RefreshOutput {
  token: string;            // novo access (opaco base64url)
  refreshToken: string;     // novo refresh (opaco base64url)
  expiresIn: number;        // segundos até access expirar (1800)
  refreshExpiresIn: number; // segundos até refresh expirar (2592000)
  paciente: {
    id: string;
    cpf: string;
    cpfFormatado: string;
    nome: string;
    email: string | null;
    telefone: string | null;
    senhaProvisoria: boolean;
  };
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

    return {
      token: novoAccess,
      refreshToken: novoRefresh,
      expiresIn: ACCESS_EXPIRES_IN_S,
      refreshExpiresIn: Math.floor(REFRESH_TTL_MS / 1000),
      paciente: {
        id: found.conta.id,
        cpf: found.conta.cpf,
        cpfFormatado: found.conta.cpfFormatado || formatarCpf(found.conta.cpf),
        nome: found.conta.nome,
        email: found.conta.email,
        telefone: found.conta.telefone,
        senhaProvisoria: found.conta.senhaProvisoria,
      },
    };
  }
}
