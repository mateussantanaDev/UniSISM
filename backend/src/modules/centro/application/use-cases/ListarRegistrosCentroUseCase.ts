import { prisma } from '../../../../infrastructure/database/prisma';
import { INCLUDE_ENCAMINHAMENTO_FULL, rowParaEncaminhamento } from '../../../../infrastructure/database/encaminhamentoMapper';
import { whereByScopeViaUbs } from '../../../../infrastructure/database/scopeWhere';
import type { AccessScope } from '../../../../shared/scope';
import type { Prisma, StatusAtendimentoCentro, StatusEncaminhamento } from '../../../../../generated/prisma';

export interface RegistrosCentroInput {
  centro: 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO';
  profissionalId?: string;
  data?: string;
  status?: StatusEncaminhamento;
  statusAtendimento?: StatusAtendimentoCentro;
}

export class ListarRegistrosCentroUseCase {
  async exec(input: RegistrosCentroInput, scope: AccessScope) {
    const where: Prisma.EncaminhamentoWhereInput = {
      AND: [whereByScopeViaUbs(scope), { OR: [{ canalRoteamento: input.centro }, { destinoRegulacao: input.centro }] }],
      ...(input.profissionalId ? { profissionalAgendadoId: input.profissionalId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.statusAtendimento ? { statusAtendimentoCentro: input.statusAtendimento } : {}),
      ...(input.data ? { agendamentoPrevisto: { gte: new Date(`${input.data}T00:00:00.000Z`), lte: new Date(`${input.data}T23:59:59.999Z`) } } : {}),
    };
    const rows = await prisma.encaminhamento.findMany({ where, include: INCLUDE_ENCAMINHAMENTO_FULL, orderBy: [{ agendamentoPrevisto: 'desc' }, { criadoEm: 'desc' }] });
    return rows.map(rowParaEncaminhamento);
  }
}
