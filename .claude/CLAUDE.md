# UNISISM — Instruções do projeto (white-label)

> Sistema integrado de **regulação ambulatorial + PEC + app do cidadão + gestão TFD**
> projetado para Secretarias Municipais de Saúde. **Multi-tenant, neutro, revendável.**
>
> **Importante**: este produto é vendido como software. **Não há acoplamento com nenhum município, estado ou prefeitura específica.** Qualquer dado de cliente final entra via seed/cadastro (tenant) — nunca hard-coded.

---

## Identidade do produto

| Atributo | Valor |
|---|---|
| Nome de código | UNISISM |
| Tipo | SaaS / on-premise B2G (Business-to-Government) |
| Domínio | Saúde pública municipal (SUS) |
| Tenancy | Multi-tenant por **Prefeitura** (entidade contratante) |
| Localização | pt-BR · Brasil · ISO 8601 UTC |
| Faces | 4 (UBS · Regulação SMS · App Paciente · TFD) |

O produto **não menciona** nenhum cliente específico em código, marca, seed ou
copy. Qualquer instância (município, secretaria, fundação, consórcio) é
representada genericamente como `Prefeitura` (entidade contratante / tenant).

---

## Faces do produto

| Face | Atores | Rotas frontend | Stack mobile? |
|---|---|---|---|
| **Face 1 · UBS** | atendente, coordenador | `/ubs/*` | — |
| **Face 2 · Regulação SMS** | regulador, admin | `/sms/*` | — |
| **Face 3 · App Paciente** | cidadão (CPF + senha) | — | Flutter (`UNISISM-Paciente/`) |
| **Face 4 · TFD (gestão)** | gestor TFD | `/tfd/*` (RBAC `GESTOR_TFD`) | — |
| **Face 4 · TFD (terminal)** | atendente TFD | subset `/tfd/solicitacoes/*` (RBAC `ATENDENTE_TFD`) | — |
| **Face 4 · TFD (motorista)** | motorista | — | Flutter (`UNISISM-motorista/`) |
| **Admin** | DESENVOLVEDOR, ADMIN | `/sms/rede/*` | — |

---

## Layout do monorepo

```
unisism-ubs/
├── .claude/                  Instruções para o assistente (este diretório)
│   ├── CLAUDE.md             Este arquivo — visão geral neutra
│   ├── agents/               Subagents especializados
│   └── settings.local.json   Permissões locais (não versionar valores sensíveis)
│
├── .specs/                   Especificação funcional + técnica (white-label)
│   ├── README.md             Índice e quickstart
│   └── 01..18-*.md           Capítulos
│
├── backend/                  Node 22 + TS + Express 5 + Prisma 6 + Postgres 16
│   ├── src/
│   │   ├── domain/           entidades + repository interfaces (puras)
│   │   ├── application/      use cases (Face 1 + admin)
│   │   ├── infrastructure/   Prisma, JWT, bcrypt, S3/disk, ClamAV, pino, OTel
│   │   ├── presentation/     Express controllers/rotas/middlewares
│   │   ├── modules/          Face 2-4 + relatórios (auto-contidos)
│   │   ├── main/             composition root + bootstrap + tracing
│   │   └── shared/           env, errors, http, scope, dates
│   ├── prisma/               schema (~50 tabelas) + seed + migrations
│   ├── docs/                 contrato HTTP (autoritativo) + kit Flutter
│   ├── scripts/              setup.sh, init-minio.ts, setup-db-triggers.ts
│   ├── deploy/               caddy/, prometheus/, tempo/
│   ├── docker-compose.yml    dev: postgres + redis + minio + clamav + backend
│   └── docker-compose.prod.yml prod overlay: caddy + tempo + grafana + prom
│
├── frontend/                 SvelteKit 2 + Svelte 5 + Vite 8 + Tailwind 4
│   ├── src/lib/              Clean Architecture (domain/application/infra/presentation)
│   ├── src/routes/           /login /ubs /sms /tfd
│   └── *.md                  Specs do frontend (sincronizadas com backend/docs)
│
├── UNISISM-Paciente/         Flutter — app do cidadão
└── UNISISM-motorista/        Flutter — app do motorista TFD
```

**Working directory padrão do agente: `backend/`** — a maior parte do
desenvolvimento ativo acontece aí, e o contrato HTTP é fonte de verdade entre
backend, frontend e ambos os apps Flutter.

---

## Princípios não-negociáveis

### 1. Contrato HTTP é fonte de verdade
- `backend/docs/API.md` — referência canônica de **todas** as rotas, requests, responses, erros.
- `backend/docs/types.ts` e `backend/docs/api-client.ts` são **copiados** para `frontend/src/lib/api/` e para os apps Flutter. Atualizou endpoint? Atualize os 3 (`API.md` + `types.ts` + `api-client.ts`) + bump no `CHANGELOG.md`.
- Erros sempre no shape `{ error: { code: "SCREAMING_SNAKE", message: "pt-BR", details?: {} } }` (códigos em `src/shared/errors.ts`).

### 2. Isolamento por escopo (RBAC + multi-tenant)
- 8 roles: `DESENVOLVEDOR | ADMIN | COORDENADOR_UBS | ATENDENTE_UBS | REGULADOR_SMS | GESTOR_TFD | ATENDENTE_TFD | MOTORISTA_TFD`.
- Listagens aplicam **filtro automático** via `scopeWhere` (Prisma). Recurso fora do escopo retorna **404** (não 403) para não vazar existência.
- `DESENVOLVEDOR`: GLOBAL · `ADMIN/REGULADOR_SMS/GESTOR_TFD/ATENDENTE_TFD`: prefeitura · `ATENDENTE/COORDENADOR_UBS`: UBS · `MOTORISTA_TFD`: só suas viagens.
- Soft delete em Prefeitura/Ubs/Paciente/Encaminhamento (`deletadoEm`) — listagens filtram automático.
- **Tenant = `Prefeitura`** (a entidade contratante). Cada banco pode conter N prefeituras com isolamento estrito.

### 3. Conformidade legal brasileira (não-negociável)
- **LGPD (Lei 13.709/2018) — art. 37** — `relatorio_audit` retenção mín. 5 anos, append-only.
- **CFM Res. 1.821/2007 — art. 8º** — `paciente_prontuario_audit` retenção mín. 20 anos, append-only.
- **TFD** — `tfd_audit_log` com cadeia hash SHA-256 encadeada (cada linha = `SHA-256(payload | hashAnterior)`), assinatura ICP-Brasil opcional. Trigger SQL bloqueia UPDATE/DELETE.
- Compressão de PDF obrigatória (Ghostscript com fallback pdf-lib) antes do storage.
- ClamAV scan antes de liberar download (`scanStatus: PENDENTE → LIMPO|INFECTADO|FALHOU`).

### 4. Boot fail-fast em produção (`src/shared/env.ts`)
Em `NODE_ENV=production` o backend recusa subir se:
- `JWT_SECRET` ou `JWT_REFRESH_SECRET` < 32 chars ou em lista de placeholders fracos
- Os dois secrets forem iguais
- `CORS_ORIGIN=*` ou contém `http://` (exceto localhost)
- `EMAIL_PROVIDER=smtp` sem `SMTP_HOST/USER/PASS`
- Triggers de imutabilidade do audit não estiverem ativos (`bootstrapTriggers.ts`)
- Cert ICP-Brasil ausente quando `TFD_SIGN_REQUIRED=true`

### 5. Composition root é o único lugar de wiring
`src/main/container.ts` instancia repositórios, serviços, use cases e
controllers. **Não criar singletons fora dali.** Use cases recebem dependências
via construtor (DI manual).

---

## Stack e comandos

### Backend (`cd backend && …`)

| Comando | Função |
|---|---|
| `npm run dev` | API em watch → `http://localhost:3333/v1` |
| `npm run build` / `npm start` | Build TSC + `node dist/main/server.js` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run prisma:generate` | Regenera Prisma Client em `./generated/prisma` |
| `npm run prisma:migrate` | Cria/aplica migration em DEV |
| `npm run prisma:deploy` | Aplica migrations em PROD |
| `npm run prisma:studio` | UI do banco em `:5555` |
| `npm run db:seed` | Cria seed mínimo (usuários técnicos + tenant exemplo) |
| `npm run db:setup-triggers` | Aplica triggers de imutabilidade (audit) |
| `npm run minio:init` | Cria bucket S3 na primeira vez |
| `npm run setup` | `bash scripts/setup.sh` (full setup local) |

Dev stack: `docker compose up -d postgres redis minio` (ClamAV opcional — leva ~5min no 1º start).

### Frontend (`cd frontend && …`)

| Comando | Função |
|---|---|
| `npm run dev` | Vite dev → `http://localhost:5173` |
| `npm run build` / `npm run preview` | Build + preview |
| `npm run check` | `svelte-check` (type check Svelte) |
| `npm run lint` | Prettier + ESLint |
| `npm run test` | Vitest (browser via Playwright) |

### Credenciais seed (DEV) — senha sempre `12345678`

> Estes usuários são apenas para o seed de desenvolvimento. **Em produção
> nenhum dado real de cliente entra via seed** — provisionar via `/admin/*`.

| Matrícula | Role | Escopo |
|---|---|---|
| `DEV-001` | DESENVOLVEDOR | GLOBAL |
| `ADM-001` | ADMIN | Tenant exemplo |
| `SMS-099101` | REGULADOR_SMS | Tenant exemplo |
| `SMS-047291` | ATENDENTE_UBS | UBS exemplo |

Paciente do app Face 3 (seed): CPF `123.456.789-00` / senha `12345678`.
Encaminhamento em pendência para testar: protocolo `UBS-{ano}-100137`.

---

## Convenções

- **Domínio em pt-BR** (entidades, enums, campos, mensagens de erro) — convenção deliberada por ser sistema brasileiro do SUS, com integrações que esperam termos oficiais.
- **IDs**: UUIDv4. Protocolos human-readable: `UBS-AAAA-NNNNNN` (encaminhamento), `TFD-AAAA-NNNNNN`, `ABT-AAAA-NNNNNN`, `AJC-AAAA-NNNNNN` — geração centralizada em `SequencialProtocolo` (Postgres counter).
- **Datas**: ISO 8601 UTC nos contratos HTTP (`2026-04-22T14:32:18.000Z`) ou `YYYY-MM-DD`. Use `src/shared/dates.ts` (aceita `DD/MM/YYYY` como fallback no parse de payload).
- **Mensagens de erro**: códigos em `SCREAMING_SNAKE_CASE` (inglês), mensagens em **pt-BR**.
- **Endpoints**: prefixo `/v1`. Auth (Face 1/2/Admin/TFD) via `Authorization: Bearer <jwt>`. Face 3 (paciente) usa token opaco próprio.

---

## O que NÃO fazer

- **Nunca commitar nome de cliente real** (município, estado, prefeito, secretário, servidor, email institucional, CNPJ específico) em código, seed, doc ou copy. Use placeholders genéricos (`{municipio}`, `<dominio-cliente>`, `<nome-tenant>`).
- Não criar wrappers de erro "amigáveis" que escondem o `code` original — frontend usa o `code` para decidir UX.
- Não fazer `SELECT *` em fontes de relatório — cada `TipoRelatorio` tem lista explícita de colunas em `TipoRelatorioMeta` (minimização LGPD).
- Não emitir 403 quando o recurso simplesmente não pertence ao escopo — devolver 404 (anti-enumeration).
- Não amend de migration já aplicada — sempre criar nova.
- Não mexer em `paciente_prontuario_audit` ou `tfd_audit_log` por UPDATE/DELETE — trigger SQL bloqueia e isso é proposital.
- Não criar arquivos `.md` sem solicitação — `docs/` e `.specs/` já estão bem cobertos.

---

## Referência rápida — documentação interna

| Arquivo | Quando ler |
|---|---|
| `.specs/README.md` | Índice da especificação white-label. **Comece aqui para visão de produto.** |
| `backend/docs/API.md` | Mudou rota? Adicionou erro? Frontend precisa saber? **Fonte de verdade.** |
| `backend/docs/CHANGELOG.md` | Sumário versão-a-versão. |
| `backend/docs/RELATORIOS.md` | Spec do módulo LGPD-first (`src/modules/relatorios/`). |
| `backend/docs/TFD_API.md` | Spec Face 4 (frota/viagens/abastecimento/auditoria TJ). |
| `backend/docs/PRONTUARIO_CRUD.md` | CRUD sub-documentos do PEC (auditoria CFM). |
| `backend/docs/FLUXO_PACIENTE.md` | Onboarding + notificações Face 3. |
| `backend/docs/PACIENTE_APP_API.md` | Spec autoritativa do app paciente. |
| `backend/docs/MOTORISTA_APP_API.md` | Spec autoritativa do app motorista. |
| `backend/docs/PRODUCAO_TFD.md` | Operação TFD em prod (assinatura, cert ICP, ZIP TJ). |
| `backend/docs/DEPLOY_PRODUCAO.md` | Stack production-grade: Caddy + Tempo + Grafana + SMTP + ClamAV. |
| `backend/docs/flutter/README.md` | Kit Dart para o app do paciente. |
| `frontend/BACKEND_GUIDE.md` | Como o frontend consome a API (recipes). |
| `frontend/DESIGN_SYSTEM.md` | Design system B2G brutalist (tokens, componentes, padrões). |

---

## Como executar tarefas comuns

### Adicionar uma rota nova

1. Criar use case em `src/application/<area>/` (ou em `src/modules/<feature>/application/` se for Face 2-4 / módulo isolado).
2. Criar controller em `src/presentation/controllers/` (ou no módulo).
3. Plugar no `src/main/container.ts` e na rota correspondente em `src/presentation/routes/` ou no `<modulo>/presentation/routes/`.
4. Atualizar `backend/docs/API.md` (descrição completa) + adicionar entrada no `backend/docs/CHANGELOG.md`.
5. Atualizar `backend/docs/types.ts` (interface) e `backend/docs/api-client.ts` (método).
6. Copiar `types.ts`/`api-client.ts` para `frontend/src/lib/api/` (o frontend não importa direto de `backend/docs`, é uma cópia versionada).
7. Adicionar códigos de erro novos em `src/shared/errors.ts` se for o caso.

### Adicionar uma tabela/campo

1. Editar `prisma/schema.prisma`.
2. `npm run prisma:migrate -- --name descricao_curta` em DEV.
3. Se for tabela de audit imutável, adicionar trigger em `scripts/setup-db-triggers.ts`.
4. Atualizar mappers em `src/infrastructure/database/`.
5. Rodar `npm run prisma:generate` se mexeu nos types.

### Provisionar uma nova prefeitura (tenant)

1. `POST /v1/admin/prefeituras` (role DESENVOLVEDOR) com `nome`, `municipio`, `uf`, `cnpj`.
2. `POST /v1/admin/ubs` para cada UBS daquele tenant.
3. `POST /v1/admin/usuarios` para criar os ADMIN/REGULADOR_SMS/GESTOR_TFD do tenant.
4. ADMIN do tenant assume daí — cria coordenadores, atendentes, motoristas (via `/v1/tfd/motoristas`), etc.
5. **Branding (logo, cores, copy "Prefeitura de X")** vive em variáveis de ambiente / config do frontend por tenant — não em código.

### Subir a stack production-grade local (teste de deploy)

```bash
cp backend/.env.prod.example backend/.env.prod  # editar e preencher REPLACE_*
docker compose --env-file backend/.env.prod \
  -f backend/docker-compose.yml -f backend/docker-compose.prod.yml up -d
```

---

## Branding / white-label

O produto **não tem branding hard-coded** de cliente. Tudo abaixo é
parametrizável por tenant:

| Item | Onde mora |
|---|---|
| Nome da entidade ("Prefeitura Municipal de X") | `Prefeitura.nome` no banco |
| Logo do cabeçalho | `static/brand/<tenantId>/logo.svg` (servido por rota condicional) |
| Cor primária (ação) | Token `--brand-primary` no Tailwind, sobrescrito por `<tenantId>.css` |
| Domínio próprio | DNS + Caddy (cada tenant pode ter seu `api.<dominio>` e `app.<dominio>`) |
| Emails (sender, footer) | Templates em `src/infrastructure/email/templates/` parametrizados por tenant |
| Copy institucional ("Bem-vindo, servidor de X") | i18n por tenant em `frontend/src/lib/i18n/` |

**Regra**: nenhum cliente entra no seed. Seed só tem dados fictícios/exemplos
para desenvolvimento.

---

## Estado atual (snapshot)

- Versão atual está descrita em `backend/docs/CHANGELOG.md` (atualmente em iteração 0.18.x).
- Branch principal: `main`.
- Roadmap conhecido: refresh rotativo do app paciente (✅ feito v0.18.0), bump do `package.json`, finalização de scripts de deploy, integração FCM completa para Face 3, rotação automática de refresh para Face 1/2/4.
