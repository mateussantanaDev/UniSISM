import { StatusEncaminhamento, CanalRoteamento, Prisma } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';

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
    const canal = centroTarget === 'CENTRO_ODONTOLOGICO' ? CanalRoteamento.CENTRO_ODONTOLOGICO : CanalRoteamento.CENTRO_ESPECIALIDADES;

    const where: Prisma.EncaminhamentoWhereInput = {
      canalRoteamento: canal,
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
      where.OR = [
        { pacienteNome: { contains: b, mode: 'insensitive' } },
        { pacienteCpf: { contains: b } },
        { protocolo: { contains: b, mode: 'insensitive' } },
      ];
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

    return rows.map(rowParaEncaminhamento);
  }
}
