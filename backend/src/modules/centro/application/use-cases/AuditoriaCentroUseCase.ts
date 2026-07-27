import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';

export interface AuditoriaCentroInput {
  limit?: number;
  offset?: number;
  acao?: string;
}

export interface AuditLogDTO {
  id: string;
  acao: string;
  recurso: string;
  recursoId?: string | null;
  payload?: any;
  atendenteId?: string | null;
  atendenteNome?: string;
  criadoEm: string;
}

export class AuditoriaCentroUseCase {
  async exec(input: AuditoriaCentroInput, scope: AccessScope): Promise<{ total: number; logs: AuditLogDTO[] }> {
    const limit = Math.min(input.limit || 50, 200);
    const offset = input.offset || 0;

    const where: any = {
      recurso: 'CENTRO_ESPECIALIDADES',
    };

    if (input.acao) {
      where.acao = { contains: input.acao, mode: 'insensitive' };
    }

    const [total, rows] = await Promise.all([
      prisma.auditoriaLog.count({ where }),
      prisma.auditoriaLog.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { criadoEm: 'desc' },
        include: {
          atendente: {
            select: { nome: true },
          },
        },
      }),
    ]);

    const logs: AuditLogDTO[] = rows.map((r) => ({
      id: r.id,
      acao: r.acao,
      recurso: r.recurso,
      recursoId: r.recursoId,
      payload: r.payload,
      atendenteId: r.atendenteId,
      atendenteNome: r.atendente?.nome,
      criadoEm: r.criadoEm.toISOString(),
    }));

    return { total, logs };
  }
}
