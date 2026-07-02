# 18 · Checklist de revenda — implantação para novo cliente

> Passo-a-passo prático para implantar o produto a um novo cliente
> (Secretaria Municipal de Saúde, fundação ou consórcio). Estimativa: 1-3
> dias úteis para go-live, dependendo do nível de white-label.

---

## Fase 1 — Pré-venda e descoberta

- [ ] Mapear escopo: quantas UBSs, quantos usuários, há TFD?
- [ ] Validar regime: prefeitura municipal, estado, consórcio, fundação?
- [ ] Identificar contato técnico do cliente (DPO + TI).
- [ ] Definir domínio próprio (`<dominio-cliente>`).
- [ ] Hospedagem: cloud público nosso, cloud público dele, on-premise?
- [ ] LGPD: já tem encarregado de dados? Política de privacidade pronta?
- [ ] TFD: quantos veículos, motoristas, orçamento mensal?
- [ ] Integrações desejadas (eSUS, Tasy, ERP municipal)?
- [ ] Apps mobile: branding próprio ou genérico?

## Fase 2 — Provisionamento de infra

### 2.1 Servidor

- [ ] Provisionar VPS / instância (sugestão: Hetzner CCX23 4 vCPU 16 GB RAM, ou AWS t3.large).
- [ ] OS: Ubuntu 24.04 LTS ou similar.
- [ ] Instalar Docker + Docker Compose.
- [ ] Firewall: portas 80/443 abertas; 5432, 6379, 9000 fechadas para internet.

### 2.2 DNS

- [ ] `api.<dominio-cliente>` → A record para IP do servidor.
- [ ] `app.<dominio-cliente>` → A record para IP do servidor (ou CDN).
- [ ] Email DKIM/SPF/DMARC se for usar SMTP próprio do cliente.

### 2.3 Storage

- [ ] Bucket S3 (AWS / Backblaze B2 / MinIO próprio).
- [ ] Versionamento habilitado.
- [ ] Lifecycle: deletar relatórios após 7 dias.
- [ ] Geração de access key + secret key restritos a esse bucket.

### 2.4 SMTP

- [ ] Conta Brevo / Postmark / AWS SES (ou SMTP próprio do cliente).
- [ ] Sender autorizado: `naoresponda@<dominio-cliente>`.
- [ ] DKIM/SPF configurado.
- [ ] Teste de entrega para Gmail/Outlook/Yahoo.

### 2.5 FCM (push do app paciente)

- [ ] Criar projeto Firebase.
- [ ] Adicionar app Android + iOS.
- [ ] Baixar `google-services.json` + `GoogleService-Info.plist`.
- [ ] Service account JSON com role Firebase Cloud Messaging Sender.

### 2.6 Cert ICP-Brasil (opcional — se cliente quer assinatura TFD)

- [ ] Cert A1 PFX comprado de AC credenciada.
- [ ] Senha do cert guardada em vault.
- [ ] Upload do PFX para `/opt/icp/cert.pfx` no servidor.

## Fase 3 — Configuração da aplicação

### 3.1 Clonar repositório

```bash
git clone <repo> /opt/unisism
cd /opt/unisism
```

### 3.2 Configurar `.env.prod`

```bash
cp backend/.env.prod.example backend/.env.prod
# Editar todos os REPLACE_*
```

Valores a preencher:

| Var | Como gerar |
|---|---|
| `DATABASE_URL` | depois do compose up |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 48` (diferente do anterior) |
| `CORS_ORIGIN` | `https://app.<dominio-cliente>` |
| `STORAGE_KIND` | `s3` |
| `S3_*` | do provedor |
| `SMTP_*` | do provedor |
| `FCM_*` | da service account Firebase |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://tempo:4318/v1/traces` |
| `TFD_SIGN_REQUIRED` | `true` se usar ICP, senão `false` |

### 3.3 Configurar Caddyfile

`backend/deploy/caddy/Caddyfile`:

```caddy
api.<dominio-cliente> {
  reverse_proxy backend:3333 { health_uri /v1/health }
  header { Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" }
}

app.<dominio-cliente> {
  root * /srv/frontend/dist
  encode gzip zstd
  try_files {path} /index.html
  file_server
}
```

### 3.4 Buildar e subir

```bash
docker compose --env-file backend/.env.prod \
  -f backend/docker-compose.yml \
  -f backend/docker-compose.prod.yml \
  up -d --build
```

### 3.5 Migrations e triggers

```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run db:setup-triggers
docker compose exec backend npm run minio:init  # se MinIO local
```

### 3.6 Smoke test

```bash
curl https://api.<dominio-cliente>/v1/health
# → { "ok": true }
```

## Fase 4 — Branding white-label

### 4.1 Assets

- [ ] Upload `logo.svg` para `static/brand/<tenantId>/logo.svg`
- [ ] Upload `favicon.ico` para `static/brand/<tenantId>/favicon.ico`
- [ ] Upload `splash.png` para `static/brand/<tenantId>/splash.png`

### 4.2 Cores

Decidir cor primária do cliente (ex: `#1a3a8a` azul). Adicionar em
`frontend/src/lib/styles/tenants/<tenantId>.css`:

```css
:root[data-tenant="<tenantId>"] {
  --brand-primary: #1a3a8a;
  --brand-primary-hover: #112a6b;
}
```

### 4.3 Copy

i18n por tenant em `frontend/src/lib/i18n/<tenantId>.json`:

```json
{
  "app.titulo": "Sistema de Saúde — <Nome institucional>",
  "auth.login.subtitulo": "Acesso restrito a servidores",
  "home.saudacao": "Olá, servidor(a) de <Nome do município>"
}
```

### 4.4 Termos e política

- [ ] URL dos termos de uso do cliente.
- [ ] URL da política de privacidade do cliente.
- [ ] Email do encarregado de dados (DPO) do cliente.

### 4.5 App Flutter (se branding mobile próprio)

Opção 1 — build flavor:

```dart
flutter build apk --flavor <tenantId> --dart-define=TENANT_ID=<tenantId>
```

Opção 2 — config remota (roadmap):

```dart
// App busca config no startup
final config = await api.get('/v1/tenant/config');
```

## Fase 5 — Provisionamento do tenant

### 5.1 Criar primeiro DESENVOLVEDOR

```bash
docker compose exec backend node scripts/criar-dev.js \
  --matricula DEV-001 \
  --email dev@<dominio-cliente> \
  --cpf 00000000000 \
  --nome 'DEV RAIZ'
# Imprime senha provisória — SALVAR
```

### 5.2 Criar Prefeitura (tenant)

```bash
TOKEN=$(curl -X POST https://api.<dominio-cliente>/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"DEV-001","senha":"<senha provisória>"}' | jq -r .token)

curl -X POST https://api.<dominio-cliente>/v1/admin/prefeituras \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "nome": "<Nome institucional do cliente>",
    "municipio": "<município>",
    "uf": "<UF>",
    "cnpj": "<cnpj>"
  }'
```

### 5.3 Criar primeiro ADMIN do cliente

```bash
curl -X POST https://api.<dominio-cliente>/v1/admin/usuarios \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "role": "ADMIN",
    "prefeituraId": "<id retornado acima>",
    "nome": "<NOME DO ADMIN>",
    "email": "<email>",
    "matricula": "ADM-001",
    "cpf": "<cpf>"
  }'
# Resposta inclui senha provisória — entregar ao cliente por canal seguro
```

### 5.4 A partir daqui, ADMIN do cliente faz tudo

ADMIN provisiona:

- UBSs via `POST /v1/admin/ubs`
- Coordenadores e atendentes via `POST /v1/admin/usuarios`
- Reguladores SMS
- Gestores TFD
- Atendentes TFD (terminal)
- Veículos via `POST /v1/tfd/veiculos`
- Motoristas via `POST /v1/tfd/motoristas`
- Saldo inicial via `POST /v1/tfd/saldo/ajustar`

## Fase 6 — Observabilidade

### 6.1 Configurar Grafana

- [ ] Datasource Prometheus apontando para `http://prometheus:9090`
- [ ] Datasource Tempo apontando para `http://tempo:3200`
- [ ] Datasource Loki (opcional, para logs centralizados)
- [ ] Dashboards: overview, encaminhamentos, TFD, auth

### 6.2 Alertas

- [ ] Backend down → email + SMS
- [ ] Hash chain TFD inválida → email DPO + email técnico
- [ ] p95 latency > 2s por 10min → email técnico
- [ ] Disco > 85% → email técnico
- [ ] Postgres lag > 30s → email técnico

### 6.3 Backups

- [ ] Cron diário: `pg_dump` → storage externo (S3 / Backblaze)
- [ ] Retenção: 30 dias diários + 12 meses mensais
- [ ] Teste de restore agendado (trimestral)

## Fase 7 — Treinamento e go-live

- [ ] Treinamento ADMIN do cliente (provisionar usuários, UBSs, etc.)
- [ ] Treinamento atendentes UBS (consolidar encaminhamento)
- [ ] Treinamento reguladores SMS (fluxo de decisão)
- [ ] Treinamento gestor TFD (programar viagem, ajuste de saldo)
- [ ] Treinamento motoristas (uso do app)
- [ ] Comunicação aos cidadãos (folder do app paciente)
- [ ] Suporte L1 designado (parceiro local ou nossa equipe)
- [ ] SLA acordado por escrito

## Fase 8 — Pós go-live

### Primeira semana

- [ ] Monitorar Grafana 2x/dia
- [ ] Verificar hash chain TFD diariamente
- [ ] Reunião com cliente no D+3 e D+7
- [ ] Ajustar saldos / criar usuários adicionais conforme necessário

### Primeiro mês

- [ ] Revisar métricas mensais com cliente (encaminhamentos, TFD, etc.)
- [ ] Verificar primeiro relatório TJ (se TFD em uso)
- [ ] Coletar feedback dos atendentes
- [ ] Aplicar patches/melhorias de UX

### Recorrente

- [ ] Backup teste mensal
- [ ] Atualização de version mensal (CHANGELOG → cliente)
- [ ] Renovação de certs (Caddy auto + ICP manual a cada 1-3 anos)
- [ ] Revisão LGPD anual

## Checklist final — pronto para revender?

- [ ] Domínio próprio funcionando
- [ ] TLS automático (Caddy)
- [ ] Backend up + healthcheck verde
- [ ] Frontend acessível
- [ ] Apps Flutter rodando (Android + iOS)
- [ ] Push FCM testado
- [ ] SMTP testado (recovery de senha funciona)
- [ ] S3 com versionamento
- [ ] Triggers de imutabilidade ativos
- [ ] Backup automatizado
- [ ] Grafana + alertas funcionando
- [ ] Hash chain TFD íntegra (verificação inicial)
- [ ] ADMIN do cliente treinado
- [ ] Atendentes treinados em pelo menos 1 UBS
- [ ] Política de privacidade e termos publicados no domínio do cliente
- [ ] DPO designado
- [ ] Contrato + SLA assinado
- [ ] Suporte L1 ativo

**Go-live!** 🚀 (… mas sem emojis em copy de produção, claro.)
