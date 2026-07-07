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

// ---------- CORS — sem '*' em PROD; lista explícita ----------
const CORS_ORIGIN_RAW = opt('CORS_ORIGIN', 'http://localhost:5173');
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
  DATABASE_URL: required('DATABASE_URL'),
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

  // ---------- HTTPS / Security headers ----------
  /** App está atrás de proxy reverso TLS? Habilita HSTS + trust proxy. */
  TRUST_PROXY: optBool('TRUST_PROXY', isProd),
  HSTS_MAX_AGE: Number(opt('HSTS_MAX_AGE', '15552000')), // 180 dias

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

  // ---------- API key para consumo externo ----------
  API_KEY: opt('API_KEY', ''),
  API_KEY_HEADER: opt('API_KEY_HEADER', 'x-api-key'),

  // ---------- ClamAV ----------
  CLAMAV_HOST: opt('CLAMAV_HOST', ''),
  CLAMAV_PORT: Number(opt('CLAMAV_PORT', '3310')),
} as const;

if (isProd && env.EMAIL_PROVIDER === 'smtp' && !env.SMTP_HOST) {
  throw new Error(
    '[PROD] EMAIL_PROVIDER=smtp requer SMTP_HOST/SMTP_USER/SMTP_PASS configurados',
  );
}

export type Env = typeof env;
