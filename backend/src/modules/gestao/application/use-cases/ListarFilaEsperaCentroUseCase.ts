import { StatusEncaminhamento } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento } from '../../../../infrastructure/database/encaminhamentoMapper';
import { whereByScopeViaUbs } from '../../../../infrastructure/database/scopeWhere';
import type { AccessScope } from '../../../../shared/scope';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';

export class ListarFilaEsperaCentroUseCase {
  async exec(
    centro: 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO',
    scope: AccessScope
  ): Promise<Encaminhamento[]> {
    const isCeo = centro === 'CENTRO_ODONTOLOGICO';
    const list = await prisma.encaminhamento.findMany({
      where: {
        OR: isCeo
          ? [
              { destinoRegulacao: 'CENTRO_ODONTOLOGICO' as any },
              { canalRoteamento: 'CENTRO_ODONTOLOGICO' as any },
              { localAgendamento: { contains: 'CEO', mode: 'insensitive' } },
              { especialidadeSolicitada: { contains: 'Odonto', mode: 'insensitive' } },
              { especialidadeSolicitada: { contains: 'Bucomaxilo', mode: 'insensitive' } },
              { especialidadeSolicitada: { contains: 'Endodont', mode: 'insensitive' } },
              { especialidadeSolicitada: { contains: 'Periodont', mode: 'insensitive' } },
            ]
          : [
              { destinoRegulacao: 'CENTRO_ESPECIALIDADES' as any },
              { canalRoteamento: 'CENTRO_ESPECIALIDADES' as any },
              {
                AND: [
                  { canalRoteamento: null, destinoRegulacao: null },
                  { NOT: { especialidadeSolicitada: { contains: 'Odonto', mode: 'insensitive' } } },
                  { NOT: { especialidadeSolicitada: { contains: 'Bucomaxilo', mode: 'insensitive' } } },
                  { NOT: { localAgendamento: { contains: 'CEO', mode: 'insensitive' } } },
                ],
              },
            ],
        status: StatusEncaminhamento.APROVADO,
        agendamentoPrevisto: null,
        ...whereByScopeViaUbs(scope),
      },
      include: {
        anexos: true,
        timeline: true,
      },
      orderBy: { criadoEm: 'asc' },
    });
    return list.map(rowParaEncaminhamento);
  }
}
