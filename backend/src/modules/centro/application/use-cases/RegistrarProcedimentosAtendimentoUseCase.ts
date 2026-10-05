import { createHash } from 'node:crypto';
import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';
import { NotFound, BadRequest, Conflict } from '../../../../shared/errors';
import type { Prisma } from '../../../../../generated/prisma';

export interface ItemProcedimentoInput { codigoSigtap?: string; nome: string; quantidade?: number; valorUnitario?: number; observacao?: string; }
export interface RegistrarProcedimentosInput { atendimentoId: string; procedimentos: ItemProcedimentoInput[]; idempotencyKey?: string; }

export class RegistrarProcedimentosAtendimentoUseCase {
  private async resolver(id: string, scope: AccessScope, tx: Prisma.TransactionClient = prisma, actorId?: string) {
    const actor = actorId ? await tx.atendente.findUnique({ where: { id: actorId }, select: { role: true } }) : null;
    const medicoId = actor && ['MEDICO', 'MEDICO_ESPECIALISTA'].includes(actor.role) ? actorId : undefined;
    const filtroUbs = scope.kind === 'GLOBAL' ? {} : scope.kind === 'UBS' ? { ubsId: scope.ubsId } : { ubs: { prefeituraId: scope.prefeituraId } };
    const enc = await tx.encaminhamento.findFirst({ where: { OR: [{ id }, { atendimentoId: id }], deletadoEm: null, ...filtroUbs, ...(medicoId ? { profissionalAgendadoId: medicoId } : {}) } });
    if (enc) {
      if (!enc.atendimentoId || enc.statusAtendimentoCentro !== 'CONCLUIDO') throw BadRequest('ATENDIMENTO_NAO_CONCLUIDO', 'Conclua o atendimento antes de registrar procedimentos.');
      return { atendimentoId: enc.atendimentoId, agendamentoId: null as string | null };
    }
    const antigo = await tx.agendamentoCentro.findFirst({ where: { id, ...(medicoId ? { medicoId } : {}), ...(scope.kind === 'GLOBAL' ? {} : scope.kind === 'UBS' ? { paciente: { ubsId: scope.ubsId } } : { prefeituraId: scope.prefeituraId }) } });
    if (!antigo) throw NotFound('ATENDIMENTO_NAO_ENCONTRADO', 'Atendimento não encontrado');
    if (antigo.status !== 'CONCLUIDO') throw BadRequest('ATENDIMENTO_NAO_CONCLUIDO', 'Conclua o atendimento antes de registrar procedimentos.');
    return { atendimentoId: null as string | null, agendamentoId: antigo.id };
  }
  async listar(id: string, scope: AccessScope, actorId?: string) {
    const ref = await this.resolver(id, scope, prisma, actorId);
    return prisma.atendimentoProcedimentoRealizado.findMany({ where: ref, orderBy: { registradoEm: 'asc' } });
  }
  async remover(id: string, procedimentoId: string, scope: AccessScope, registradoPorId: string) {
    return prisma.$transaction(async tx => {
      const ref = await this.resolver(id, scope, tx, registradoPorId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`centro-procedimentos:${ref.atendimentoId || ref.agendamentoId}`}))`;
      const item = await tx.atendimentoProcedimentoRealizado.findFirst({ where: { id: procedimentoId, ...ref } });
      if (!item) throw NotFound('PROCEDIMENTO_NAO_ENCONTRADO', 'Procedimento não encontrado neste atendimento');
      await tx.atendimentoProcedimentoRealizado.delete({ where: { id: procedimentoId } });
      await tx.auditoriaLog.create({ data: { acao: 'CENTRO_REMOVER_PROCEDIMENTO', recurso: 'CENTRO_ESPECIALIDADES', recursoId: ref.atendimentoId || ref.agendamentoId, atendenteId: registradoPorId, payload: { procedimentoId, nome: item.nome, codigoSigtap: item.codigoSigtap } } });
      return { sucesso: true };
    });
  }
  async exec(input: RegistrarProcedimentosInput, scope: AccessScope, registradoPorId: string) {
    if (!input.procedimentos.length || input.procedimentos.some(p => p.nome.trim().length < 2 || !Number.isInteger(p.quantidade ?? 1) || (p.quantidade ?? 1) < 1 || !Number.isFinite(p.valorUnitario ?? 0) || (p.valorUnitario ?? 0) < 0 || (p.codigoSigtap && !/^(?:\d{10}|\d{2}\.\d{2}\.\d{2}\.\d{3}-\d)$/.test(p.codigoSigtap)))) throw BadRequest('PROCEDIMENTO_INVALIDO', 'Informe nome, quantidade positiva, valor não negativo e código SIGTAP válido.');
    const fingerprint = createHash('sha256').update(JSON.stringify(input.procedimentos)).digest('hex');
    return prisma.$transaction(async tx => {
      const ref = await this.resolver(input.atendimentoId, scope, tx, registradoPorId);
      const recursoId = ref.atendimentoId || ref.agendamentoId!;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`centro-procedimentos:${recursoId}`}))`;
      if (input.idempotencyKey) {
        const prior = await tx.auditoriaLog.findFirst({ where: { recursoId, acao: 'CENTRO_REGISTRAR_PROCEDIMENTOS', payload: { path: ['idempotencyKey'], equals: input.idempotencyKey } } });
        if (prior) {
          const payload = prior.payload as { fingerprint: string; ids: string[] };
          if (payload.fingerprint !== fingerprint) throw Conflict('CHAVE_IDEMPOTENCIA_REUTILIZADA', 'Esta solicitação já foi registrada com outros procedimentos.');
          const procedimentos = await tx.atendimentoProcedimentoRealizado.findMany({ where: { ...ref, id: { in: payload.ids } } });
          return { sucesso: true, atendimentoId: recursoId, totalRegistrados: procedimentos.length, procedimentos, repetido: true };
        }
      }
      const procedimentos = [];
      for (const p of input.procedimentos) procedimentos.push(await tx.atendimentoProcedimentoRealizado.create({ data: { ...ref, nome: p.nome.trim(), codigoSigtap: p.codigoSigtap?.replace(/\D/g, '') || null, quantidade: p.quantidade ?? 1, valorUnitario: p.valorUnitario ?? 0, observacao: p.observacao || null, registradoPorId } }));
      await tx.auditoriaLog.create({ data: { acao: 'CENTRO_REGISTRAR_PROCEDIMENTOS', recurso: 'CENTRO_ESPECIALIDADES', recursoId, atendenteId: registradoPorId, payload: { idempotencyKey: input.idempotencyKey ?? null, fingerprint, ids: procedimentos.map(p => p.id), totalProcedimentos: procedimentos.length } } });
      return { sucesso: true, atendimentoId: recursoId, totalRegistrados: procedimentos.length, procedimentos, repetido: false };
    });
  }
}
