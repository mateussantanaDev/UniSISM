import { StatusEncaminhamento, CanalRoteamento, Prisma } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { isEspecialidadeOdonto } from '../../shared/centroClassifier';

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

    const isOdonto = input.centro === 'CENTRO_ODONTOLOGICO' || (input.centro as string) === 'CEO';
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
            { localAgendamento: { contains: 'CEO', mode: 'insensitive' } },
            { localAgendamento: { contains: 'CADEIRA', mode: 'insensitive' } },
            { crm: { contains: 'CRO', mode: 'insensitive' } },
            { especialidadeSolicitada: { contains: 'Odont', mode: 'insensitive' } },
            { especialidadeSolicitada: { contains: 'CEO', mode: 'insensitive' } },
            { especialidadeSolicitada: { contains: 'Dent', mode: 'insensitive' } },
            { especialidadeSolicitada: { contains: 'Siso', mode: 'insensitive' } },
            { especialidadeSolicitada: { contains: 'Exodont', mode: 'insensitive' } },
          ]
        : [
            {
              AND: [
                {
                  OR: [
                    { canalRoteamento: CanalRoteamento.CENTRO_ESPECIALIDADES },
                    { destinoRegulacao: 'CENTRO_ESPECIALIDADES' as any },
                    { AND: [{ canalRoteamento: null }, { destinoRegulacao: null }] },
                  ],
                },
                { canalRoteamento: { not: CanalRoteamento.CENTRO_ODONTOLOGICO } },
                { destinoRegulacao: { not: 'CENTRO_ODONTOLOGICO' as any } },
                { NOT: { especialidadeSolicitada: { contains: 'Siso', mode: 'insensitive' } } },
                { NOT: { especialidadeSolicitada: { contains: 'Exodont', mode: 'insensitive' } } },
                { NOT: { especialidadeSolicitada: { contains: 'Odont', mode: 'insensitive' } } },
                { NOT: { especialidadeSolicitada: { contains: 'Endodont', mode: 'insensitive' } } },
                { NOT: { especialidadeSolicitada: { contains: 'Periodont', mode: 'insensitive' } } },
                { NOT: { especialidadeSolicitada: { contains: 'Bucomaxilo', mode: 'insensitive' } } },
                { NOT: { especialidadeSolicitada: { contains: 'Dent', mode: 'insensitive' } } },
                { NOT: { localAgendamento: { contains: 'CADEIRA', mode: 'insensitive' } } },
                { NOT: { localAgendamento: { contains: 'CEO', mode: 'insensitive' } } },
                { NOT: { crm: { contains: 'CRO', mode: 'insensitive' } } },
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

    const items = rows.map(rowParaEncaminhamento);
    return items.filter((e) => {
      const eOdonto = isEspecialidadeOdonto({
        especialidade: e.solicitacao?.especialidadeSolicitada,
        crm: e.solicitacao?.crm,
        medicoNome: e.solicitacao?.medicoSolicitante,
        profissionalAgendado: e.profissionalAgendado ?? undefined,
        localAgendamento: e.localAgendamento ?? undefined,
        canalRoteamento: (e as any).canalRoteamento,
        destinoRegulacao: (e as any).destinoRegulacao,
        filaDestino: (e as any).filaDestino,
      });
      return isOdonto ? eOdonto : !eOdonto;
    });
  }
}
