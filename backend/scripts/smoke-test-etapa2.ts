/**
 * Smoke test fim-a-fim da Etapa 2 (Recuperação de senha FECHAR 100%).
 *
 * Cobre as 10 brechas identificadas:
 *
 *   1. Rate limit por IP (5 req/15min/IP no esqueci-senha)
 *   2. Audit log em todas as tentativas (sucesso/falha/inválido/expirado)
 *   3. Purge cron deleta tokens expirados (TTL grace 24h)
 *   4. (Tela web — validada manualmente; este smoke valida o contrato HTTP)
 *   5. CPF checksum bloqueia "11111111111"
 *   6. Senha "12345678" rejeitada (NUMERICA_PURA / SEQUENCIA_COMUM)
 *   7. Timing-constant — esqueci-senha tem MIN_MS para conta inexistente
 *   8. Outros recovery tokens ativos são invalidados ao usar um
 *   9. Rate limit genérico Face 3 (30 req/15min/IP em login)
 *  10. Token brute force barrado por rate limit (10 req/15min/IP no redefinir)
 *
 * Uso: npx ts-node-dev --transpile-only scripts/smoke-test-etapa2.ts
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from '../src/infrastructure/database/prisma';
import { PrismaAuditLogger } from '../src/infrastructure/audit/PrismaAuditLogger';
import { PasswordRecoveryRateLimiter } from '../src/modules/paciente-app/infrastructure/PasswordRecoveryRateLimiter';
import { EsqueciSenhaPacienteUseCase } from '../src/modules/paciente-app/application/use-cases/EsqueciSenhaPacienteUseCase';
import { RedefinirSenhaPacienteUseCase } from '../src/modules/paciente-app/application/use-cases/RedefinirSenhaPacienteUseCase';
import {
  purgeRecoveryTokens,
} from '../src/modules/paciente-app/infrastructure/RecoveryTokenPurgeCron';
import type { IEmailService } from '../src/infrastructure/email/EmailService';
import type { IPasswordHasher } from '../src/domain/services/IPasswordHasher';
import { isCpfValido } from '../src/shared/cpf';
import { validarSenhaForte } from '../src/shared/senhaForte';
import { getCache } from '../src/infrastructure/cache/Cache';

/** Limpa todas as keys `rl:pa:*` no Redis (e in-memory fallback) entre cenários. */
async function limparRateLimitKeys(): Promise<void> {
  const cache = getCache();
  // Aguarda Redis ficar pronto (até 2s) — sem isso, run-em-frio cai no NoOp.
  const inicio = Date.now();
  while (!cache.isReady() && Date.now() - inicio < 2000) {
    await new Promise((r) => setTimeout(r, 50));
  }
  await cache.delByPrefix('rl:pa:');
}

// ─────────── Doubles ───────────

class FakeEmailService implements IEmailService {
  enviados: Array<{ to: string; subject: string; body: string }> = [];
  async enviar(opts: { to: string; subject: string; text?: string; html?: string }): Promise<void> {
    this.enviados.push({ to: opts.to, subject: opts.subject, body: opts.text ?? opts.html ?? '' });
  }
}

class BcryptHasher implements IPasswordHasher {
  hash(p: string): Promise<string> { return bcrypt.hash(p, 8); }
  compare(p: string, h: string): Promise<boolean> { return bcrypt.compare(p, h); }
}

// ─────────── Fixtures ───────────

const CPF_VALIDO = '11144477735';        // checksum válido (gerado)
const CPF_INVALIDO_TODOS_IGUAIS = '11111111111';
const CPF_INVALIDO_CHECKSUM = '12345678900';
const CPF_FMT = '111.444.777-35';
const EMAIL = 'maria.smoke@example.com';
const SENHA_INICIAL = 'X9k!2pQrZ7';

async function ensureConta(): Promise<{ id: string }> {
  let conta = await prisma.pacienteConta.findUnique({ where: { cpf: CPF_VALIDO } });
  if (!conta) {
    const hash = await bcrypt.hash(SENHA_INICIAL, 8);
    conta = await prisma.pacienteConta.create({
      data: {
        cpf: CPF_VALIDO,
        cpfFormatado: CPF_FMT,
        nome: 'MARIA SMOKE ETAPA 2',
        email: EMAIL,
        senhaHash: hash,
        ativo: true,
        senhaProvisoria: false,
      },
    });
  } else {
    // garante email + senha inicial
    const hash = await bcrypt.hash(SENHA_INICIAL, 8);
    await prisma.pacienteConta.update({
      where: { id: conta.id },
      data: { email: EMAIL, senhaHash: hash, ativo: true },
    });
  }
  return { id: conta.id };
}

async function limparTokensEAudits(contaId: string): Promise<void> {
  await prisma.pacienteRecoveryToken.deleteMany({ where: { contaId } });
  await prisma.auditoriaLog.deleteMany({
    where: { recurso: 'PacienteConta', recursoId: contaId },
  });
  await prisma.auditoriaLog.deleteMany({
    where: { recurso: 'PacienteConta', recursoId: null, acao: { contains: 'REDEFINICAO' } },
  });
}

// ─────────── Helpers ───────────

let falhas = 0;
function assert(label: string, ok: boolean, extra?: unknown): void {
  if (ok) console.log(`  ✓ ${label}`);
  else { console.log(`  ✗ ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`); falhas++; }
}

async function pegarUltimoTokenAtivo(contaId: string): Promise<{ id: string; tokenHash: string }> {
  const t = await prisma.pacienteRecoveryToken.findFirst({
    where: { contaId, usadoEm: null },
    orderBy: { criadoEm: 'desc' },
  });
  if (!t) throw new Error('Nenhum token ativo encontrado pra teste');
  return t;
}

// ─────────── Main ───────────

async function main(): Promise<void> {
  console.log('\n──── SMOKE TEST · Etapa 2 (Recuperação de Senha — 10 brechas) ────\n');

  const audit = new PrismaAuditLogger();
  const hasher = new BcryptHasher();
  const email = new FakeEmailService();

  const conta = await ensureConta();
  await limparTokensEAudits(conta.id);
  await limparRateLimitKeys();
  console.log(`✓ Pré-requisitos: contaId=${conta.id}\n`);

  // ─────────── 1. Validador CPF (unit) ───────────
  console.log('── BRECHA 5 · Validador CPF (checksum) ──');
  assert('CPF válido aceito', isCpfValido(CPF_VALIDO));
  assert('CPF todos iguais rejeitado', !isCpfValido(CPF_INVALIDO_TODOS_IGUAIS));
  assert('CPF checksum errado rejeitado', !isCpfValido(CPF_INVALIDO_CHECKSUM));
  assert('CPF vazio rejeitado', !isCpfValido(''));
  assert('CPF curto rejeitado', !isCpfValido('12345'));

  // ─────────── 2. Validador senha forte (unit) ───────────
  console.log('\n── BRECHA 6 · Validador senha forte ──');
  assert('Senha forte aceita', validarSenhaForte('X9k!2pQrZ7') === null);
  assert('Numérica pura rejeitada', validarSenhaForte('12345678') !== null);
  assert('Sequência comum rejeitada', validarSenhaForte('password') !== null);
  assert('Curta rejeitada', validarSenhaForte('abc') !== null);
  assert('CPF como senha rejeitado', validarSenhaForte(CPF_VALIDO, { cpf: CPF_VALIDO }) !== null);
  assert('Caractere repetido rejeitado', validarSenhaForte('aaaaaaaa') !== null);

  // ─────────── 3. Esqueci-senha — anti-enumeration + timing-constant + audit ───────────
  console.log('\n── BRECHA 1, 2, 7 · Rate limit + audit + timing-constant ──');

  // Cada cenário precisa de IP único pra não compartilhar rate limit.
  let rateLimiter = new PasswordRecoveryRateLimiter();
  const esqueciUC = new EsqueciSenhaPacienteUseCase(email, audit, rateLimiter);

  // 3.1 — CPF não existe → silencioso + audit + tempo >= MIN_MS
  const t0 = Date.now();
  await esqueciUC.exec('99999999999', { ip: '10.0.0.1', userAgent: 'smoke-cpf-naoexiste' });
  const dt0 = Date.now() - t0;
  assert('Sem throw quando CPF não existe', true);
  assert(`Timing >= 120ms (foi ${dt0}ms)`, dt0 >= 110); // tolerância 10ms

  const auditCpfNaoExiste = await prisma.auditoriaLog.findFirst({
    where: { acao: 'SOLICITAR_REDEFINICAO_SENHA_CPF_INVALIDO' },
    orderBy: { criadoEm: 'desc' },
  });
  assert('Audit gravado para CPF inválido (checksum)', auditCpfNaoExiste !== null);

  // 3.2 — CPF malformado (checksum falha)
  await esqueciUC.exec(CPF_INVALIDO_CHECKSUM, { ip: '10.0.0.2', userAgent: 'smoke-cpf-checksum' });
  const auditChecksum = await prisma.auditoriaLog.findFirst({
    where: { acao: 'SOLICITAR_REDEFINICAO_SENHA_CPF_INVALIDO', ip: '10.0.0.2' },
  });
  assert('Audit gravado para CPF checksum errado', auditChecksum !== null);

  // 3.3 — CPF válido e existente → token gerado + email + audit OK
  await esqueciUC.exec(CPF_VALIDO, { ip: '10.0.0.3', userAgent: 'smoke-ok' });
  assert('Email enviado pelo FakeEmailService', email.enviados.length === 1);
  const link = email.enviados[0]?.body ?? '';
  const tokenMatch = /\?t=([a-f0-9]{64})/.exec(link);
  assert('Email contém link com token 64 hex', tokenMatch !== null);
  const tokenPlano = tokenMatch?.[1] ?? '';
  assert(
    'Token gerado tem 64 chars hex',
    tokenPlano.length === 64 && /^[a-f0-9]{64}$/i.test(tokenPlano),
  );
  const auditOk = await prisma.auditoriaLog.findFirst({
    where: { acao: 'SOLICITAR_REDEFINICAO_SENHA_OK', recursoId: conta.id },
  });
  assert('Audit gravado para sucesso', auditOk !== null);

  // ─────────── 4. Rate limit por IP (sliding window) ───────────
  console.log('\n── BRECHA 1 · Rate limit por IP (5 req/15min) ──');
  // Limpa keys Redis pra começar fresh + usa CPFs DIFERENTES por req
  // (CPF rate limit é 3/h — se reusar, estoura antes do IP limit).
  await limparRateLimitKeys();
  rateLimiter = new PasswordRecoveryRateLimiter();
  const esqueciUC2 = new EsqueciSenhaPacienteUseCase(email, audit, rateLimiter);
  const IP_TESTE = '10.0.0.99';
  const cpfsDistintos = ['39053344705', '52998224725', '23454565800', '88248204606',
                         '11144477735', '32178911840', '79023514880', '63459187600'];
  let estouroIp = false;
  for (let i = 0; i < cpfsDistintos.length; i++) {
    try {
      await esqueciUC2.exec(cpfsDistintos[i]!, { ip: IP_TESTE, userAgent: 'smoke-flood' });
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code?: string }).code === 'RATE_LIMIT_EXCEDIDO'
      ) {
        estouroIp = true;
        assert(`Rate limit por IP estourou na tentativa #${i + 1} (esperado: 6ª)`, i + 1 >= 6 && i + 1 <= 7);
        break;
      }
      throw err;
    }
  }
  assert('Rate limit IP estourou em ≤ 8 tentativas', estouroIp);
  const auditThrottle = await prisma.auditoriaLog.findFirst({
    where: { acao: 'SOLICITAR_REDEFINICAO_SENHA_THROTTLED' },
    orderBy: { criadoEm: 'desc' },
  });
  assert('Audit gravado para throttle', auditThrottle !== null);

  // ─────────── 5. Redefinir-senha — validações + audit + multi-token revogação ───────────
  console.log('\n── BRECHA 8 · Outros tokens invalidados ao redefinir ──');

  // Gera 3 tokens pra mesma conta (limita Redis + IPs distintos)
  await limparTokensEAudits(conta.id);
  await limparRateLimitKeys();
  await prisma.pacienteRecoveryToken.deleteMany({ where: { contaId: conta.id } });
  rateLimiter = new PasswordRecoveryRateLimiter();
  const esqueciUC3 = new EsqueciSenhaPacienteUseCase(email, audit, rateLimiter);
  // 3 IPs distintos pra não estourar IP rate limit. CPF rate limit é 3/hora — bate certinho.
  email.enviados = [];
  await esqueciUC3.exec(CPF_VALIDO, { ip: '10.1.1.1', userAgent: 'a' });
  await esqueciUC3.exec(CPF_VALIDO, { ip: '10.1.1.2', userAgent: 'b' });
  await esqueciUC3.exec(CPF_VALIDO, { ip: '10.1.1.3', userAgent: 'c' });

  const tokensAtivos = await prisma.pacienteRecoveryToken.count({
    where: { contaId: conta.id, usadoEm: null },
  });
  assert(`3 tokens ativos gerados (foi ${tokensAtivos})`, tokensAtivos === 3);

  // Usa o último (mais recente) pra redefinir senha
  // Reconstruir token plano: pega o último email enviado e extrai
  const ultimoEmail = email.enviados[email.enviados.length - 1]?.body ?? '';
  const m3 = /\?t=([a-f0-9]{64})/.exec(ultimoEmail);
  if (!m3) throw new Error('Não achei token no último email');
  const tokenUsado = m3[1]!;

  const redefinirRl = new PasswordRecoveryRateLimiter();
  const redefinirUC = new RedefinirSenhaPacienteUseCase(hasher, audit, redefinirRl);
  await redefinirUC.exec(tokenUsado, 'NovaSenha!Forte2026', { ip: '10.2.2.2', userAgent: 'red' });

  const tokensAtivosDepois = await prisma.pacienteRecoveryToken.count({
    where: { contaId: conta.id, usadoEm: null },
  });
  assert(`Após redefinir, 0 tokens ativos (foi ${tokensAtivosDepois})`, tokensAtivosDepois === 0);
  const tokensUsados = await prisma.pacienteRecoveryToken.count({
    where: { contaId: conta.id, usadoEm: { not: null } },
  });
  assert(`Todos 3 tokens marcados como usados (foi ${tokensUsados})`, tokensUsados === 3);

  const auditRedefOk = await prisma.auditoriaLog.findFirst({
    where: { acao: 'REDEFINIR_SENHA_OK', recursoId: conta.id },
  });
  assert('Audit REDEFINIR_SENHA_OK presente', auditRedefOk !== null);
  const payloadOk = auditRedefOk?.payload as
    | { outrosTokensInvalidados?: number; sessoesRevogadas?: number }
    | null;
  assert(
    `Audit payload: outrosTokensInvalidados=${payloadOk?.outrosTokensInvalidados}`,
    payloadOk?.outrosTokensInvalidados === 2,
  );

  // ─────────── 6. Redefinir — token usado, expirado, malformado ───────────
  console.log('\n── BRECHA 2 · Audit em token usado/expirado/malformado ──');

  // Tentar redefinir com mesmo token usado → erro + audit
  try {
    await redefinirUC.exec(tokenUsado, 'OutraSenhaForte2026', { ip: '10.2.2.3' });
    assert('Token usado bloqueado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`Token já usado: erro TOKEN_JA_USADO (foi ${code})`, code === 'TOKEN_JA_USADO');
  }
  const auditJaUsado = await prisma.auditoriaLog.findFirst({
    where: { acao: 'REDEFINIR_SENHA_TOKEN_JA_USADO', recursoId: conta.id },
  });
  assert('Audit TOKEN_JA_USADO gravado', auditJaUsado !== null);

  // Token malformado
  try {
    await redefinirUC.exec('curtinho', 'NovaSenha!Forte2026', { ip: '10.2.2.4' });
    assert('Token curtinho bloqueado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`Token curto: erro TOKEN_INVALIDO (foi ${code})`, code === 'TOKEN_INVALIDO');
  }

  // Token expirado (forja: cria um token e seta expiraEm no passado)
  const tokenExpirado = crypto.randomBytes(32).toString('hex');
  const tokenExpiradoHash = crypto.createHash('sha256').update(tokenExpirado).digest('hex');
  await prisma.pacienteRecoveryToken.create({
    data: {
      contaId: conta.id,
      tokenHash: tokenExpiradoHash,
      expiraEm: new Date(Date.now() - 60_000), // 1 min atrás
    },
  });
  try {
    await redefinirUC.exec(tokenExpirado, 'NovaSenha!Forte2026', { ip: '10.2.2.5' });
    assert('Token expirado bloqueado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`Token expirado: erro TOKEN_EXPIRADO (foi ${code})`, code === 'TOKEN_EXPIRADO');
  }
  const auditExpirado = await prisma.auditoriaLog.findFirst({
    where: { acao: 'REDEFINIR_SENHA_TOKEN_EXPIRADO', recursoId: conta.id },
  });
  assert('Audit TOKEN_EXPIRADO gravado', auditExpirado !== null);

  // ─────────── 7. Rate limit redefinir-senha por IP ───────────
  console.log('\n── BRECHA 10 · Rate limit redefinir-senha (10 req/15min/IP) ──');
  await limparRateLimitKeys();
  const rlRedef = new PasswordRecoveryRateLimiter();
  const redefUC2 = new RedefinirSenhaPacienteUseCase(hasher, audit, rlRedef);
  let estouroRedef = false;
  for (let i = 0; i < 15; i++) {
    try {
      // Token aleatório válido em formato — falha em "TOKEN_INVALIDO" se passar do rl
      await redefUC2.exec(crypto.randomBytes(32).toString('hex'), 'NovaSenha!Forte2026', {
        ip: '10.3.3.3',
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'RATE_LIMIT_EXCEDIDO') {
        estouroRedef = true;
        assert(`Rate limit redefinir-senha estourou na tentativa #${i + 1}`, i >= 10);
        break;
      }
      // TOKEN_INVALIDO é esperado nas primeiras tentativas
      if (code !== 'TOKEN_INVALIDO') throw err;
    }
  }
  assert('Rate limit redefinir-senha estoura em até 15 tentativas', estouroRedef);

  // ─────────── 8. Rate limit genérico Face 3 ───────────
  console.log('\n── BRECHA 9 · Rate limit genérico Face 3 ──');
  await limparRateLimitKeys();
  const rlGen = new PasswordRecoveryRateLimiter();
  let estouroGen = false;
  for (let i = 0; i < 40; i++) {
    try {
      await rlGen.consumirGenericoFace3('10.4.4.4', 'login');
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'RATE_LIMIT_EXCEDIDO') {
        estouroGen = true;
        assert(`Genérico Face 3 estourou na tentativa #${i + 1}`, i >= 30);
        break;
      }
      throw err;
    }
  }
  assert('Rate limit genérico Face 3 estoura em ≤ 40 tentativas', estouroGen);

  // ─────────── 9. Purge cron ───────────
  console.log('\n── BRECHA 3 · Purge cron ──');
  // Cria token expirado HÁ MAIS DE 24H (grace)
  await prisma.pacienteRecoveryToken.create({
    data: {
      contaId: conta.id,
      tokenHash: crypto.randomBytes(32).toString('hex'),
      expiraEm: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h atrás
    },
  });
  // Cria token usado HÁ MAIS DE 24H
  await prisma.pacienteRecoveryToken.create({
    data: {
      contaId: conta.id,
      tokenHash: crypto.randomBytes(32).toString('hex'),
      expiraEm: new Date(Date.now() + 60 * 60 * 1000),
      usadoEm: new Date(Date.now() - 48 * 60 * 60 * 1000),
    },
  });
  // Cria token recente (não deve ser purgado)
  const tokenRecente = await prisma.pacienteRecoveryToken.create({
    data: {
      contaId: conta.id,
      tokenHash: crypto.randomBytes(32).toString('hex'),
      expiraEm: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const r = await purgeRecoveryTokens();
  assert(`Purge deletou ${r.deletadosExpirados} expirado(s)`, r.deletadosExpirados >= 1);
  assert(`Purge deletou ${r.deletadosUsados} usado(s)`, r.deletadosUsados >= 1);
  const ainda = await prisma.pacienteRecoveryToken.findUnique({ where: { id: tokenRecente.id } });
  assert('Token recente NÃO foi purgado (dentro do grace)', ainda !== null);

  // ─────────── PATCH 0.11.1 · Race no token consumption ───────────
  console.log('\n── PATCH 0.11.1 · Race no token consumption (atomic check-and-set) ──');
  await prisma.pacienteRecoveryToken.deleteMany({ where: { contaId: conta.id } });
  await limparRateLimitKeys();

  // Gera token único pra teste de race
  const tokenRaceRl = new PasswordRecoveryRateLimiter();
  const ucEsq = new EsqueciSenhaPacienteUseCase(email, audit, tokenRaceRl);
  email.enviados = [];
  await ucEsq.exec(CPF_VALIDO, { ip: '10.9.9.1', userAgent: 'race-test' });
  const lastEmail = email.enviados[email.enviados.length - 1]?.body ?? '';
  const mRace = /\?t=([a-f0-9]{64})/.exec(lastEmail);
  if (!mRace) throw new Error('token race: não achei token');
  const tokenRace = mRace[1]!;

  const rlRace = new PasswordRecoveryRateLimiter();
  const ucRedef = new RedefinirSenhaPacienteUseCase(hasher, audit, rlRace);

  // 2 requests simultâneos com MESMO token
  const [r1, r2] = await Promise.allSettled([
    ucRedef.exec(tokenRace, 'NovaSenha!Race2026A', { ip: '10.9.9.2' }),
    ucRedef.exec(tokenRace, 'NovaSenha!Race2026B', { ip: '10.9.9.3' }),
  ]);
  const ok = [r1, r2].filter((r) => r.status === 'fulfilled');
  const erros = [r1, r2].filter((r) => r.status === 'rejected');
  assert('Race: exatamente 1 sucesso (uso único respeitado)', ok.length === 1);
  assert('Race: exatamente 1 erro (segundo bloqueado)', erros.length === 1);
  const errCode = (erros[0] as PromiseRejectedResult | undefined)?.reason?.code;
  assert(
    `Race: erro = TOKEN_JA_USADO (recebido: ${errCode})`,
    errCode === 'TOKEN_JA_USADO',
  );

  // Conta de audit logs: deve ter 1 OK + 1 RACE_DETECTADA (ou outro bloqueio)
  const auditRace = await prisma.auditoriaLog.findFirst({
    where: { acao: 'REDEFINIR_SENHA_TOKEN_RACE_DETECTADA' },
  });
  const auditJaUsadoOuRace = auditRace !== null || await prisma.auditoriaLog.count({
    where: {
      OR: [
        { acao: 'REDEFINIR_SENHA_TOKEN_JA_USADO' },
        { acao: 'REDEFINIR_SENHA_TOKEN_RACE_DETECTADA' },
      ],
      recursoId: conta.id,
    },
  }) >= 1;
  assert('Audit RACE_DETECTADA ou TOKEN_JA_USADO gravado', auditJaUsadoOuRace);

  // Cleanup final
  await prisma.pacienteRecoveryToken.deleteMany({ where: { contaId: conta.id } });
  await prisma.auditoriaLog.deleteMany({ where: { recursoId: conta.id, recurso: 'PacienteConta' } });

  console.log(
    `\n${falhas === 0 ? '✓ TODOS OS ASSERTS PASSARAM (10 brechas + patch 0.11.1)' : `✗ ${falhas} FALHAS`}\n`,
  );
  process.exit(falhas === 0 ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
