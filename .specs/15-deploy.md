# 15 · Deploy

> Stack production-grade com Caddy (TLS automático), backend Node em
> container, Postgres + Redis + MinIO + ClamAV em sidecars, Prometheus +
> Tempo + Grafana para observabilidade.

Detalhes completos em `backend/docs/DEPLOY_PRODUCAO.md` (~600 linhas).

---

## Topologia em produção

```
            ┌──────────────────────────────────────┐
            │  Caddy (TLS + reverse proxy)         │
            │  - Let's Encrypt automático          │
            │  - request body 12 MB                │
            │  - HSTS, headers de segurança        │
            └──────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   ┌─────────┐       ┌──────────┐      ┌──────────┐
   │ backend │×N     │ frontend │      │ /metrics │
   │ (Node)  │       │ (static  │      │ /traces  │
   │ :3333   │       │  via CDN)│      │ (interno)│
   └─────────┘       └──────────┘      └──────────┘
        │
        ├─────► Postgres (storage primário)
        ├─────► Redis (cache + rate limit)
        ├─────► MinIO/S3 (anexos)
        ├─────► ClamAV (TCP 3310)
        ├─────► SMTP (Brevo / SES / sendgrid)
        ├─────► FCM (push)
        ├─────► Tempo (OTel traces)
        └─────► Prometheus (metrics scrape)
```

## Arquivos de orquestração

| Arquivo | Propósito |
|---|---|
| `backend/docker-compose.yml` | **DEV** — postgres + redis + minio + clamav + backend |
| `backend/docker-compose.prod.yml` | **PROD overlay** — adiciona caddy + tempo + grafana + prometheus + exporters |
| `backend/deploy/caddy/Caddyfile` | reverse proxy + TLS auto |
| `backend/deploy/prometheus/prometheus.yml` | scrape config |
| `backend/deploy/tempo/tempo.yml` | trace storage |
| `backend/.env.example` | dev vars |
| `backend/.env.prod.example` | prod vars (template) |

## Variáveis de ambiente

### Obrigatórias em produção

| Var | Exemplo (sanitizado) | Notas |
|---|---|---|
| `NODE_ENV` | `production` | dispara fail-fast |
| `PORT` | `3333` | |
| `DATABASE_URL` | `postgresql://<user>:<pwd>@<host>:5432/<db>` | |
| `REDIS_URL` | `redis://<host>:6379` | |
| `JWT_SECRET` | `<base64 ≥ 32 chars>` | gerar com `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | `<base64 ≥ 32 chars, ≠ JWT_SECRET>` | |
| `CORS_ORIGIN` | `https://app.<dominio-cliente>,https://admin.<dominio-cliente>` | sem `*`, sem `http://` |
| `STORAGE_KIND` | `s3` | ou `disk` (não recomendado em prod) |
| `S3_ENDPOINT` | `https://<bucket-region>.amazonaws.com` ou MinIO/B2 endpoint | |
| `S3_BUCKET` | `<bucket>` | |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | … | |
| `S3_REGION` | `us-east-1` ou região do provedor | |
| `CLAMAV_HOST` / `CLAMAV_PORT` | `clamav` `3310` | |
| `EMAIL_PROVIDER` | `smtp` | |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | … | |
| `SMTP_FROM` | `naoresponda@<dominio-cliente>` | |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://tempo:4318/v1/traces` | |
| `FCM_PROJECT_ID` / `FCM_CLIENT_EMAIL` / `FCM_PRIVATE_KEY` | … | conta de serviço Firebase |

### Opcionais

| Var | Default | Notas |
|---|---|---|
| `LOG_LEVEL` | `info` | dev: `debug` |
| `TFD_SIGN_REQUIRED` | `false` | quando `true` exige cert ICP |
| `TFD_ICP_CERT_PATH` | `/opt/icp/cert.pfx` | |
| `TFD_ICP_CERT_PASSWORD` | `<senha-cert>` | |
| `RATE_LIMIT_DISABLED` | `false` | só para testes |
| `OTEL_SAMPLING_RATIO` | `0.1` | 10% em prod |

## Boot fail-fast

Em `NODE_ENV=production` o backend recusa subir se:

- `JWT_SECRET` ou `JWT_REFRESH_SECRET` < 32 chars
- Secrets em blocklist de placeholders fracos
- Os dois secrets iguais
- `CORS_ORIGIN=*` ou contém `http://` (exceto localhost)
- `EMAIL_PROVIDER=smtp` sem `SMTP_HOST/USER/PASS`
- Triggers de imutabilidade do audit não estiverem ativos
- Cert ICP ausente quando `TFD_SIGN_REQUIRED=true`

## Subir em prod local (teste)

```bash
# 1. Configurar
cp backend/.env.prod.example backend/.env.prod
# Editar REPLACE_* — gerar JWT_SECRET com openssl rand -base64 48

# 2. Subir
docker compose --env-file backend/.env.prod \
  -f backend/docker-compose.yml \
  -f backend/docker-compose.prod.yml \
  up -d

# 3. Migrations
docker compose exec backend npx prisma migrate deploy

# 4. Triggers de imutabilidade
docker compose exec backend npm run db:setup-triggers

# 5. Bucket S3 (primeira vez)
docker compose exec backend npm run minio:init

# 6. Smoke test
curl https://<dominio>/v1/health
# → { "ok": true }
```

## Provisionar primeiro DESENVOLVEDOR

Após primeira subida, criar o primeiro DEV via script:

```bash
docker compose exec backend node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
(async () => {
  const dev = await prisma.atendente.create({
    data: {
      matricula: 'DEV-001',
      nome: 'DESENVOLVEDOR PRINCIPAL',
      email: 'dev@<dominio-cliente>',
      senhaHash: await bcrypt.hash(process.env.DEV_SENHA, 12),
      cpf: '00000000000',
      role: 'DESENVOLVEDOR',
      cargo: 'TECNOLOGIA',
      funcao: 'Operador raiz',
      senhaProvisoria: true,
    },
  });
  console.log('DEV criado:', dev.matricula);
})();
"
```

Em seguida, login como DEV-001 e usar `/v1/admin/prefeituras` para criar
o tenant do primeiro cliente.

## Backup

```bash
# Postgres (cron diário)
docker compose exec postgres pg_dump -U unisism -d unisism --format=custom \
  > /backup/postgres_$(date +%F).pgc

# MinIO/S3 — versionamento + replicação cross-region
# (configurado no provedor S3)

# Restore postgres
docker compose exec -T postgres pg_restore -U unisism -d unisism --clean \
  < /backup/postgres_2026-05-29.pgc
```

## Zero-downtime restart (com replicas)

```bash
docker compose up -d --no-deps --force-recreate --scale backend=2 backend
# Caddy faz round-robin automaticamente
```

## Migrations em produção

```bash
# Aplicar migration pendente
docker compose exec backend npx prisma migrate deploy
```

Boas práticas:

- **Migrations aditivas**: adicionar coluna `NOT NULL DEFAULT <val>` antes
  de remover o default.
- **Two-phase rollout** para drop de coluna: deploy 1 deixa de ler/escrever,
  deploy 2 dropa a coluna.
- **Nunca**: `prisma migrate dev` em prod.

## Caddyfile (sample)

```caddy
{
  email <email-contato>
  servers {
    request_body {
      max_size 12MB
    }
  }
}

<dominio-api> {
  reverse_proxy backend:3333 {
    health_uri /v1/health
    health_interval 30s
    fail_duration 30s
    max_fails 3
    transport http {
      keepalive 1m
    }
  }

  header {
    Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    X-Frame-Options "DENY"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "geolocation=(), microphone=(), camera=()"
  }

  log {
    output file /var/log/caddy/access.log
    format json
  }
}

<dominio-app> {
  root * /srv/frontend/dist
  encode gzip zstd
  try_files {path} /index.html
  file_server
}
```

## CDN / static do frontend

O frontend gera bundle estático (`vite build`) que pode ser servido por:

- Caddy diretamente (`file_server`).
- Cloudflare Pages / Vercel / Netlify (recomendado para CDN edge).
- S3 + CloudFront.

Variável de ambiente do front:

```
VITE_API_BASE_URL=https://<dominio-api>/v1
```

## Versão dos serviços

| Serviço | Versão recomendada |
|---|---|
| Node | 22 LTS |
| Postgres | 16 |
| Redis | 7 |
| MinIO | RELEASE.2024+ |
| ClamAV | 1.x |
| Caddy | 2.8+ |
| Tempo | 2.5+ |
| Prometheus | 2.55+ |
| Grafana | 11+ |

## Provedores recomendados

| Categoria | Sugestão |
|---|---|
| Hosting | Hetzner CCX23 / AWS EC2 m6i.large / Azure D4s_v5 |
| Postgres gerenciado | AWS RDS / Hetzner managed PG / Supabase |
| Storage | AWS S3 / Backblaze B2 (mais barato) / Hetzner Object |
| SMTP | Brevo (ex-Sendinblue) / Postmark / AWS SES |
| Push | Firebase Cloud Messaging (FCM) |
| DNS | Cloudflare (recomendado pelo proxy/CDN) |

> Em revenda, deixar o cliente escolher. Suporta cloud público (AWS/Azure)
> e on-premise (servidor dedicado do município com Caddy + tudo em docker).

## Checklist de deploy inicial

- [ ] DNS configurado (api + app)
- [ ] Cert TLS (Caddy auto-emite na primeira request)
- [ ] `.env.prod` preenchido (REPLACE_* tudo trocado)
- [ ] Bucket S3 criado + chaves geradas
- [ ] SMTP testado (envio real)
- [ ] FCM project criado + service account baixada
- [ ] Postgres backup configurado (cron + storage externo)
- [ ] Prometheus scrape config correta
- [ ] Grafana com datasource Tempo + Prometheus
- [ ] Healthcheck externo (uptime monitor)
- [ ] Alertas configurados (Slack / email / SMS)
- [ ] `npm run db:setup-triggers` rodado
- [ ] Primeiro `DESENVOLVEDOR` criado
- [ ] Primeiro `Prefeitura` (tenant) criado via API

## Padrões de release

- Versão segue semver: `0.X.Y`.
- `CHANGELOG.md` no backend é fonte de verdade.
- Build de prod: `npm run build` + Dockerfile multi-stage.
- Tag git no formato `v0.X.Y`.
- Rolling update preferível a big-bang.
