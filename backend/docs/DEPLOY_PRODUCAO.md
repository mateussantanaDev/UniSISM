# Deploy em produção — VPS ou máquina local

> Guia para subir o backend UNISISM em produção **gratuitamente** numa VPS
> (ou máquina local com IP público). Tudo que está aqui é open-source, sem
> cartão de crédito.
>
> **Stack production-grade incluído**:
> - Backend Node + PostgreSQL + Redis + MinIO + ClamAV (já no `docker-compose.yml`)
> - **Caddy** — proxy reverso HTTPS com Let's Encrypt automático
> - **Tempo + Grafana + Prometheus** — observabilidade completa
> - **SMTP real** — Brevo/SMTP2GO/Resend (300+ emails/dia grátis)
> - **OpenTelemetry** — tracing distribuído
>
> Custo total: **R$ 0/mês** (apenas o custo da VPS — qualquer plano de 2GB
> RAM serve: Hetzner CPX11 €5/mês, Oracle Cloud Free Tier R$0, Hostinger VPS R$15/mês, etc.)

---

## Índice

1. [Geração de secrets fortes](#1-geração-de-secrets-fortes)
2. [Configuração SMTP gratuita](#2-configuração-smtp-gratuita)
3. [HTTPS automático com Caddy](#3-https-automático-com-caddy)
4. [Storage S3 (MinIO local ou Backblaze B2 grátis)](#4-storage-s3)
5. [Antivírus ClamAV](#5-antivírus-clamav)
6. [Observabilidade — Prometheus + Grafana + Tempo](#6-observabilidade)
7. [Hardening de runtime](#7-hardening-de-runtime)
8. [Comandos de deploy](#8-comandos-de-deploy)
9. [Checklist pré-deploy](#9-checklist-pré-deploy)
10. [Operação dia-a-dia](#10-operação-dia-a-dia)

---

## 1. Geração de secrets fortes

```bash
# Gere 3 secrets diferentes (JWT_SECRET, JWT_REFRESH_SECRET, S3_SECRET_KEY):
openssl rand -base64 48
openssl rand -base64 48
openssl rand -base64 32

# Senhas para Postgres e Grafana:
openssl rand -base64 24
```

Cole nos campos do `.env.prod`:
```bash
cp .env.prod.example .env.prod
$EDITOR .env.prod   # preencha tudo marcado como REPLACE_*
```

> **Validação automática**: se você esquecer de trocar, o backend **não sobe**.
> O `env.ts` rejeita placeholders fracos, secrets iguais, CORS=`*` e SMTP_HOST
> vazio em produção. Erros são explícitos no boot.

### O que o backend valida em PROD

| Validação | Comportamento se falhar |
|---|---|
| `JWT_SECRET` < 32 chars ou placeholder | `Error: [PROD] JWT_SECRET é placeholder fraco` |
| `JWT_SECRET == JWT_REFRESH_SECRET` | `Error: [PROD] JWT_SECRET e JWT_REFRESH_SECRET devem ser DIFERENTES` |
| `CORS_ORIGIN=*` | `Error: [PROD] CORS_ORIGIN deve ser lista explícita (sem '*')` |
| `CORS_ORIGIN=http://...` (sem ser localhost) | `Error: [PROD] CORS_ORIGIN deve ser https://` |
| `EMAIL_PROVIDER=smtp` sem `SMTP_HOST` | `Error: [PROD] SMTP_HOST/USER/PASS exigidos` |
| `TFD_SIGN_REQUIRED=true` sem cert válido | `Error: cert ICP-Brasil indisponível` |

---

## 2. Configuração SMTP gratuita

Não é preciso pagar — escolha **uma** das opções:

### Opção A · Brevo (Sendinblue) — recomendado

- **300 emails/dia grátis** sem cartão de crédito
- Cadastre em https://www.brevo.com
- Settings → SMTP & API → criar SMTP key

```bash
# .env.prod
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu-email-cadastrado@dominio.com
SMTP_PASS=xkeys-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=UNISISM <noreply@unisism.exemplo.com.br>
```

### Opção B · SMTP2GO

- 1000 emails/mês grátis
- https://www.smtp2go.com → Sending Channels → SMTP Users

```bash
SMTP_HOST=mail.smtp2go.com
SMTP_PORT=2525
SMTP_USER=usuario_criado
SMTP_PASS=senha_criada
```

### Opção C · Resend

- 100 emails/dia grátis (precisa configurar DKIM no DNS do domínio)
- https://resend.com → API Keys

```bash
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxxxxxxxxxx
```

### Opção D · Gmail App Password (último recurso)

- 500 emails/dia mas pode cair em spam
- https://myaccount.google.com/apppasswords (precisa 2FA ativo)

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-email@gmail.com
SMTP_PASS=xxxx-xxxx-xxxx-xxxx
```

### Modo `log` (dev / sem SMTP)

Em **dev**, default é `EMAIL_PROVIDER=log` — código de redefinição vai pro
terminal do backend, não envia email. Em **prod**, esse modo precisa ser
explícito (ex.: dry-run).

---

## 3. HTTPS automático com Caddy

Já incluído em `docker-compose.prod.yml`. **Zero configuração**: Caddy obtém
cert Let's Encrypt automaticamente quando o servidor sobe.

### Pré-requisitos

1. **DNS apontando**: registro A do seu domínio → IP da VPS
2. **Portas 80 e 443 abertas** no firewall da VPS
3. **Email no `.env.prod`** (`ACME_EMAIL`) pra notificações

### Passos

```bash
# 1. Configure o domínio
echo "UNISISM_DOMAIN=api.unisism.exemplo.com.br" >> .env.prod
echo "ACME_EMAIL=admin@exemplo.com.br" >> .env.prod

# 2. Suba a stack
docker compose --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml up -d

# 3. Aguarde ~30s — Caddy obtém o cert
docker compose logs caddy | grep "certificate obtained"

# 4. Teste
curl -I https://api.unisism.exemplo.com.br/v1/health
# → HTTP/2 200
# → strict-transport-security: max-age=15552000; includeSubDomains; preload
```

### Headers de segurança configurados

Caddy + helmet enviam:

```
Strict-Transport-Security: max-age=15552000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
```

### HSTS preload (opcional, nível avançado)

Após rodar 6 meses sem incidente:
1. Aumente `HSTS_MAX_AGE=63072000` (2 anos)
2. Submeta o domínio em https://hstspreload.org
3. Browsers passam a forçar HTTPS para o domínio independente do header

---

## 4. Storage S3

### MinIO local (default — incluído)

Já está no `docker-compose.yml`. Console em `http://localhost:9001`
(usuário/senha das envs `S3_ACCESS_KEY` / `S3_SECRET_KEY`).

```bash
# Inicializa o bucket após primeiro boot:
npm run minio:init
```

### Backblaze B2 (alternativa cloud grátis)

- 10 GB grátis pra sempre
- API S3-compatible (mesmo cliente do MinIO)
- https://www.backblaze.com → B2 Cloud Storage → Create Bucket

```bash
# .env.prod
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://s3.us-west-002.backblazeb2.com  # sua região
S3_REGION=us-west-002
S3_BUCKET=unisism-anexos
S3_ACCESS_KEY=keyId-do-app-key
S3_SECRET_KEY=applicationKey-secreto
S3_FORCE_PATH_STYLE=false  # B2 usa subdomain-style
```

### Outros providers S3-compatible grátis

| Provider | Limite grátis | Nota |
|---|---|---|
| **Cloudflare R2** | 10 GB | sem custo de egress (downloads ilimitados) |
| **Wasabi** | trial 30 dias | depois ~R$30/mês mínimo |
| **iDrive E2** | 10 GB | sem custo de egress |
| **Tigris (fly.io)** | 5 GB | só funciona com fly.io apps |

Todos usam o mesmo cliente — só muda `S3_ENDPOINT` + creds.

---

## 5. Antivírus ClamAV

Já incluído. **Atenção**: na primeira inicialização demora ~5 minutos
baixando assinaturas de vírus (~250 MB).

```bash
# Verificar se está pronto:
docker compose logs clamav | grep "Self checking"
# → "Self checking every 600 seconds" = pronto
```

Configuração já correta no compose:
```yaml
backend:
  environment:
    CLAMAV_HOST: clamav
    CLAMAV_PORT: 3310
```

Quando ClamAV está disponível, **todo upload** (anexos de encaminhamento, ajuda
de custo, comprovantes de abastecimento) é escaneado em background. Status:
`PENDENTE → LIMPO | INFECTADO | FALHOU`. Download só libera com `LIMPO`.

> Em VPS muito pequena (<2 GB RAM), ClamAV pode causar OOM. Solução: rodar
> em VPS dedicada de scan, ou usar ClamAV REST (`mailgrip/clamav-rest`) em
> servidor separado e setar `CLAMAV_HOST` apontando pra ele.

---

## 6. Observabilidade

### Stack incluído (free, self-hosted)

| Componente | Função | Porta interna | Acesso externo |
|---|---|---|---|
| **Prometheus** | scrape `/metrics` | 9090 | nenhum (rede Docker) |
| **Tempo** | recebe spans OTLP | 4318/4317 | nenhum (rede Docker) |
| **Grafana** | UI dashboards + traces | 3000 | localhost only (SSH tunnel) |

### Acesso ao Grafana via SSH tunnel

```bash
# Da sua máquina local:
ssh -L 3000:127.0.0.1:3000 user@vps-ip

# Abra http://localhost:3000
# Login: admin / GRAFANA_PASSWORD do .env.prod
```

### Configurar datasources (1ª vez)

Em Grafana → Connections → Data sources:

1. **Prometheus**: URL `http://prometheus:9090`
2. **Tempo**: URL `http://tempo:3200`

Importe dashboards prontos:
- Node.js exporter (ID 11159)
- Prometheus 2.0 stats (ID 3662)

### Métricas disponíveis (Prometheus)

```
# Request rate
sum(rate(http_requests_total[5m])) by (route, method)

# P95 latência
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))

# Error rate
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))

# Audit: tentativas de adulteração (SQL trigger error)
# (filtrar nos logs do Postgres)
```

### Tracing distribuído (OpenTelemetry)

Auto-instrumentação ligada para:
- `express` (todas as rotas)
- `http` (chamadas externas)
- `prisma` / `pg` (queries SQL)
- `ioredis` (cache)
- `nodemailer` (envio de email)

Cada request HTTP gera um trace com waterfall completo. Em Grafana → Explore →
Tempo, busca por `service.name = unisism-backend`.

### Desligar tracing (zero overhead)

```bash
# .env.prod
OTEL_ENABLED=false
```

O `tracing.ts` faz check antes de carregar o SDK — se desligado, **nem carrega**
as deps OTLP no runtime.

---

## 7. Hardening de runtime

### Trust proxy

Com Caddy na frente, o backend tem `TRUST_PROXY=true`. Isso garante:
- `req.ip` = IP real do cliente (não Caddy)
- `req.protocol` = `https` (necessário pra HSTS)
- Rate limiting baseado em IP funciona

### Helmet configurado

```ts
helmet({
  hsts: { maxAge: 15552000, includeSubDomains: true, preload: true },
  contentSecurityPolicy: false,  // delegado ao Caddy
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});
```

### CORS lockdown

`env.ts` recusa boot em PROD se:
- `CORS_ORIGIN=*`
- `CORS_ORIGIN` contém origens `http://` (exceto `http://localhost`)

### Rate limiting

- `POST /v1/auth/forgot-password`: máx **1 request/60s** por usuário (anti-enumeration)
- Rate limit global: implementar via plugin Caddy ou nginx em produção real
- Audit log: trigger SQL **bloqueia** UPDATE/DELETE em `tfd_audit_log` e `paciente_prontuario_audit`

### Não-`root` no container

Recomendado adicionar ao `Dockerfile`:
```dockerfile
RUN addgroup -S app && adduser -S -G app app
USER app
```

---

## 8. Comandos de deploy

### Build local + push

```bash
# Build da imagem
docker build -t unisism-backend:latest .

# (opcional) push pra registry privado
docker tag unisism-backend:latest registry.exemplo.com/unisism-backend:v0.8.2
docker push registry.exemplo.com/unisism-backend:v0.8.2
```

### Deploy stack completa

```bash
# Primeira vez (subir tudo do zero)
docker compose --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml up -d

# Atualização (após push de nova imagem)
docker compose --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps backend

# Migrações
docker compose --env-file .env.prod exec backend npx prisma migrate deploy

# Triggers SQL imutabilidade
docker compose --env-file .env.prod exec backend npm run db:setup-triggers

# Inicializar bucket MinIO (1ª vez)
docker compose --env-file .env.prod exec backend npm run minio:init

# Seed (opcional — só pra criar usuário DEV inicial)
docker compose --env-file .env.prod exec backend npm run db:seed
```

### Logs

```bash
# Backend
docker compose logs -f backend

# Tudo
docker compose logs -f

# Filtrar erros
docker compose logs backend | grep ERROR
```

---

## 9. Checklist pré-deploy

### Secrets e auth
- [ ] `JWT_SECRET` gerado com `openssl rand -base64 48`
- [ ] `JWT_REFRESH_SECRET` gerado separadamente (DIFERENTE do anterior)
- [ ] `POSTGRES_PASSWORD` forte (≥ 24 chars)
- [ ] `S3_SECRET_KEY` forte
- [ ] `GRAFANA_PASSWORD` trocado do default

### CORS e HTTPS
- [ ] `CORS_ORIGIN` lista explícita (sem `*`) com `https://`
- [ ] DNS A do `UNISISM_DOMAIN` apontando pro IP da VPS
- [ ] Portas 80 e 443 abertas no firewall
- [ ] `ACME_EMAIL` configurado

### SMTP
- [ ] Conta criada em Brevo/SMTP2GO/Resend
- [ ] `SMTP_HOST/USER/PASS` no `.env.prod`
- [ ] `EMAIL_FROM` com domínio próprio
- [ ] Teste: `POST /v1/auth/forgot-password` com email real

### Storage e ClamAV
- [ ] Bucket S3 criado (`npm run minio:init` ou via console B2)
- [ ] `STORAGE_PROVIDER=s3`
- [ ] ClamAV operacional (verificar logs após 5 min)

### Observabilidade
- [ ] `OTEL_ENABLED=true` apontando pra `http://tempo:4318`
- [ ] Acesso ao Grafana funcionando (SSH tunnel)
- [ ] Dashboards de Node.js importados

### Audit e compliance
- [ ] `npm run db:setup-triggers` executado (triggers de imutabilidade)
- [ ] Backup automático do banco configurado (cron + pg_dump)
- [ ] Cert ICP-Brasil obtido (e-CNPJ A1) — quando disponível, setar `TFD_SIGN_REQUIRED=true`

### Validação
- [ ] `curl https://seu-dominio/v1/health` → `{"ok":true}`
- [ ] Login funcional via frontend
- [ ] Headers de segurança presentes (`curl -I`)
- [ ] Trace de request aparece no Grafana → Tempo

---

## 10. Operação dia-a-dia

### Backup automático do banco

Adicione ao crontab da VPS:
```bash
# Backup diário às 02:00
0 2 * * * docker compose -f /opt/unisism/docker-compose.yml exec -T postgres \
  pg_dump -U unisism unisism_ubs | gzip > /backup/unisism-$(date +\%Y\%m\%d).sql.gz

# Limpar backups > 30 dias
0 3 * * * find /backup -name "unisism-*.sql.gz" -mtime +30 -delete
```

Pra prod real, **enviar pro storage offsite** (Backblaze B2 também tem free tier
de 10 GB pra backup).

### Renovação de cert Let's Encrypt

**Automática**. Caddy renova 30 dias antes de expirar. Para forçar:
```bash
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### Renovação de cert ICP-Brasil (TFD)

Anual. Backend valida `notAfter` e desliga signing automaticamente quando
expira (export TJ vira `HASH_ONLY`). Configure cron de aviso:
```bash
# Avisar 30 dias antes
0 9 * * * /opt/unisism/scripts/check-icp-cert.sh
```

### Log rotation

Pino + Docker já rotacionam automaticamente. Pra ajustar:
```yaml
# docker-compose.prod.yml
backend:
  logging:
    driver: json-file
    options:
      max-size: "100m"
      max-file: "5"
```

### Monitoramento externo (uptime)

Use [UptimeRobot](https://uptimerobot.com/) (50 monitors grátis, 5min interval):
- Monitor HTTPS pro `https://api.unisism.exemplo.com.br/v1/health`
- Alerta por email/Telegram em downtime

### Atualização de schema (migrations)

```bash
# 1. Gerar migration localmente em DEV
npx prisma migrate dev --name add_xxx

# 2. Commit do diff em prisma/migrations/

# 3. Em PROD:
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run db:setup-triggers
```

### Rollback rápido

```bash
# Volta pra versão anterior
docker tag unisism-backend:v0.8.1 unisism-backend:latest
docker compose up -d --no-deps backend
```

---

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| `[PROD] JWT_SECRET é placeholder fraco` | Não trocou secret | `openssl rand -base64 48` e atualizar |
| `[PROD] CORS_ORIGIN deve ser https://` | CORS apontando pra http | Habilitar HTTPS no frontend ou usar localhost |
| `Cert obtain failed` (Caddy) | DNS não propagou | `dig +short api.dominio.com.br` deve retornar IP |
| `503 Service Unavailable` (Caddy) | Backend não subiu | `docker compose logs backend` |
| `email enviado` mas chega em spam | Sem SPF/DKIM/DMARC | Configurar DNS TXT do domínio (provider mostra) |
| ClamAV `connection refused` | Container ainda baixando assinaturas | Aguardar 5min, ver `docker compose logs clamav` |
| Trace não aparece no Tempo | OTEL_EXPORTER_OTLP_ENDPOINT errado | Deve ser `http://tempo:4318` (sem `/v1/traces`) |
| Grafana mostra "Bad Gateway" | Tempo/Prometheus não subiram | `docker compose ps` deve mostrar todos `Up` |

---

## Custos estimados (deploy completo)

| Item | Provider | Custo/mês |
|---|---|---|
| VPS 2GB RAM / 2 vCPU | Hetzner CPX11 | €5 (~R$30) |
| OU VPS Free | Oracle Cloud Always Free | R$0 |
| Domínio `.com.br` | Registro.br | R$40/ano (R$3,30/mês) |
| Cert TLS | Let's Encrypt (Caddy) | R$0 |
| SMTP (300/dia) | Brevo | R$0 |
| Storage 10GB | MinIO local + Backblaze B2 backup | R$0 |
| Tracing/Métricas | Tempo + Grafana + Prometheus self-hosted | R$0 |
| Cert ICP-Brasil e-CNPJ A1 | ACs (Serpro/Soluti/etc.) | ~R$200/ano (R$17/mês) — opcional |
| **TOTAL** | | **R$33–50/mês** |

---

## Arquivos relevantes

```
backend/
├── .env.example                  # template DEV
├── .env.prod.example             # template PROD (copie e edite)
├── docker-compose.yml            # base (postgres, redis, minio, clamav, backend)
├── docker-compose.prod.yml       # overlay PROD (caddy, tempo, prometheus, grafana)
├── deploy/
│   ├── caddy/Caddyfile           # config HTTPS + headers
│   ├── tempo/tempo.yaml          # config tracing
│   └── prometheus/prometheus.yml # config scrape
└── src/
    ├── shared/env.ts             # validação fail-fast em PROD
    ├── main/
    │   ├── tracing.ts            # bootstrap OpenTelemetry (carrega 1º)
    │   ├── server.ts             # boot + cron + bootstraps
    │   └── app.ts                # helmet + HSTS + trust proxy + CORS
    └── infrastructure/
        └── email/EmailService.ts # nodemailer (smtp ou log)
```

---

*Última atualização: 2026-04-26*
