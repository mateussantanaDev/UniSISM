import type { Prisma } from '../../../generated/prisma';
import { prisma } from './prisma';
import type {
  AtendenteComEscopo,
  IAtendenteRepository,
} from '../../domain/repositories/IAtendenteRepository';
import type { RoleAtendente } from '../../domain/entities/Atendente';

const INCLUDE_ESCOPO = {
  ubs: { include: { prefeitura: true } },
  prefeitura: true,
} as const;

export class PrismaAtendenteRepository implements IAtendenteRepository {
  async buscarPorLogin(login: string): Promise<AtendenteComEscopo | null> {
    const where: Prisma.AtendenteWhereInput = login.includes('@')
      ? { email: login.toLowerCase() }
      : { matricula: login.toUpperCase() };
    return prisma.atendente.findFirst({ where, include: INCLUDE_ESCOPO });
  }

  async buscarPorId(id: string): Promise<AtendenteComEscopo | null> {
    return prisma.atendente.findUnique({ where: { id }, include: INCLUDE_ESCOPO });
  }

  async buscarPorEmail(email: string): Promise<AtendenteComEscopo | null> {
    return prisma.atendente.findUnique({
      where: { email: email.toLowerCase() },
      include: INCLUDE_ESCOPO,
    });
  }

  async atualizarSenha(id: string, senhaHash: string): Promise<void> {
    await prisma.atendente.update({
      where: { id },
      data: { senhaHash, senhaAlteradaEm: new Date(), trocaSenhaObrigatoria: false },
    });
  }

  async registrarTentativaLogin(params: {
    login: string;
    atendenteId?: string;
    sucesso: boolean;
    ip?: string;
    userAgent?: string;
  }): Promise<void> {
    await prisma.tentativaLogin.create({
      data: {
        login: params.login,
        sucesso: params.sucesso,
        atendenteId: params.atendenteId ?? null,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  }

  async contarTentativasFalhas(login: string, janelaMinutos: number): Promise<number> {
    const desde = new Date(Date.now() - janelaMinutos * 60_000);
    return prisma.tentativaLogin.count({
      where: {
        login,
        sucesso: false,
        criadoEm: { gte: desde },
      },
    });
  }

  async bloquearAte(id: string, ate: Date): Promise<void> {
    await prisma.atendente.update({ where: { id }, data: { bloqueadoAte: ate } });
  }

  async registrarAtividade(atendenteId: string, acao: string, alvo?: string): Promise<void> {
    await prisma.atividadeAtendente.create({
      data: { atendenteId, acao, alvo: alvo ?? null },
    });
  }

  async atualizarRole(id: string, role: RoleAtendente): Promise<void> {
    await prisma.atendente.update({ where: { id }, data: { role } });
  }
}
