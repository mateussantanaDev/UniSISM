/**
 * Cron de cleanup de `PacienteDispositivo` inativos.
 *
 * Motivação:
 *   - Tokens push sem uso há muito tempo são lixo (LGPD: minimização).
 *   - Devices que tiveram falhas permanentes acumuladas já foram removidos
 *     no dispatcher; este cron pega os "esquecidos" (paciente desinstalou app).
 *
 * Política:
 *   - Remove dispositivos com `ultimaAtividade < (now - INATIVO_DIAS)`
 *   - Default: 90 dias (env `PUSH_DEVICE_TTL_DIAS`)
 *
 * Schedule:
 *   - Default: dia 1º às 03:30 UTC (1x ao mês)
 *   - Override: env `PUSH_DEVICE_CLEANUP_CRON`
 *
 * Audit: `PUSH_DEVICE_CLEANUP` com contagem.
 */
import * as cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { prisma } from '../../../infrastructure/database/prisma';
import { logger } from '../../../infrastructure/logger';
import type { IAuditLogger } from '../../../infrastructure/audit/PrismaAuditLogger';

export async function purgePushDevicesInativos(diasInativo: number): Promise<{
  deletados: number;
  duracaoMs: number;
}> {
  const inicio = Date.now();
  const cutoff = new Date(Date.now() - diasInativo * 24 * 60 * 60 * 1000);
  const r = await prisma.pacienteDispositivo.deleteMany({
    where: { ultimaAtividade: { lt: cutoff } },
  });
  return { deletados: r.count, duracaoMs: Date.now() - inicio };
}

export class PushTokenCleanupCron {
  private task: ScheduledTask | null = null;

  constructor(private readonly audit: IAuditLogger) {}

  start(): void {
    const expr = process.env['PUSH_DEVICE_CLEANUP_CRON'] ?? '30 3 1 * *';
    if (!cron.validate(expr)) {
      logger.error({ expr }, 'PUSH_DEVICE_CLEANUP_CRON inválida — cron NÃO ativado');
      return;
    }
    const dias = Number(process.env['PUSH_DEVICE_TTL_DIAS']) || 90;

    void this._runOnce('boot-catchup', dias).catch((err) =>
      logger.error({ err }, 'push device cleanup no boot falhou'),
    );

    this.task = cron.schedule(
      expr,
      () => {
        void this._runOnce('cron', dias).catch((err) =>
          logger.error({ err }, 'push device cleanup (cron) falhou'),
        );
      },
      { timezone: process.env['PUSH_DEVICE_CLEANUP_CRON_TZ'] ?? 'UTC' },
    );
    logger.info({ expr, dias }, '✓ cron de cleanup de push devices iniciado');
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
  }

  private async _runOnce(origem: 'cron' | 'boot-catchup', diasInativo: number): Promise<void> {
    const r = await purgePushDevicesInativos(diasInativo);
    logger.info({ ...r, origem, diasInativo }, `push device cleanup (${origem}) concluído`);
    if (r.deletados > 0) {
      await this.audit.registrar({
        acao: 'PUSH_DEVICE_CLEANUP',
        recurso: 'PacienteDispositivo',
        atendenteId: null,
        payload: { origem, deletados: r.deletados, diasInativo, duracaoMs: r.duracaoMs },
      });
    }
  }
}
