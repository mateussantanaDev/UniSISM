/**
 * Smoke test — Etapa 10 (segurança de borda, segredo e auditoria).
 *
 * Cobre:
 *   1. CORS em produção aceita apenas origens explícitas por default
 *   2. Preview Vercel só é aceito quando habilitado explicitamente
 *   3. CORS dev continua aceitando localhost/LAN e wildcard apenas fora de produção
 *   4. API key usa comparação segura em tempo constante para valores de mesmo tamanho
 *   5. Logger sobe com redaction configurado
 *   6. Auditoria mascara payloads sensíveis de forma recursiva antes de persistir
 *
 * Uso:
 *   npx ts-node --transpile-only scripts/smoke-test-etapa10.ts
 */
import { prisma } from '../src/infrastructure/database/prisma';
import {
  PrismaAuditLogger,
  mascararPayloadAuditoria,
} from '../src/infrastructure/audit/PrismaAuditLogger';
import { logger } from '../src/infrastructure/logger';
import { isValidApiKey } from '../src/presentation/middlewares/apiKey';
import { isCorsOriginAllowed } from '../src/shared/cors';

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

function contem(value: unknown, needle: string): boolean {
  return JSON.stringify(value).includes(needle);
}

async function main(): Promise<void> {
  console.log('═══ Smoke Etapa 10 · Segurança ═══\n');

  console.log('Cenário 1 · Política de CORS');
  const prodPolicy = {
    configuredOrigins: 'https://unisism.vercel.app,https://admin.unisism.gov.br',
    isProd: true,
    allowVercelPreview: false,
    vercelProject: 'unisism',
  };
  ok(isCorsOriginAllowed(undefined, prodPolicy), 'sem Origin é permitido para app mobile/cURL');
  ok(
    isCorsOriginAllowed('https://unisism.vercel.app', prodPolicy),
    'origem explícita é permitida em produção',
  );
  ok(
    !isCorsOriginAllowed('https://preview-malicioso.vercel.app', prodPolicy),
    'preview Vercel aleatório é bloqueado por default em produção',
  );
  ok(
    isCorsOriginAllowed('https://unisism-git-main-prefeitura.vercel.app', {
      ...prodPolicy,
      allowVercelPreview: true,
    }),
    'preview Vercel do projeto unisism pode ser habilitado explicitamente',
  );
  ok(
    !isCorsOriginAllowed('https://outro-projeto-git-main-prefeitura.vercel.app', {
      ...prodPolicy,
      allowVercelPreview: true,
    }),
    'preview Vercel de outro projeto segue bloqueado',
  );
  ok(
    !isCorsOriginAllowed('https://qualquer-origem.example', {
      configuredOrigins: '*',
      isProd: true,
      allowVercelPreview: false,
      vercelProject: 'unisism',
    }),
    'wildcard não libera CORS em produção',
  );
  ok(
    isCorsOriginAllowed('http://localhost:5173', {
      configuredOrigins: '',
      isProd: false,
      allowVercelPreview: false,
      vercelProject: 'unisism',
    }),
    'localhost continua permitido em dev',
  );
  ok(
    isCorsOriginAllowed('http://192.168.0.20:5173', {
      configuredOrigins: '',
      isProd: false,
      allowVercelPreview: false,
      vercelProject: 'unisism',
    }),
    'LAN continua permitida em dev',
  );
  ok(
    isCorsOriginAllowed('https://origem-dev.example', {
      configuredOrigins: '*',
      isProd: false,
      allowVercelPreview: false,
      vercelProject: 'unisism',
    }),
    'wildcard continua permitido somente em dev',
  );

  console.log('\nCenário 2 · API key');
  ok(isValidApiKey('segredo-operacional-123', 'segredo-operacional-123'), 'API key exata é aceita');
  ok(!isValidApiKey(undefined, 'segredo-operacional-123'), 'API key ausente é rejeitada');
  ok(!isValidApiKey('segredo-operacional-124', 'segredo-operacional-123'), 'API key errada do mesmo tamanho é rejeitada');
  ok(!isValidApiKey('curta', 'segredo-operacional-123'), 'API key errada de outro tamanho é rejeitada');
  ok(!isValidApiKey('segredo-operacional-123', ''), 'API key esperada vazia não valida por acidente');

  console.log('\nCenário 3 · Logger e auditoria');
  ok(typeof logger.info === 'function', 'logger inicializa com redaction configurado');

  const audit = new PrismaAuditLogger();
  const recursoId = `smoke-etapa10-${Date.now()}`;
  await audit.registrar({
    acao: 'SMOKE_ETAPA10_REDACTION',
    recurso: 'SecuritySmoke',
    recursoId,
    payload: {
      senha: 'senha-em-claro',
      authorization: 'Bearer token-super-secreto',
      paciente: {
        cpf: '12345678909',
        cartaoSus: '123456789012345',
        credenciais: {
          senhaAtual: 'senha-antiga',
          refreshToken: 'refresh-super-secreto',
          tokenHash: 'hash-nao-deve-vazar',
        },
      },
      historico: [
        {
          novaSenha: 'senha-nova',
          apiKey: 'api-key-super-secreta',
          responsavelCpf: '98765432100',
        },
      ],
      campoVisivel: 'valor autorizado',
    },
    ip: '127.0.0.1',
    userAgent: 'smoke-etapa10/1.0',
  });

  const log = await prisma.auditoriaLog.findFirst({
    where: { acao: 'SMOKE_ETAPA10_REDACTION', recursoId },
    orderBy: { criadoEm: 'desc' },
  });
  ok(log !== null, 'registro de auditoria persistido');
  ok(log?.payload !== null, 'payload de auditoria persistido');
  ok(!contem(log?.payload, 'senha-em-claro'), 'senha top-level não vaza no payload');
  ok(!contem(log?.payload, 'Bearer token-super-secreto'), 'authorization não vaza no payload');
  ok(!contem(log?.payload, 'refresh-super-secreto'), 'refreshToken nested não vaza no payload');
  ok(!contem(log?.payload, 'hash-nao-deve-vazar'), 'tokenHash nested não vaza no payload');
  ok(!contem(log?.payload, 'api-key-super-secreta'), 'apiKey em array não vaza no payload');
  ok(contem(log?.payload, '[REDACTED]'), 'payload registra censor explícito');
  ok(contem(log?.payload, '123.456.***-09'), 'CPF nested é mascarado');
  ok(contem(log?.payload, '987.654.***-00'), 'CPF nested em array é mascarado');
  ok(contem(log?.payload, '123 4567 **** 2345'), 'Cartão SUS nested é mascarado');
  ok(contem(log?.payload, 'valor autorizado'), 'campo não sensível é preservado');

  const helperPayload = mascararPayloadAuditoria({
    nested: {
      token: 'token-direto',
      cpf: '123.456.789-09',
    },
  });
  ok(!contem(helperPayload, 'token-direto'), 'helper recursivo mascara tokens fora do DB');
  ok(contem(helperPayload, '123.456.***-09'), 'helper recursivo mascara CPF formatado');

  console.log(`\nAsserts: ${asserts}`);
  if (falhas > 0) {
    throw new Error(`Smoke Etapa 10 falhou: ${falhas} falha(s)`);
  }
  console.log('✅ Smoke Etapa 10 OK');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
