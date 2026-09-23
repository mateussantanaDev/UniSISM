/**
 * Cron mensal de saldos por veículo (TFD).
 *
 * Comportamento:
 *   - Roda **dia 1º de cada mês às 00:30** (configurável via env TFD_SALDO_CRON).
 *   - Para cada veículo ATIVO de toda prefeitura:
 *       Se o registro do mês corrente já existe → ignora.
 *       Senão → copia `saldoMensal` do mês anterior (zera consumido/reservado).
 *       Se não há mês anterior → cria com saldo zero (gestor ajusta depois).
 *
 *   - **Catch-up no boot**: ao iniciar o servidor, faz um sweep — se hoje >= dia 1
 *     e algum veículo ATIVO está sem saldo do mês corrente, cria.
 *     Garante consistência mesmo se o servidor estava down dia 1º.
 *
 * Observabilidade:
 *   - Loga sumário (criados, ignorados, falhados) ao final de cada execução.
 *   - Métrica Prometheus opcional via counter (deixado pra ampliação futura).
 */
import * as cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { prisma } from '../../../infrastructure/database/prisma';
import { logger } from '../../../infrastructure/logger';
import { env } from '../../../shared/env';

function ymdMes(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function mesAnterior(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  // Date(y, m-1) é o mês atual; m-2 é o anterior; quando m-2 < 0, JS ajusta o ano.
  const d = new Date(Date.UTC(y!, m! - 2, 1));
  return ymdMes(d);
}

export interface SweepResult {
  mes: string;
  totalVeiculosAtivos: number;
  criados: number;
  jaExistiam: number;
  falhados: number;
}

/**
 * Executa o sweep de criação de saldos para o mês informado (default: corrente).
 * Idempotente — pode rodar quantas vezes quiser sem duplicar.
 */
export async function sweepSaldosMensais(mesAlvo?: string): Promise<SweepResult> {
  const mes = mesAlvo ?? ymdMes();
  const anterior = mesAnterior(mes);

  const veiculos = await prisma.veiculoTFD.findMany({
    where: { deletadoEm: null, status: 'ATIVO' },
    select: { id: true, prefeituraId: true, placa: true },
  });

  const result: SweepResult = {
    mes,
    totalVeiculosAtivos: veiculos.length,
    criados: 0,
    jaExistiam: 0,
    falhados: 0,
  };

  for (const v of veiculos) {
    try {
      const ja = await prisma.saldoVeiculo.findUnique({
        where: { veiculoId_mes: { veiculoId: v.id, mes } },
      });
      if (ja) {
        result.jaExistiam++;
        continue;
      }
      const ant = await prisma.saldoVeiculo.findUnique({
        where: { veiculoId_mes: { veiculoId: v.id, mes: anterior } },
      });
      const saldoMensal = ant ? ant.saldoMensal : 0;

      await prisma.saldoVeiculo.create({
        data: {
          veiculoId: v.id,
          prefeituraId: v.prefeituraId,
          mes,
          saldoMensal,
          saldoConsumido: 0,
          saldoReservado: 0,
        },
      });
      result.criados++;
    } catch (err) {
      result.falhados++;
      logger.error(
        { err, veiculoId: v.id, placa: v.placa, mes },
        'falha ao criar saldo mensal',
      );
    }
  }
  return result;
}

export class SaldoMensalCron {
  private task: ScheduledTask | null = null;

  /**
   * Agenda o cron e roda catch-up imediatamente.
   * Cron padrão: dia 1º às 00:30 UTC. Override via env `TFD_SALDO_CRON`.
   */
  start(): void {
    const expr = env.TFD_SALDO_CRON;
    if (!cron.validate(expr)) {
      logger.error({ expr }, 'TFD_SALDO_CRON inválida — cron de saldos NÃO ativado');
      return;
    }
    const tz = env.TFD_SALDO_CRON_TZ;

    // Catch-up no boot — não bloqueia o startup.
    void this.runOnce('boot-catchup').catch((err) =>
      logger.error({ err }, 'sweep de saldos no boot falhou'),
    );

    this.task = cron.schedule(
      expr,
      () => {
        void this.runOnce('cron').catch((err) =>
          logger.error({ err }, 'sweep mensal de saldos falhou'),
        );
      },
      { timezone: tz },
    );
    logger.info(
      { expr, tz },
      '✓ cron mensal de saldos TFD iniciado',
    );
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
  }

  private async runOnce(origem: 'cron' | 'boot-catchup'): Promise<SweepResult> {
    const inicio = Date.now();
    const r = await sweepSaldosMensais();
    logger.info(
      { ...r, origem, duracaoMs: Date.now() - inicio },
      `sweep de saldos TFD (${origem}) concluído`,
    );
    return r;
  }
}
