/**
 * Smoke test - Etapa 12 (configuracao de producao/deploy).
 *
 * Cobre:
 *   1. Dockerfile deterministico com npm ci e healthcheck sem curl/nc.
 *   2. docker-compose base/prod sem dependencia de nc no backend.
 *   3. Overlay de producao expondo variaveis criticas.
 *   4. env.ts falha cedo para SMTP/S3/ntfy/timeouts invalidos em producao.
 *   5. Documentacao e runner unico atualizados para a etapa 12.
 *
 * Uso:
 *   npx ts-node --transpile-only scripts/smoke-test-etapa12.ts
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

let asserts = 0;
let falhas = 0;
let skips = 0;

function ok(cond: unknown, msg: string, extra?: unknown): void {
  asserts++;
  if (cond) {
    console.log(`  OK ${msg}`);
  } else {
    falhas++;
    console.log(`  FAIL ${msg}${extra !== undefined ? ` - ${JSON.stringify(extra)}` : ''}`);
  }
}

function skip(msg: string): void {
  skips++;
  console.log(`  - ${msg}`);
}

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function contains(file: string, needle: string, msg: string): void {
  ok(read(file).includes(needle), msg, { file, needle });
}

function notContains(file: string, needle: string, msg: string): void {
  ok(!read(file).includes(needle), msg, { file, needle });
}

function runEnv(overrides: Record<string, string>) {
  return spawnSync(
    NPX,
    ['ts-node', '--transpile-only', '-e', "require('./src/shared/env')"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://unisism:senha-forte@localhost:5432/unisism_prod?schema=public',
        JWT_SECRET: 'jwt-secret-prod-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        JWT_REFRESH_SECRET: 'jwt-refresh-prod-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        CORS_ORIGIN: 'https://unisism.exemplo.com.br',
        CORS_ALLOW_VERCEL_PREVIEW: 'false',
        CORS_VERCEL_PROJECT: 'unisism',
        HTTP_KEEP_ALIVE_TIMEOUT_MS: '65000',
        HTTP_HEADERS_TIMEOUT_MS: '66000',
        HTTP_REQUEST_TIMEOUT_MS: '300000',
        SHUTDOWN_GRACE_MS: '10000',
        EMAIL_PROVIDER: 'smtp',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_USER: 'mailer',
        SMTP_PASS: 'mailer-password',
        STORAGE_PROVIDER: 's3',
        S3_BUCKET: 'unisism-anexos',
        S3_ACCESS_KEY: 'unisism',
        S3_SECRET_KEY: 's3-secret-prod-aaaaaaaaaaaaaaaa',
        PUSH_PROVIDER: 'ntfy',
        NTFY_BASE_URL: 'https://push.unisism.exemplo.com.br',
        ...overrides,
      },
      encoding: 'utf8',
    },
  );
}

function outputOf(result: ReturnType<typeof runEnv>): string {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function assertEnvFails(
  overrides: Record<string, string>,
  expectedText: string,
  msg: string,
): void {
  const result = runEnv(overrides);
  const output = outputOf(result);
  ok(result.status !== 0 && output.includes(expectedText), msg, {
    status: result.status,
    output: output.slice(0, 800),
  });
}

function smokeStaticFiles(): void {
  console.log('Cenario 1 - Arquivos de deploy');

  contains('Dockerfile', 'RUN npm ci --no-audit --no-fund', 'Dockerfile usa npm ci deterministico');
  contains('Dockerfile', 'HEALTHCHECK', 'Dockerfile tem healthcheck HTTP do backend');
  contains('Dockerfile', '127.0.0.1:3333/v1/health', 'healthcheck usa /v1/health');
  contains('Dockerfile', 'USER app', 'runtime Docker roda sem root');

  notContains('docker-compose.yml', 'nc -z', 'compose nao depende de nc no backend');
  contains('docker-compose.yml', 'npm run start:container', 'compose usa script unico de boot do container');
  contains('docker-compose.yml', 'healthcheck:', 'compose define healthcheck do backend');
  contains('docker-compose.yml', 'HTTP_KEEP_ALIVE_TIMEOUT_MS', 'compose expoe timeouts HTTP');

  contains('docker-compose.prod.yml', 'NODE_ENV: production', 'overlay prod fixa NODE_ENV=production');
  contains('docker-compose.prod.yml', 'CORS_ALLOW_VERCEL_PREVIEW', 'overlay prod controla previews Vercel');
  contains('docker-compose.prod.yml', 'CORS_VERCEL_PROJECT', 'overlay prod restringe previews ao projeto Vercel');
  contains('docker-compose.prod.yml', 'APP_RESET_SENHA_URL', 'overlay prod exige URL publica de reset de senha');
  contains('docker-compose.prod.yml', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'overlay prod expoe OpenTelemetry');
  contains('docker-compose.prod.yml', 'NTFY_TIMEOUT_MS', 'overlay prod expoe timeout do ntfy');
  contains('docker-compose.observability.yml', 'unisism-grafana', 'overlay observability define Grafana');
  contains('docker-compose.observability.yml', '127.0.0.1:${GRAFANA_PORT:-3000}:3000', 'Grafana fica preso em localhost');
  contains('deploy/observability/prometheus.yml', 'backend:3333', 'Prometheus coleta metricas do backend');
  contains('deploy/observability/tempo.yml', '0.0.0.0:4318', 'Tempo recebe OTLP HTTP');

  contains('.env.prod.example', 'HTTP_KEEP_ALIVE_TIMEOUT_MS=65000', '.env.prod.example documenta keep-alive');
  contains('.env.prod.example', 'CORS_ALLOW_VERCEL_PREVIEW=false', '.env.prod.example bloqueia previews por default');
  contains('.env.prod.example', 'CORS_VERCEL_PROJECT=unisism', '.env.prod.example documenta projeto Vercel');
  contains('.env.prod.example', 'GRAFANA_PASSWORD=', '.env.prod.example documenta senha do Grafana');
  contains('package.json', '"start:container"', 'package.json tem start:container');
  contains('package.json', '"test:smoke:production"', 'package.json tem smoke de producao');
  contains('scripts/smoke/run-all.sh', 'scripts/smoke-test-etapa{1..12}.ts', 'runner unico inclui etapa 12');
}

function smokeEnvFailFast(): void {
  console.log('\nCenario 2 - Fail-fast de env em producao');

  const valid = runEnv({});
  ok(valid.status === 0, 'env de producao valido carrega sem erro', {
    status: valid.status,
    output: outputOf(valid).slice(0, 800),
  });

  assertEnvFails(
    { SMTP_USER: '', SMTP_PASS: '' },
    'EMAIL_PROVIDER=smtp requer SMTP_USER, SMTP_PASS',
    'SMTP incompleto falha no boot',
  );
  assertEnvFails(
    { S3_SECRET_KEY: '' },
    'STORAGE_PROVIDER=s3 requer S3_SECRET_KEY',
    'S3 incompleto falha no boot',
  );
  assertEnvFails(
    { NTFY_BASE_URL: '' },
    'PUSH_PROVIDER=ntfy requer NTFY_BASE_URL',
    'ntfy sem base URL falha no boot em producao',
  );
  assertEnvFails(
    { HTTP_HEADERS_TIMEOUT_MS: '64000' },
    'HTTP_HEADERS_TIMEOUT_MS deve ser maior que HTTP_KEEP_ALIVE_TIMEOUT_MS',
    'timeouts HTTP incoerentes falham no boot',
  );
}

function smokeDockerComposeConfig(): void {
  console.log('\nCenario 3 - docker compose config');

  const version = spawnSync('docker', ['compose', 'version'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (version.status !== 0) {
    skip('docker compose indisponivel; validacao estatica foi executada');
    return;
  }

  const config = spawnSync(
    'docker',
    [
      'compose',
      '--env-file',
      '.env.prod.example',
      '-f',
      'docker-compose.yml',
      '-f',
      'docker-compose.prod.yml',
      'config',
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
  const output = `${config.stdout ?? ''}${config.stderr ?? ''}`;
  ok(config.status === 0, 'docker compose renderiza base + prod', {
    status: config.status,
    output: output.slice(0, 800),
  });
  if (config.status === 0) {
    ok(output.includes('NODE_ENV: production'), 'compose renderizado mantem backend em producao');
    ok(output.includes('npm run start:container'), 'compose renderizado usa start:container');
    ok(output.includes('127.0.0.1:3333/v1/health'), 'compose renderizado inclui healthcheck do backend');
  }

  const observability = spawnSync(
    'docker',
    [
      'compose',
      '--env-file',
      '.env.prod.example',
      '-f',
      'docker-compose.yml',
      '-f',
      'docker-compose.prod.yml',
      '-f',
      'docker-compose.observability.yml',
      'config',
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
  const observabilityOutput = `${observability.stdout ?? ''}${observability.stderr ?? ''}`;
  ok(observability.status === 0, 'docker compose renderiza overlay observability', {
    status: observability.status,
    output: observabilityOutput.slice(0, 800),
  });
  if (observability.status === 0) {
    ok(observabilityOutput.includes('unisism-grafana'), 'compose observability inclui Grafana');
    ok(observabilityOutput.includes('unisism-prometheus'), 'compose observability inclui Prometheus');
    ok(observabilityOutput.includes('unisism-tempo'), 'compose observability inclui Tempo');
  }
}

function smokeDocs(): void {
  console.log('\nCenario 4 - Documentacao operacional');

  contains('docs/DEPLOY_PRODUCAO.md', 'npm run test:smoke:production', 'doc de deploy cita smoke de producao');
  contains('docs/DEPLOY_PRODUCAO.md', 'docker compose --env-file .env.prod', 'doc de deploy cita compose prod');
  contains('docs/MAPA_CONTEXTO_VALIDACAO.html', '12 · Producao', 'mapa registra etapa 12');
}

async function main(): Promise<void> {
  console.log('=== Smoke Etapa 12 - Producao e Deploy ===\n');

  smokeStaticFiles();
  smokeEnvFailFast();
  smokeDockerComposeConfig();
  smokeDocs();

  console.log(`\nAsserts: ${asserts}`);
  if (skips > 0) console.log(`Skips: ${skips}`);
  if (falhas > 0) {
    throw new Error(`Smoke Etapa 12 falhou: ${falhas} falha(s)`);
  }
  console.log('Smoke Etapa 12 OK');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
