/**
 * Configuração centralizada do backend.
 *
 * Filosofia:
 *   - Em DEV (NODE_ENV != 'production'): defaults permissivos pra subir rápido.
 *   - Em PROD: fail-fast no boot — secrets fracos, CORS aberto e SMTP inválido
 *     fazem o servidor recusar subir, evitando deploys inseguros.
 *
 * Para gerar secrets fortes localmente:
 *   openssl rand -base64 48
 */
import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Variável de ambiente ${name} é obrigatória`);
  }
  return v;
}

function opt(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

function optBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v == null || v === '') return fallback;
  return v.toLowerCase() === 'true' || v === '1';
}

const NODE_ENV = opt('NODE_ENV', 'development');
const isProd = NODE_ENV === 'production';

// ---------- JWT secrets — minimum 32 chars + diferentes em PROD ----------
const FRACOS = new Set([
  'dev-jwt-secret', 'dev-refresh-secret',
  'change-me-in-prod', 'change-me-refresh',
  'troque-por-um-segredo-forte', 'troque-por-um-refresh-forte',
  'secret', 'changeme', '123456',
]);

function jwtSecretValido(name: string, valor: string): string {
  if (!isProd) return valor;
  if (FRACOS.has(valor)) {
    throw new Error(
      `[PROD] ${name} é placeholder fraco. Gere com: openssl rand -base64 48`,
    );
  }
  if (valor.length < 32) {
    throw new Error(
      `[PROD] ${name} muito curto (${valor.length} chars). Mínimo 32. Use openssl rand -base64 48`,
    );
  }
  return valor;
}

const JWT_SECRET = jwtSecretValido('JWT_SECRET', opt('JWT_SECRET', 'dev-jwt-secret'));
const JWT_REFRESH_SECRET = jwtSecretValido(
  'JWT_REFRESH_SECRET',
  opt('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
);
if (isProd && JWT_SECRET === JWT_REFRESH_SECRET) {
  throw new Error('[PROD] JWT_SECRET e JWT_REFRESH_SECRET devem ser DIFERENTES');
}

function assertChoice(name: string, value: string, allowed: readonly string[]): void {
  if (!allowed.includes(value)) {
    throw new Error(`[ENV] ${name} invalido: "${value}". Use: ${allowed.join(', ')}`);
  }
}

function assertPositiveNumber(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`[PROD] ${name} deve ser numero positivo`);
  }
}

function assertNonEmptyProd(context: string, values: Array<[string, string]>): void {
  if (!isProd) return;
  const faltando = values
    .filter(([, value]) => value.length === 0)
    .map(([name]) => name);
  if (faltando.length > 0) {
    throw new Error(`[PROD] ${context} requer ${faltando.join(', ')} configurado(s)`);
  }
}

// ---------- CORS — sem '*' em PROD; lista explícita ----------
const CORS_ORIGIN_RAW = opt(
  'CORS_ORIGIN',
  'https://unisism.vercel.app,http://localhost:5173,http://localhost:3000,http://localhost:4173',
);
if (isProd) {
  const lista = CORS_ORIGIN_RAW.split(',').map((s) => s.trim()).filter(Boolean);
  if (lista.length === 0 || lista.includes('*')) {
    throw new Error('[PROD] CORS_ORIGIN deve ser lista explícita de origens (sem `*`)');
  }
  for (const origem of lista) {
    if (!/^https:\/\//i.test(origem) && !origem.startsWith('http://localhost')) {
      throw new Error(`[PROD] CORS_ORIGIN "${origem}" deve ser https:// (apenas localhost pode ser http)`);
    }
  }
}

export const env = {
  NODE_ENV,
  isProd,
  PORT: Number(opt('PORT', '3333')),
  LOG_LEVEL: opt('LOG_LEVEL', 'info'),
  CORS_ORIGIN: CORS_ORIGIN_RAW,
  CORS_ALLOW_VERCEL_PREVIEW: optBool('CORS_ALLOW_VERCEL_PREVIEW', !isProd),
  CORS_VERCEL_PROJECT: opt('CORS_VERCEL_PROJECT', 'unisism'),
  DATABASE_URL: required('DATABASE_URL'),
  METRICS_ENABLED: optBool('METRICS_ENABLED', true),
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_EXPIRES_IN: opt('JWT_EXPIRES_IN', '30m'),
  JWT_REFRESH_EXPIRES_IN: opt('JWT_REFRESH_EXPIRES_IN', '7d'),
  BCRYPT_ROUNDS: Number(opt('BCRYPT_ROUNDS', '10')),
  UPLOAD_DIR: opt('UPLOAD_DIR', './uploads'),
  MAX_UPLOAD_MB: Number(opt('MAX_UPLOAD_MB', '10')),
  PASSWORD_MIN_LENGTH: Number(opt('PASSWORD_MIN_LENGTH', '8')),
  PASSWORD_HISTORY_SIZE: Number(opt('PASSWORD_HISTORY_SIZE', '5')),
  PASSWORD_VALIDITY_DAYS: Number(opt('PASSWORD_VALIDITY_DAYS', '180')),
  RETENCAO_PRONTUARIO_ANOS: Number(opt('RETENCAO_PRONTUARIO_ANOS', '20')),
  RETENCAO_AUDIT_LOG_ANOS: Number(opt('RETENCAO_AUDIT_LOG_ANOS', '5')),
  RETENCAO_SESSAO_DIAS: Number(opt('RETENCAO_SESSAO_DIAS', '90')),
  APP_RESET_SENHA_URL: opt(
    'APP_RESET_SENHA_URL',
    'https://app.unisism.aguasbelas.pe.gov.br/redefinir',
  ),

  // ---------- HTTPS / Security headers ----------
  /** App está atrás de proxy reverso TLS? Habilita HSTS + trust proxy. */
  TRUST_PROXY: optBool('TRUST_PROXY', isProd),
  HSTS_MAX_AGE: Number(opt('HSTS_MAX_AGE', '15552000')), // 180 dias
  HTTP_KEEP_ALIVE_TIMEOUT_MS: Number(opt('HTTP_KEEP_ALIVE_TIMEOUT_MS', '65000')),
  HTTP_HEADERS_TIMEOUT_MS: Number(opt('HTTP_HEADERS_TIMEOUT_MS', '66000')),
  HTTP_REQUEST_TIMEOUT_MS: Number(opt('HTTP_REQUEST_TIMEOUT_MS', '300000')),
  SHUTDOWN_GRACE_MS: Number(opt('SHUTDOWN_GRACE_MS', '10000')),

  // ---------- SMTP (envio real de email) ----------
  /** `smtp` (real) ou `log` (apenas loga, default em dev). */
  EMAIL_PROVIDER: opt('EMAIL_PROVIDER', isProd ? 'smtp' : 'log'),
  SMTP_HOST: opt('SMTP_HOST', ''),
  SMTP_PORT: Number(opt('SMTP_PORT', '587')),
  SMTP_USER: opt('SMTP_USER', ''),
  SMTP_PASS: opt('SMTP_PASS', ''),
  SMTP_SECURE: optBool('SMTP_SECURE', false), // true só pra porta 465 (SMTPS)
  EMAIL_FROM: opt('EMAIL_FROM', 'UNISISM <noreply@unisism.local>'),
  EMAIL_REPLY_TO: opt('EMAIL_REPLY_TO', ''),

  // ---------- OpenTelemetry ----------
  OTEL_ENABLED: optBool('OTEL_ENABLED', false),
  OTEL_SERVICE_NAME: opt('OTEL_SERVICE_NAME', 'unisism-backend'),
  /** Endpoint OTLP/HTTP. Ex.: http://localhost:4318 (Tempo, Jaeger, Grafana Agent). */
  OTEL_EXPORTER_OTLP_ENDPOINT: opt('OTEL_EXPORTER_OTLP_ENDPOINT', ''),

  // ---------- Storage (já existia, formalizado aqui) ----------
  STORAGE_PROVIDER: opt('STORAGE_PROVIDER', 'disk') as 'disk' | 's3',
  S3_ENDPOINT: opt('S3_ENDPOINT', ''),
  S3_REGION: opt('S3_REGION', 'us-east-1'),
  S3_BUCKET: opt('S3_BUCKET', ''),
  S3_ACCESS_KEY: opt('S3_ACCESS_KEY', ''),
  S3_SECRET_KEY: opt('S3_SECRET_KEY', ''),
  S3_FORCE_PATH_STYLE: optBool('S3_FORCE_PATH_STYLE', true),

  // ---------- Cache / workers ----------
  REDIS_URL: opt('REDIS_URL', ''),
  CACHE_TTL_ARVORE: Number(opt('CACHE_TTL_ARVORE', '60')),
  CACHE_TTL_DASHBOARD: Number(opt('CACHE_TTL_DASHBOARD', '30')),
  OUTBOX_ENABLED: optBool('OUTBOX_ENABLED', true),
  OUTBOX_INTERVAL_MS: Number(opt('OUTBOX_INTERVAL_MS', '500')),

  // ---------- API key para consumo externo ----------
  API_KEY: opt('API_KEY', ''),
  API_KEY_HEADER: opt('API_KEY_HEADER', 'x-api-key'),

  // ---------- ClamAV ----------
  CLAMAV_HOST: opt('CLAMAV_HOST', ''),
  CLAMAV_PORT: Number(opt('CLAMAV_PORT', '3310')),

  // ---------- Push ----------
  PUSH_PROVIDER: opt('PUSH_PROVIDER', 'noop'),
  PUSH_DISPATCHER_ENABLED: optBool('PUSH_DISPATCHER_ENABLED', true),
  PUSH_DISPATCHER_INTERVAL_MS: Number(opt('PUSH_DISPATCHER_INTERVAL_MS', '15000')),
  PUSH_DEVICE_CLEANUP_CRON: opt('PUSH_DEVICE_CLEANUP_CRON', '30 3 1 * *'),
  PUSH_DEVICE_CLEANUP_CRON_TZ: opt('PUSH_DEVICE_CLEANUP_CRON_TZ', 'UTC'),
  PUSH_DEVICE_TTL_DIAS: Number(opt('PUSH_DEVICE_TTL_DIAS', '90')),
  NTFY_BASE_URL: opt('NTFY_BASE_URL', ''),
  NTFY_AUTH_TOKEN: opt('NTFY_AUTH_TOKEN', ''),
  NTFY_TIMEOUT_MS: Number(opt('NTFY_TIMEOUT_MS', '0')),

  // ---------- Cron / TFD ----------
  RECOVERY_PURGE_CRON: opt('RECOVERY_PURGE_CRON', '0 */6 * * *'),
  RECOVERY_PURGE_CRON_TZ: opt('RECOVERY_PURGE_CRON_TZ', 'UTC'),
  TFD_SALDO_CRON: opt('TFD_SALDO_CRON', '30 0 1 * *'),
  TFD_SALDO_CRON_TZ: opt('TFD_SALDO_CRON_TZ', 'UTC'),
  TFD_SIGN_CERT_PATH: opt('TFD_SIGN_CERT_PATH', ''),
  TFD_SIGN_CERT_PASSWORD: opt('TFD_SIGN_CERT_PASSWORD', ''),
  TFD_SIGN_REQUIRED: optBool('TFD_SIGN_REQUIRED', false),

  // ---------- Demo/dev ----------
  DEMO_SEED_ON_BOOT: optBool('DEMO_SEED_ON_BOOT', false),
} as const;

assertChoice('EMAIL_PROVIDER', env.EMAIL_PROVIDER, ['smtp', 'log']);
assertChoice('STORAGE_PROVIDER', env.STORAGE_PROVIDER, ['disk', 's3']);
assertChoice('PUSH_PROVIDER', env.PUSH_PROVIDER, ['noop', 'ntfy']);

if (isProd) {
  assertPositiveNumber('PORT', env.PORT);
  assertPositiveNumber('BCRYPT_ROUNDS', env.BCRYPT_ROUNDS);
  assertPositiveNumber('MAX_UPLOAD_MB', env.MAX_UPLOAD_MB);
  assertPositiveNumber('SMTP_PORT', env.SMTP_PORT);
  assertPositiveNumber('HTTP_KEEP_ALIVE_TIMEOUT_MS', env.HTTP_KEEP_ALIVE_TIMEOUT_MS);
  assertPositiveNumber('HTTP_HEADERS_TIMEOUT_MS', env.HTTP_HEADERS_TIMEOUT_MS);
  assertPositiveNumber('HTTP_REQUEST_TIMEOUT_MS', env.HTTP_REQUEST_TIMEOUT_MS);
  assertPositiveNumber('SHUTDOWN_GRACE_MS', env.SHUTDOWN_GRACE_MS);

  if (env.HTTP_HEADERS_TIMEOUT_MS <= env.HTTP_KEEP_ALIVE_TIMEOUT_MS) {
    throw new Error(
      '[PROD] HTTP_HEADERS_TIMEOUT_MS deve ser maior que HTTP_KEEP_ALIVE_TIMEOUT_MS',
    );
  }
}

if (env.EMAIL_PROVIDER === 'smtp') {
  assertNonEmptyProd('EMAIL_PROVIDER=smtp', [
    ['SMTP_HOST', env.SMTP_HOST],
    ['SMTP_USER', env.SMTP_USER],
    ['SMTP_PASS', env.SMTP_PASS],
  ]);
}

if (env.STORAGE_PROVIDER === 's3') {
  assertNonEmptyProd('STORAGE_PROVIDER=s3', [
    ['S3_BUCKET', env.S3_BUCKET],
    ['S3_ACCESS_KEY', env.S3_ACCESS_KEY],
    ['S3_SECRET_KEY', env.S3_SECRET_KEY],
  ]);
}

if (env.PUSH_PROVIDER === 'ntfy') {
  assertNonEmptyProd('PUSH_PROVIDER=ntfy', [
    ['NTFY_BASE_URL', env.NTFY_BASE_URL],
  ]);
}

export type Env = typeof env;
