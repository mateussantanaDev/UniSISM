# 14 · Observabilidade

> Logs estruturados (pino) · métricas (Prometheus) · traces distribuídos
> (OpenTelemetry → Tempo) · dashboards Grafana · request id propagado fim-a-fim.

---

## Sinais

| Sinal | Tecnologia | Destino |
|---|---|---|
| Logs | `pino` JSON | stdout → fluentbit / loki (opcional) |
| Métricas | `prom-client` | Prometheus → Grafana |
| Traces | `@opentelemetry/sdk-node` | OTLP HTTP → Tempo → Grafana |
| Healthcheck | `GET /v1/health` | Caddy + uptime monitor |
| Audit | tabelas `*_audit` | Postgres (compliance) |

## Request ID

Middleware `src/presentation/middlewares/requestId.ts`:

- Gera UUIDv4 se request não vier com `X-Request-Id`.
- Propaga via context (`AsyncLocalStorage`).
- Aparece em:
  - Response header `X-Request-Id`
  - Todos os logs estruturados
  - Spans OTel (attribute `request.id`)
  - Auditoria operacional

> Toda response, mesmo de erro, devolve `X-Request-Id`. Em suporte, peça o
> request id e consiga rastrear toda a cadeia de logs/traces.

## Logs

### Configuração

```typescript
import pino from 'pino';

const logger = pino({
  level: env.LOG_LEVEL ?? 'info',
  formatters: {
    level(label) { return { level: label }; },
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.body.senha',
      'req.body.novaSenha',
      'req.body.senhaAtual',
      'paciente.cpf',          // se aparecer no contexto
    ],
    censor: '***',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
```

### Padrão de log

```typescript
logger.info({
  requestId,
  atendenteId,
  ubsId,
  rota: 'POST /encaminhamentos',
  protocolo: 'UBS-2026-000123',
  duracaoMs: 234,
}, 'encaminhamento consolidado');
```

### Níveis

| Nível | Quando |
|---|---|
| `fatal` | Erro que vai derrubar o processo |
| `error` | Erro inesperado, mas processo segue (500) |
| `warn` | Estado degradado (ClamAV indisponível, etc.) |
| `info` | Eventos operacionais relevantes |
| `debug` | Detalhe para dev (não usar em prod default) |
| `trace` | Verbose extremo |

### Não logar

- Senhas, tokens, refresh tokens (mesmo hash em log é desnecessário)
- CPF completo de paciente (mascarar últimos 4 dígitos)
- Payload de prontuário (CID, conduta, queixa)
- Conteúdo de email/SMS
- URLs assinadas

## Métricas (Prometheus)

### Endpoint

```
GET /metrics                          (sem prefixo /v1)
```

Em prod, restringir por firewall + reverse proxy autenticado. Default
binding: rede interna apenas.

### Métricas built-in

- `process_cpu_seconds_total`
- `process_resident_memory_bytes`
- `nodejs_eventloop_lag_seconds`
- `nodejs_active_handles`
- `nodejs_active_requests`

### Métricas custom (`src/infrastructure/metrics/`)

```
http_requests_total{rota, metodo, status}
http_request_duration_seconds{rota, metodo} (histogram)
encaminhamentos_consolidados_total{prefeituraId, ubsId}
encaminhamentos_aprovados_total{prefeituraId}
encaminhamentos_pendencias_total{prefeituraId}
encaminhamentos_rejeitados_total{prefeituraId}
tfd_viagens_iniciadas_total{prefeituraId}
tfd_viagens_concluidas_total{prefeituraId}
tfd_audit_chain_length{prefeituraId} (gauge)
ocr_extract_duration_seconds{result} (histogram)
pdf_compression_duration_seconds (histogram)
clamav_scan_duration_seconds{status} (histogram)
clamav_scan_pending_count (gauge)
relatorios_geracao_duration_seconds{tipo, formato} (histogram)
push_notification_dispatched_total{tipo}
```

**Labels com `prefeituraId`** permitem dashboard per-tenant.

### SLOs sugeridos

| SLO | Target |
|---|---|
| Disponibilidade `/auth/login` | 99.9% / 30 dias |
| p95 latency `/auth/login` | < 600 ms |
| p95 latency `/encaminhamentos/extract-pdf` | < 4 s |
| p95 latency `/dashboard/metrics` | < 200 ms |
| Lag de ClamAV scan | < 5 min (P99) |
| Tempo de geração de relatório PDF | < 60 s (P95) |
| Integridade hash chain TFD | 100% (cron hourly) |

## Tracing (OpenTelemetry)

### Setup

`src/main/tracing.ts`:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  serviceName: 'unisism-backend',
  traceExporter: new OTLPTraceExporter({ url: env.OTEL_EXPORTER_OTLP_ENDPOINT }),
  instrumentations: [getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': { enabled: false },
  })],
});
sdk.start();
```

### Spans custom

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('unisism');

await tracer.startActiveSpan('OcrExtractor.extract', async (span) => {
  try {
    const result = await ocr.run(pdf);
    span.setAttribute('ocr.pages', result.pages);
    span.setAttribute('ocr.score', result.score);
    return result;
  } finally {
    span.end();
  }
});
```

### Atributos sensíveis

Não colocar CPF, CID, queixa em atributos de span. Mascarar ou omitir.

### Sampling

- Dev: 100%.
- Prod: 10% default (head-based) + 100% para erros (`record_exception`).
- Trace context propagado via header `traceparent`.

## Dashboards Grafana

| Dashboard | Painel |
|---|---|
| **Overview** | RPS · latência · erros 5xx · uptime · CPU/mem |
| **Encaminhamentos** | Volume por dia · aprovação · pendência · tempo médio decisão |
| **OCR / Storage** | Latência OCR · taxa de compressão · uso S3 · scan ClamAV |
| **TFD** | Viagens ativas · ocupação · custo por km · saldo por veículo · cadeia íntegra |
| **Auth** | Logins/h · falhas · reset de senha · bloqueios |
| **Per-tenant** | Mesmas métricas filtradas por `prefeituraId` |

## Alertas

| Alerta | Condição | Severidade |
|---|---|---|
| Backend down | `up{job="backend"} == 0` por 2 min | crítica |
| Postgres lag | `pg_stat_replication_lag > 30s` | alta |
| Disco cheio | `disk_usage > 85%` | alta |
| Taxa 5xx alta | `rate(http_5xx[5m]) > 1%` | alta |
| ClamAV pendente alto | `clamav_scan_pending_count > 50` | média |
| Hash chain quebrada | `tfd_audit_chain_valid == 0` | **crítica + email DPO** |
| Senha resetada por admin | qualquer event | média (audit) |
| 10+ falhas de login mesmo IP / min | rate-limit já bloqueou, mas alerta | informativa |

## Logs de aplicação por categoria

| Categoria | Onde |
|---|---|
| Sessões / auth | `auditoria_logs` + pino |
| Mutação em PEC | `paciente_prontuario_audit` (imutável) |
| Geração de relatório | `relatorio_audit` (imutável) |
| Evento TFD | `tfd_audit_log` (imutável + hash) |
| Erros 5xx | pino + Grafana |
| Latência | OTel spans + Prometheus histograms |

## Runbook: investigar uma falha do paciente

```
1. Paciente reporta: "App diz erro ao baixar resposta SUS"
2. Pega request id (se app expõe) ou data/hora aproximada
3. No Grafana, filtrar logs:
   { service: "unisism-backend", requestId: "<id>" }
   OU
   { rota: "/v1/paciente-app/anexos/*/download", criadoEm: "<near>" }
4. Olha trace OTel — onde o tempo foi gasto.
5. Olha métrica clamav_scan_duration_seconds — se anexo ainda pendente.
6. Reage:
   - PENDING > 5 min → re-fila scan
   - INFECTED → audit + alerta
   - FALHOU → re-tenta + alerta
```

## Healthcheck

```
GET /v1/health
→ 200 { "ok": true }
```

Em prod, healthcheck composto opcional:

```
GET /v1/health/deep
→ 200 {
    "ok": true,
    "postgres": "ok",
    "redis": "ok",
    "minio": "ok",
    "clamav": "ok" | "degraded"
  }
```

## Cron jobs

| Job | Frequência | Função |
|---|---|---|
| Scan ClamAV worker | contínuo | Consome `anexos` PENDENTE |
| Verifica hash chain | hourly | `GET /tfd/auditoria/verificar` por tenant |
| Limpeza de sessões expiradas | daily | DELETE WHERE expiraEm < now - 30d |
| Limpeza de relatórios expirados | daily | DELETE storage onde linkExpiraEm < now |
| Limpeza de tentativas_login | daily | DELETE WHERE criadoEm < now - 6m |
| Backup Postgres | daily | `pg_dump --format=custom` |
| `freshclam` (ClamAV signatures) | hourly | Update virus DB |
