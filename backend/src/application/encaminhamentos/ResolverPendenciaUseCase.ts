import { Unprocessable } from '../../shared/errors';
import type { Encaminhamento, TipoAnexo } from '../../domain/entities/Encaminhamento';
import type {
  IEncaminhamentoRepository,
  ResolverPendenciaInput,
} from '../../domain/repositories/IEncaminhamentoRepository';
import type { IFileStorage } from '../../domain/services/IFileStorage';
import type { IAnexoScanner } from '../../infrastructure/scan/ClamavScanner';
import type { AccessScope } from '../../shared/scope';
import { prisma } from '../../infrastructure/database/prisma';
import { logger } from '../../infrastructure/logger';
import { PdfCompressor } from '../../infrastructure/services/PdfCompressor';
import {
  MENSAGENS,
  NotificacaoPacienteService,
} from '../../infrastructure/services/NotificacaoPacienteService';

export interface AnexoUpload {
  nomeOriginal: string;
  mimeType: string;
  buffer: Buffer;
  tipo: TipoAnexo;
}

export interface ResolverPendenciaUseCaseInput {
  id: string;
  scope: AccessScope;
  nota: string;
  autor: string;
  autorPapel: string;
  anexos: AnexoUpload[];
}

export class ResolverPendenciaUseCase {
  private readonly compressor = new PdfCompressor();
  private readonly notificacoes = new NotificacaoPacienteService();

  constructor(
    private readonly repo: IEncaminhamentoRepository,
    private readonly storage: IFileStorage,
    private readonly scanner?: IAnexoScanner,
  ) {}

  private async talvezComprimir(
    nome: string,
    mimeType: string,
    buffer: Buffer,
  ): Promise<Buffer> {
    if (mimeType !== 'application/pdf') return buffer;
    try {
      const r = await this.compressor.comprimir(buffer);
      return r.buffer;
    } catch (err) {
      logger.warn({ err, nome }, 'falha ao comprimir PDF na pendência, salvando original');
      return buffer;
    }
  }

  async exec(input: ResolverPendenciaUseCaseInput): Promise<Encaminhamento> {
    if ((!input.nota || input.nota.trim().length === 0) && input.anexos.length === 0) {
      throw Unprocessable('NENHUMA_ACAO_FORNECIDA', 'Forneça uma nota ou ao menos um anexo');
    }

    const pasta = `encaminhamentos/pendencias/${new Date().toISOString().slice(0, 7)}`;
    const novosAnexos: ResolverPendenciaInput['novosAnexos'] = [];
    for (const a of input.anexos) {
      const bufferComprimido = await this.talvezComprimir(a.nomeOriginal, a.mimeType, a.buffer);
      const arq = await this.storage.salvar({
        nomeOriginal: a.nomeOriginal,
        mimeType: a.mimeType,
        buffer: bufferComprimido,
        pasta,
      });
      novosAnexos.push({
        nome: a.nomeOriginal,
        tipo: a.tipo,
        tamanhoKb: arq.tamanhoKb,
        mimeType: a.mimeType,
        caminho: arq.caminho,
      });
    }

    const atualizado = await this.repo.resolverPendencia(input.id, input.scope, {
      nota: input.nota || 'Pendência respondida',
      autor: input.autor,
      autorPapel: input.autorPapel,
      novosAnexos,
    });

    // Scan AV dos novos anexos (fire-and-forget)
    if (this.scanner && novosAnexos.length > 0) {
      void this.escanearNovosAnexosAsync(atualizado.id);
    }

    void this.notificacoes
      .notificar({
        cpfPaciente: atualizado.paciente.cpf,
        pacienteNome: atualizado.paciente.nome,
        encaminhamentoId: atualizado.id,
        tipo: 'PENDENCIA_RESOLVIDA',
        ...MENSAGENS.pendenciaResolvida(atualizado.protocolo),
        payload: { protocolo: atualizado.protocolo },
      })
      .catch((err) => logger.warn({ err }, 'notificar PENDENCIA_RESOLVIDA falhou'));

    return atualizado;
  }

  private async escanearNovosAnexosAsync(encaminhamentoId: string): Promise<void> {
    if (!this.scanner) return;
    try {
      const anexos = await prisma.anexoDocumento.findMany({
        where: { encaminhamentoId, scanStatus: 'PENDENTE' },
        select: { id: true, caminho: true },
      });
      for (const a of anexos) {
        try {
          await this.scanner.escanearEAtualizar(a.id, this.storage.caminhoAbsoluto(a.caminho));
        } catch (err) {
          logger.warn({ err, anexoId: a.id }, 'scan AV do anexo de pendência falhou');
        }
      }
    } catch (err) {
      logger.warn({ err, encaminhamentoId }, 'falha ao enfileirar scan AV de pendência');
    }
  }
}
