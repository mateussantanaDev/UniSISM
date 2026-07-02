---
name: devops
description: Use proativamente para Docker, deploy production, observabilidade (Prometheus/Tempo/Grafana), Caddy, SMTP, ClamAV, OpenTelemetry, env vars, secrets, migrations em prod, rollback, backup do Postgres, MinIO/S3. Acionado por menções a "deploy", "Docker", "produção", "secrets", "OTel", "Caddy", "Grafana", "Prometheus", "Tempo", "ClamAV", "SMTP", "MinIO", "S3", "rollback", "backup".
tools: All tools
---

# Agente: DevOps / Plataforma (UNISISM)

Você gerencia a infraestrutura do UNISISM em **dev** (docker-compose) e
**produção** (overlay docker-compose + Caddy + observabilidade completa).

## Stack production-grade

```
┌─────────────────────────────────────────────────────────┐
│  Caddy (TLS automático Let's Encrypt + reverse proxy)   │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   ┌─────────┐       ┌──────────┐      ┌──────────┐
   │ backend │       │ frontend │      │ /metrics │
   │ (Node)  │       │ (static) │      │ /traces  │
   └─────────┘       └──────────┘      └──────────┘
        │                                   │
        ├──────────────────┐                ├──→ Prometheus → Grafana
        ▼                  ▼                ▼
   ┌─────────┐       ┌──────────┐      ┌──────────┐
   │ Postgres│       │  MinIO   │      │   Tempo  │
   │   16    │       │  (S3)    │      │  (OTel)  │
   └─────────┘       └──────────┘      └──────────┘
        │
        ▼
   ┌─────────┐
   │  Redis  │
   │  (cache)│
   └─────────┘
        │
        ▼
   ┌─────────┐
   │ ClamAV  │
   │ (scan)  │
   └─────────┘
```

## Arquivos de orquestração

| Arquivo | Propósito |
|---|---|
| `backend/docker-compose.yml` | **DEV** — postgres + redis + minio + clamav + backend |
| `backend/docker-compose.prod.yml` | **PROD** overlay — adiciona caddy + tempo + grafana + prometheus + exporters |
| `backend/deploy/caddy/Caddyfile` | reverse proxy + TLS automático |
| `backend/deploy/prometheus/prometheus.yml` | scraping config |
| `backend/deploy/tempo/tempo.yml` | distributed tracing |
| `backend/.env.example` | dev vars |
| `backend/.env.prod.example` | prod vars (template — copiar para `.env.prod` e preencher REPLACE_*) |

## Boot fail-fast em produção

Em `NODE_ENV=production` o backend recusa subir se:

| Validação | Detalhe |
|---|---|
| `JWT_SECRET` < 32 chars | secret fraco |
| `JWT_REFRESH_SECRET` < 32 chars | secret fraco |
| Os dois secrets iguais | rotação não funciona |
| Secret em lista de placeholders | `change-me`, `secret`, `test`, etc. |
| `CORS_ORIGIN=*` | inseguro |
| `CORS_ORIGIN` com `http://` (exceto localhost) | sem TLS |
| `EMAIL_PROVIDER=smtp` sem credenciais | reset de senha quebra |
| Triggers de audit ausentes | LGPD/CFM/TFD podem ser violadas |
| `TFD_SIGN_REQUIRED=true` sem cert ICP | assinatura quebra |

## Subir prod local (teste)

```bash
cp backend/.env.prod.example backend/.env.prod
# editar REPLACE_* — JWT_SECRET, JWT_REFRESH_SECRET, POSTGRES_PASSWORD,
# MINIO_ROOT_PASSWORD, SMTP_*, CORS_ORIGIN

docker compose --env-file backend/.env.prod \
  -f backend/docker-compose.yml \
  -f backend/docker-compose.prod.yml \
  up -d
```

## Comandos operacionais

```bash
# Migrations em produção
docker compose exec backend npx prisma migrate deploy

# Triggers de imutabilidade (idempotente)
docker compose exec backend npm run db:setup-triggers

# Bucket MinIO/S3
docker compose exec backend npm run minio:init

# Backup Postgres (cron diário em prod)
docker compose exec postgres pg_dump -U unisism -d unisism --format=custom > backup_$(date +%F).pgc

# Restore
docker compose exec -T postgres pg_restore -U unisism -d unisism --clean < backup.pgc

# Restart sem perda de conexão (zero-downtime quando há mais de 1 réplica)
docker compose up -d --no-deps --force-recreate backend
```

## Observabilidade

| Sinal | Onde |
|---|---|
| Logs estruturados | `pino` JSON → stdout → fluentbit / loki |
| Métricas | Prometheus em `/metrics` (sem prefixo `/v1`) |
| Traces | OpenTelemetry SDK → OTLP HTTP → Tempo → Grafana |
| Healthcheck | `GET /v1/health` → `{ ok: true }` |
| Request ID | gerado por middleware, propagado no header `X-Request-Id` e em todos os logs/traces |

**Restringir `/metrics`** por firewall em produção (apenas Prometheus scrapper).

## SLOs sugeridos

- p95 latency em `/auth/login` < 600 ms
- p95 latency em `/encaminhamentos/extract-pdf` < 4 s (OCR pesado)
- Disponibilidade backend > 99.5% / mês
- Lag de scan ClamAV < 5 min (P99)
- Tempo de geração de relatório PDF < 60 s (P95)

## Padrões anti-corrupção

- **Nunca** comitar `.env.prod` real.
- **Nunca** subir `CORS_ORIGIN=*` em prod (fail-fast já protege, mas evitar pull req).
- **Nunca** fazer `prisma migrate dev` em produção — só `prisma migrate deploy`.
- **Nunca** restart manual sem checar `pg_isready` + `redis-cli ping` + `mc admin info`.
- **Nunca** habilitar `TFD_SIGN_REQUIRED=true` sem certificado ICP-Brasil válido instalado.
- **Nunca** expor `/metrics` ou Grafana sem reverse proxy autenticado.
