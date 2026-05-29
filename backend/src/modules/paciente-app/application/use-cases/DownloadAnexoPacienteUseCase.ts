/**
 * Download seguro de anexo médico pelo PACIENTE (Face 3).
 *
 * **LGPD crítico**: anexo pertence ao prontuário do paciente — toda interação
 * é registrada em `auditoria_logs` para rastreabilidade (CFM Res. 1.821/2007
 * + LGPD art. 37).
 *
 * Camadas de defesa:
 *
 *   1. **Escopo** — anexo precisa pertencer a encaminhamento do CPF autenticado.
 *      Falha → 404 (anti-enumeration, não vaza existência).
 *
 *   2. **ClamAV gate** — só libera se `scanStatus === 'LIMPO'`. PENDENTE/INFECTADO/FALHOU → 409.
 *
 *   3. **Path traversal guard** — `path.resolve(UPLOAD_DIR, anexo.caminho)` é
 *      validado contra `path.resolve(UPLOAD_DIR)` via `startsWith` + checagem
 *      de separador. Se `caminho` contiver `..` que escape, 404.
 *
 *   4. **Stat async** — usa `fs.promises.stat` (não bloqueia event loop).
 *      Retorna 404 ARQUIVO_NAO_ENCONTRADO se sumiu (corrupção de DB-vs-disco).
 *
 *   5. **Rate limit** — aplicado no middleware HTTP (não no use case).
 *
 *   6. **Audit log** — `DOWNLOAD_ANEXO_PACIENTE_*` em TODOS os caminhos.
 *
 * Retorna um descritor pro controller fazer o stream com headers seguros
 * (sem responsabilidade de I/O no use case — testabilidade).
 */
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../../../infrastructure/database/prisma';
import { env } from '../../../../shared/env';
import { Conflict, NotFound } from '../../../../shared/errors';
import { logger } from '../../../../infrastructure/logger';
import type { IAuditLogger } from '../../../../infrastructure/audit/PrismaAuditLogger';

export interface DownloadAnexoContext {
  cpfDigits: string;
  contaId: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface DownloadAnexoDescriptor {
  absolutePath: string;
  filename: string;
  mimeType: string;
  size: number;
  sha256: string | null;
}

export class DownloadAnexoPacienteUseCase {
  constructor(private readonly audit: IAuditLogger) {}

  async exec(anexoId: string, ctx: DownloadAnexoContext): Promise<DownloadAnexoDescriptor> {
    // 1. Lookup com inclusão do encaminhamento (precisa do CPF pra escopo + pacienteId pra audit CFM).
    const anexo = await prisma.anexoDocumento.findUnique({
      where: { id: anexoId },
      include: {
        encaminhamento: {
          select: { id: true, pacienteCpf: true, ubsId: true, pacienteId: true, pacienteNome: true },
        },
      },
    });

    if (!anexo) {
      await this._audit('DOWNLOAD_ANEXO_PACIENTE_NAO_EXISTE', null, ctx, { anexoId });
      throw NotFound('ANEXO_NAO_ENCONTRADO', 'Anexo não encontrado');
    }

    // 2. Escopo — CPF do encaminhamento deve bater com CPF autenticado.
    const cpfEnc = anexo.encaminhamento.pacienteCpf.replace(/\D+/g, '');
    if (cpfEnc !== ctx.cpfDigits) {
      await this._audit('DOWNLOAD_ANEXO_PACIENTE_FORA_DO_ESCOPO', anexo.id, ctx, {
        anexoId,
        encId: anexo.encaminhamentoId,
        cpfMasked: ctx.cpfDigits.slice(0, 4) + '***',
      });
      // Anti-enumeration: 404 ao invés de 403.
      throw NotFound('ANEXO_NAO_ENCONTRADO', 'Anexo não encontrado');
    }

    // 3. ClamAV gate.
    if (anexo.scanStatus !== 'LIMPO') {
      await this._audit('DOWNLOAD_ANEXO_PACIENTE_NAO_LIBERADO', anexo.id, ctx, {
        scanStatus: anexo.scanStatus,
      });
      const motivo =
        anexo.scanStatus === 'INFECTADO'
          ? 'Arquivo bloqueado por segurança (vírus detectado)'
          : anexo.scanStatus === 'FALHOU'
            ? 'Falha ao verificar arquivo. Tente novamente.'
            : 'Arquivo ainda em processamento de segurança';
      throw Conflict('ANEXO_NAO_LIBERADO', motivo, { scanStatus: anexo.scanStatus });
    }

    // 4. Path traversal guard.
    const uploadDirAbs = path.resolve(env.UPLOAD_DIR);
    const candidato = path.resolve(uploadDirAbs, anexo.caminho);
    // candidato precisa estar DENTRO do uploadDirAbs (ou ser exatamente ele).
    const rel = path.relative(uploadDirAbs, candidato);
    const escapou = rel.startsWith('..') || path.isAbsolute(rel);
    if (escapou) {
      logger.error(
        { anexoId: anexo.id, caminho: anexo.caminho, candidato, uploadDirAbs },
        '[security] path traversal detectado em anexo — bloqueado',
      );
      await this._audit('DOWNLOAD_ANEXO_PACIENTE_PATH_TRAVERSAL', anexo.id, ctx, {
        caminhoSuspeito: anexo.caminho,
      });
      throw NotFound('ANEXO_NAO_ENCONTRADO', 'Anexo não encontrado');
    }

    // 5. Stat async (não bloqueia loop) + verifica que é arquivo (não diretório/symlink dir).
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(candidato);
    } catch {
      await this._audit('DOWNLOAD_ANEXO_PACIENTE_ARQUIVO_SUMIU', anexo.id, ctx, {
        caminho: anexo.caminho,
      });
      throw NotFound('ARQUIVO_NAO_ENCONTRADO', 'Arquivo físico não encontrado');
    }
    if (!stat.isFile()) {
      await this._audit('DOWNLOAD_ANEXO_PACIENTE_NAO_E_ARQUIVO', anexo.id, ctx, {
        caminho: anexo.caminho,
      });
      throw NotFound('ARQUIVO_NAO_ENCONTRADO', 'Arquivo físico inválido');
    }

    // 6. Audit OK:
    //   - `auditoria_logs` (LGPD 5 anos) — granular, todas as ações
    //   - `paciente_prontuario_audit` (CFM 20 anos) — só sucesso, dado médico
    //     append-only protegido por trigger SQL (UPDATE/DELETE bloqueados).
    await this._audit('DOWNLOAD_ANEXO_PACIENTE_OK', anexo.id, ctx, {
      anexoNome: anexo.nome,
      mimeType: anexo.mimeType,
      size: stat.size,
      sha256: anexo.sha256,
      encId: anexo.encaminhamentoId,
    });
    await this._auditCfm(anexo, stat.size, ctx);

    return {
      absolutePath: candidato,
      filename: anexo.nome,
      mimeType: anexo.mimeType,
      size: stat.size,
      sha256: anexo.sha256,
    };
  }

  /**
   * Audit CFM 20 anos — só executado em download bem-sucedido.
   * Requer `pacienteId` (FK ao Paciente). Se não existir (encaminhamento sem
   * vínculo a Paciente — raro), faz fallback graceful: loga warn e SAI sem
   * gravar (não temos `pacienteId` válido pra registrar — não inventamos).
   * O download em si NÃO é bloqueado (audit LGPD em `auditoria_logs` já cobre).
   */
  private async _auditCfm(
    anexo: {
      id: string;
      nome: string;
      mimeType: string;
      sha256: string | null;
      encaminhamento: { pacienteId: string | null; pacienteNome: string };
    },
    sizeBytes: number,
    ctx: DownloadAnexoContext,
  ): Promise<void> {
    if (!anexo.encaminhamento.pacienteId) {
      logger.warn(
        { anexoId: anexo.id, encId: ctx.contaId },
        '[cfm-audit] encaminhamento sem pacienteId — audit CFM 20 anos não pode ser gravado (faltou vínculo no Paciente)',
      );
      return;
    }
    try {
      await prisma.pacienteProntuarioAudit.create({
        data: {
          pacienteId: anexo.encaminhamento.pacienteId,
          // `autorId` aqui é o `contaId` do paciente (próprio paciente baixando).
          autorId: ctx.contaId,
          autorNome: anexo.encaminhamento.pacienteNome,
          autorPapel: 'PACIENTE · App',
          acao: 'DOWNLOAD_ANEXO',
          recursoId: anexo.id,
          dados: {
            anexoNome: anexo.nome,
            mimeType: anexo.mimeType,
            size: sizeBytes,
            sha256: anexo.sha256,
            cpfMasked: ctx.cpfDigits.slice(0, 4) + '***',
          },
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
        },
      });
    } catch (err) {
      // CFM audit não deve quebrar download. Loga erro pra investigação.
      logger.error(
        { err, anexoId: anexo.id, pacienteId: anexo.encaminhamento.pacienteId },
        '[cfm-audit] falha ao gravar paciente_prontuario_audit',
      );
    }
  }

  private async _audit(
    acao: string,
    anexoId: string | null,
    ctx: DownloadAnexoContext,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.registrar({
      acao,
      recurso: 'AnexoDocumento',
      recursoId: anexoId ?? undefined,
      atendenteId: null,
      payload: {
        contaId: ctx.contaId,
        cpfMasked: ctx.cpfDigits.slice(0, 4) + '***',
        ...(extra ?? {}),
      },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  }
}
