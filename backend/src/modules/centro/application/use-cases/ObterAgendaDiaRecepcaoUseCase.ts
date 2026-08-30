import { StatusEncaminhamento, CanalRoteamento, Prisma } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';

export interface ObterAgendaDiaInput {
  data?: string; // YYYY-MM-DD
  especialidade?: string;
  medico?: string;
  statusAtendimento?: string; // AGENDADO, AGUARDANDO_ATENDIMENTO, etc.
  centro?: 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO';
}

export class ObterAgendaDiaRecepcaoUseCase {
  async exec(input: ObterAgendaDiaInput, scope: AccessScope): Promise<Encaminhamento[]> {
    const targetDateStr = input.data || new Date().toISOString().substring(0, 10);
    const startOfDay = new Date(`${targetDateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${targetDateStr}T23:59:59.999Z`);

    const isOdonto = input.centro === 'CENTRO_ODONTOLOGICO';
    const where: Prisma.EncaminhamentoWhereInput = {
      deletadoEm: null,
      status: StatusEncaminhamento.APROVADO,
      agendamentoPrevisto: {
        gte: startOfDay,
        lte: endOfDay,
      },
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

    if (input.especialidade) {
      where.especialidadeSolicitada = {
        contains: input.especialidade,
        mode: 'insensitive',
      };
    }

    if (input.medico) {
      where.profissionalAgendado = {
        contains: input.medico,
        mode: 'insensitive',
      };
    }

    if (input.statusAtendimento) {
      where.statusAtendimentoCentro = input.statusAtendimento as any;
    }

    if (scope.kind === 'PREFEITURA') {
      where.ubs = { prefeituraId: scope.prefeituraId };
    } else if (scope.kind === 'UBS') {
      where.ubsId = scope.ubsId;
    }

    const rows = await prisma.encaminhamento.findMany({
      where,
      include: INCLUDE_ENCAMINHAMENTO_FULL,
      orderBy: [
        { agendamentoPrevisto: 'asc' },
        { prioridade: 'desc' },
      ],
    });

    return rows.map(rowParaEncaminhamento);
  }
}
