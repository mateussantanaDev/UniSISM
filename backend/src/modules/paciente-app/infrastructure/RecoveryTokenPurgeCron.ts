/**
 * Cron de purga de `PacienteRecoveryToken` expirados/usados.
 *
 * Motivação:
 *   - Tokens expirados/usados não têm utilidade operacional além de audit imediato.
 *   - Acumular tokens infinitamente é:
 *       (a) waste de storage,
 *       (b) attack surface (se DB vaza, hashes ficam expostos),
 *       (c) LGPD: dado pessoal (token associado a contaId) sem necessidade
 *           de retenção indefinida.
 *
 * Política:
 *   - Deleta tokens onde `expiraEm < (agora - GRACE_HRS)` ou `usadoEm < (agora - GRACE_HRS)`.
 *   - GRACE de 24h garante que audit log já registrou (audit é a "memória de longo
 *     prazo"; o token em si pode ir embora).
 *
 * Schedule:
 *   - Default: a cada 6h (`0 *‍/6 * * *` UTC).
 *   - Override: env `RECOVERY_PURGE_CRON`.
 *   - Catch-up no boot.
 *
 * Audit: cada run loga (contagem deletada) em `auditoria_logs` com
 *   `acao=PURGE_RECOVERY_TOKENS` para rastreabilidade administrativa.
 */
import * as cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { prisma } from '../../../infrastructure/database/prisma';
import { logger } from '../../../infrastructure/logger';
import type { IAuditLogger } from '../../../infrastructure/audit/PrismaAuditLogger';

const GRACE_HRS = 24;

export interface PurgeResult {
  deletadosExpirados: number;
  deletadosUsados: number;
  duracaoMs: number;
}

export async function purgeRecoveryTokens(): Promise<PurgeResult> {
  const inicio = Date.now();
  const cutoff = new Date(Date.now() - GRACE_HRS * 60 * 60 * 1000);

  // 2 deletes separados pra ter granularidade no audit.
  const expirados = await prisma.pacienteRecoveryToken.deleteMany({
    where: { expiraEm: { lt: cutoff }, usadoEm: null },
  });
  const usados = await prisma.pacienteRecoveryToken.deleteMany({
    where: { usadoEm: { lt: cutoff } },
  });

  return {
    deletadosExpirados: expirados.count,
    deletadosUsados: usados.count,
    duracaoMs: Date.now() - inicio,
  };
}

export class RecoveryTokenPurgeCron {
  private task: ScheduledTask | null = null;

  constructor(private readonly audit: IAuditLogger) {}

  /**
   * Agenda o cron e roda catch-up imediato no boot.
   * Default: a cada 6h. Override: env `RECOVERY_PURGE_CRON`.
   */
  start(): void {
    const expr = process.env['RECOVERY_PURGE_CRON'] ?? '0 */6 * * *';
    if (!cron.validate(expr)) {
      logger.error({ expr }, 'RECOVERY_PURGE_CRON inválida — cron NÃO ativado');
      return;
    }

    // Catch-up — purga ao subir (não bloqueia startup).
    void this.runOnce('boot-catchup').catch((err) =>
      logger.error({ err }, 'purge de recovery tokens no boot falhou'),
    );

    this.task = cron.schedule(
      expr,
      () => {
        void this.runOnce('cron').catch((err) =>
          logger.error({ err }, 'purge de recovery tokens (cron) falhou'),
        );
      },
      { timezone: process.env['RECOVERY_PURGE_CRON_TZ'] ?? 'UTC' },
    );

    logger.info(
      { expr, tz: process.env['RECOVERY_PURGE_CRON_TZ'] ?? 'UTC' },
      '✓ cron de purga de recovery tokens iniciado',
    );
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
  }

  private async runOnce(origem: 'cron' | 'boot-catchup'): Promise<PurgeResult> {
    const r = await purgeRecoveryTokens();
    logger.info(
      { ...r, origem },
      `purge de recovery tokens (${origem}) concluído`,
    );
    // Audit só se houve alguma ação (evita lixo).
    if (r.deletadosExpirados + r.deletadosUsados > 0) {
      await this.audit.registrar({
        acao: 'PURGE_RECOVERY_TOKENS',
        recurso: 'PacienteRecoveryToken',
        atendenteId: null,
        payload: {
          origem,
          deletadosExpirados: r.deletadosExpirados,
          deletadosUsados: r.deletadosUsados,
          graceHoras: GRACE_HRS,
          duracaoMs: r.duracaoMs,
        },
      });
    }
    return r;
  }
}
