import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento } from '../../../../infrastructure/database/encaminhamentoMapper';
import type { AccessScope } from '../../../../shared/scope';
import { whereByScopeViaUbs } from '../../../../infrastructure/database/scopeWhere';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';

export class ListarAgendaEspecialistaUseCase {
  async exec(
    scope: AccessScope,
    doctorNome: string,
    doctorMatricula: string,
    date?: string // YYYY-MM-DD
  ): Promise<Encaminhamento[]> {
    let dateFilter = {};
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(`${date}T23:59:59.999Z`);
      dateFilter = {
        agendamentoPrevisto: {
          gte: start,
          lte: end,
        },
      };
    } else {
      dateFilter = {
        agendamentoPrevisto: { not: null },
      };
    }

    const list = await prisma.encaminhamento.findMany({
      where: {
        ...dateFilter,
        ...whereByScopeViaUbs(scope),
        OR: [
          { profissionalAgendado: { contains: doctorNome, mode: 'insensitive' } },
          { profissionalAgendado: { contains: doctorMatricula } },
        ],
      },
      include: {
        anexos: true,
        timeline: true,
      },
      orderBy: { agendamentoPrevisto: 'asc' },
    });

    return list.map(rowParaEncaminhamento);
  }
}
