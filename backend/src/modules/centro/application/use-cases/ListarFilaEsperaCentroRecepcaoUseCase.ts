import { StatusEncaminhamento, CanalRoteamento, DestinoRegulacao, Prisma } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { isEspecialidadeOdonto } from '../../shared/centroClassifier';

export interface ListarFilaCentroInput {
  centro?: 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO';
  status?: 'APROVADO' | 'AGUARDANDO_REGULACAO' | 'TODOS';
  agendado?: boolean;
  especialidade?: string;
  prioridade?: string;
  busca?: string;
}

export class ListarFilaEsperaCentroRecepcaoUseCase {
  async exec(input: ListarFilaCentroInput, scope: AccessScope): Promise<Encaminhamento[]> {
    const centroTarget = input.centro ?? 'CENTRO_ESPECIALIDADES';
    const isOdonto = centroTarget === 'CENTRO_ODONTOLOGICO' || (centroTarget as string) === 'CEO';

    const conditions: Prisma.EncaminhamentoWhereInput[] = [];

    if (isOdonto) {
      conditions.push({
        OR: [
          { canalRoteamento: CanalRoteamento.CENTRO_ODONTOLOGICO },
          { destinoRegulacao: DestinoRegulacao.CENTRO_ODONTOLOGICO },
          { localAgendamento: { contains: 'CEO', mode: 'insensitive' } },
          { localAgendamento: { contains: 'CADEIRA', mode: 'insensitive' } },
          { crm: { contains: 'CRO', mode: 'insensitive' } },
          { especialidadeSolicitada: { contains: 'Odonto', mode: 'insensitive' } },
          { especialidadeSolicitada: { contains: 'Bucomaxilo', mode: 'insensitive' } },
          { especialidadeSolicitada: { contains: 'Endodont', mode: 'insensitive' } },
          { especialidadeSolicitada: { contains: 'Periodont', mode: 'insensitive' } },
          { especialidadeSolicitada: { contains: 'Prótese', mode: 'insensitive' } },
          { especialidadeSolicitada: { contains: 'Protese', mode: 'insensitive' } },
          { especialidadeSolicitada: { contains: 'Estomatol', mode: 'insensitive' } },
          { especialidadeSolicitada: { contains: 'Siso', mode: 'insensitive' } },
          { especialidadeSolicitada: { contains: 'Exodont', mode: 'insensitive' } },
          { especialidadeSolicitada: { contains: 'Dent', mode: 'insensitive' } },
        ],
      });
    } else {
      conditions.push({
        AND: [
          {
            OR: [
              { canalRoteamento: CanalRoteamento.CENTRO_ESPECIALIDADES },
              { destinoRegulacao: DestinoRegulacao.CENTRO_ESPECIALIDADES },
              { AND: [{ canalRoteamento: null }, { destinoRegulacao: null }] },
            ],
          },
          { canalRoteamento: { not: CanalRoteamento.CENTRO_ODONTOLOGICO } },
          { destinoRegulacao: { not: DestinoRegulacao.CENTRO_ODONTOLOGICO } },
          { NOT: { especialidadeSolicitada: { contains: 'Odonto', mode: 'insensitive' } } },
          { NOT: { especialidadeSolicitada: { contains: 'Bucomaxilo', mode: 'insensitive' } } },
          { NOT: { especialidadeSolicitada: { contains: 'Endodont', mode: 'insensitive' } } },
          { NOT: { especialidadeSolicitada: { contains: 'Periodont', mode: 'insensitive' } } },
          { NOT: { especialidadeSolicitada: { contains: 'Prótese', mode: 'insensitive' } } },
          { NOT: { especialidadeSolicitada: { contains: 'Protese', mode: 'insensitive' } } },
          { NOT: { especialidadeSolicitada: { contains: 'Estomatol', mode: 'insensitive' } } },
          { NOT: { especialidadeSolicitada: { contains: 'Siso', mode: 'insensitive' } } },
          { NOT: { especialidadeSolicitada: { contains: 'Exodont', mode: 'insensitive' } } },
          { NOT: { especialidadeSolicitada: { contains: 'Dent', mode: 'insensitive' } } },
          { NOT: { localAgendamento: { contains: 'CEO', mode: 'insensitive' } } },
          { NOT: { localAgendamento: { contains: 'CADEIRA', mode: 'insensitive' } } },
          { NOT: { crm: { contains: 'CRO', mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.EncaminhamentoWhereInput = {
      deletadoEm: null,
      AND: conditions,
    };

    if (input.status === 'APROVADO') {
      where.status = StatusEncaminhamento.APROVADO;
    } else if (input.status === 'AGUARDANDO_REGULACAO') {
      where.status = StatusEncaminhamento.AGUARDANDO_REGULACAO;
    } else if (!input.status || input.status === 'TODOS') {
      where.status = {
        in: [StatusEncaminhamento.APROVADO, StatusEncaminhamento.AGUARDANDO_REGULACAO],
      };
    }

    if (input.agendado !== undefined) {
      if (input.agendado) {
        where.agendamentoPrevisto = { not: null };
      } else {
        where.agendamentoPrevisto = null;
      }
    }

    if (input.especialidade) {
      where.especialidadeSolicitada = {
        contains: input.especialidade,
        mode: 'insensitive',
      };
    }

    if (input.prioridade) {
      where.prioridade = input.prioridade as any;
    }

    if (input.busca && input.busca.trim().length > 0) {
      const b = input.busca.trim();
      conditions.push({
        OR: [
          { pacienteNome: { contains: b, mode: 'insensitive' } },
          { pacienteCpf: { contains: b } },
          { protocolo: { contains: b, mode: 'insensitive' } },
        ],
      });
    }

    // Apply AccessScope
    if (scope.kind === 'PREFEITURA') {
      where.ubs = { prefeituraId: scope.prefeituraId };
    } else if (scope.kind === 'UBS') {
      where.ubsId = scope.ubsId;
    }

    const rows = await prisma.encaminhamento.findMany({
      where,
      include: INCLUDE_ENCAMINHAMENTO_FULL,
      orderBy: [
        { prioridade: 'desc' },
        { dataSolicitacao: 'asc' },
        { criadoEm: 'asc' },
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
