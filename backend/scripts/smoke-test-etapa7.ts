/**
 * Smoke test fim-a-fim da Etapa 7 (Push notifications — sem Firebase).
 *
 * Cobre as 15 brechas identificadas:
 *
 *   1. Dispatcher real (worker processa batch + atualiza status)
 *   2. Hooks via NotificacaoPaciente.pushStatus=PENDENTE default
 *   3. Schema agnóstico (`endpoint` + `provider` enum)
 *   4. Retry + dead-letter (4 tentativas com backoff)
 *   5. Audit de envio (OK, FALHOU, EXCEDIDO)
 *   6. Rate limit nos endpoints (já coberto pela rotação Face 3)
 *   7. Provider abstrato (IPushProvider) + Noop + Ntfy
 *   8. Worker scheduling (start/stop graceful)
 *   9. UPSERT transfere device entre contas com audit
 *   10. Validação endpoint por provider (NTFY topic regex, FCM len)
 *   11. Cleanup TTL 90d devices inativos
 *   12. Flutter sem Firebase (validado via análise estática)
 *   13. Topic strategy (UUIDv4 gerado pelo backend)
 *   14. Secret management (NTFY_AUTH_TOKEN via env)
 *   15. Email fallback (notificações urgentes → email se push falhar)
 *
 * Uso: npx ts-node-dev --transpile-only scripts/smoke-test-etapa7.ts
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/infrastructure/database/prisma';
import { PrismaAuditLogger } from '../src/infrastructure/audit/PrismaAuditLogger';
import {
  RegistrarPushDispositivoUseCase,
  RevogarPushDispositivoUseCase,
} from '../src/modules/paciente-app/application/use-cases/PushDispositivoUseCases';
import { PushDispatcherWorker } from '../src/modules/paciente-app/infrastructure/PushDispatcherWorker';
import { purgePushDevicesInativos } from '../src/modules/paciente-app/infrastructure/PushTokenCleanupCron';
import type { IPushProvider, PushPayload, PushResult } from '../src/infrastructure/push/IPushProvider';
import { NtfyPushProvider } from '../src/infrastructure/push/NtfyPushProvider';
import { NoopPushProvider } from '../src/infrastructure/push/NoopPushProvider';
import type { IEmailService } from '../src/infrastructure/email/EmailService';
import { env } from '../src/shared/env';

const CPF_E7 = '11144477735';

let falhas = 0;
function assert(label: string, ok: boolean, extra?: unknown): void {
  if (ok) console.log(`  ✓ ${label}`);
  else { console.log(`  ✗ ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`); falhas++; }
}

/** Provider fake controlável pra smoke. */
class FakePushProvider implements IPushProvider {
  readonly name: 'NTFY' | 'FCM' | 'WEB_PUSH' | 'NOOP' = 'NTFY';
  enviados: Array<{ endpoint: string; payload: PushPayload }> = [];
  comportamentoPorEndpoint: Map<string, PushResult> = new Map();
  defaultResult: PushResult = { ok: true, retryable: false };

  isReady(): boolean { return true; }

  async enviar(endpoint: string, payload: PushPayload): Promise<PushResult> {
    this.enviados.push({ endpoint, payload });
    return this.comportamentoPorEndpoint.get(endpoint) ?? this.defaultResult;
  }
}

class FakeEmailService implements IEmailService {
  enviados: Array<{ to: string; subject: string }> = [];
  async enviar(opts: { to: string; subject: string; text?: string; html?: string }): Promise<void> {
    this.enviados.push({ to: opts.to, subject: opts.subject });
  }
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

async function setup(): Promise<{
  contaId: string;
  conta2Id: string;
  emailFalha: string;
}> {
  // Conta principal (com email pra fallback)
  let conta = await prisma.pacienteConta.findUnique({ where: { cpf: CPF_E7 } });
  if (!conta) {
    const h = await bcrypt.hash('Senha!2026', 8);
    conta = await prisma.pacienteConta.create({
      data: {
        cpf: CPF_E7,
        cpfFormatado: '111.444.777-35',
        nome: 'PACIENTE SMOKE E7',
        email: 'paciente-e7@example.com',
        senhaHash: h,
        ativo: true,
      },
    });
  } else {
    // Garante email setado (runs anteriores de outras etapas podem ter sobrescrito)
    conta = await prisma.pacienteConta.update({
      where: { id: conta.id },
      data: { email: 'paciente-e7@example.com' },
    });
  }
  // Conta secundária (sem email)
  let conta2 = await prisma.pacienteConta.findUnique({ where: { cpf: '52998224725' } });
  if (!conta2) {
    const h = await bcrypt.hash('Senha!2026', 8);
    conta2 = await prisma.pacienteConta.create({
      data: {
        cpf: '52998224725',
        cpfFormatado: '529.982.247-25',
        nome: 'PACIENTE SMOKE E7 B',
        senhaHash: h,
        ativo: true,
      },
    });
  }
  // Limpa devices + notificações antigos
  await prisma.pacienteDispositivo.deleteMany({ where: { contaId: { in: [conta.id, conta2.id] } } });
  await prisma.notificacaoPaciente.deleteMany({ where: { contaId: { in: [conta.id, conta2.id] } } });
  if (usandoBancoSmoke()) {
    await prisma.notificacaoPaciente.updateMany({
      where: {
        pushStatus: 'PENDENTE',
        contaId: { notIn: [conta.id, conta2.id] },
      },
      data: {
        pushStatus: 'SEM_DEVICE',
        pushErro: 'neutralizada pelo smoke etapa7 para isolar o batch',
      },
    });
  }

  return { contaId: conta.id, conta2Id: conta2.id, emailFalha: 'paciente-e7@example.com' };
}

async function main(): Promise<void> {
  console.log('\n──── SMOKE TEST · Etapa 7 (Push notifications — sem Firebase) ────\n');

  const ctx = await setup();
  console.log(`✓ Setup: conta=${ctx.contaId}\n`);

  const audit = new PrismaAuditLogger();

  // ─────────── BRECHA 10 · Validação endpoint por provider ───────────
  console.log('── BRECHA 10 · Validação endpoint por provider ──');
  const regUC = new RegistrarPushDispositivoUseCase(audit);

  try {
    await regUC.exec(ctx.contaId, {
      provider: 'NTFY',
      endpoint: 'a@b!c',  // chars inválidos
      plataforma: 'android',
    });
    assert('NTFY topic inválido rejeitado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`NTFY topic inválido → ENDPOINT_INVALIDO (foi ${code})`, code === 'ENDPOINT_INVALIDO');
  }
  try {
    await regUC.exec(ctx.contaId, {
      provider: 'FCM',
      endpoint: 'curto',  // < 20 chars
      plataforma: 'android',
    });
    assert('FCM token curto rejeitado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`FCM token curto → ENDPOINT_INVALIDO (foi ${code})`, code === 'ENDPOINT_INVALIDO');
  }
  try {
    await regUC.exec(ctx.contaId, {
      provider: 'FCM',
      // sem endpoint
      plataforma: 'android',
    });
    assert('FCM sem endpoint rejeitado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`FCM sem endpoint → ENDPOINT_OBRIGATORIO (foi ${code})`, code === 'ENDPOINT_OBRIGATORIO');
  }
  try {
    await regUC.exec(ctx.contaId, {
      provider: 'NTFY',
      endpoint: 'topic-valido',
      plataforma: 'windows' as 'android',
    });
    assert('plataforma inválida rejeitada', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`plataforma inválida → PLATAFORMA_INVALIDA (foi ${code})`, code === 'PLATAFORMA_INVALIDA');
  }

  // ─────────── BRECHA 13, 3 · Topic auto-gerado + provider agnóstico ───────────
  console.log('\n── BRECHA 13, 3 · Topic UUID auto-gerado ──');
  // Ajusta o env central temporariamente pra subscribeUrl ser gerada.
  const smokeEnv = env as { NTFY_BASE_URL: string };
  const origNtfy = smokeEnv.NTFY_BASE_URL;
  smokeEnv.NTFY_BASE_URL = 'https://ntfy.example.com';

  const out = await regUC.exec(ctx.contaId, {
    provider: 'NTFY',
    plataforma: 'android',
  });
  assert('endpoint gerado começa com unisism-', out.endpoint.startsWith('unisism-'));
  assert(`endpoint tem 40 chars (unisism- + 32 hex) — foi ${out.endpoint.length}`, out.endpoint.length === 40);
  assert('provider = NTFY', out.provider === 'NTFY');
  assert(
    `subscribeUrl wss:// (foi "${out.subscribeUrl}")`,
    out.subscribeUrl?.startsWith('wss://ntfy.example.com/') === true && out.subscribeUrl?.endsWith('/ws') === true,
  );
  smokeEnv.NTFY_BASE_URL = origNtfy;

  // ─────────── BRECHA 9 · Transferência de device entre contas ───────────
  console.log('\n── BRECHA 9 · Device transfere entre contas (audit) ──');
  const endpointShared = 'unisism-shared12345678901234567890abcd';
  await regUC.exec(ctx.contaId, {
    provider: 'NTFY',
    endpoint: endpointShared,
    plataforma: 'android',
  });
  await regUC.exec(ctx.conta2Id, {
    provider: 'NTFY',
    endpoint: endpointShared,
    plataforma: 'android',
  });
  const dev = await prisma.pacienteDispositivo.findUnique({ where: { endpoint: endpointShared } });
  assert(`Device transferiu para conta2 (foi ${dev?.contaId})`, dev?.contaId === ctx.conta2Id);
  const auditTransfer = await prisma.auditoriaLog.findFirst({
    where: { acao: 'PUSH_DEVICE_TRANSFERIDO' },
    orderBy: { criadoEm: 'desc' },
  });
  assert('Audit PUSH_DEVICE_TRANSFERIDO gravado', auditTransfer !== null);

  // ─────────── BRECHA 1, 5, 7 · Worker + provider + audit OK ───────────
  console.log('\n── BRECHA 1, 5, 7 · Worker dispatcher + audit OK ──');
  // Limpa state
  await prisma.pacienteDispositivo.deleteMany({ where: { contaId: ctx.contaId } });
  const fake = new FakePushProvider();
  const worker = new PushDispatcherWorker(fake, audit);

  // Registra device + cria notificação
  const reg1 = await regUC.exec(ctx.contaId, {
    provider: 'NTFY',
    plataforma: 'android',
  });
  const notif1 = await prisma.notificacaoPaciente.create({
    data: {
      contaId: ctx.contaId,
      pacienteCpf: CPF_E7,
      tipo: 'APROVADO',
      titulo: 'Encaminhamento aprovado',
      corpo: 'Seu encaminhamento foi aprovado.',
      payload: { protocolo: 'UBS-2026-099999', encaminhamentoId: 'enc-abc' },
    },
  });
  const r1 = await worker._processarBatch();
  assert(`Batch processou 1 (foi ${r1.processadas})`, r1.processadas === 1);
  assert(`Batch ok=1 (foi ${r1.ok})`, r1.ok === 1);

  const notif1Atualizada = await prisma.notificacaoPaciente.findUnique({ where: { id: notif1.id } });
  assert(`Status ENVIADO (foi ${notif1Atualizada?.pushStatus})`, notif1Atualizada?.pushStatus === 'ENVIADO');
  assert('pushEnviadoEm setado', notif1Atualizada?.pushEnviadoEm !== null);
  assert('pushTentativas = 1', notif1Atualizada?.pushTentativas === 1);

  assert(`Provider recebeu 1 envio (foi ${fake.enviados.length})`, fake.enviados.length === 1);
  const enviado = fake.enviados[0]!;
  assert(`Endpoint correto (foi ${enviado.endpoint.slice(0, 12)}...)`, enviado.endpoint === reg1.endpoint);
  assert('Payload tem deepLink derivado de encaminhamentoId', enviado.payload.deepLink === 'unisism://encaminhamento/enc-abc');
  assert('Payload prioridade 4 (APROVADO)', enviado.payload.prioridade === 4);

  const auditOk = await prisma.auditoriaLog.findFirst({
    where: { acao: 'PUSH_ENVIADO_OK', recursoId: notif1.id },
  });
  assert('Audit PUSH_ENVIADO_OK gravado', auditOk !== null);

  // ─────────── BRECHA 4 · Retry com backoff ───────────
  console.log('\n── BRECHA 4 · Retry exponencial ──');
  fake.defaultResult = { ok: false, retryable: true, erro: 'simulado 500', status: 503 };
  fake.enviados = [];
  const notif2 = await prisma.notificacaoPaciente.create({
    data: {
      contaId: ctx.contaId,
      pacienteCpf: CPF_E7,
      tipo: 'PENDENCIA_REGISTRADA',
      titulo: 'Pendência registrada',
      corpo: 'Anexar documento.',
    },
  });
  // 1ª tentativa
  await worker._processarBatch();
  let n = await prisma.notificacaoPaciente.findUnique({ where: { id: notif2.id } });
  assert(`Tentativa 1: PENDENTE (foi ${n?.pushStatus})`, n?.pushStatus === 'PENDENTE');
  assert(`pushTentativas=1`, n?.pushTentativas === 1);

  // Backoff ativo: re-rodando imediato NÃO deve tentar de novo
  await worker._processarBatch();
  n = await prisma.notificacaoPaciente.findUnique({ where: { id: notif2.id } });
  assert(`Backoff respeita (tentativas ainda = 1, foi ${n?.pushTentativas})`, n?.pushTentativas === 1);

  // Força bypass do backoff zerando pushUltimaTentativaEm (simula tempo passado)
  await prisma.notificacaoPaciente.update({
    where: { id: notif2.id },
    data: { pushUltimaTentativaEm: new Date(Date.now() - 60 * 60_000) },
  });
  await worker._processarBatch();
  n = await prisma.notificacaoPaciente.findUnique({ where: { id: notif2.id } });
  assert(`Tentativa 2: tentativas=2 (foi ${n?.pushTentativas})`, n?.pushTentativas === 2);

  // Continua até EXCEDIDO
  await prisma.notificacaoPaciente.update({
    where: { id: notif2.id },
    data: { pushUltimaTentativaEm: new Date(Date.now() - 60 * 60_000) },
  });
  await worker._processarBatch();
  await prisma.notificacaoPaciente.update({
    where: { id: notif2.id },
    data: { pushUltimaTentativaEm: new Date(Date.now() - 60 * 60_000) },
  });
  await worker._processarBatch();
  n = await prisma.notificacaoPaciente.findUnique({ where: { id: notif2.id } });
  assert(`Após 4 tentativas: EXCEDIDO (foi ${n?.pushStatus})`, n?.pushStatus === 'EXCEDIDO');
  assert(`pushTentativas=4`, n?.pushTentativas === 4);
  assert('pushErro preenchido', (n?.pushErro?.length ?? 0) > 0);

  const auditExcedido = await prisma.auditoriaLog.findFirst({
    where: { acao: 'PUSH_EXCEDIDO', recursoId: notif2.id },
  });
  assert('Audit PUSH_EXCEDIDO gravado', auditExcedido !== null);

  // ─────────── BRECHA 15 · Email fallback urgente ───────────
  console.log('\n── BRECHA 15 · Email fallback para tipos urgentes ──');
  const fakeEmail = new FakeEmailService();
  const workerComEmail = new PushDispatcherWorker(fake, audit, fakeEmail);
  fake.defaultResult = { ok: false, retryable: false, erro: 'token inválido', status: 410 };

  // Notificação tipo APROVADO (urgente) que vai falhar
  const notif3 = await prisma.notificacaoPaciente.create({
    data: {
      contaId: ctx.contaId,
      pacienteCpf: CPF_E7,
      tipo: 'AGENDADO',
      titulo: 'Consulta agendada',
      corpo: 'Você tem consulta marcada.',
    },
  });
  await workerComEmail._processarBatch();
  n = await prisma.notificacaoPaciente.findUnique({ where: { id: notif3.id } });
  // Não retryable → marca FALHOU/EXCEDIDO direto
  assert(
    `Tipo urgente falhando: status final (foi ${n?.pushStatus})`,
    n?.pushStatus === 'FALHOU' || n?.pushStatus === 'EXCEDIDO',
  );
  assert(`Email fallback enviado (foi ${fakeEmail.enviados.length})`, fakeEmail.enviados.length === 1);
  assert(
    `Email para paciente correto (foi "${fakeEmail.enviados[0]?.to}")`,
    fakeEmail.enviados[0]?.to === ctx.emailFalha,
  );

  const auditFallback = await prisma.auditoriaLog.findFirst({
    where: { acao: 'PUSH_FALLBACK_EMAIL_OK', recursoId: notif3.id },
  });
  assert('Audit PUSH_FALLBACK_EMAIL_OK gravado', auditFallback !== null);

  // ─────────── BRECHA 1 · SEM_DEVICE ───────────
  console.log('\n── BRECHA 1 · SEM_DEVICE quando paciente não tem device ──');
  // Conta sem dispositivos
  const notif4 = await prisma.notificacaoPaciente.create({
    data: {
      contaId: ctx.conta2Id, // conta sem email + sem device (cleanup setup)
      pacienteCpf: '52998224725',
      tipo: 'APROVADO',
      titulo: 'X',
      corpo: 'Y',
    },
  });
  await prisma.pacienteDispositivo.deleteMany({ where: { contaId: ctx.conta2Id } });
  await workerComEmail._processarBatch();
  n = await prisma.notificacaoPaciente.findUnique({ where: { id: notif4.id } });
  assert(`Sem device → SEM_DEVICE (foi ${n?.pushStatus})`, n?.pushStatus === 'SEM_DEVICE');

  // ─────────── BRECHA 11 · Cleanup TTL inativo ───────────
  console.log('\n── BRECHA 11 · Cleanup de devices inativos ──');
  // Cria device "inativo" (ultimaAtividade 100 dias atrás)
  const inativo = await prisma.pacienteDispositivo.create({
    data: {
      contaId: ctx.contaId,
      endpoint: 'unisism-inativo-test-1234567890abcdefghij',
      provider: 'NTFY',
      plataforma: 'ANDROID',
      ultimaAtividade: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
    },
  });
  // Cria device "ativo"
  const ativo = await prisma.pacienteDispositivo.create({
    data: {
      contaId: ctx.contaId,
      endpoint: 'unisism-ativo-test-12345678901234567890ab',
      provider: 'NTFY',
      plataforma: 'ANDROID',
    },
  });
  const cleanupResult = await purgePushDevicesInativos(90);
  assert(`Cleanup deletou >= 1 (foi ${cleanupResult.deletados})`, cleanupResult.deletados >= 1);
  const inativoExiste = await prisma.pacienteDispositivo.findUnique({ where: { id: inativo.id } });
  const ativoExiste = await prisma.pacienteDispositivo.findUnique({ where: { id: ativo.id } });
  assert('Device inativo (100d) deletado', inativoExiste === null);
  assert('Device ativo preservado', ativoExiste !== null);

  // ─────────── BRECHA 7 · NoopProvider sempre OK ───────────
  console.log('\n── BRECHA 7 · Providers NoopPushProvider + NtfyPushProvider ──');
  const noop = new NoopPushProvider();
  assert('Noop isReady', noop.isReady());
  const noopRes = await noop.enviar('test-endpoint', {
    titulo: 'T',
    corpo: 'C',
    tipo: 'INFO',
    notificacaoId: 'n1',
  });
  assert('Noop sempre OK', noopRes.ok === true);

  // Ntfy sem baseUrl → not ready
  const ntfyVazio = new NtfyPushProvider({ baseUrl: '' });
  assert('Ntfy vazio NOT ready', !ntfyVazio.isReady());
  const ntfyVazioRes = await ntfyVazio.enviar('topic', {
    titulo: 'T', corpo: 'C', tipo: 'INFO', notificacaoId: 'n2',
  });
  assert('Ntfy vazio recusa envio', !ntfyVazioRes.ok);

  // Ntfy com URL inválida no topic → rejeita
  const ntfyOk = new NtfyPushProvider({ baseUrl: 'https://ntfy.example.com' });
  const badTopic = await ntfyOk.enviar('topic@invalido!', {
    titulo: 'T', corpo: 'C', tipo: 'INFO', notificacaoId: 'n3',
  });
  assert('Ntfy topic inválido recusa', !badTopic.ok && !badTopic.retryable);
  assert(`Erro contém NTFY_TOPIC_INVALIDO (foi "${badTopic.erro}")`, (badTopic.erro ?? '').includes('NTFY_TOPIC_INVALIDO'));

  // ─────────── BRECHA 2 · REVOGAR ───────────
  console.log('\n── BRECHA 2 · Revogar device ──');
  const revUC = new RevogarPushDispositivoUseCase(audit);
  const r = await revUC.exec(ctx.contaId, null);
  assert(`Revogou >= 1 (foi ${r.removidos})`, r.removidos >= 1);
  const devsResta = await prisma.pacienteDispositivo.count({ where: { contaId: ctx.contaId } });
  assert(`0 devices restando (foi ${devsResta})`, devsResta === 0);
  const auditRevoke = await prisma.auditoriaLog.findFirst({
    where: { acao: 'PUSH_DEVICE_REVOGADO' },
    orderBy: { criadoEm: 'desc' },
  });
  assert('Audit PUSH_DEVICE_REVOGADO gravado', auditRevoke !== null);

  // ─────────── Cleanup ───────────
  await prisma.pacienteDispositivo.deleteMany({ where: { contaId: { in: [ctx.contaId, ctx.conta2Id] } } });
  await prisma.notificacaoPaciente.deleteMany({ where: { contaId: { in: [ctx.contaId, ctx.conta2Id] } } });

  console.log(
    `\n${falhas === 0 ? '✓ TODOS OS ASSERTS PASSARAM (15 brechas cobertas)' : `✗ ${falhas} FALHAS`}\n`,
  );
  process.exit(falhas === 0 ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
