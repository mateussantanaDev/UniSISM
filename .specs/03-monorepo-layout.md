# 03 · Layout do monorepo

## Estrutura física

```
unisism-ubs/                              ← raiz do monorepo
├── .claude/                              ← instruções para o assistente
├── .specs/                               ← especificação (você está aqui)
├── CLAUDE.md                             ← instruções legadas (raiz)
├── DOCKER_SETUP.md                       ← quickstart Docker (raiz)
├── QUICK_START.md                        ← quickstart geral (raiz)
│
├── backend/                              ← API HTTP (Node + TS + Express + Prisma)
│   ├── src/                              ← código-fonte
│   ├── prisma/                           ← schema + seed + migrations
│   ├── docs/                             ← CONTRATO HTTP autoritativo
│   ├── scripts/                          ← setup, init-minio, triggers
│   ├── deploy/                           ← caddy, prometheus, tempo
│   ├── logs/                             ← logs locais (dev)
│   ├── docker-compose.yml                ← dev stack
│   ├── docker-compose.prod.yml           ← prod overlay
│   ├── Dockerfile
│   ├── .env / .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
│
├── frontend/                             ← UI web (SvelteKit + Tailwind)
│   ├── src/                              ← código-fonte
│   ├── static/                           ← assets públicos
│   ├── *.md                              ← specs do front (sincronizadas)
│   ├── package.json
│   ├── svelte.config.js
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── UNISISM-Paciente/                     ← app Flutter — cidadão
│   ├── lib/                              ← código Dart
│   ├── android/ · ios/
│   ├── assets/
│   ├── BACKEND_API_PACIENTE.md           ← spec legada
│   ├── pubspec.yaml
│   └── README.md
│
└── UNISISM-motorista/                    ← app Flutter — motorista TFD
    ├── lib/
    ├── android/ · ios/
    ├── assets/
    ├── BACKEND_REQUIREMENTS.md
    ├── CLAUDE.md                         ← instruções específicas do app motorista
    ├── pubspec.yaml
    └── README.md
```

## backend/ — código

```
backend/src/
├── domain/
│   ├── entities/                         ← classes puras
│   │   ├── Atendente.ts
│   │   ├── Paciente.ts
│   │   ├── Encaminhamento.ts
│   │   ├── Ubs.ts
│   │   └── ...
│   ├── repositories/                     ← interfaces
│   │   ├── IAtendenteRepository.ts
│   │   ├── IPacienteRepository.ts
│   │   ├── IEncaminhamentoRepository.ts
│   │   └── ...
│   └── services/                         ← serviços puros
│
├── application/
│   ├── auth/
│   │   ├── LoginUseCase.ts
│   │   ├── LogoutUseCase.ts
│   │   ├── ForgotPasswordUseCase.ts
│   │   ├── VerifyCodeUseCase.ts
│   │   └── ResetPasswordUseCase.ts
│   ├── perfil/
│   ├── dashboard/
│   ├── encaminhamentos/
│   │   ├── ExtractPdfUseCase.ts
│   │   ├── ConsolidarEncaminhamentoUseCase.ts
│   │   ├── ListarEncaminhamentosUseCase.ts
│   │   ├── DetalharEncaminhamentoUseCase.ts
│   │   └── ResolverPendenciaUseCase.ts
│   ├── pacientes/
│   ├── anexos/
│   ├── admin/                            ← CRUD prefeituras / UBSs / usuários
│   └── utils/
│
├── infrastructure/
│   ├── database/
│   │   ├── PrismaClient.ts
│   │   ├── PrismaAtendenteRepository.ts
│   │   ├── PrismaPacienteRepository.ts
│   │   ├── ...
│   │   └── mappers/
│   ├── security/
│   │   ├── JwtService.ts
│   │   ├── BcryptHashService.ts
│   │   └── PasswordValidator.ts
│   ├── storage/
│   │   ├── S3FileStorage.ts
│   │   └── DiskFileStorage.ts
│   ├── scan/
│   │   └── ClamAVScanService.ts
│   ├── email/
│   │   ├── SmtpMailer.ts
│   │   ├── DevMailer.ts
│   │   └── templates/
│   ├── push/
│   │   ├── FcmPushProvider.ts
│   │   ├── NtfyPushProvider.ts
│   │   └── buildPushProvider.ts
│   ├── cache/
│   │   └── RedisCache.ts
│   ├── outbox/
│   │   ├── OutboxWriter.ts
│   │   └── OutboxConsumer.ts
│   ├── metrics/
│   │   └── prom.ts
│   ├── audit/
│   │   ├── AuditWriter.ts
│   │   └── HashChainWriter.ts
│   └── services/
│       ├── PdfCompressor.ts
│       └── OcrExtractor.ts
│
├── presentation/
│   ├── controllers/
│   ├── routes/
│   ├── middlewares/
│   │   ├── authMiddleware.ts
│   │   ├── roleGuard.ts
│   │   ├── rateLimit.ts
│   │   ├── requestId.ts
│   │   └── errorHandler.ts
│   └── schemas/
│
├── modules/
│   ├── gestao/                           ← Face 2 (Regulação SMS)
│   │   ├── application/
│   │   └── presentation/
│   ├── prontuario/                       ← CRUD PEC + audit CFM
│   │   ├── application/
│   │   ├── infrastructure/
│   │   └── presentation/
│   ├── paciente-app/                     ← Face 3 (app paciente)
│   │   ├── application/use-cases/
│   │   ├── infrastructure/
│   │   └── presentation/
│   ├── motorista-app/                    ← Face 4 mobile
│   ├── tfd/                              ← Face 4 gestão
│   └── relatorios/                       ← Pipeline LGPD-first
│       ├── domain/
│       ├── application/
│       ├── infrastructure/
│       └── presentation/
│
├── main/
│   ├── container.ts                      ← composition root
│   ├── app.ts                            ← Express app factory
│   ├── server.ts                         ← bootstrap
│   ├── tracing.ts                        ← OpenTelemetry SDK
│   └── bootstrapTriggers.ts              ← garante triggers de audit
│
└── shared/
    ├── env.ts                            ← validação fail-fast
    ├── errors.ts                         ← códigos catalogados
    ├── scope.ts                          ← scopeWhere (RBAC + tenant)
    ├── dates.ts                          ← parse tolerante
    ├── http.ts                           ← helpers
    └── senhaForte.ts                     ← validador de senha
```

## backend/prisma/

```
backend/prisma/
├── schema.prisma                         ← ~50 tabelas
├── seed.ts                               ← seed dev (dados fictícios)
├── migrations/
│   └── <timestamp>_<nome>/
│       └── migration.sql
└── sql/                                  ← scripts SQL avulsos (triggers, etc.)
```

## backend/docs/ — contrato HTTP autoritativo

```
backend/docs/
├── README.md                             ← visão geral + recipes
├── API.md                                ← 16 seções, todas as rotas
├── CHANGELOG.md                          ← versão-a-versão
├── ROTAS.md                              ← mapa rápido das rotas
├── types.ts                              ← TypeScript types
├── api-client.ts                         ← cliente tipado
│
├── RELATORIOS.md                         ← Pipeline LGPD-first
├── RELATORIOS_FRONTEND.md                ← como o front consome
├── PRONTUARIO_CRUD.md                    ← CRUD PEC (audit CFM)
├── FLUXO_PACIENTE.md                     ← Face 3 onboarding + notif
├── PACIENTE_APP_API.md                   ← Face 3 API autoritativa
├── MOTORISTA_APP_API.md                  ← Face 4 mobile autoritativa
├── TFD_API.md                            ← Face 4 gestão
├── TFD_BACKEND.md
├── TFD_ATENDENTE_API.md                  ← Face 4 terminal
├── TFD_FRONTEND.md                       ← Face 4 front
├── PRODUCAO_TFD.md                       ← operação TFD em prod
├── SMS_SIMPLIFICADO.md                   ← Face 2 v2 simplificada
├── DEPLOY_PRODUCAO.md                    ← stack production-grade
├── ADMIN_CRUD_PENDENTE.md                ← roadmap admin
│
└── flutter/                              ← kit Dart pronto
    ├── README.md
    ├── unisism_api.dart                  ← cliente Dio
    └── unisism_types.dart                ← DTOs
```

## frontend/src/

```
frontend/src/
├── app.d.ts
├── app.html
├── lib/
│   ├── api/                              ← cópia versionada (não editar à mão)
│   │   ├── types.ts                      ← ⟵ cópia de backend/docs/types.ts
│   │   └── api-client.ts                 ← ⟵ cópia de backend/docs/api-client.ts
│   ├── domain/
│   │   └── models/
│   ├── application/
│   │   ├── stores/
│   │   └── services/
│   ├── assets/
│   ├── presentation/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── contexts/
│   │   └── utils/
│   └── vitest-examples/
└── routes/
    ├── login/
    │   └── esqueci-senha/
    ├── recuperar-senha-paciente/
    ├── redefinir/
    ├── ubs/                              ← Face 1
    │   ├── dashboard/
    │   ├── encaminhamento/
    │   ├── novo-encaminhamento/
    │   ├── pacientes/
    │   ├── historico/
    │   ├── respostas-sms/
    │   └── perfil/
    ├── sms/                              ← Face 2 + Admin
    │   ├── dashboard/
    │   ├── solicitacoes/
    │   ├── encaminhamentos/
    │   ├── encaminhamento/
    │   ├── pacientes/
    │   ├── respostas/
    │   ├── ingestoes/
    │   ├── relatorios/
    │   ├── rede/
    │   ├── auditoria/
    │   ├── analytics/
    │   ├── configuracoes/
    │   │   ├── integracoes/
    │   │   └── parametros/
    │   └── perfil/
    └── tfd/                              ← Face 4 (gestão + terminal)
        ├── dashboard/
        ├── solicitacoes/
        ├── viagens/
        ├── frota/
        ├── motoristas/
        ├── abastecimento/
        ├── saldo/
        ├── saldo-ajuda-custo/
        ├── ajuda-custo/
        ├── relatorios/
        │   └── especialidades/
        ├── auditoria/
        ├── usuarios/
        └── perfil/
```

## Apps Flutter

```
UNISISM-Paciente/
├── lib/                                  ← código Dart
│   ├── core/                             ← serviços (auth, storage, http)
│   ├── features/                         ← features por tela
│   ├── shared/                           ← widgets compartilhados
│   └── main.dart
├── android/ · ios/
├── assets/                               ← imagens, fontes
├── test/
├── pubspec.yaml
├── BACKEND_API_PACIENTE.md               ← spec legada (preferir backend/docs/PACIENTE_APP_API.md)
└── README.md

UNISISM-motorista/                        ← estrutura análoga
├── lib/
├── android/ · ios/
├── assets/
├── test/
├── pubspec.yaml
├── BACKEND_REQUIREMENTS.md
├── CLAUDE.md
└── README.md
```

## Versionamento e dependências entre projetos

| De → Para | Como |
|---|---|
| backend → frontend (contrato) | Copiar `backend/docs/types.ts` e `backend/docs/api-client.ts` para `frontend/src/lib/api/` a cada release |
| backend → app Flutter Paciente | Copiar `backend/docs/flutter/unisism_*.dart` para o app |
| backend → app Flutter Motorista | Idem |
| frontend ⇄ backend | NUNCA importar entre si — só via HTTP |
| backend ⇄ apps | NUNCA importar entre si — só via HTTP |

**`CHANGELOG.md` do backend lista quando o contrato muda.** Apps e frontend
precisam dar bump na sua cópia local e ajustar consumo quando contrato muda.

## Convenção de nomenclatura de arquivos

| Tipo | Convenção | Exemplo |
|---|---|---|
| Use case | PascalCase + sufixo `UseCase.ts` | `ConsolidarEncaminhamentoUseCase.ts` |
| Controller | PascalCase + sufixo `Controller.ts` | `EncaminhamentoController.ts` |
| Repository interface | `I` + PascalCase + sufixo `Repository.ts` | `IPacienteRepository.ts` |
| Repository implementação | Prefixo `Prisma` + sufixo `Repository.ts` | `PrismaPacienteRepository.ts` |
| Entity | PascalCase, sem sufixo | `Paciente.ts` |
| Schema Zod | PascalCase + sufixo `Schema.ts` | `LoginSchema.ts` |
| Route file | kebab-case + sufixo `.routes.ts` | `encaminhamentos.routes.ts` |
| Component Svelte | PascalCase + `.svelte` | `EncaminhamentoCard.svelte` |
| Store Svelte | camelCase + sufixo `Store.ts` | `authStore.svelte.ts` |
