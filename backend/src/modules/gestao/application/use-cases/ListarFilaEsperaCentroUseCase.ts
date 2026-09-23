import { StatusEncaminhamento, CanalRoteamento, DestinoRegulacao, Prisma } from '../../../../../generated/prisma';
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
      status: {
        in: [StatusEncaminhamento.APROVADO, StatusEncaminhamento.AGUARDANDO_REGULACAO],
      },
      agendamentoPrevisto: null,
      ...whereByScopeViaUbs(scope),
      OR: isOdonto
        ? [
            { canalRoteamento: CanalRoteamento.CENTRO_ODONTOLOGICO },
            { destinoRegulacao: DestinoRegulacao.CENTRO_ODONTOLOGICO },
            { especialidadeSolicitada: { contains: 'Odont', mode: 'insensitive' } },
            { especialidadeSolicitada: { contains: 'CEO', mode: 'insensitive' } },
            { especialidadeSolicitada: { contains: 'Dent', mode: 'insensitive' } },
            { localAgendamento: { contains: 'CEO', mode: 'insensitive' } },
          ]
        : [
            { canalRoteamento: CanalRoteamento.CENTRO_ESPECIALIDADES },
            { destinoRegulacao: DestinoRegulacao.CENTRO_ESPECIALIDADES },
            { localAgendamento: { contains: 'CEM', mode: 'insensitive' } },
            {
              AND: [
                { canalRoteamento: { not: CanalRoteamento.CENTRO_ODONTOLOGICO } },
                {
                  OR: [
                    { destinoRegulacao: { not: DestinoRegulacao.CENTRO_ODONTOLOGICO } },
                    { destinoRegulacao: null },
                  ],
                },
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
