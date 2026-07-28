import { prisma } from '../../infrastructure/database/prisma';
import { whereByScopeAtendente } from '../../infrastructure/database/scopeWhere';
import type { AccessScope } from '../../shared/scope';

export interface ListUsuariosFiltro {
  scope: AccessScope;
  q?: string;
  role?: string;
  ubsId?: string;
  prefeituraId?: string;
  ativo?: boolean;
}

export class ListUsuariosUseCase {
  async exec(filtro: ListUsuariosFiltro) {
    const where = {
      ...whereByScopeAtendente(filtro.scope),
      ...(filtro.role ? { role: filtro.role as never } : {}),
      ...(filtro.ubsId ? { ubsId: filtro.ubsId } : {}),
      ...(filtro.prefeituraId
        ? {
            OR: [
              { prefeituraId: filtro.prefeituraId },
              { ubs: { prefeituraId: filtro.prefeituraId } },
            ],
          }
        : {}),
      ...(typeof filtro.ativo === 'boolean' ? { ativo: filtro.ativo } : {}),
      ...(filtro.q
        ? {
            OR: [
              { nome: { contains: filtro.q, mode: 'insensitive' as const } },
              { matricula: { contains: filtro.q.toUpperCase() } },
              { email: { contains: filtro.q.toLowerCase() } },
            ],
          }
        : {}),
    };

    const rows = await prisma.atendente.findMany({
      where,
      select: {
        id: true,
        nome: true,
        matricula: true,
        email: true,
        cpf: true,
        role: true,
        tipoUnidade: true,
        unidadeId: true,
        ativo: true,
        criadoEm: true,
        ubs: { select: { id: true, nome: true, prefeitura: { select: { id: true, nome: true } } } },
        prefeitura: { select: { id: true, nome: true } },
      },
      orderBy: { nome: 'asc' },
      take: 200,
    });

    return rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      email: r.email,
      cpf: r.cpf,
      matricula: r.matricula,
      role: r.role,
      tipoUnidade: r.tipoUnidade ?? (r.ubs ? 'UBS' : null),
      unidadeId: r.unidadeId ?? r.ubs?.id ?? null,
      unidade: r.ubs?.nome ?? null,
      ativo: r.ativo,
      criadoEm: r.criadoEm,
      ubs: r.ubs,
      prefeitura: r.prefeitura,
    }));
  }
}
