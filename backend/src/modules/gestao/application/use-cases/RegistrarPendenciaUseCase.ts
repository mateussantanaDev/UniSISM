/**
 * Registrar pendência (Face 2 · SMS).
 *
 * Pré-condição (gate):
 *   status === 'AGUARDANDO_REGULACAO'   → senão 409 ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO
 *
 * Validação:
 *   observacao.trim().length > 0        → senão 422 OBSERVACAO_OBRIGATORIA
 *
 * Transição (transação atômica):
 *   1. Atualiza observacoesRegulacao = observacao (já trimada)
 *   2. Cria evento PENDENCIA_REGISTRADA (descricao = observacao)
 *   3. Status → PENDENCIA_DOCUMENTO + atualizadoEm
 *   4. (futuro) enfileira notificação à UBS
 */
import { StatusEncaminhamento } from '../../../../../generated/prisma';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import { prisma } from '../../../../infrastructure/database/prisma';
import {
  INCLUDE_ENCAMINHAMENTO_FULL,
  rowParaEncaminhamento,
} from '../../../../infrastructure/database/encaminhamentoMapper';
import { whereByScopeViaUbs } from '../../../../infrastructure/database/scopeWhere';
import { Conflict, NotFound, Unprocessable } from '../../../../shared/errors';
import type { AccessScope } from '../../../../shared/scope';
import { logger } from '../../../../infrastructure/logger';
import { publicarNaTransacao } from '../../../../infrastructure/outbox/OutboxBus';
import { encaminhamentoTransicao } from '../../../../infrastructure/metrics/prometheus';
import {
  MENSAGENS,
  NotificacaoPacienteService,
} from '../../../../infrastructure/services/NotificacaoPacienteService';
import type { AutorRegulacao } from './AprovarEncaminhamentoUseCase';
import { invalidarCacheArvorePorUbs } from '../../../../infrastructure/cache/arvoreCacheInvalidator';


export interface RegistrarPendenciaInput {
  observacao: string;
}

export class RegistrarPendenciaUseCase {
  private readonly notificacoes = new NotificacaoPacienteService();

  async exec(
    id: string,
    scope: AccessScope,
    autor: AutorRegulacao,
    input: RegistrarPendenciaInput,
  ): Promise<Encaminhamento> {
    const observacao = (input.observacao ?? '').trim();
    if (observacao.length === 0) {
      throw Unprocessable('OBSERVACAO_OBRIGATORIA', 'A observação é obrigatória');
    }

    const atual = await prisma.encaminhamento.findFirst({
      where: { id, ...whereByScopeViaUbs(scope) },
    });
    if (!atual) throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    if (atual.status !== StatusEncaminhamento.AGUARDANDO_REGULACAO) {
      throw Conflict(
        'ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO',
        'Encaminhamento não está aguardando regulação.',
        { statusAtual: atual.status },
      );
    }

    const atualizado = await prisma.$transaction(async (tx) => {
      await tx.eventoTimeline.create({
        data: {
          encaminhamentoId: id,
          tipo: 'PENDENCIA_REGISTRADA',
          titulo: 'Pendência registrada pela Regulação',
          descricao: observacao,
          autor: autor.nome,
          autorPapel: autor.papel,
        },
      });

      const upd = await tx.encaminhamento.update({
        where: { id },
        data: {
          status: StatusEncaminhamento.PENDENCIA_DOCUMENTO,
          observacoesRegulacao: observacao,
        },
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });

      await publicarNaTransacao(tx, {
        eventType: 'encaminhamento.pendencia_registrada',
        aggregateType: 'Encaminhamento',
        aggregateId: id,
        payload: {
          protocolo: upd.protocolo,
          ubsId: upd.ubsId,
          observacao,
          registradoPor: autor.nome,
        },
      });

      return upd;
    });

    encaminhamentoTransicao.inc({ de: 'AGUARDANDO_REGULACAO', para: 'PENDENCIA_DOCUMENTO' });

    logger.info(
      { encId: id, protocolo: atualizado.protocolo, ubsId: atualizado.ubsId },
      'pendência registrada',
    );

    void this.notificacoes
      .notificar({
        cpfPaciente: atualizado.pacienteCpf,
        pacienteNome: atualizado.pacienteNome,
        encaminhamentoId: id,
        tipo: 'PENDENCIA_REGISTRADA',
        ...MENSAGENS.pendenciaRegistrada(atualizado.protocolo, observacao),
        payload: { protocolo: atualizado.protocolo, observacao },
      })
      .catch((err) => logger.warn({ err }, 'notificar PENDENCIA falhou'));

    // Invalida cache da árvore para esta UBS e globalmente
    void invalidarCacheArvorePorUbs(atualizado.ubsId);

    return rowParaEncaminhamento(atualizado);
  }
}
