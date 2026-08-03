import { StatusEncaminhamento, CanalRoteamento, Prisma } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento } from '../../../../infrastructure/database/encaminhamentoMapper';
import { whereByScopeViaUbs } from '../../../../infrastructure/database/scopeWhere';
import type { AccessScope } from '../../../../shared/scope';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';

export class ListarFilaEsperaCentroUseCase {
  async exec(
    centro: 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO',
    scope: AccessScope,
  ): Promise<Encaminhamento[]> {
    const isOdonto = centro === 'CENTRO_ODONTOLOGICO';

    const where: Prisma.EncaminhamentoWhereInput = {
      status: StatusEncaminhamento.APROVADO,
      agendamentoPrevisto: null,
      ...whereByScopeViaUbs(scope),
      OR: isOdonto
        ? [
            { canalRoteamento: CanalRoteamento.CENTRO_ODONTOLOGICO },
            { destinoRegulacao: 'CENTRO_ODONTOLOGICO' as any },
            { especialidadeSolicitada: { contains: 'Odont', mode: 'insensitive' } },
            { especialidadeSolicitada: { contains: 'CEO', mode: 'insensitive' } },
            { especialidadeSolicitada: { contains: 'Dent', mode: 'insensitive' } },
          ]
        : [
            { canalRoteamento: CanalRoteamento.CENTRO_ESPECIALIDADES },
            { destinoRegulacao: 'CENTRO_ESPECIALIDADES' as any },
            {
              AND: [
                { canalRoteamento: { not: CanalRoteamento.CENTRO_ODONTOLOGICO } },
                { destinoRegulacao: { not: 'CENTRO_ODONTOLOGICO' as any } },
              ],
            },
          ],
    };

    const list = await prisma.encaminhamento.findMany({
      where,
      include: {
        anexos: true,
        timeline: true,
      },
      orderBy: { criadoEm: 'asc' },
    });
    return list.map(rowParaEncaminhamento);
  }
}
