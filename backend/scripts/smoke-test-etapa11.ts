/**
 * Smoke test — Etapa 11 (performance/confiabilidade).
 *
 * Cobre:
 *   1. Dispatcher de push filtra backoff no banco e não deixa itens antigos
 *      inelegíveis bloquearem notificações novas elegíveis.
 *   2. OutboxPublisher executa tick imediato e stop() aguarda batch em andamento.
 *
 * Uso:
 *   npx ts-node --transpile-only scripts/smoke-test-etapa11.ts
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/infrastructure/database/prisma';
import { PrismaAuditLogger } from '../src/infrastructure/audit/PrismaAuditLogger';
import { PushDispatcherWorker } from '../src/modules/paciente-app/infrastructure/PushDispatcherWorker';
import type { IPushProvider, PushPayload, PushResult } from '../src/infrastructure/push/IPushProvider';
import { OutboxPublisher, type OutboxHandler } from '../src/infrastructure/outbox/OutboxBus';

const CPF_E11 = '22233344405';

let asserts = 0;
let falhas = 0;

function ok(cond: unknown, msg: string, extra?: unknown): void {
  asserts++;
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    falhas++;
    console.log(`  ✗ ${msg}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function usandoBancoSmoke(): boolean {
  try {
    const raw = process.env.DATABASE_URL ?? '';
    const db = decodeURIComponent(new URL(raw).pathname.replace(/^\//, ''));
    return /(^|[_-])(smoke|test|testing|ci)([_-]|$)/i.test(db);
  } catch {
    return false;
  }
}

class FakePushProvider implements IPushProvider {
  readonly name = 'NTFY' as const;
  enviados: Array<{ endpoint: string; payload: PushPayload }> = [];
  defaultResult: PushResult = { ok: true, retryable: false };

  isReady(): boolean {
    return true;
  }

  async enviar(endpoint: string, payload: PushPayload): Promise<PushResult> {
    this.enviados.push({ endpoint, payload });
    return this.defaultResult;
  }
}

async function setupConta(): Promise<string> {
  const senhaHash = await bcrypt.hash('Senha!2026', 8);
  const conta = await prisma.pacienteConta.upsert({
    where: { cpf: CPF_E11 },
    create: {
      cpf: CPF_E11,
      cpfFormatado: '222.333.444-05',
      nome: 'PACIENTE SMOKE E11',
      email: 'paciente-e11@example.com',
      senhaHash,
      ativo: true,
    },
    update: {
      nome: 'PACIENTE SMOKE E11',
      email: 'paciente-e11@example.com',
      ativo: true,
    },
  });

  await prisma.pacienteDispositivo.deleteMany({ where: { contaId: conta.id } });
  await prisma.notificacaoPaciente.deleteMany({ where: { contaId: conta.id } });
  if (usandoBancoSmoke()) {
    await prisma.notificacaoPaciente.updateMany({
      where: {
        pushStatus: 'PENDENTE',
        contaId: { not: conta.id },
      },
      data: {
        pushStatus: 'SEM_DEVICE',
        pushErro: 'neutralizada pelo smoke etapa11 para isolar fila global',
      },
    });
  }
  await prisma.outboxEvent.deleteMany({ where: { aggregateType: 'SMOKE_ETAPA11' } });
  return conta.id;
}

async function smokePushBackoff(contaId: string): Promise<void> {
  console.log('Cenário 1 · Push dispatcher sem starvation por backoff');

  await prisma.pacienteDispositivo.create({
    data: {
      contaId,
      endpoint: 'unisism-etapa11-push-topic-1234567890ab',
      provider: 'NTFY',
      plataforma: 'ANDROID',
    },
  });

  const agora = new Date();
  const antigas = Array.from({ length: 55 }, (_, i) => ({
    contaId,
    pacienteCpf: CPF_E11,
    tipo: 'PENDENCIA_REGISTRADA' as const,
    titulo: `Backoff ${i}`,
    corpo: 'Ainda em backoff.',
    criadaEm: new Date(agora.getTime() - (60_000 + (55 - i) * 1000)),
    pushStatus: 'PENDENTE' as const,
    pushTentativas: 1,
    pushUltimaTentativaEm: agora,
  }));
  await prisma.notificacaoPaciente.createMany({ data: antigas });

  const elegivel = await prisma.notificacaoPaciente.create({
    data: {
      contaId,
      pacienteCpf: CPF_E11,
      tipo: 'APROVADO',
      titulo: 'Elegível',
      corpo: 'Esta notificação deve furar a fila bloqueada por backoff.',
      criadaEm: new Date(agora.getTime() + 1000),
    },
  });

  const fake = new FakePushProvider();
  const worker = new PushDispatcherWorker(fake, new PrismaAuditLogger());
  const resultado = await worker._processarBatch();

  const elegivelAtualizada = await prisma.notificacaoPaciente.findUnique({
    where: { id: elegivel.id },
  });
  const aindaEmBackoff = await prisma.notificacaoPaciente.count({
    where: {
      contaId,
      pushStatus: 'PENDENTE',
      pushTentativas: 1,
    },
  });

  ok(resultado.processadas === 1, `batch processou somente elegíveis (foi ${resultado.processadas})`);
  ok(resultado.ok === 1, `batch enviou 1 notificação elegível (foi ${resultado.ok})`);
  ok(fake.enviados.length === 1, `provider recebeu 1 envio (foi ${fake.enviados.length})`);
  ok(elegivelAtualizada?.pushStatus === 'ENVIADO', `notificação elegível enviada (foi ${elegivelAtualizada?.pushStatus})`);
  ok(aindaEmBackoff === 55, `55 notificações em backoff preservadas (foi ${aindaEmBackoff})`);
}

async function smokeOutboxStop(): Promise<void> {
  console.log('\nCenário 2 · Outbox stop aguarda batch em andamento');

  await prisma.outboxEvent.deleteMany({ where: { aggregateType: 'SMOKE_ETAPA11' } });
  const evento = await prisma.outboxEvent.create({
    data: {
      eventType: 'SMOKE_ETAPA11_EVENT',
      aggregateType: 'SMOKE_ETAPA11',
      aggregateId: `smoke-${Date.now()}`,
      payload: { ok: true },
    },
  });

  const processados: string[] = [];
  const handler: OutboxHandler = async (evt) => {
    await sleep(150);
    processados.push(evt.id);
  };

  const outbox = new OutboxPublisher(handler, { intervalMs: 60_000 });
  outbox.start();
  await outbox.stop();

  const relido = await prisma.outboxEvent.findUnique({ where: { id: evento.id } });
  ok(processados.includes(evento.id), 'stop aguardou handler em andamento');
  ok(relido?.publicadoEm !== null, 'evento foi marcado como publicado antes do stop concluir');
}

async function main(): Promise<void> {
  console.log('═══ Smoke Etapa 11 · Performance e Confiabilidade ═══\n');

  const contaId = await setupConta();
  await smokePushBackoff(contaId);
  await smokeOutboxStop();

  await prisma.pacienteDispositivo.deleteMany({ where: { contaId } });
  await prisma.notificacaoPaciente.deleteMany({ where: { contaId } });
  await prisma.outboxEvent.deleteMany({ where: { aggregateType: 'SMOKE_ETAPA11' } });

  console.log(`\nAsserts: ${asserts}`);
  if (falhas > 0) {
    throw new Error(`Smoke Etapa 11 falhou: ${falhas} falha(s)`);
  }
  console.log('✅ Smoke Etapa 11 OK');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
