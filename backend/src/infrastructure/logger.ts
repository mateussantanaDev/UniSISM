import pino from 'pino';
import { env } from '../shared/env';

const REDACT_PATHS = [
  'authorization',
  'cookie',
  'headers.authorization',
  'headers.cookie',
  'headers["x-api-key"]',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'body.senha',
  'body.senhaAtual',
  'body.novaSenha',
  'body.password',
  'body.token',
  'body.accessToken',
  'body.refreshToken',
  'body.resetToken',
  'payload.senha',
  'payload.senhaAtual',
  'payload.novaSenha',
  'payload.password',
  'payload.token',
  'payload.accessToken',
  'payload.refreshToken',
  'payload.resetToken',
  'senha',
  'senhaAtual',
  'novaSenha',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'resetToken',
  'apiKey',
  'err.config.headers.authorization',
  'err.config.headers.Authorization',
  'err.config.headers["x-api-key"]',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'unisism-ubs-backend' },
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
});
