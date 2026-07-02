/**
 * Login do paciente no app.
 *
 * Chave: CPF + senha.
 * Contas criadas automaticamente por notificação começam "pendentes" (senhaHash = '!pending!'
 * e ativo=false). O paciente ativa via `POST /paciente-app/auth/ativar-conta` usando CPF +
 * data de nascimento (confirmação simples) + nova senha. [roadmap]
 *
 * Enquanto a conta estiver `ativo=false` ou senhaHash=='!pending!', o login é rejeitado.
 */
import crypto from 'node:crypto';
import { prisma } from '../../../../infrastructure/database/prisma';
import { Forbidden, Unauthorized } from '../../../../shared/errors';
import type { IPasswordHasher } from '../../../../domain/services/IPasswordHasher';
import {
  formatarCpf,
  normalizarCpf,
} from '../../../../infrastructure/services/NotificacaoPacienteService';

/**
 * Política de TTL (v0.18.1 — refresh rotativo + contrato app):
 *   - Access token: 30 min (era 24h)
 *   - Refresh token: 30 dias rotativo (uso único, detecção de reuse)
 *
 * Compat retro:
 *   - Campos `token` + `expiresIn` continuam presentes (v0.17.x).
 *   - Campos `accessToken` + `expiresAt` (v0.18.1) — exigidos pelo CONTRATO_BACKEND.md
 *     do app Flutter.
 *
 * Apps que querem aproveitar refresh devem:
 *   1. Persistir `refreshToken` no secure storage.
 *   2. Quando access retornar 401, chamar `POST /auth/paciente/refresh` com o
 *      refresh atual antes de redirecionar pra /login.
 */
const ACCESS_TTL_MS = 30 * 60 * 1000;            // 30 min
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const ACCESS_EXPIRES_IN_S = 30 * 60;

/**
 * Shape canônico do paciente nas respostas de auth (login/refresh/me).
 * Espelha CONTRATO_BACKEND.md §4.1.
 */
export interface PacienteAuthPayload {
  id: string;
  nome: string;
  cpf: string;
  cpfFormatado: string;
  /** YYYY-MM-DD ou null se conta não tem Paciente associado ainda. */
  dataNascimento: string | null;
  cartaoSus: string | null;
  email: string | null;
  telefone: string | null;
  fotoUrl: string | null;
  ubsVinculadaId: string | null;
  ubsVinculadaNome: string | null;
  /** true quando a senha ainda é o CPF — app deve forçar troca. */
  senhaProvisoria: boolean;
}

export interface LoginPacienteOutput {
  /** v0.18.1+ · nome canônico do contrato. */
  accessToken: string;
  /** Alias legado v0.17.x — mesmo valor de `accessToken`. */
  token: string;
  /** Refresh rotativo (v0.18.0+). */
  refreshToken: string;
  /** Segundos até access expirar (legado v0.17.x). */
  expiresIn: number;
  /** ISO 8601 quando access expira (v0.18.1+, contrato). */
  expiresAt: string;
  /** Segundos até refresh expirar (v0.18.0+). */
  refreshExpiresIn: number;
  paciente: PacienteAuthPayload;
}

export class LoginPacienteUseCase {
  constructor(private readonly hasher: IPasswordHasher) {}

  async exec(
    cpf: string,
    senha: string,
    ip?: string,
    userAgent?: string,
  ): Promise<LoginPacienteOutput> {
    const cpfDigits = normalizarCpf(cpf);
    const conta = await prisma.pacienteConta.findUnique({ where: { cpf: cpfDigits } });
    if (!conta) {
      throw Unauthorized('AUTH_INVALID_CREDENTIALS', 'CPF ou senha inválidos');
    }
    // Contas criadas automaticamente no primeiro encaminhamento já nascem
    // ATIVAS com senha = CPF (senhaProvisoria=true). O app do paciente deve
    // forçar a troca no primeiro login. Só bloqueia se o admin desativar.
    if (!conta.ativo) {
      throw Forbidden(
        'CONTA_DESATIVADA',
        'Conta desativada. Procure sua UBS para reativação.',
      );
    }
    const ok = await this.hasher.compare(senha, conta.senhaHash);
    if (!ok) throw Unauthorized('AUTH_INVALID_CREDENTIALS', 'CPF ou senha inválidos');

    // Gera par (access opaco + refresh opaco) atomicamente
    const accessToken = crypto.randomBytes(48).toString('base64url');
    const refreshToken = crypto.randomBytes(48).toString('base64url');
    const accessHash = crypto.createHash('sha256').update(accessToken).digest('hex');
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const now = new Date();
    const accessExpira = new Date(now.getTime() + ACCESS_TTL_MS);
    const refreshExpira = new Date(now.getTime() + REFRESH_TTL_MS);

    await prisma.$transaction(async (tx) => {
      const refreshRow = await tx.pacienteRefreshToken.create({
        data: {
          contaId: conta.id,
          tokenHash: refreshHash,
          expiraEm: refreshExpira,
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        },
      });

      await tx.sessaoPaciente.create({
        data: {
          contaId: conta.id,
          tokenHash: accessHash,
          ip: ip ?? null,
          userAgent: userAgent ?? null,
          expiraEm: accessExpira,
          refreshTokenId: refreshRow.id,
        },
      });
    });

    // Resolve UBS vinculada (LEFT JOIN) + paciente clínico (LEFT JOIN por CPF)
    const contaWithUbs = await prisma.pacienteConta.findUnique({
      where: { id: conta.id },
      select: { ubsVinculadaId: true, ubsVinculada: { select: { nome: true } } },
    });
    const pac = await prisma.paciente.findUnique({
      where: { cpf: cpfDigits },
      select: { dataNascimento: true, cartaoSus: true },
    });

    const paciente: PacienteAuthPayload = {
      id: conta.id,
      nome: conta.nome,
      cpf: cpfDigits,
      cpfFormatado: conta.cpfFormatado || formatarCpf(cpfDigits),
      dataNascimento: pac?.dataNascimento ? pac.dataNascimento.toISOString().slice(0, 10) : null,
      cartaoSus: pac?.cartaoSus ?? null,
      email: conta.email,
      telefone: conta.telefone,
      fotoUrl: null,
      ubsVinculadaId: contaWithUbs?.ubsVinculadaId ?? null,
      ubsVinculadaNome: contaWithUbs?.ubsVinculada?.nome ?? null,
      senhaProvisoria: conta.senhaProvisoria,
    };

    return {
      accessToken,
      token: accessToken, // alias legado
      refreshToken,
      expiresIn: ACCESS_EXPIRES_IN_S,
      expiresAt: accessExpira.toISOString(),
      refreshExpiresIn: Math.floor(REFRESH_TTL_MS / 1000),
      paciente,
    };
  }
}
