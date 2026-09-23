const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgresql://unisism:unisism@localhost:5432/unisism_test';
process.env.JWT_SECRET ||= 'test-jwt-secret-test-jwt-secret-test';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-test-refresh-secret';

const { prisma } = require('../dist/infrastructure/database/prisma.js');
const {
  buildScope,
  ensurePrefeituraAcessivel,
  ensureUbsAcessivel,
} = require('../dist/shared/scope.js');
const {
  assertAcessoPaciente,
  parseIsoObrigatorio,
  parseYmdObrigatorio,
} = require('../dist/modules/prontuario/application/_helpers.js');
const {
  assertMesmaPrefeitura,
  mesAtualYmd,
  resolverPrefeituraIdEfetiva,
} = require('../dist/modules/tfd/application/_helpers.js');
const { SaldoUseCases } = require('../dist/modules/tfd/application/saldo.js');
const {
  TfdAuditLogger,
  verificarCadeiaTfd,
} = require('../dist/modules/tfd/infrastructure/TfdAuditLogger.js');

const GENESIS = '0'.repeat(64);

function patchMethod(target, method, implementation) {
  const original = target[method];
  target[method] = implementation;
  return () => {
    target[method] = original;
  };
}

function expectAppError(err, statusCode, code) {
  assert.equal(err.statusCode, statusCode);
  assert.equal(err.code, code);
  return true;
}

function req({ query = {}, body = {}, ip = '127.0.0.1', userAgent = 'node-test' } = {}) {
  return {
    query,
    body,
    ip,
    header(name) {
      return String(name).toLowerCase() === 'user-agent' ? userAgent : undefined;
    },
  };
}

function buildAuditInput(overrides = {}) {
  return {
    prefeituraId: 'pref-1',
    acao: 'SALDO_AJUSTADO',
    recursoTipo: 'SALDO_VEICULO',
    recursoId: 'veiculo-1:2026-09',
    recursoProtocolo: null,
    operadorId: 'user-1',
    operadorNome: 'Operador',
    operadorMatricula: 'MAT-1',
    operadorRole: 'ADMIN',
    ip: '127.0.0.1',
    userAgent: 'node-test',
    antes: { saldoMensal: 0 },
    depois: { saldoMensal: 1000 },
    ...overrides,
  };
}

async function buildAuditRows() {
  const rows = [];
  const logger = new TfdAuditLogger();
  const tx = {
    $executeRaw: async () => 0,
    tfdAuditLog: {
      findFirst: async () => {
        const last = rows.at(-1);
        return last ? { hash: last.hash } : null;
      },
      create: async ({ data }) => {
        rows.push(data);
        return data;
      },
    },
  };

  await logger.registrarNaTransacao(tx, buildAuditInput());
  await logger.registrarNaTransacao(
    tx,
    buildAuditInput({
      recursoId: 'veiculo-1:2026-10',
      antes: { saldoMensal: 1000 },
      depois: { saldoMensal: 1200 },
    }),
  );
  return rows;
}

test('escopo LGPD bloqueia prefeitura ou UBS ausente no contexto autenticado', () => {
  assert.deepEqual(buildScope({ atendenteId: 'dev', role: 'DESENVOLVEDOR' }), {
    kind: 'GLOBAL',
  });

  assert.throws(
    () => buildScope({ atendenteId: 'admin', role: 'ADMIN' }),
    (err) => expectAppError(err, 403, 'USUARIO_SEM_PREFEITURA'),
  );

  assert.throws(
    () => buildScope({ atendenteId: 'ubs', role: 'ATENDENTE_UBS' }),
    (err) => expectAppError(err, 403, 'USUARIO_SEM_UBS'),
  );
});

test('escopo LGPD impede acesso a UBS e prefeitura fora do dominio', () => {
  const prefeituraScope = { kind: 'PREFEITURA', prefeituraId: 'pref-1' };
  const ubsScope = { kind: 'UBS', ubsId: 'ubs-1', prefeituraId: 'pref-1' };

  assert.doesNotThrow(() =>
    ensureUbsAcessivel(prefeituraScope, { id: 'ubs-qualquer', prefeituraId: 'pref-1' }),
  );
  assert.throws(
    () => ensureUbsAcessivel(ubsScope, { id: 'ubs-2', prefeituraId: 'pref-1' }),
    (err) => expectAppError(err, 404, 'UBS_NAO_ENCONTRADA'),
  );
  assert.throws(
    () => ensurePrefeituraAcessivel(prefeituraScope, 'pref-2'),
    (err) => expectAppError(err, 404, 'PREFEITURA_NAO_ENCONTRADA'),
  );
});

test('prontuario retorna 404 para paciente inexistente, deletado ou fora do escopo', async () => {
  const restore = patchMethod(prisma.paciente, 'findUnique', async ({ where }) => {
    if (where.id === 'paciente-ok') {
      return {
        id: 'paciente-ok',
        deletadoEm: null,
        ubsId: 'ubs-1',
        ubs: { prefeituraId: 'pref-1' },
      };
    }
    if (where.id === 'paciente-deletado') {
      return {
        id: 'paciente-deletado',
        deletadoEm: new Date(),
        ubsId: 'ubs-1',
        ubs: { prefeituraId: 'pref-1' },
      };
    }
    return null;
  });

  try {
    await assert.rejects(
      () => assertAcessoPaciente('paciente-inexistente', { kind: 'GLOBAL' }),
      (err) => expectAppError(err, 404, 'PACIENTE_NAO_ENCONTRADO'),
    );
    await assert.rejects(
      () => assertAcessoPaciente('paciente-deletado', { kind: 'GLOBAL' }),
      (err) => expectAppError(err, 404, 'PACIENTE_NAO_ENCONTRADO'),
    );
    await assert.rejects(
      () => assertAcessoPaciente('paciente-ok', { kind: 'PREFEITURA', prefeituraId: 'pref-2' }),
      (err) => expectAppError(err, 404, 'PACIENTE_NAO_ENCONTRADO'),
    );
    await assert.rejects(
      () => assertAcessoPaciente('paciente-ok', { kind: 'UBS', ubsId: 'ubs-2' }),
      (err) => expectAppError(err, 404, 'PACIENTE_NAO_ENCONTRADO'),
    );
    await assert.doesNotReject(() =>
      assertAcessoPaciente('paciente-ok', { kind: 'UBS', ubsId: 'ubs-1' }),
    );
  } finally {
    restore();
  }
});

test('helpers do prontuario validam datas obrigatorias', () => {
  assert.equal(parseYmdObrigatorio('2026-09-22', 'DATA_INVALIDA', 'desde').toISOString(), '2026-09-22T00:00:00.000Z');
  assert.equal(parseIsoObrigatorio('2026-09-22T10:30:00.000Z', 'DATA_INVALIDA', 'em').toISOString(), '2026-09-22T10:30:00.000Z');

  assert.throws(
    () => parseYmdObrigatorio('2026-99-99', 'DATA_INVALIDA', 'desde'),
    (err) => expectAppError(err, 422, 'DATA_INVALIDA'),
  );
  assert.throws(
    () => parseIsoObrigatorio('nao-e-data', 'DATA_INVALIDA', 'em'),
    (err) => expectAppError(err, 422, 'DATA_INVALIDA'),
  );
});

test('helpers TFD resolvem prefeitura efetiva e protegem isolamento entre prefeituras', () => {
  assert.equal(
    resolverPrefeituraIdEfetiva({ kind: 'PREFEITURA', prefeituraId: 'pref-1' }, req()),
    'pref-1',
  );
  assert.equal(
    resolverPrefeituraIdEfetiva({ kind: 'GLOBAL' }, req({ query: { prefeituraId: 'pref-q' } })),
    'pref-q',
  );
  assert.equal(
    resolverPrefeituraIdEfetiva({ kind: 'GLOBAL' }, req({ body: { prefeituraId: 'pref-b' } })),
    'pref-b',
  );
  assert.throws(
    () => resolverPrefeituraIdEfetiva({ kind: 'GLOBAL' }, req()),
    (err) => expectAppError(err, 403, 'PREFEITURA_REQUERIDA'),
  );
  assert.throws(
    () => assertMesmaPrefeitura({ kind: 'PREFEITURA', prefeituraId: 'pref-1' }, 'pref-2'),
    (err) => expectAppError(err, 404, 'RECURSO_NAO_ENCONTRADO'),
  );
  assert.equal(mesAtualYmd(new Date('2026-09-22T12:00:00.000Z')), '2026-09');
});

test('SaldoUseCases bloqueia ajuste financeiro invalido antes de tocar no banco', async () => {
  const useCase = new SaldoUseCases({ registrar: async () => {} }, { buscarPorId: async () => null });
  const input = {
    veiculoId: 'veiculo-1',
    mes: '2026-09',
    novoSaldoMensal: 1000,
    justificativa: 'justificativa operacional valida',
  };

  await assert.rejects(
    () =>
      useCase.ajustar({ kind: 'GLOBAL' }, req(), 'autor-1', {
        ...input,
        justificativa: 'curta',
      }),
    (err) => expectAppError(err, 422, 'JUSTIFICATIVA_OBRIGATORIA'),
  );

  await assert.rejects(
    () =>
      useCase.ajustar({ kind: 'GLOBAL' }, req(), 'autor-1', {
        ...input,
        novoSaldoMensal: -1,
      }),
    (err) => expectAppError(err, 422, 'SALDO_NEGATIVO'),
  );

  await assert.rejects(
    () => useCase.ajustar({ kind: 'UBS', ubsId: 'ubs-1', prefeituraId: 'pref-1' }, req(), 'autor-1', input),
    (err) => expectAppError(err, 403, 'ROLE_NAO_PERMITIDO'),
  );
});

test('TfdAuditLogger encadeia hash anterior em registros sucessivos', async () => {
  const rows = await buildAuditRows();

  assert.equal(rows.length, 2);
  assert.equal(rows[0].hashAnterior, GENESIS);
  assert.match(rows[0].hash, /^[a-f0-9]{64}$/);
  assert.equal(rows[1].hashAnterior, rows[0].hash);
  assert.match(rows[1].hash, /^[a-f0-9]{64}$/);
});

test('verificarCadeiaTfd detecta adulteracao de payload ou hashAnterior', async () => {
  const rows = await buildAuditRows();
  const intactRows = rows.map((row) => ({ ...row }));
  const tamperedRows = rows.map((row) => ({ ...row }));
  tamperedRows[1].depois = { saldoMensal: 9999 };

  let restore = patchMethod(prisma.tfdAuditLog, 'findMany', async () => intactRows);
  try {
    assert.deepEqual(await verificarCadeiaTfd('pref-1'), { total: 2, corrompidos: [] });
  } finally {
    restore();
  }

  restore = patchMethod(prisma.tfdAuditLog, 'findMany', async () => tamperedRows);
  try {
    const result = await verificarCadeiaTfd('pref-1');
    assert.equal(result.total, 2);
    assert.deepEqual(result.corrompidos, [tamperedRows[1].id]);
  } finally {
    restore();
  }
});
