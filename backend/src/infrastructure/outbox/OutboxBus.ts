/**
 * Outbox pattern.
 *
 * Escrita: `outbox.publicarNaTransacao(tx, evento)` insere o evento
 * **na mesma transação** que altera o agregado. Atomicidade total.
 *
 * Entrega: `OutboxPublisher` (worker separado) varre eventos pendentes
 * a cada N ms, entrega pro handler (log/webhook/fila) e marca como
 * publicado. At-least-once. Handlers devem ser idempotentes.
 */
import type { Prisma } from '../../../generated/prisma';
import { prisma } from '../database/prisma';
import { logger } from '../logger';
import { outboxPendentes } from '../metrics/prometheus';

export interface OutboxEventoInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

/**
 * Insere o evento no outbox DENTRO da transação do agregado.
 * Passar `tx` garante atomicidade (rollback em cascata).
 */
export async function publicarNaTransacao(
  tx: Prisma.TransactionClient,
  evento: OutboxEventoInput,
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      eventType: evento.eventType,
      aggregateType: evento.aggregateType,
      aggregateId: evento.aggregateId,
      payload: evento.payload as Prisma.InputJsonValue,
    },
  });
}

/** Variante fora de transação (usar só quando o agregado já foi persistido). */
export async function publicar(evento: OutboxEventoInput): Promise<void> {
  await prisma.outboxEvent.create({
    data: {
      eventType: evento.eventType,
      aggregateType: evento.aggregateType,
      aggregateId: evento.aggregateId,
      payload: evento.payload as Prisma.InputJsonValue,
    },
  });
}

export type OutboxHandler = (evento: {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  criadoEm: Date;
}) => Promise<void>;

export class OutboxPublisher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly intervalMs: number;
  private readonly handler: OutboxHandler;
  private readonly maxTentativas: number;

  constructor(handler: OutboxHandler, opts?: { intervalMs?: number; maxTentativas?: number }) {
    this.handler = handler;
    this.intervalMs = opts?.intervalMs ?? 500;
    this.maxTentativas = opts?.maxTentativas ?? 10;
  }

  start(): void {
    if (this.timer) return;
    const tick = async () => {
      if (this.running) return;
      this.running = true;
      try {
        await this.processBatch();
      } catch (err) {
        logger.error({ err }, 'outbox publisher batch falhou');
      } finally {
        this.running = false;
      }
    };
    void tick();
    this.timer = setInterval(() => void tick(), this.intervalMs);
    logger.info({ intervalMs: this.intervalMs }, 'outbox publisher iniciado');
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const inicio = Date.now();
    while (this.running && Date.now() - inicio < 10_000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    logger.info('outbox publisher parado');
  }

  private async processBatch(): Promise<void> {
    // Busca até 50 eventos pendentes e com tentativas abaixo do limite
    const pendentes = await prisma.outboxEvent.findMany({
      where: {
        publicadoEm: null,
        tentativas: { lt: this.maxTentativas },
      },
      orderBy: { criadoEm: 'asc' },
      take: 50,
    });
    outboxPendentes.set(pendentes.length);

    for (const e of pendentes) {
      try {
        await this.handler({
          id: e.id,
          eventType: e.eventType,
          aggregateType: e.aggregateType,
          aggregateId: e.aggregateId,
          payload: (e.payload as Record<string, unknown>) ?? {},
          criadoEm: e.criadoEm,
        });
        await prisma.outboxEvent.update({
          where: { id: e.id },
          data: { publicadoEm: new Date() },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await prisma.outboxEvent.update({
          where: { id: e.id },
          data: {
            tentativas: { increment: 1 },
            ultimoErro: msg.slice(0, 500),
          },
        });
        logger.warn({ err: msg, eventId: e.id, eventType: e.eventType }, 'outbox handler falhou');
      }
    }
  }
}

/** Handler default: só loga. Em produção, substituir por webhook/fila. */
export const logOnlyOutboxHandler: OutboxHandler = async (evento) => {
  logger.info(
    {
      outbox: true,
      eventType: evento.eventType,
      aggregateType: evento.aggregateType,
      aggregateId: evento.aggregateId,
      payload: evento.payload,
    },
    `outbox → ${evento.eventType}`,
  );
};
