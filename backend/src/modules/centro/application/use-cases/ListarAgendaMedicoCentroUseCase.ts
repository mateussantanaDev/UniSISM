import { hojeRecife, intervaloDiaRecife } from '../../shared/dataCentro';
import { StatusEncaminhamento, CanalRoteamento, Prisma } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';

export interface ListarAgendaMedicoInput {
  doctorId: string;
  doctorNome?: string;
  doctorMatricula?: string;
  data?: string; // YYYY-MM-DD (default: hoje)
  especialidade?: string;
  statusAtendimento?: string;
  centro?: 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO';
}

export class ListarAgendaMedicoCentroUseCase {
  async exec(input: ListarAgendaMedicoInput, scope: AccessScope): Promise<Encaminhamento[]> {
    const targetDateStr = input.data || hojeRecife();

    const centro = input.centro ?? 'CENTRO_ESPECIALIDADES';
    const conditions: Prisma.EncaminhamentoWhereInput[] = [
      { OR: [{ canalRoteamento: centro }, { destinoRegulacao: centro }] },
      { profissionalAgendadoId: input.doctorId },
    ];

    const where: Prisma.EncaminhamentoWhereInput = {
      deletadoEm: null,
      status: StatusEncaminhamento.APROVADO,
      agendamentoPrevisto: intervaloDiaRecife(targetDateStr),
      AND: conditions,
    };

    if (input.especialidade) {
      where.especialidadeSolicitada = {
        contains: input.especialidade,
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
