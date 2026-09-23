import { StatusEncaminhamento, TipoEventoTimeline, Prisma } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';

export interface RemanejamentoLoteInput {
  medicoOrigem: string;
  dataOrigem: string; // YYYY-MM-DD
  medicoDestino: string;
  dataDestino: string; // YYYY-MM-DD
  notificarSms?: boolean;
  atendenteId: string;
  atendenteNome: string;
}

export class RemanejamentoLoteUseCase {
  async exec(input: RemanejamentoLoteInput, scope: AccessScope): Promise<{ totalRemanejados: number; dataDestino: string; medicoDestino: string }> {
    const startOrigem = new Date(`${input.dataOrigem}T00:00:00.000Z`);
    const endOrigem = new Date(`${input.dataOrigem}T23:59:59.999Z`);

    const where: Prisma.EncaminhamentoWhereInput = {
      status: StatusEncaminhamento.APROVADO,
      profissionalAgendado: { contains: input.medicoOrigem, mode: 'insensitive' },
      agendamentoPrevisto: { gte: startOrigem, lte: endOrigem },
    };

    if (scope.kind === 'PREFEITURA') {
      where.ubs = { prefeituraId: scope.prefeituraId };
    }

    const encaminhamentos = await prisma.encaminhamento.findMany({
      where,
      select: { id: true, protocolo: true, agendamentoPrevisto: true, pacienteNome: true },
    });

    if (encaminhamentos.length === 0) {
      return { totalRemanejados: 0, dataDestino: input.dataDestino, medicoDestino: input.medicoDestino };
    }

    const baseDestino = new Date(`${input.dataDestino}T08:00:00.000Z`);

    let total = 0;
    for (let i = 0; i < encaminhamentos.length; i++) {
      const enc = encaminhamentos[i]!;
      // Offset by 20 mins slot
      const newSlot = new Date(baseDestino.getTime() + i * 20 * 60 * 1000);

      await prisma.$transaction([
        prisma.encaminhamento.update({
          where: { id: enc.id },
          data: {
            profissionalAgendado: input.medicoDestino,
            agendamentoPrevisto: newSlot,
            observacoesRegulacao: `Remanejamento em lote de ${input.medicoOrigem} (${input.dataOrigem}) para ${input.medicoDestino} (${input.dataDestino}).`,
          },
        }),
        prisma.eventoTimeline.create({
          data: {
            encaminhamentoId: enc.id,
            tipo: TipoEventoTimeline.AGENDADO,
            titulo: 'Remanejamento Emergencial de Agenda',
            descricao: `Consulta transferida do(a) ${input.medicoOrigem} para ${input.medicoDestino} em ${input.dataDestino}.`,
            autor: input.atendenteNome,
            autorPapel: 'Diretoria / Gestão do Centro',
          },
        }),
      ]);
      total++;
    }

    await prisma.auditoriaLog.create({
      data: {
        acao: 'CENTRO_GESTAO_REMANEJAMENTO_LOTE',
        recurso: 'CENTRO_ESPECIALIDADES',
        atendenteId: input.atendenteId,
        payload: {
          medicoOrigem: input.medicoOrigem,
          dataOrigem: input.dataOrigem,
          medicoDestino: input.medicoDestino,
          dataDestino: input.dataDestino,
          totalRemanejados: total,
        },
      },
    });

    return {
      totalRemanejados: total,
      dataDestino: input.dataDestino,
      medicoDestino: input.medicoDestino,
    };
  }
}
