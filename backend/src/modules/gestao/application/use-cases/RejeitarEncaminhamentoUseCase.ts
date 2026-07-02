/**
 * Rejeitar encaminhamento (Face 2 · SMS).
 *
 * Pré-condição (gate):
 *   status === 'AGUARDANDO_REGULACAO'   → senão 409 ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO
 *
 * Validação:
 *   motivo.trim().length > 0            → senão 422 MOTIVO_OBRIGATORIO
 *
 * Transição (transação atômica):
 *   1. Cria evento REJEITADO (descricao = motivo)
 *   2. Status → REJEITADO + atualizadoEm
 *   3. Limpa observacoesRegulacao (estado terminal — pendência anterior, se houver, perde sentido)
 *   4. (futuro) enfileira notificação à UBS
 *
 * REJEITADO é TERMINAL — UBS não pode reenviar o mesmo protocolo.
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


export interface RejeitarInput {
  motivo: string;
}

export class RejeitarEncaminhamentoUseCase {
  private readonly notificacoes = new NotificacaoPacienteService();

  async exec(
    id: string,
    scope: AccessScope,
    autor: AutorRegulacao,
    input: RejeitarInput,
  ): Promise<Encaminhamento> {
    const motivo = (input.motivo ?? '').trim();
    if (motivo.length === 0) {
      throw Unprocessable('MOTIVO_OBRIGATORIO', 'O motivo da rejeição é obrigatório');
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
          tipo: 'REJEITADO',
          titulo: 'Encaminhamento rejeitado',
          descricao: motivo,
          autor: autor.nome,
          autorPapel: autor.papel,
        },
      });

      const upd = await tx.encaminhamento.update({
        where: { id },
        data: {
          status: StatusEncaminhamento.REJEITADO,
          observacoesRegulacao: '',
          // Persistir motivo flat — o app paciente usa pra mostrar bloco
          // vermelho "Motivo da recusa" sem precisar varrer a timeline.
          motivoRejeicao: motivo,
        },
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });

      await publicarNaTransacao(tx, {
        eventType: 'encaminhamento.rejeitado',
        aggregateType: 'Encaminhamento',
        aggregateId: id,
        payload: {
          protocolo: upd.protocolo,
          ubsId: upd.ubsId,
          motivo,
          rejeitadoPor: autor.nome,
        },
      });

      return upd;
    });

    encaminhamentoTransicao.inc({ de: 'AGUARDANDO_REGULACAO', para: 'REJEITADO' });

    logger.info(
      { encId: id, protocolo: atualizado.protocolo, ubsId: atualizado.ubsId },
      'encaminhamento rejeitado',
    );

    void this.notificacoes
      .notificar({
        cpfPaciente: atualizado.pacienteCpf,
        pacienteNome: atualizado.pacienteNome,
        encaminhamentoId: id,
        tipo: 'REJEITADO',
        ...MENSAGENS.rejeitado(atualizado.protocolo, motivo),
        payload: { protocolo: atualizado.protocolo, motivo },
      })
      .catch((err) => logger.warn({ err }, 'notificar REJEITADO falhou'));

    // Invalida cache da árvore para esta UBS e globalmente
    void invalidarCacheArvorePorUbs(atualizado.ubsId);

    return rowParaEncaminhamento(atualizado);
  }
}
