// IMPORT FIRST: OpenTelemetry deve carregar antes de tudo pra instrumentar.
import './tracing';

import { buildApp } from './app';
import { env } from '../shared/env';
import { logger } from '../infrastructure/logger';
import { prisma } from '../infrastructure/database/prisma';
import { getCache } from '../infrastructure/cache/Cache';
import { aplicarTriggersImutabilidade, checarTriggersAtivos } from './bootstrapTriggers';
import { bootstrapAssinaturaTfd } from '../modules/tfd/infrastructure/TfdSignatureService';
import { SaldoMensalCron } from '../modules/tfd/infrastructure/SaldoMensalCron';

async function main() {
  // ----- Production bootstraps (devem rodar ANTES do app subir) -----
  // 1) Triggers de imutabilidade dos audit logs (idempotente).
  await aplicarTriggersImutabilidade();
  const trig = await checarTriggersAtivos();
  if (!trig.tfdAuditOk || !trig.prontuarioAuditOk) {
    if (env.NODE_ENV === 'production') {
      logger.error(trig, '✗ triggers de imutabilidade NÃO ativos em produção');
      process.exit(1);
    }
    logger.warn(trig, '⚠️  triggers de imutabilidade incompletos (DEV)');
  }
  // 2) Cert ICP-Brasil (fail-fast em produção se TFD_SIGN_REQUIRED=true)
  bootstrapAssinaturaTfd();

  const { app, container } = buildApp();

  const server = app.listen(env.PORT, () => {
    logger.info(
      {
        url: `http://localhost:${env.PORT}/v1`,
        metrics: (process.env['METRICS_ENABLED'] ?? 'true') === 'true',
        redis: getCache().isReady(),
        storage: process.env['STORAGE_PROVIDER'] ?? 'disk',
        scanner: container.scanner.isAtivo() ? 'clamav' : 'noop',
      },
      'UNISISM · UBS backend escutando',
    );
  });

  // Outbox publisher — ativar se env permitir
  if ((process.env['OUTBOX_ENABLED'] ?? 'true') === 'true') {
    container.outbox.start();
  }

  // Cron diário de expiração de relatórios (§6 LGPD)
  container.relExpiracaoCron.start(60 * 60 * 1000); // roda de hora em hora

  // Cron mensal de saldos TFD (dia 1º + catch-up no boot)
  const saldoCron = new SaldoMensalCron();
  saldoCron.start();

  // Cron de purga de PacienteRecoveryToken expirados/usados (a cada 6h + catch-up)
  container.recoveryTokenPurgeCron.start();

  // Push dispatcher worker (polling 15s) — envia notificações pendentes via ntfy.sh
  if ((process.env['PUSH_DISPATCHER_ENABLED'] ?? 'true') === 'true') {
    container.pushDispatcher.start();
  }
  // Cron mensal de cleanup de dispositivos push inativos
  container.pushCleanupCron.start();

  const shutdown = async (signal: string) => {
    logger.warn({ signal }, 'graceful shutdown iniciado');
    container.outbox.stop();
    container.relExpiracaoCron.stop();
    saldoCron.stop();
    container.recoveryTokenPurgeCron.stop();
    container.pushCleanupCron.stop();
    void container.pushDispatcher.stop();
    server.close(async (err) => {
      if (err) logger.error({ err }, 'erro ao fechar HTTP server');
      try {
        await getCache().quit();
        await prisma.$disconnect();
      } finally {
        process.exit(err ? 1 : 0);
      }
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'falha fatal ao iniciar o servidor');
  process.exit(1);
});
