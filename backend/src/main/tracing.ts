/**
 * OpenTelemetry tracing — DEVE ser importado ANTES de qualquer outro import
 * que precise ser instrumentado (express, http, prisma, ioredis, pg).
 *
 * Habilitar via env:
 *   OTEL_ENABLED=true
 *   OTEL_SERVICE_NAME=unisism-backend
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
 *
 * Backend de tracing recomendado (gratuito, self-hosted):
 *   - Grafana Tempo + Grafana (stack completo) — `grafana/tempo` no docker
 *   - Jaeger (legado mas estável) — `jaegertracing/all-in-one`
 *   - SigNoz (UI mais polida) — `signoz/signoz`
 *
 * Sem essas variáveis configuradas, o módulo NÃO inicializa nada (zero overhead).
 */
import { env } from '../shared/env';

const enabled = env.OTEL_ENABLED;
const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (enabled && endpoint) {
  // Imports dinâmicos pra zero overhead quando desligado.
  const { NodeSDK } = require('@opentelemetry/sdk-node') as typeof import('@opentelemetry/sdk-node');
  const {
    getNodeAutoInstrumentations,
  } = require('@opentelemetry/auto-instrumentations-node') as typeof import('@opentelemetry/auto-instrumentations-node');
  const {
    OTLPTraceExporter,
  } = require('@opentelemetry/exporter-trace-otlp-http') as typeof import('@opentelemetry/exporter-trace-otlp-http');

  const sdk = new NodeSDK({
    serviceName: env.OTEL_SERVICE_NAME,
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint.replace(/\/$/, '')}/v1/traces`,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Reduz ruído — desabilita instrumentações pouco úteis.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });

  try {
    sdk.start();
    console.log(`[otel] tracing habilitado → ${endpoint}/v1/traces`);
  } catch (err) {
    console.error('[otel] falha ao iniciar tracing:', err);
  }

  // Graceful shutdown — flush spans pendentes.
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      sdk.shutdown().catch(() => undefined);
    });
  }
}
