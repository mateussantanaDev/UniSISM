/**
 * Worker de geração de relatórios.
 *
 * Fluxo (por job):
 *   1. Carrega RelatorioJob + snapshot do solicitante (nome, prefeitura)
 *   2. Resolve data source por tipo → linhas
 *   3. Renderiza CSV/XLSX/PDF para /tmp (via renderer do formato)
 *   4. Upload pro object storage (S3/disk)
 *   5. UPDATE job: DISPONIVEL + storage_key + tamanho + hash
 *   6. Apaga /tmp
 *   7. Erro → status=FALHA, erro_trace_id
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '../../../infrastructure/database/prisma';
import { logger } from '../../../infrastructure/logger';
import type { IFileStorage } from '../../../domain/services/IFileStorage';
import { META } from '../domain/TipoRelatorioMeta';
import type { LinhaDados } from './dataSources';
import {
  dadosBuscaAtiva,
  dadosEncaminhamentosPorEspecialidade,
  dadosFilaRegulacao,
  dadosPendenciasResolvidas,
  dadosProducaoIndividual,
  dadosTfdCustos,
  dadosVacinacaoUbs,
  type EscopoData,
  type JanelaPeriodo,
} from './dataSources';
import { CsvRenderer } from '../infrastructure/renderers/CsvRenderer';
import { XlsxRenderer } from '../infrastructure/renderers/XlsxRenderer';
import { PdfRenderer } from '../infrastructure/renderers/PdfRenderer';
import type { Renderer } from '../infrastructure/renderers/types';
import { RelatorioAuditLogger } from '../infrastructure/RelatorioAuditLogger';
import type { TipoRelatorio } from '../../../domain/entities/Relatorio';

const MAX_LINHAS = 500_000;

function rendererDe(formato: string): Renderer {
  switch (formato) {
    case 'CSV':
      return new CsvRenderer();
    case 'XLSX':
      return new XlsxRenderer();
    case 'PDF':
      return new PdfRenderer();
    default:
      throw new Error(`Formato não suportado: ${formato}`);
  }
}

function fmtBr(d: Date): string {
  return d.toLocaleDateString('pt-BR');
}

async function buscarDados(
  tipo: TipoRelatorio,
  escopo: EscopoData,
  janela: JanelaPeriodo,
  filtros: Record<string, unknown>,
): Promise<LinhaDados[]> {
  switch (tipo) {
    case 'FILA_REGULACAO':
      return dadosFilaRegulacao(escopo, janela);
    case 'ENCAMINHAMENTOS_POR_ESPECIALIDADE':
      return dadosEncaminhamentosPorEspecialidade(escopo, janela);
    case 'PENDENCIAS_RESOLVIDAS':
      return dadosPendenciasResolvidas(escopo, janela);
    case 'TFD_CUSTOS':
      return dadosTfdCustos(escopo, janela);
    case 'VACINACAO_UBS':
      return dadosVacinacaoUbs(escopo, janela);
    case 'BUSCA_ATIVA':
      return dadosBuscaAtiva(escopo, janela, {
        incluirNomes: filtros['incluirNomes'] === true,
      });
    case 'PRODUCAO_INDIVIDUAL':
      return dadosProducaoIndividual(escopo, janela);
  }
}

export class RelatorioWorker {
  private readonly audit = new RelatorioAuditLogger();

  constructor(private readonly storage: IFileStorage) {}

  /** Executa um job de relatório. Nunca lança — marca FALHA em caso de erro. */
  async executar(jobId: string): Promise<void> {
    const job = await prisma.relatorio.findUnique({
      where: { id: jobId },
      include: {
        atendente: { select: { id: true, nome: true, matricula: true } },
        prefeituraRel: { select: { nome: true } },
      },
    });
    if (!job) {
      logger.warn({ jobId }, 'job não encontrado — skipping');
      return;
    }
    if (job.status !== 'PROCESSANDO') {
      logger.warn({ jobId, status: job.status }, 'job não está em PROCESSANDO — skipping');
      return;
    }

    const meta = META[job.tipo];
    const filtros = (job.filtros as Record<string, unknown>) ?? {};

    const janela: JanelaPeriodo = {
      inicio: job.periodoIni,
      fim: new Date(new Date(job.periodoFim).setUTCHours(23, 59, 59, 999)),
    };

    const escopo: EscopoData = {
      prefeituraId: job.prefeituraId,
      ubsId: job.ubsId,
      atendenteId: meta.escopoPadrao === 'SELF' ? job.atendenteId : null,
    };

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'unisism-rel-'));
    const renderer = rendererDe(job.formato);
    const filename = `${job.id}.${renderer.extensao()}`;
    const caminhoTmp = path.join(tmp, filename);

    try {
      const linhas = await buscarDados(job.tipo, escopo, janela, filtros);
      if (linhas.length > MAX_LINHAS) {
        throw new Error(`LINHAS_EXCEDIDAS: ${linhas.length} > ${MAX_LINHAS}`);
      }

      const colunas: readonly string[] =
        meta.permiteNominal && filtros['incluirNomes'] === true && meta.colunasOpcionaisNominais
          ? [...meta.colunas, ...meta.colunasOpcionaisNominais]
          : meta.colunas;

      const periodoLegivel = `${fmtBr(job.periodoIni)} – ${fmtBr(job.periodoFim)}`;
      const partes = job.atendente.nome.split(/\s+/).filter(Boolean);
      const nomeAbrev =
        partes.length <= 1 ? job.atendente.nome : `${partes[0]} ${partes[partes.length - 1]}`;

      const { tamanhoBytes, sha256 } = await renderer.render({
        colunas,
        linhas,
        caminhoDestino: caminhoTmp,
        metadata: {
          titulo: job.titulo,
          tipo: job.tipo,
          periodoLegivel,
          prefeituraNome: job.prefeituraRel.nome,
          geradoPorMatricula: job.atendente.matricula,
          geradoPorNomeAbreviado: nomeAbrev,
          relatorioId: job.id,
          geradoEmIso: new Date().toISOString(),
          finalidade: meta.descricaoFinalidade,
          classificacao: meta.classificacao,
          marcaDagua: !!meta.marcaDagua,
        },
      });

      // Upload
      const buffer = await fs.readFile(caminhoTmp);
      const arq = await this.storage.salvar({
        nomeOriginal: filename,
        mimeType: renderer.contentType(),
        buffer,
        pasta: 'relatorios',
      });

      await prisma.relatorio.update({
        where: { id: job.id },
        data: {
          status: 'DISPONIVEL',
          storageKey: arq.caminho,
          contentType: renderer.contentType(),
          tamanhoBytes: BigInt(tamanhoBytes),
          tamanhoKb: Math.max(1, Math.round(tamanhoBytes / 1024)),
          hashSha256: sha256,
          finalizadoEm: new Date(),
        },
      });

      logger.info(
        {
          jobId: job.id,
          tipo: job.tipo,
          linhas: linhas.length,
          tamanhoKb: Math.round(tamanhoBytes / 1024),
          sha256: sha256.slice(0, 16),
        },
        'relatório gerado',
      );
    } catch (err) {
      const traceId = `trace-${crypto.randomBytes(8).toString('hex')}`;
      logger.error({ err, jobId, traceId }, 'falha na geração de relatório');
      await prisma.relatorio.update({
        where: { id: jobId },
        data: { status: 'FALHA', erroTraceId: traceId, finalizadoEm: new Date() },
      });
      await this.audit.registrar({
        relatorioId: jobId,
        atendenteId: job.atendenteId,
        acao: 'FALHA',
        detalhes: { traceId, motivo: err instanceof Error ? err.message.slice(0, 200) : 'desconhecido' },
      });
    } finally {
      // Cleanup /tmp
      try {
        if (fsSync.existsSync(caminhoTmp)) await fs.unlink(caminhoTmp);
        await fs.rm(tmp, { recursive: true, force: true });
      } catch {
        /* ignora */
      }
    }
  }
}
