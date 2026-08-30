/**
 * Cron diário de expiração (§6 da spec).
 * Toda entrada com `expiraEm < now()` e `status=DISPONIVEL`:
 *   - Remove o arquivo do storage
 *   - Zera storageKey / contentType / tamanho / hash
 *   - status → 'FALHA' com erro_trace_id='EXPIRADO'
 *   - INSERT audit EXPIRADO
 */
import { prisma } from '../../../infrastructure/database/prisma';
import { logger } from '../../../infrastructure/logger';
import type { IFileStorage } from '../../../domain/services/IFileStorage';
import { RelatorioAuditLogger } from '../infrastructure/RelatorioAuditLogger';

export class ExpiracaoCron {
  private readonly audit = new RelatorioAuditLogger();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly storage: IFileStorage) {}

  start(intervaloMs = 60 * 60 * 1000): void {
    if (this.timer) return;
    const tick = async () => {
      try {
        await this.executar();
      } catch (err) {
        logger.error({ err }, 'cron expiração falhou');
      }
    };
    // Executa uma vez 10s depois do start, depois a cada intervaloMs
    setTimeout(tick, 10_000);
    this.timer = setInterval(tick, intervaloMs);
    logger.info({ intervaloMs }, 'cron de expiração de relatórios ativo');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async executar(): Promise<number> {
    const expirados = await prisma.relatorio.findMany({
      where: { status: 'DISPONIVEL', expiraEm: { lt: new Date() } },
      select: { id: true, atendenteId: true, storageKey: true },
      take: 500,
    });
    if (expirados.length === 0) return 0;

    logger.info({ quantidade: expirados.length }, 'apagando relatórios expirados');

    for (const r of expirados) {
      if (r.storageKey) {
        try {
          await this.storage.deletar(r.storageKey);
        } catch (err) {
          logger.warn({ err, id: r.id, key: r.storageKey }, 'falha ao apagar arquivo do storage');
        }
      }
      await prisma.relatorio.update({
        where: { id: r.id },
        data: {
          status: 'FALHA',
          erroTraceId: 'EXPIRADO',
          storageKey: null,
          contentType: null,
          tamanhoBytes: null,
          tamanhoKb: 0,
          hashSha256: null,
        },
      });
      await this.audit.registrar({
        relatorioId: r.id,
        atendenteId: r.atendenteId,
        acao: 'EXPIRADO',
      });
    }
    return expirados.length;
  }
}
