# 02 · Arquitetura geral

## Topologia

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CLIENTE FINAL (browser / app)                 │
└──────────────────────────────────────────────────────────────────────┘
       │                       │                       │
       ▼                       ▼                       ▼
┌────────────┐         ┌────────────┐         ┌────────────┐
│  Frontend  │         │ App Pac.   │         │ App Mot.   │
│  SvelteKit │         │  Flutter   │         │  Flutter   │
│   (web)    │         │            │         │            │
└────────────┘         └────────────┘         └────────────┘
       │                       │                       │
       └───────────────────────┼───────────────────────┘
                               │
                               ▼
                ┌────────────────────────────────┐
                │   Caddy (TLS + reverse proxy)  │
                └────────────────────────────────┘
                               │
                               ▼
                ┌────────────────────────────────┐
                │   Backend Node (Express 5)     │
                │   ──────────────────────────   │
                │   /v1 /auth /admin /tfd …      │
                │   /paciente-app /motorista-app │
                │   /metrics  /health            │
                └────────────────────────────────┘
                  │     │     │     │     │     │
       ┌──────────┘     │     │     │     │     └──────────┐
       ▼                ▼     ▼     ▼     ▼                ▼
  ┌────────┐      ┌────────┐ ┌─────┐ ┌─────┐ ┌──────┐ ┌──────────┐
  │Postgres│      │ Redis  │ │MinIO│ │Clam │ │ SMTP │ │  FCM     │
  │  16    │      │ cache  │ │ S3  │ │ AV  │ │      │ │  (push)  │
  └────────┘      └────────┘ └─────┘ └─────┘ └──────┘ └──────────┘
       │
       ▼
  ┌────────────────────────────────┐
  │ Prometheus → Grafana           │
  │ OpenTelemetry → Tempo → Grafana│
  └────────────────────────────────┘
```

## Camadas (Clean Architecture)

O backend e o frontend espelham a mesma camada-em-4 (independente):

```
domain/         ← entidades + interfaces de repositório (puras)
application/    ← use cases (orquestram regras)
infrastructure/ ← implementações concretas (Prisma, JWT, S3, etc.)
presentation/   ← controllers + rotas + middlewares (entrada HTTP)
```

### Backend — diretórios

```
backend/src/
├── domain/
│   ├── entities/           ← Atendente, Paciente, Encaminhamento, ...
│   ├── repositories/       ← interfaces (não-implementadas)
│   └── services/           ← serviços puros de domínio
├── application/
│   ├── auth/               ← LoginUseCase, ForgotPasswordUseCase, ...
│   ├── perfil/
│   ├── dashboard/
│   ├── encaminhamentos/
│   ├── pacientes/
│   ├── anexos/
│   ├── admin/              ← CRUD de Prefeitura / Ubs / Atendente
│   └── utils/
├── infrastructure/
│   ├── database/           ← Prisma client + mappers + repositories concretos
│   ├── security/           ← JwtService, BcryptHashService, ...
│   ├── storage/            ← S3FileStorage / DiskFileStorage
│   ├── scan/               ← ClamAVScanService
│   ├── email/              ← SmtpMailer, templates, providers
│   ├── push/               ← FcmPushProvider, NtfyPushProvider
│   ├── cache/              ← RedisCache
│   ├── outbox/             ← Outbox pattern para eventos assíncronos
│   ├── metrics/            ← Prometheus collectors
│   ├── audit/              ← AuditWriter (LGPD + CFM + TFD chain)
│   └── services/           ← Pdf compressor, OCR extractor, ...
├── presentation/
│   ├── controllers/        ← Express handlers
│   ├── routes/             ← Express routers
│   ├── middlewares/        ← auth, scope, rate-limit, request-id, error
│   └── schemas/            ← Zod schemas de request body
├── modules/                ← módulos isolados (mesma estrutura interna)
│   ├── gestao/             ← Face 2 (Regulação SMS)
│   ├── prontuario/         ← CRUD PEC + audit CFM
│   ├── paciente-app/       ← Face 3 (app paciente)
│   ├── motorista-app/      ← Face 4 mobile
│   ├── tfd/                ← Face 4 gestão
│   └── relatorios/         ← Pipeline LGPD-first
├── main/                   ← composition root
│   ├── container.ts        ← DI manual — único lugar de wiring
│   ├── app.ts              ← Express app factory
│   ├── server.ts           ← bootstrap
│   ├── tracing.ts          ← OTel SDK init
│   └── bootstrapTriggers.ts ← garante triggers de audit ativos
└── shared/                 ← env, errors, http helpers, scope, dates
```

### Frontend — diretórios

```
frontend/src/
├── lib/
│   ├── domain/             ← models (mirror dos types do backend)
│   │   └── models/
│   ├── application/        ← stores Svelte 5 + services HTTP
│   │   ├── stores/
│   │   └── services/
│   ├── api/                ← types.ts + api-client.ts (cópia versionada)
│   ├── assets/
│   └── presentation/
│       ├── components/
│       ├── layouts/
│       ├── contexts/
│       └── utils/
└── routes/                 ← SvelteKit file-based routing
    ├── login/
    ├── ubs/                ← Face 1
    ├── sms/                ← Face 2 + Admin
    ├── tfd/                ← Face 4 (gestão + terminal)
    ├── recuperar-senha-paciente/
    └── redefinir/
```

## Princípios arquiteturais

### 1. Composition root é o único lugar de wiring

`src/main/container.ts`:

```typescript
const prismaClient = new PrismaClient();
const atendenteRepo = new PrismaAtendenteRepository(prismaClient);
const jwtService    = new JwtService(env.JWT_SECRET, env.JWT_REFRESH_SECRET);
const hashService   = new BcryptHashService();

const loginUseCase = new LoginUseCase(
  atendenteRepo,
  jwtService,
  hashService,
  sessaoRepo,
  tentativaLoginRepo,
  auditWriter
);

const authController = new AuthController(loginUseCase, /* ... */);
```

**Regras:**
- Nenhum `new SomethingService()` fora de `container.ts`.
- Use cases só recebem dependências via construtor.
- Singletons de framework (PrismaClient, Redis) instanciados aqui.
- Testes unitários injetam mocks no construtor — `container.ts` não é usado em teste.

### 2. Camada não vaza

- `domain/` não importa Prisma, Express, JWT.
- `application/` não importa Prisma, Express.
- `infrastructure/` é onde implementações concretas vivem.
- `presentation/` só fala com `application/` (use cases).

### 3. Módulos isolados

Cada módulo em `src/modules/*` é uma **mini-Clean Architecture**:

```
modules/tfd/
├── domain/
├── application/
├── infrastructure/
└── presentation/
```

Quando faz sentido isolar (Face 2 / 3 / 4 e relatórios), o módulo tem seu próprio
agregado. Quando não (Face 1, admin), usa as camadas raiz.

### 4. Contrato HTTP é fonte de verdade

```
backend/docs/API.md            ← descrição humana
backend/docs/types.ts          ← TypeScript interfaces
backend/docs/api-client.ts     ← cliente tipado
backend/docs/CHANGELOG.md      ← evolução versão-a-versão
```

Esses arquivos **são copiados** para `frontend/src/lib/api/` e para os kits
Flutter. Editar manualmente os arquivos copiados é proibido — sempre regenerar
a partir da fonte em `backend/docs/`.

### 5. RBAC + tenancy aplicados na camada de aplicação

```typescript
// Antes de toda listagem
const where = scopeWhere(usuario, { /* filtros adicionais */ });
return repo.list(where);
```

`scopeWhere` (em `src/shared/scope.ts`) injeta `prefeituraId` / `ubsId` baseado
no token. **Sempre 404** quando recurso fora do escopo (não 403).

### 6. Erros padronizados

```json
{ "error": { "code": "SCREAMING_SNAKE", "message": "pt-BR", "details": {} } }
```

Códigos catalogados em `src/shared/errors.ts` e replicados em `API.md §14`.
**O frontend usa `code` para decidir UX**, nunca `message`.

### 7. Outbox pattern para eventos

Notificação push, email, audit cross-module → `outbox` table → worker consome
e publica. Garante "send once, eventually" mesmo com restart.

### 8. Imutabilidade por trigger SQL

Tabelas de audit (`paciente_prontuario_audit`, `relatorio_audit`,
`tfd_audit_log`) têm trigger que bloqueia `UPDATE` e `DELETE`. **Boot fail-fast
verifica trigger ativo antes de aceitar requests.**

## Fluxo de uma request típica (Face 1 — consolidar encaminhamento)

```
POST /v1/encaminhamentos  (multipart/form-data)
       │
       ▼
1. caddy → backend
       │
       ▼
2. requestIdMiddleware  → gera X-Request-Id
       │
       ▼
3. helmet + cors + rateLimit
       │
       ▼
4. authMiddleware       → valida JWT, popula req.usuario
       │
       ▼
5. roleGuard(['ATENDENTE_UBS','COORDENADOR_UBS','DESENVOLVEDOR'])
       │
       ▼
6. multer (memory)      → parse multipart, validar size <= 10MB, mime allowlist
       │
       ▼
7. zod schema           → validar payload JSON
       │
       ▼
8. EncaminhamentoController.consolidar(req, res)
       │
       ▼
9. ConsolidarEncaminhamentoUseCase
   ├─ valida regras de negócio
   ├─ scopeWhere(usuario) → confirma UBS
   ├─ prisma.$transaction:
   │   ├─ cria PacienteConta (se não existir)
   │   ├─ cria Encaminhamento + protocolo via SequencialProtocolo
   │   ├─ persiste anexos (comprimir PDF via Ghostscript → S3)
   │   ├─ outbox: NotificarPaciente
   │   └─ audit
   └─ retorna { encaminhamento, paciente }
       │
       ▼
10. response 201 + body
       │
       ▼
11. errorMiddleware (se erro)
       │
       ▼
12. requestLogMiddleware → pino + Prometheus metric + OTel span
```

## Decisões arquiteturais (ADRs implícitos)

| Decisão | Justificativa |
|---|---|
| **Prisma 6** em vez de TypeORM/Knex | Type safety completo, migrations declarativas, melhor DX. |
| **Express 5** em vez de Fastify/Hono | Maturidade, ecossistema, equipe conhecimento. |
| **Token opaco** para Face 3 (não JWT) | Revogação instantânea (delete row). Paciente não tem claims complexas. |
| **SvelteKit + Svelte 5** | Bundle menor que React/Next, performance superior para UI densa. |
| **Tailwind CSS 4** | Velocidade de iteração, design system via tokens, design B2G suporta utility-first. |
| **PostgreSQL** | Compliance LGPD/CFM exige durabilidade + transações ACID + JSONB para payload de audit. |
| **MinIO em dev, S3 em prod** | Mesma API; permite dev offline. |
| **ClamAV** | Padrão de mercado, FOSS, integra via TCP no docker. |
| **OpenTelemetry + Tempo** | Padrão da indústria, vendor-neutral, integra com Grafana. |
| **Multi-tenant single-DB** | Custo operacional menor que database-per-tenant; isolamento por `scopeWhere` é suficiente até dezenas de tenants. |
| **Hash chain SHA-256 no TFD** | Requisito de prestação de contas a TJ/TCM — adulteração quebra cadeia. |
