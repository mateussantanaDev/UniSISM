import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';

export interface AuditoriaCentroInput {
  limit?: number;
  offset?: number;
  acao?: string;
  centro?: 'CEM' | 'CEO' | 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO' | 'TODOS';
  busca?: string;
}

export interface AuditLogDTO {
  id: string;
  acao: string;
  recurso: string;
  recursoId?: string | null;
  payload?: any;
  atendenteId?: string | null;
  atendenteNome?: string;
  atendenteRole?: string;
  protocolo?: string;
  pacienteNome?: string;
  motivo?: string;
  detalhes?: string;
  ip?: string | null;
  criadoEm: string;
}

export class AuditoriaCentroUseCase {
  async exec(input: AuditoriaCentroInput, scope: AccessScope): Promise<{ total: number; logs: AuditLogDTO[] }> {
    const limit = Math.min(input.limit || 50, 200);
    const offset = input.offset || 0;

    const where: any = {};

    const ehCeo = input.centro === 'CEO' || input.centro === 'CENTRO_ODONTOLOGICO';
    const ehCem = input.centro === 'CEM' || input.centro === 'CENTRO_ESPECIALIDADES';

    if (ehCeo) {
      where.OR = [
        { recurso: 'CENTRO_ODONTOLOGICO' },
        { acao: { contains: 'CEO', mode: 'insensitive' } },
        { acao: { contains: 'ODONTO', mode: 'insensitive' } },
      ];
    } else if (ehCem) {
      where.OR = [
        { recurso: 'CENTRO_ESPECIALIDADES' },
        { recurso: 'Encaminhamento' },
        { acao: { contains: 'CENTRO', mode: 'insensitive' } },
      ];
    } else {
      where.OR = [
        { recurso: 'CENTRO_ESPECIALIDADES' },
        { recurso: 'CENTRO_ODONTOLOGICO' },
        { recurso: 'Encaminhamento' },
      ];
    }

    if (scope.kind === 'PREFEITURA') {
      where.atendente = { prefeituraId: scope.prefeituraId };
    }

    if (input.acao && input.acao !== 'TODAS') {
      where.acao = { contains: input.acao, mode: 'insensitive' };
    }

    if (input.busca && input.busca.trim()) {
      const q = input.busca.trim();
      const buscaConditions = [
        { acao: { contains: q, mode: 'insensitive' } },
        { atendente: { nome: { contains: q, mode: 'insensitive' } } },
        { recursoId: { contains: q, mode: 'insensitive' } },
      ];
      if (where.AND) {
        where.AND.push({ OR: buscaConditions });
      } else {
        where.AND = [{ OR: buscaConditions }];
      }
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
            select: { nome: true, role: true },
          },
        },
      }),
    ]);

    const logs: AuditLogDTO[] = rows.map((r) => {
      const p = (r.payload as any) || {};
      const protocolo = p.protocolo || (r.recursoId ? r.recursoId.substring(0, 10).toUpperCase() : undefined);
      const pacienteNome = p.pacienteNome || undefined;
      const motivo = p.motivo || undefined;
      const operadorNome = r.atendente?.nome || p.operadorNome || 'Operador';
      const operadorRole = r.atendente?.role || p.operadorRole || 'SISTEMA';

      let detalhes = '';
      if (motivo) detalhes = `Motivo: ${motivo}`;
      else if (p.especialidade) detalhes = `Especialidade: ${p.especialidade}${p.medico ? ` · Profissional: ${p.medico}` : ''}`;
      else if (p.camposAlterados) detalhes = `Campos alterados: ${Array.isArray(p.camposAlterados) ? p.camposAlterados.join(', ') : p.camposAlterados}`;
      else detalhes = `Recurso: ${r.recurso}${r.recursoId ? ` (${r.recursoId.substring(0, 8)})` : ''}`;

      return {
        id: r.id,
        acao: r.acao,
        recurso: r.recurso,
        recursoId: r.recursoId,
        payload: r.payload,
        atendenteId: r.atendenteId,
        atendenteNome: operadorNome,
        atendenteRole: operadorRole,
        protocolo,
        pacienteNome,
        motivo,
        detalhes,
        ip: r.ip || null,
        criadoEm: r.criadoEm.toISOString(),
      };
    });

    return { total, logs };
  }
}
