/**
 * Smoke test E2E — Etapa 9 (refresh token rotativo do paciente · v0.18.0).
 *
 * Cobre os cenários críticos:
 *   1. Login emite par (access + refresh)
 *   2. Refresh OK → novo par, antigo marcado como usado + link na cadeia
 *   3. Refresh com refresh JÁ usado → REUSE_DETECTED + revoga toda cadeia
 *   4. Refresh expirado → 401 REFRESH_TOKEN_EXPIRADO
 *   5. Refresh revogado (logout) → 401 REFRESH_TOKEN_REVOGADO
 *   6. Refresh inválido (não existe) → 401 REFRESH_TOKEN_INVALIDO
 *   7. Conta desativada → 403 CONTA_DESATIVADA + token revogado
 *   8. Logout revoga TODOS os refresh tokens vivos da conta
 *   9. Audit log gravado em rotação + reuse detection
 *  10. Plaintext NUNCA aparece no DB (sempre só hash)
 *
 * Uso:
 *   npx ts-node-dev --transpile-only scripts/smoke-test-etapa9.ts
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/infrastructure/database/prisma';
import { PrismaAuditLogger } from '../src/infrastructure/audit/PrismaAuditLogger';
import { LoginPacienteUseCase } from '../src/modules/paciente-app/application/use-cases/LoginPacienteUseCase';
import { RefreshTokenPacienteUseCase } from '../src/modules/paciente-app/application/use-cases/RefreshTokenPacienteUseCase';
import { BcryptPasswordHasher } from '../src/infrastructure/security/BcryptPasswordHasher';

const CPF_TESTE = '12345678909';
const SENHA = 'TesteRefresh#1';

let asserts = 0;
let falhas = 0;
function ok(cond: unknown, msg: string) {
  asserts++;
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    falhas++;
    console.log(`  ✗ ${msg}`);
  }
}
function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

async function cleanup() {
  // Não pode deletar audit (trigger imutável) — só os outros
  const conta = await prisma.pacienteConta.findUnique({ where: { cpf: CPF_TESTE } });
  if (conta) {
    await prisma.sessaoPaciente.deleteMany({ where: { contaId: conta.id } });
    await prisma.pacienteRefreshToken.deleteMany({ where: { contaId: conta.id } });
    await prisma.pacienteConta.delete({ where: { id: conta.id } });
  }
}

async function main() {
  console.log('═══ Smoke Etapa 9 · Refresh Token Rotativo · v0.18.0 ═══\n');

  await cleanup();

  // Bootstrap — paciente conta
  const hasher = new BcryptPasswordHasher();
  const senhaHash = await bcrypt.hash(SENHA, 10);
  const conta = await prisma.pacienteConta.create({
    data: {
      cpf: CPF_TESTE,
      cpfFormatado: '123.456.789-09',
      nome: 'Mateus Teste Refresh',
      senhaHash,
      senhaProvisoria: false,
      ativo: true,
    },
  });
  console.log(`✓ conta criada: ${conta.id}\n`);

  const audit = new PrismaAuditLogger();
  const login = new LoginPacienteUseCase(hasher);
  const refresh = new RefreshTokenPacienteUseCase(audit);

  // ──────── Cenário 1: Login emite par ────────
  console.log('Cenário 1 · Login emite par (access + refresh)');
  const r1 = await login.exec(CPF_TESTE, SENHA, '10.0.0.1', 'smoke/1.0');
  ok(typeof r1.token === 'string' && r1.token.length > 30, 'access token retornado');
  ok(typeof r1.refreshToken === 'string' && r1.refreshToken.length > 30, 'refresh token retornado');
  ok(r1.expiresIn === 1800, 'access expiresIn = 1800s (30 min)');
  ok(r1.refreshExpiresIn === 2592000, 'refresh expiresIn = 2592000s (30 dias)');
  ok(r1.paciente.cpf === CPF_TESTE, 'paciente.cpf no payload');

  // Confere persistência
  const sessao1 = await prisma.sessaoPaciente.findUnique({
    where: { tokenHash: sha256(r1.token) },
  });
  ok(sessao1 !== null, 'sessão (access) persistida com hash');
  ok(sessao1?.refreshTokenId !== null, 'sessão linka com refreshTokenId');

  const refresh1 = await prisma.pacienteRefreshToken.findUnique({
    where: { tokenHash: sha256(r1.refreshToken) },
  });
  ok(refresh1 !== null, 'refresh persistido com hash');
  ok(refresh1?.usadoEm === null, 'refresh novo tem usadoEm=null');
  ok(refresh1?.revogadoEm === null, 'refresh novo tem revogadoEm=null');

  // Plaintext checagem — refresh em plaintext NÃO deve aparecer no DB
  const todasRefresh = await prisma.pacienteRefreshToken.findMany();
  const plaintextLeak = todasRefresh.some((r) => r.tokenHash === r1.refreshToken);
  ok(!plaintextLeak, 'plaintext NUNCA persiste (só hash)');

  // ──────── Cenário 2: Refresh OK → rotação ────────
  console.log('\nCenário 2 · Refresh OK → rotação');
  const r2 = await refresh.exec({
    refreshToken: r1.refreshToken,
    ip: '10.0.0.2',
    userAgent: 'smoke/1.0',
  });
  ok(r2.token !== r1.token, 'novo access ≠ antigo');
  ok(r2.refreshToken !== r1.refreshToken, 'novo refresh ≠ antigo');
  ok(r2.paciente.cpf === CPF_TESTE, 'paciente.cpf preservado');

  // Antigo: marcado como usado + link
  const r1Reread = await prisma.pacienteRefreshToken.findUnique({
    where: { tokenHash: sha256(r1.refreshToken) },
  });
  ok(r1Reread?.usadoEm !== null, 'refresh antigo marcado como usadoEm');
  ok(r1Reread?.substituidoPorId !== null, 'refresh antigo aponta pro novo (cadeia)');

  // Novo: válido
  const r2Stored = await prisma.pacienteRefreshToken.findUnique({
    where: { tokenHash: sha256(r2.refreshToken) },
  });
  ok(r2Stored !== null, 'refresh novo persistido');
  ok(r2Stored?.usadoEm === null, 'refresh novo ainda não usado');
  ok(r2Stored?.id === r1Reread?.substituidoPorId, 'cadeia consistente');

  // ──────── Cenário 3: Reuse detection ────────
  console.log('\nCenário 3 · Reuse detection (refresh já usado)');
  try {
    await refresh.exec({ refreshToken: r1.refreshToken, ip: '10.0.0.3' });
    ok(false, 'reuse deveria ter lançado');
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    ok(code === 'REFRESH_REUSE_DETECTED', `código correto: ${code}`);
  }

  // Toda cadeia da conta agora deve estar revogada
  const todosRefresh2 = await prisma.pacienteRefreshToken.findMany({
    where: { contaId: conta.id },
  });
  const vivos = todosRefresh2.filter((r) => r.revogadoEm === null);
  ok(vivos.length === 0, 'todos refresh tokens da conta revogados');
  ok(
    todosRefresh2.every((r) =>
      ['CHAIN_COMPROMISED', 'LOGOUT', 'REUSE_DETECTED', 'CONTA_INATIVA', null].includes(
        r.motivoRevogacao,
      ),
    ),
    'motivos de revogação válidos',
  );
  ok(
    todosRefresh2.some((r) => r.motivoRevogacao === 'CHAIN_COMPROMISED'),
    'pelo menos um marcado como CHAIN_COMPROMISED',
  );

  // Sessões também revogadas (forçar re-login)
  const sessoes = await prisma.sessaoPaciente.findMany({
    where: { contaId: conta.id, revogadaEm: null },
  });
  ok(sessoes.length === 0, 'sessões também revogadas após reuse detection');

  // Audit registrado
  const auditReuse = await prisma.auditoriaLog.count({
    where: { acao: 'REFRESH_REUSE_DETECTED' },
  });
  ok(auditReuse >= 1, 'audit REFRESH_REUSE_DETECTED gravado');

  // ──────── Cenário 4: Refresh expirado ────────
  console.log('\nCenário 4 · Refresh expirado');
  const expiradoRaw = crypto.randomBytes(48).toString('base64url');
  await prisma.pacienteRefreshToken.create({
    data: {
      contaId: conta.id,
      tokenHash: sha256(expiradoRaw),
      expiraEm: new Date(Date.now() - 1000), // já expirado
    },
  });
  try {
    await refresh.exec({ refreshToken: expiradoRaw });
    ok(false, 'refresh expirado deveria ter lançado');
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    ok(code === 'REFRESH_TOKEN_EXPIRADO', `código correto: ${code}`);
  }

  // ──────── Cenário 5: Refresh revogado ────────
  console.log('\nCenário 5 · Refresh revogado');
  const revogadoRaw = crypto.randomBytes(48).toString('base64url');
  await prisma.pacienteRefreshToken.create({
    data: {
      contaId: conta.id,
      tokenHash: sha256(revogadoRaw),
      expiraEm: new Date(Date.now() + 60_000),
      revogadoEm: new Date(),
      motivoRevogacao: 'LOGOUT',
    },
  });
  try {
    await refresh.exec({ refreshToken: revogadoRaw });
    ok(false, 'refresh revogado deveria ter lançado');
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    ok(code === 'REFRESH_TOKEN_REVOGADO', `código correto: ${code}`);
  }

  // ──────── Cenário 6: Refresh inválido (não existe) ────────
  console.log('\nCenário 6 · Refresh inválido (não existe no DB)');
  const fakeToken = crypto.randomBytes(48).toString('base64url');
  try {
    await refresh.exec({ refreshToken: fakeToken });
    ok(false, 'refresh inválido deveria ter lançado');
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    ok(code === 'REFRESH_TOKEN_INVALIDO', `código correto: ${code}`);
  }

  // ──────── Cenário 7: Conta desativada ────────
  console.log('\nCenário 7 · Conta desativada');
  // Cria novo refresh válido, depois desativa a conta
  const desativadoRaw = crypto.randomBytes(48).toString('base64url');
  const desativadoRow = await prisma.pacienteRefreshToken.create({
    data: {
      contaId: conta.id,
      tokenHash: sha256(desativadoRaw),
      expiraEm: new Date(Date.now() + 60_000),
    },
  });
  await prisma.pacienteConta.update({
    where: { id: conta.id },
    data: { ativo: false },
  });
  try {
    await refresh.exec({ refreshToken: desativadoRaw });
    ok(false, 'conta desativada deveria ter lançado');
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    ok(code === 'CONTA_DESATIVADA', `código correto: ${code}`);
  }
  const desativadoReread = await prisma.pacienteRefreshToken.findUnique({
    where: { id: desativadoRow.id },
  });
  ok(
    desativadoReread?.revogadoEm !== null && desativadoReread?.motivoRevogacao === 'CONTA_INATIVA',
    'token também revogado com motivo CONTA_INATIVA',
  );

  // Reativa pra continuar
  await prisma.pacienteConta.update({
    where: { id: conta.id },
    data: { ativo: true },
  });

  // ──────── Cenário 8: Logout revoga refresh tokens da conta ────────
  console.log('\nCenário 8 · Logout revoga refresh tokens');
  const r8 = await login.exec(CPF_TESTE, SENHA, '10.0.0.8', 'smoke/1.0');
  // Logout não tem use case dedicado — invocamos o equivalente direto
  await prisma.$transaction([
    prisma.sessaoPaciente.updateMany({
      where: { tokenHash: sha256(r8.token), revogadaEm: null },
      data: { revogadaEm: new Date() },
    }),
    prisma.pacienteRefreshToken.updateMany({
      where: { contaId: conta.id, revogadoEm: null },
      data: { revogadoEm: new Date(), motivoRevogacao: 'LOGOUT' },
    }),
  ]);
  try {
    await refresh.exec({ refreshToken: r8.refreshToken });
    ok(false, 'refresh após logout deveria falhar');
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    ok(code === 'REFRESH_TOKEN_REVOGADO', `logout → refresh subsequente falha (code=${code})`);
  }

  // ──────── Cenário 9: Audit ROTACIONADO ────────
  console.log('\nCenário 9 · Audit log de rotação');
  const auditCount = await prisma.auditoriaLog.count({
    where: { acao: 'REFRESH_TOKEN_ROTACIONADO' },
  });
  ok(auditCount >= 1, `audit REFRESH_TOKEN_ROTACIONADO gravado (${auditCount} entries)`);

  // ──────── Cenário 10: Múltiplas rotações em sequência ────────
  console.log('\nCenário 10 · Múltiplas rotações sequenciais');
  let cur = await login.exec(CPF_TESTE, SENHA, '10.0.0.10', 'smoke/seq');
  for (let i = 0; i < 5; i++) {
    cur = await refresh.exec({ refreshToken: cur.refreshToken, ip: '10.0.0.10' });
  }
  ok(typeof cur.refreshToken === 'string', '5 rotações sequenciais funcionam');

  // Cleanup final
  await cleanup();

  console.log(`\n═══ Resultado: ${asserts - falhas}/${asserts} ✓ ═══`);
  if (falhas > 0) {
    console.log(`✗ ${falhas} falhas`);
    process.exit(1);
  }
  console.log('✓ Etapa 9 · OK');
}

main()
  .catch(async (e) => {
    console.error('✗ smoke falhou:', e);
    await cleanup().catch(() => {});
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
