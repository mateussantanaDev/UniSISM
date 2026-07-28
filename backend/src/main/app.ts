import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from '../shared/env';
import { requestId } from '../presentation/middlewares/requestId';
import { errorHandler } from '../presentation/middlewares/errorHandler';
import { metricsMiddleware } from '../presentation/middlewares/metrics';
import { serverTime } from '../presentation/middlewares/serverTime';
import { apiKeyGuard } from '../presentation/middlewares/apiKey';
import { buildRoutes } from '../presentation/routes';
import { buildContainer, type Container } from './container';
import { metricsRegistry } from '../infrastructure/metrics/prometheus';
import { logger } from '../infrastructure/logger';

export interface BuiltApp {
  app: Express;
  container: Container;
}

export function buildApp(): BuiltApp {
  const app = express();

  // ---------- Trust proxy (HTTPS atrás de Caddy/nginx/Cloudflare) ----------
  // Garante: req.ip = IP real do cliente (não o proxy) e
  //          req.protocol = 'https' (necessário pra HSTS funcionar corretamente).
  // Em dev (sem proxy), usar 'loopback' permite reqs locais sem warning.
  if (env.TRUST_PROXY) {
    app.set('trust proxy', 1); // 1 = confia no primeiro hop (Caddy/nginx)
  } else {
    app.set('trust proxy', 'loopback');
  }

  app.disable('x-powered-by');

  // ---------- Helmet — security headers + HSTS ----------
  // HSTS força HTTPS no cliente por N dias. Só faz sentido em PROD com TLS real.
  // includeSubDomains + preload viabiliza inscrição em https://hstspreload.org
  app.use(
    helmet({
      hsts: env.isProd
        ? { maxAge: env.HSTS_MAX_AGE, includeSubDomains: true, preload: true }
        : false,
      // CSP é definido pelo proxy reverso (Caddy/nginx), não aqui — backend é JSON.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // permite frontend
      // Outros defaults do helmet ficam ativos: noSniff, frameguard, xss-filter etc.
    }),
  );

  // ---------- CORS ----------
  // Em PROD, env.ts já garante que CORS_ORIGIN é lista explícita https:// (sem '*').
  // O callback lida com edge cases: app mobile sem Origin + LAN em dev.
  app.use(
    cors({
      origin: (origin, cb) => {
        const allow = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
        if (!origin) return cb(null, true); // apps mobile / cURL / backend-to-backend
        if (allow.includes(origin)) return cb(null, true);
        if (/\.vercel\.app$/i.test(origin)) return cb(null, true); // permite Vercel (produção e preview)
        if (allow.includes('*') && !env.isProd) return cb(null, true);
        if (
          !env.isProd
          && /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(
            origin,
          )
        ) {
          return cb(null, true);
        }
        logger.warn({ origin }, 'CORS: origin não permitida');
        cb(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'X-Request-Id', 'x-api-key', env.API_KEY_HEADER],
    }),
  );
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestId);
  app.use(serverTime);
  app.use(metricsMiddleware);
  app.use(apiKeyGuard);
  app.use(
    morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined', {
      skip: (req) => req.path === '/v1/health' || req.path === '/metrics',
    }),
  );

  const container = buildContainer();
  app.use('/v1', buildRoutes(container));

  // Endpoint Prometheus — interno, sem auth. Em produção, restringir por NetworkPolicy/firewall.
  if ((process.env['METRICS_ENABLED'] ?? 'true') === 'true') {
    app.get('/metrics', async (_req, res) => {
      res.set('Content-Type', metricsRegistry.contentType);
      res.end(await metricsRegistry.metrics());
    });
  }

  app.use(errorHandler);

  return { app, container };
}
