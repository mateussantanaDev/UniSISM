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
    const list = await prisma.encaminhamento.findMany({
      where: {
        destinoRegulacao: centro,
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
