import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';
import { NotFound } from '../../../../shared/errors';

export interface ItemProcedimentoInput {
  codigoSigtap?: string;
  nome: string;
  quantidade?: number;
  valorUnitario?: number;
  observacao?: string;
}

export interface RegistrarProcedimentosInput {
  atendimentoId: string;
  procedimentos: ItemProcedimentoInput[];
}

export class RegistrarProcedimentosAtendimentoUseCase {
  async exec(
    input: RegistrarProcedimentosInput,
    _scope: AccessScope,
    registradoPorId: string,
  ) {
    // Check if Atendimento or AgendamentoCentro exists
    const atendimento = await prisma.atendimento.findUnique({
      where: { id: input.atendimentoId },
    });
    const agendamento = !atendimento
      ? await prisma.agendamentoCentro.findUnique({ where: { id: input.atendimentoId } })
      : null;

    if (!atendimento && !agendamento) {
      throw NotFound('ATENDIMENTO_NAO_ENCONTRADO', 'Atendimento ou agendamento não encontrado');
    }

    const criados = await prisma.$transaction(async (tx) => {
      const records = [];
      for (const p of input.procedimentos) {
        const item = await tx.atendimentoProcedimentoRealizado.create({
          data: {
            atendimentoId: atendimento ? atendimento.id : null,
            agendamentoId: agendamento ? agendamento.id : null,
            codigoSigtap: p.codigoSigtap || null,
            nome: p.nome.trim(),
            quantidade: p.quantidade || 1,
            valorUnitario: p.valorUnitario || 0,
            observacao: p.observacao || null,
            registradoPorId,
          },
        });
        records.push(item);
      }
      return records;
    });

    await prisma.auditoriaLog.create({
      data: {
        acao: 'CENTRO_REGISTRAR_PROCEDIMENTOS',
        recurso: 'CENTRO_ESPECIALIDADES',
        recursoId: input.atendimentoId,
        atendenteId: registradoPorId,
        payload: {
          totalProcedimentos: criados.length,
          procedimentos: criados.map((c) => ({ id: c.id, codigoSigtap: c.codigoSigtap, nome: c.nome })),
        },
      },
    });

    return {
      sucesso: true,
      atendimentoId: input.atendimentoId,
      totalRegistrados: criados.length,
      procedimentos: criados,
    };
  }
}
