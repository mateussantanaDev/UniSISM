# UNISISM — Monorepo (SMS Águas Belas / PE)

Sistema integrado da Secretaria Municipal de Saúde para regulação de encaminhamentos, prontuário, app do paciente e gestão TFD (Tratamento Fora do Domicílio).

## Faces (cada uma é um conjunto de rotas + telas + RBAC)

| Face | Atores | Rotas frontend | Stack mobile? |
|---|---|---|---|
| **Face 1 · UBS** | atendente, coordenador | `/ubs/*` | — |
| **Face 2 · Regulação SMS** | regulador, admin | `/sms/*` | — |
| **Face 3 · App Paciente** | cidadão (CPF + senha) | — | Flutter (kit em `backend/docs/flutter/`) |
| **Face 4 · TFD (gestão)** | gestor TFD | `/tfd/*` (RBAC `GESTOR_TFD`) | — |
| **Face 4 · TFD (terminal)** | atendente TFD (terminal rodoviário) | subset `/tfd/solicitacoes/*` (RBAC `ATENDENTE_TFD`) | — |
| **Face 4 · TFD (motorista)** | motorista (matrícula + senha) | — | Flutter (`UNISISM-motorista/` · `/v1/motorista-app/*`) |
| **Admin** | DESENVOLVEDOR, ADMIN | `/sms/rede/*` | — |

## Layout do monorepo

```
unisism-ubs/
├── backend/                  Node 22 + TS + Express 5 + Prisma 6 + Postgres 16
│   ├── src/
│   │   ├── domain/           entidades + repository interfaces (puras)
│   │   ├── application/      use cases (Face 1 + admin)
│   │   ├── infrastructure/   Prisma, JWT, bcrypt, S3/disk, ClamAV, pino, OTel
│   │   ├── presentation/     Express controllers/rotas/middlewares (Face 1 + admin)
│   │   ├── modules/          módulos auto-contidos (Face 2-4 + relatórios)
│   │   │   ├── gestao/       Face 2 — aprovar/pendenciar/rejeitar/resposta-sus
│   │   │   ├── paciente-app/ Face 3 — auth CPF + notificações + download
│   │   │   ├── prontuario/   CRUD sub-docs do PEC + audit CFM (20 anos)
│   │   │   ├── relatorios/   Pipeline LGPD-first (PDF/CSV/XLSX + SHA-256 + TTL)
│   │   │   ├── tfd/          Face 4 (gestão) — frota/viagens/abastecimento/auditoria TJ
│   │   │   └── motorista-app/ Face 4 (mobile) — app do motorista com sync offline + FCM
│   │   ├── main/             composition root + app + server + tracing
│   │   └── shared/           env, errors, http, scope, dates
│   ├── prisma/               schema (~50 tabelas) + seed + migrations
│   ├── docs/                 contrato com o frontend (autoritativo) + flutter/
│   ├── scripts/              setup.sh, init-minio.ts, setup-db-triggers.ts
│   ├── deploy/               caddy/, prometheus/, tempo/
│   ├── docker-compose.yml    dev: postgres+redis+minio+clamav+backend
│   └── docker-compose.prod.yml  prod overlay: caddy+tempo+grafana+prometheus
│
├── frontend/                 SvelteKit 2 + Svelte 5 + Vite 8 + Tailwind 4
│   ├── src/lib/              Clean Architecture espelhado (domain/app/infra/pres)
│   ├── src/routes/           /login /ubs /sms /tfd
│   ├── BACKEND_API.md        cliente HTTP + tipos copiados de backend/docs
│   ├── BACKEND_GUIDE.md
│   ├── DESIGN_SYSTEM.md
│   ├── FACE2_SMS.md
│   └── PRONTUARIO_PACIENTE.md
│
└── src/lib/                  (legado — antiga raiz monorepo, ainda no repo)
```

Working directory padrão do agente: **`backend/`**. Quase todo desenvolvimento ativo acontece aí. O contrato HTTP é a fonte de verdade entre back e front.

## Pontos críticos para qualquer mudança

### Contrato HTTP é fonte de verdade
- `backend/docs/API.md` — referência canônica de TODAS as rotas, requests, responses, erros (16 seções).
- `backend/docs/types.ts` e `backend/docs/api-client.ts` são **copiados** para `frontend/src/lib/api/`. Atualizou um endpoint? Atualize os 3 (`API.md` + `types.ts` + `api-client.ts`) + bump no `CHANGELOG.md`.
- Erros sempre no shape `{ error: { code: "SCREAMING_SNAKE", message: "pt-BR", details?: {} } }` (códigos em `src/shared/errors.ts`).

### Isolamento por escopo (RBAC)
- 6 roles: `DESENVOLVEDOR | ADMIN | COORDENADOR_UBS | ATENDENTE_UBS | REGULADOR_SMS | GESTOR_TFD`.
- Listagens aplicam **filtro automático** via `scopeWhere` (Prisma). Recurso fora do escopo retorna **404** (não 403) para não vazar existência.
- `DESENVOLVEDOR`: GLOBAL · `ADMIN/REGULADOR_SMS`: prefeitura · `ATENDENTE/COORDENADOR_UBS`: UBS.
- Soft delete em Prefeitura/Ubs/Paciente/Encaminhamento (`deletadoEm`) — listagens filtram automático.

### Conformidade legal (não-negociável)
- **LGPD art. 37** — `relatorio_audit` retenção mín. 5 anos, append-only.
- **CFM Res. 1.821/2007 art. 8º** — `paciente_prontuario_audit` retenção mín. 20 anos, append-only.
- **TFD** — `tfd_audit_log` com cadeia hash SHA-256 encadeada (cada linha = `SHA-256(payload | hashAnterior)`), assinatura ICP-Brasil opcional. Trigger SQL bloqueia UPDATE/DELETE.
- Compressão de PDF obrigatória (Ghostscript com fallback pdf-lib) antes do storage.
- ClamAV scan antes de liberar download (`scanStatus: PENDENTE → LIMPO|INFECTADO|FALHOU`).

### Boot fail-fast em produção (`src/shared/env.ts`)
Em `NODE_ENV=production` o backend recusa subir se:
- `JWT_SECRET` ou `JWT_REFRESH_SECRET` < 32 chars ou em lista de placeholders fracos
- Os dois secrets forem iguais
- `CORS_ORIGIN=*` ou contém `http://` (exceto localhost)
- `EMAIL_PROVIDER=smtp` sem `SMTP_HOST/USER/PASS`
- Triggers de imutabilidade do audit não estiverem ativos (`bootstrapTriggers.ts`)
- Cert ICP-Brasil ausente quando `TFD_SIGN_REQUIRED=true`

### Composition root é o único lugar de wiring
`src/main/container.ts` instancia repositórios, serviços, use cases e controllers. **Não criar singletons fora dali.** Use cases recebem dependências via construtor (DI manual).

## Stack e comandos essenciais

### Backend (`cd backend && …`)

| Comando | Função |
|---|---|
| `npm run dev` | Sobe API em watch (ts-node-dev) → `http://localhost:3333/v1` |
| `npm run build` / `npm start` | Build TSC + `node dist/main/server.js` |
| `npm run typecheck` | `tsc --noEmit` (não emite) |
| `npm run prisma:generate` | Regenera Prisma Client em `./generated/prisma` |
| `npm run prisma:migrate` | Cria/aplica migration em DEV |
| `npm run prisma:deploy` | Aplica migrations em PROD |
| `npm run prisma:studio` | UI do banco em `:5555` |
| `npm run db:seed` | Roda `prisma/seed.ts` (cria 4 usuários + 1 paciente + 1 encaminhamento em pendência) |
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

| Matrícula | Role | Escopo |
|---|---|---|
| `DEV-001` | DESENVOLVEDOR | GLOBAL |
| `ADM-001` | ADMIN | Prefeitura Águas Belas |
| `SMS-099101` | REGULADOR_SMS | Prefeitura Feira (Face 2) |
| `SMS-047291` | ATENDENTE_UBS | UBS CENTRAL |

Paciente do app Face 3: CPF `123.456.789-00` / senha `12345678` (MARIA APARECIDA).
Encaminhamento em pendência para testar: protocolo `UBS-2026-100137`.

## Convenções

- **Nomes em pt-BR** em todo o domínio (entidades, enums, campos, mensagens de erro) — convenção deliberada por ser sistema público brasileiro.
- **IDs**: UUIDv4. Protocolos human-readable: `UBS-AAAA-NNNNNN` (encaminhamento), `TFD-AAAA-NNNNNN`, `ABT-AAAA-NNNNNN`, `AJC-AAAA-NNNNNN` — geração centralizada em `SequencialProtocolo` (Postgres counter).
- **Datas**: ISO 8601 UTC nos contratos HTTP (`2026-04-22T14:32:18.000Z`) ou `YYYY-MM-DD`. Use `src/shared/dates.ts` (aceita `DD/MM/YYYY` como fallback no parse de payload).
- **Mensagens de erro**: códigos em `SCREAMING_SNAKE_CASE` (inglês), mensagens em **pt-BR**.
- **Endpoints**: prefixo `/v1`. Auth (Face 1/2/Admin/TFD) via `Authorization: Bearer <jwt>`. Face 3 (paciente) usa token opaco próprio.

## O que NÃO fazer

- Não criar wrappers de erro "amigáveis" que escondem o `code` original — frontend usa o `code` para decidir UX.
- Não fazer `SELECT *` em fontes de relatório — cada `TipoRelatorio` tem lista explícita de colunas em `TipoRelatorioMeta` (minimização LGPD).
- Não emitir 403 quando o recurso simplesmente não pertence ao escopo — devolver 404 (anti-enumeration).
- Não amend de migration já aplicada — sempre criar nova.
- Não mexer em `paciente_prontuario_audit` ou `tfd_audit_log` por UPDATE/DELETE — trigger SQL bloqueia e isso é proposital.
- Não criar arquivos `.md` sem solicitação — `docs/` já está bem coberto.

## Referência rápida — documentação interna

| Arquivo | Quando ler |
|---|---|
| `backend/docs/API.md` | Mudou rota? Adicionou erro? Frontend precisa saber? Comece aqui. |
| `backend/docs/CHANGELOG.md` | Sumário versão-a-versão (0.1 → 0.8). |
| `backend/docs/RELATORIOS.md` | Spec do módulo LGPD-first (`src/modules/relatorios/`). |
| `backend/docs/TFD_API.md` | Spec completa Face 4 (frota/viagens/abastecimento/auditoria TJ). |
| `backend/docs/PRONTUARIO_CRUD.md` | CRUD sub-documentos do PEC (auditoria CFM). |
| `backend/docs/FLUXO_PACIENTE.md` | Onboarding + notificações Face 3. |
| `backend/docs/PRODUCAO_TFD.md` | Operação TFD em prod (assinatura, cert ICP, ZIP TJ). |
| `backend/docs/DEPLOY_PRODUCAO.md` | Stack production-grade: Caddy + Tempo + Grafana + SMTP + ClamAV. |
| `backend/docs/flutter/README.md` | Kit Dart para o app do paciente. |
| `backend/DOCKER_SETUP.md` (na raiz do monorepo) | docker compose quickstart. |
| `frontend/BACKEND_GUIDE.md` | Como o frontend consome a API (recipes). |

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

### Subir a stack production-grade local (teste de deploy)
```bash
cp backend/.env.prod.example backend/.env.prod  # editar e preencher REPLACE_*
docker compose --env-file backend/.env.prod \
  -f backend/docker-compose.yml -f backend/docker-compose.prod.yml up -d
```

## Estado atual (snapshot 2026-05-26)

- `package.json` versão: `0.1.0` (não bumpada — versões reais no `docs/CHANGELOG.md` chegando até `0.8.2`).
- Branch principal: `main`. Working tree tem mudanças não commitadas em `app.ts`, `container.ts`, `server.ts`, `env.ts`, `email/` (módulo de email recém-criado), `tracing.ts` (novo), `deploy/`, `docker-compose.prod.yml`, `docs/DEPLOY_PRODUCAO.md`, `scripts/setup.sh` — provavelmente a iteração de production hardening que está sendo finalizada.
- Próximas frentes conhecidas: bump de versão pro `package.json`, finalização dos scripts de deploy, integração FCM para Face 3 (mencionado como roadmap), rota de rotação de refresh token (mencionado como roadmap).
