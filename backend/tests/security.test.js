const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgresql://unisism:unisism@localhost:5432/unisism_test';
process.env.JWT_SECRET ||= 'test-jwt-secret-test-jwt-secret-test';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-test-refresh-secret';
process.env.API_KEY = 'expected-api-key';
process.env.API_KEY_HEADER = 'x-api-key';

const { isCorsOriginAllowed } = require('../dist/shared/cors.js');
const { isValidApiKey, apiKeyGuard } = require('../dist/presentation/middlewares/apiKey.js');
const { makeAuthenticate } = require('../dist/presentation/middlewares/authenticate.js');
const { requireRole } = require('../dist/presentation/middlewares/requireRole.js');
const {
  loginSchema,
  resetPasswordSchema,
  verifyCodeSchema,
} = require('../dist/presentation/schemas/authSchemas.js');
const { Unauthorized } = require('../dist/shared/errors.js');

function createResponse() {
  return {
    statusCode: undefined,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function runMiddleware(handler, req) {
  const res = createResponse();
  const calls = [];
  handler(req, res, (err) => {
    calls.push(err);
  });
  return { res, calls };
}

function patchMethod(target, method, implementation) {
  const original = target[method];
  target[method] = implementation;
  return () => {
    target[method] = original;
  };
}

async function runAsyncMiddleware(handler, req) {
  const res = createResponse();
  const calls = [];
  await handler(req, res, (err) => {
    calls.push(err);
  });
  return { res, calls };
}

function reqWithHeaders(headers, extra = {}) {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    method: 'GET',
    path: '/v1/protegido',
    get(name) {
      return normalized.get(String(name).toLowerCase());
    },
    header(name) {
      return normalized.get(String(name).toLowerCase());
    },
    ...extra,
  };
}

test('CORS bloqueia preview Vercel de outro projeto em producao', () => {
  const policy = {
    configuredOrigins: 'https://unisism.vercel.app',
    isProd: true,
    allowVercelPreview: true,
    vercelProject: 'unisism',
  };

  assert.equal(
    isCorsOriginAllowed('https://unisism-git-main-prefeitura.vercel.app', policy),
    true,
  );
  assert.equal(
    isCorsOriginAllowed('https://outro-projeto-git-main-prefeitura.vercel.app', policy),
    false,
  );
  assert.equal(isCorsOriginAllowed('https://qualquer.vercel.app', policy), false);
});

test('CORS ignora wildcard em producao e permite localhost apenas em dev', () => {
  assert.equal(
    isCorsOriginAllowed('https://origem-externa.example', {
      configuredOrigins: '*',
      isProd: true,
      allowVercelPreview: false,
      vercelProject: 'unisism',
    }),
    false,
  );

  assert.equal(
    isCorsOriginAllowed('http://localhost:5173', {
      configuredOrigins: '',
      isProd: false,
      allowVercelPreview: false,
      vercelProject: 'unisism',
    }),
    true,
  );
});

test('API key usa comparacao segura e rejeita ausente, diferente ou tamanho incorreto', () => {
  assert.equal(isValidApiKey('expected-api-key', 'expected-api-key'), true);
  assert.equal(isValidApiKey(undefined, 'expected-api-key'), false);
  assert.equal(isValidApiKey('wrong-api-keyxx', 'expected-api-key'), false);
  assert.equal(isValidApiKey('short', 'expected-api-key'), false);
  assert.equal(isValidApiKey('expected-api-key', ''), false);
});

test('apiKeyGuard libera health/OPTIONS e rejeita request protegida sem chave valida', () => {
  const options = runMiddleware(apiKeyGuard, reqWithHeaders({}, { method: 'OPTIONS' }));
  assert.equal(options.calls.length, 1);
  assert.equal(options.calls[0], undefined);

  const health = runMiddleware(apiKeyGuard, reqWithHeaders({}, { path: '/v1/health' }));
  assert.equal(health.calls.length, 1);
  assert.equal(health.calls[0], undefined);

  const invalid = runMiddleware(apiKeyGuard, reqWithHeaders({ 'x-api-key': 'wrong-api-key' }));
  assert.equal(invalid.calls.length, 0);
  assert.equal(invalid.res.statusCode, 401);
  assert.equal(invalid.res.body.error.code, 'API_KEY_INVALIDA');

  const valid = runMiddleware(
    apiKeyGuard,
    reqWithHeaders({ 'x-api-key': 'expected-api-key' }),
  );
  assert.equal(valid.calls.length, 1);
  assert.equal(valid.calls[0], undefined);
});

test('authenticate exige Bearer token e anexa payload validado no request', async () => {
  const payload = {
    sub: 'user-1',
    role: 'DESENVOLVEDOR',
    prefeituraId: 'pref-1',
  };
  const auth = makeAuthenticate({
    verificarAccess(token) {
      assert.equal(token, 'token-valido');
      return payload;
    },
  });
  const { prisma } = require('../dist/infrastructure/database/prisma.js');
  const restore = patchMethod(prisma.atendente, 'findUnique', async () => ({ ativo: true }));

  try {
    const missing = await runAsyncMiddleware(auth, reqWithHeaders({}));
    assert.equal(missing.calls.length, 1);
    assert.equal(missing.calls[0].statusCode, 401);
    assert.equal(missing.calls[0].code, 'TOKEN_AUSENTE');

    const validReq = reqWithHeaders({ authorization: 'Bearer token-valido' });
    const valid = await runAsyncMiddleware(auth, validReq);
    assert.equal(valid.calls.length, 1);
    assert.equal(valid.calls[0], undefined);
    assert.deepEqual(validReq.auth, payload);
  } finally {
    restore();
  }
});

test('authenticate encaminha erro de token invalido sem mascarar codigo', () => {
  const auth = makeAuthenticate({
    verificarAccess() {
      throw Unauthorized('TOKEN_INVALIDO', 'Token invalido');
    },
  });

  const result = runMiddleware(auth, reqWithHeaders({ authorization: 'Bearer token-ruim' }));
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].statusCode, 401);
  assert.equal(result.calls[0].code, 'TOKEN_INVALIDO');
});

test('requireRole bloqueia request sem auth ou com perfil insuficiente', () => {
  const onlyAdmin = requireRole('ADMIN');

  const missing = runMiddleware(onlyAdmin, reqWithHeaders({}));
  assert.equal(missing.calls[0].statusCode, 403);
  assert.equal(missing.calls[0].code, 'NAO_AUTENTICADO');

  const deniedReq = reqWithHeaders({});
  deniedReq.auth = { sub: 'u1', role: 'ATENDENTE_UBS' };
  const denied = runMiddleware(onlyAdmin, deniedReq);
  assert.equal(denied.calls[0].statusCode, 403);
  assert.equal(denied.calls[0].code, 'PERMISSAO_INSUFICIENTE');

  const allowedReq = reqWithHeaders({});
  allowedReq.auth = { sub: 'u2', role: 'ADMIN' };
  const allowed = runMiddleware(onlyAdmin, allowedReq);
  assert.equal(allowed.calls.length, 1);
  assert.equal(allowed.calls[0], undefined);
});

test('schemas de auth rejeitam payloads incompletos ou fracos', () => {
  assert.equal(loginSchema.safeParse({ senha: 'secret' }).success, false);
  assert.equal(loginSchema.safeParse({ login: 'dev', senha: 'secret' }).success, true);
  assert.equal(verifyCodeSchema.safeParse({ login: 'dev', codigo: '12345' }).success, false);
  assert.equal(verifyCodeSchema.safeParse({ login: 'dev', codigo: '123456' }).success, true);
  assert.equal(
    resetPasswordSchema.safeParse({ resetToken: 'token-ok', novaSenha: '1234567' }).success,
    false,
  );
});
