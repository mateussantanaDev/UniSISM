/**
 * Registrar Resposta do SUS Federal (Face 2 · SMS).
 *
 * Pré-condições:
 *   - status === 'APROVADO'                  → senão 409 ENCAMINHAMENTO_NAO_APROVADO
 *   - respostaSUS ainda não registrada       → senão 409 RESPOSTA_SUS_JA_REGISTRADA
 *   - observacao presente após trim          → senão 422 PDF_RESPOSTA_OBRIGATORIO (reutiliza o code, já que
 *                                                a observação é parte do mesmo conjunto de dados obrigatório)
 *   - arquivo PDF válido                     → senão 415 / 413 / 422 conforme o caso
 *
 * Transição (transação atômica):
 *   1. Salva o PDF como AnexoDocumento com tipo RESPOSTA_SUS
 *   2. Preenche os campos respostaSus* no encaminhamento (snapshot do regulador)
 *   3. Cria evento RESPOSTA_SUS_RECEBIDA na timeline
 *   4. Status permanece APROVADO (enrichment, não transição)
 *   5. (futuro) notifica UBS de origem (resposta_sus.registrada)
 */
import { StatusEncaminhamento } from '../../../../../generated/prisma';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import { prisma } from '../../../../infrastructure/database/prisma';
import { invalidarCacheArvorePorUbs } from '../../../../infrastructure/cache/arvoreCacheInvalidator';

import {
  INCLUDE_ENCAMINHAMENTO_FULL,
  rowParaEncaminhamento,
} from '../../../../infrastructure/database/encaminhamentoMapper';
import { whereByScopeViaUbs } from '../../../../infrastructure/database/scopeWhere';
import { Conflict, NotFound, Unprocessable } from '../../../../shared/errors';
import type { AccessScope } from '../../../../shared/scope';
import type { IFileStorage } from '../../../../domain/services/IFileStorage';
import type { IAnexoScanner } from '../../../../infrastructure/scan/ClamavScanner';
import { logger } from '../../../../infrastructure/logger';
import { publicarNaTransacao } from '../../../../infrastructure/outbox/OutboxBus';
import { PdfCompressor } from '../../../../infrastructure/services/PdfCompressor';
import {
  MENSAGENS,
  NotificacaoPacienteService,
} from '../../../../infrastructure/services/NotificacaoPacienteService';

export interface RegistrarRespostaSusInput {
  observacao: string;
  pdf: {
    nomeOriginal: string;
    mimeType: string;
    buffer: Buffer;
  };
}

export interface ReguladorContext {
  id: string;
  nome: string;
  matricula: string;
  papel: string; // ex.: "Regulação · SMS"
}

export class RegistrarRespostaSusUseCase {
  private readonly compressor = new PdfCompressor();
  private readonly notificacoes = new NotificacaoPacienteService();

  constructor(
    private readonly storage: IFileStorage,
    private readonly scanner?: IAnexoScanner,
  ) {}

  async exec(
    id: string,
    scope: AccessScope,
    regulador: ReguladorContext,
    input: RegistrarRespostaSusInput,
  ): Promise<Encaminhamento> {
    const observacao = (input.observacao ?? '').trim();
    if (observacao.length === 0) {
      throw Unprocessable(
        'PDF_RESPOSTA_OBRIGATORIO',
        'Observação e PDF da resposta são obrigatórios',
      );
    }
    if (!input.pdf?.buffer?.length) {
      throw Unprocessable('PDF_RESPOSTA_OBRIGATORIO', 'PDF da resposta SUS é obrigatório');
    }

    const atual = await prisma.encaminhamento.findFirst({
      where: { id, ...whereByScopeViaUbs(scope) },
    });
    if (!atual) throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    if (atual.status !== StatusEncaminhamento.APROVADO) {
      throw Conflict(
        'ENCAMINHAMENTO_NAO_APROVADO',
        'Encaminhamento não está aprovado.',
        { statusAtual: atual.status },
      );
    }
    if (atual.respostaSusAnexoId) {
      throw Conflict(
        'RESPOSTA_SUS_JA_REGISTRADA',
        'Resposta do SUS já registrada para este encaminhamento.',
      );
    }

    // 1. comprime + salva o PDF no storage
    const pasta = `encaminhamentos/resposta-sus/${new Date().toISOString().slice(0, 7)}`;
    let bufferFinal = input.pdf.buffer;
    try {
      const r = await this.compressor.comprimir(input.pdf.buffer);
      bufferFinal = r.buffer;
    } catch (err) {
      logger.warn({ err }, 'falha na compressão do PDF resposta-sus');
    }
    const arq = await this.storage.salvar({
      nomeOriginal: input.pdf.nomeOriginal,
      mimeType: input.pdf.mimeType,
      buffer: bufferFinal,
      pasta,
    });

    // 2. transação: cria anexo RESPOSTA_SUS + preenche campos + evento timeline
    const atualizado = await prisma.$transaction(async (tx) => {
      const anexo = await tx.anexoDocumento.create({
        data: {
          encaminhamentoId: id,
          nome: input.pdf.nomeOriginal,
          tipo: 'RESPOSTA_SUS',
          tamanhoKb: arq.tamanhoKb,
          mimeType: input.pdf.mimeType,
          caminho: arq.caminho,
        },
      });

      await tx.eventoTimeline.create({
        data: {
          encaminhamentoId: id,
          tipo: 'RESPOSTA_SUS_RECEBIDA',
          titulo: 'Resposta do SUS registrada',
          descricao: observacao,
          autor: regulador.nome,
          autorPapel: regulador.papel,
        },
      });

      const upd = await tx.encaminhamento.update({
        where: { id },
        data: {
          respostaSusAnexoId: anexo.id,
          respostaSusObservacao: observacao,
          respostaSusRegistradoEm: new Date(),
          respostaSusRegistradoPorId: regulador.id,
          respostaSusRegistradoPorNome: regulador.nome,
          respostaSusRegistradoPorMat: regulador.matricula,
        },
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });

      await publicarNaTransacao(tx, {
        eventType: 'resposta_sus.registrada',
        aggregateType: 'Encaminhamento',
        aggregateId: id,
        payload: {
          protocolo: upd.protocolo,
          ubsId: upd.ubsId,
          anexoId: anexo.id,
          registradoPor: regulador.nome,
        },
      });

      return upd;
    });

    logger.info(
      { encId: id, protocolo: atualizado.protocolo, ubsId: atualizado.ubsId },
      'resposta SUS registrada',
    );

    // Scan AV do PDF de resposta-sus (fire-and-forget)
    if (this.scanner) {
      const anexoCriado = atualizado.anexos.find((x) => x.id === atualizado.respostaSusAnexoId);
      if (anexoCriado) {
        void this.scanner
          .escanearEAtualizar(anexoCriado.id, this.storage.caminhoAbsoluto(anexoCriado.caminho))
          .catch((err) => logger.warn({ err }, 'scan AV resposta-sus falhou'));
      }
    }

    void this.notificacoes
      .notificar({
        cpfPaciente: atualizado.pacienteCpf,
        pacienteNome: atualizado.pacienteNome,
        encaminhamentoId: id,
        tipo: 'RESPOSTA_SUS_DISPONIVEL',
        ...MENSAGENS.respostaSusDisponivel(atualizado.protocolo),
        payload: {
          protocolo: atualizado.protocolo,
          anexoId: atualizado.respostaSusAnexoId,
        },
      })
      .catch((err) => logger.warn({ err }, 'notificar RESPOSTA_SUS falhou'));

    // Invalida cache da árvore para esta UBS e globalmente
    void invalidarCacheArvorePorUbs(atualizado.ubsId);


    return rowParaEncaminhamento(atualizado);
  }
}
