# UNISISM · UBS — Backend

Backend Node.js + TypeScript + Express + Prisma + PostgreSQL para a Face 1 (UBS) do
sistema **UNISISM** da SMS de Águas Belas / PE.

Implementa os contratos documentados em `docs/API.md`, `docs/ROTAS.md` e nos guias
específicos de cada módulo (`docs/PACIENTE_APP_API.md`, `docs/TFD_API.md`,
`docs/MOTORISTA_APP_API.md`, entre outros).

## Arquitetura

Clean Architecture em 4 camadas:

```
src/
├── domain/                ← entidades + interfaces de repositório (puras)
├── application/           ← use cases (regras de aplicação)
├── infrastructure/        ← Prisma, JWT, bcrypt, PDF, storage, logger
├── presentation/          ← Express controllers, rotas, middlewares
├── main/                  ← composition root + bootstrap
└── shared/                ← env, errors, utilitários transversais
```

Stack:

| Função | Tecnologia |
|---|---|
| Runtime | Node.js 22+ |
| Web | Express 5 |
| Banco | PostgreSQL 16 + Prisma 6 |
| Auth | JWT (HS256) + refresh token rotacionado |
| Hash | bcryptjs |
| Validação | zod |
| Uploads | multer (memória) |
| OCR/PDF | pdf-parse (heurística regex) |
| Logs | pino |
| Container | Docker + docker-compose |

## Requisitos locais

- Node.js 22+
- npm 10+
- Docker + Docker Compose (para Postgres)

## Setup rápido

```bash
# 1. Variáveis de ambiente
cp .env.example .env

# 2. Sobe Postgres em Docker
docker compose up -d postgres

# 3. Instala deps + gera Prisma Client
npm install
npm run prisma:generate

# 4. Aplica migrações + seed
npm run prisma:migrate -- --name init
npm run db:seed

# 5. Sobe o backend em modo dev
npm run dev
```

API estará em `http://localhost:3333/v1`.

### Subindo tudo no Docker

```bash
cp .env.example .env
docker compose up --build -d
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx ts-node-dev --transpile-only prisma/seed.ts
```

## Credenciais de teste (após `db:seed`)

| Campo | Valor |
|---|---|
| Login | `SMS-047291` (ou `mateus.santana@saude.aguasbelas.pe.gov.br`) |
| Senha | `12345678` |
| UBS | UBS CENTRAL |
| Encaminhamento de teste em PENDÊNCIA | `UBS-{ano}-100137` |

## Comandos disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Sobe servidor em modo watch (ts-node-dev) |
| `npm run build` | Compila para `dist/` |
| `npm start` | Roda `dist/main/server.js` (produção) |
| `npm run typecheck` | Apenas type-check (`tsc --noEmit`) |
| `npm test` | Build + testes unitários/contratuais locais |
| `npm run validate` | Type-check + suíte local de testes |
| `npm run test:smoke:app` | Smoke test do contrato do app paciente contra backend em execução |
| `npm run prisma:generate` | Gera Prisma Client |
| `npm run prisma:migrate` | Cria/aplica migration em dev |
| `npm run prisma:deploy` | Aplica migrations em produção |
| `npm run prisma:studio` | Abre Prisma Studio |
| `npm run db:seed` | Roda `prisma/seed.ts` |

### Dados demonstrativos no boot

O servidor não cria mais viagem, encaminhamento ou métricas seed automaticamente ao
iniciar. Para ambientes de demonstração, habilite explicitamente:

```bash
DEMO_SEED_ON_BOOT=true npm run dev
```

Em produção, mantenha `DEMO_SEED_ON_BOOT=false`.

## Endpoints implementados (MVP)

Veja `docs/API.md` e `docs/ROTAS.md` para o contrato completo.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/v1/auth/login` | Autentica (JWT + refresh) |
| POST | `/v1/auth/logout` | Revoga sessão atual |
| POST | `/v1/auth/forgot-password` | Inicia recuperação |
| POST | `/v1/auth/verify-code` | Valida código de 6 dígitos |
| POST | `/v1/auth/reset-password` | Redefine senha |
| GET | `/v1/auth/me` | Atendente autenticado (resumo) |
| GET | `/v1/me/profile` | Perfil completo + produção + segurança |
| POST | `/v1/me/password` | Troca senha autenticada |
| POST | `/v1/me/sessions/revoke-others` | Encerra demais sessões |
| GET | `/v1/dashboard/metrics` | Métricas da UBS do atendente |
| POST | `/v1/encaminhamentos/extract-pdf` | OCR + extração estruturada |
| POST | `/v1/encaminhamentos` | Consolida + envia à Regulação |
| GET | `/v1/encaminhamentos` | Lista (filtros: status, pacienteId, datas) |
| GET | `/v1/encaminhamentos/:id` | Detalhe + timeline + anexos |
| POST | `/v1/encaminhamentos/:id/resolve-pendencia` | Readequação |
| GET | `/v1/pacientes` | Lista PEC (filtros: q, filtro especial, equipe, microárea) |
| GET | `/v1/pacientes/:id` | Prontuário completo |
| GET | `/v1/relatorios` | Lista relatórios do atendente |
| POST | `/v1/relatorios` | Solicita geração (assíncrona) |
| GET | `/v1/relatorios/:id/download` | Baixa o arquivo |
| GET | `/v1/health` | Healthcheck |

## Estrutura de erros

Toda resposta de erro segue:

```json
{ "error": { "code": "CODIGO_SCREAMING", "message": "msg pt-BR", "details": {} } }
```

Códigos catalogados em `src/shared/errors.ts` e nos use cases. Os principais:

`CREDENCIAIS_INVALIDAS`, `USUARIO_INATIVO`, `USUARIO_BLOQUEADO`, `SENHA_EXPIRADA`,
`SENHA_FRACA`, `SENHA_ATUAL_INCORRETA`, `TOKEN_AUSENTE`, `TOKEN_EXPIRADO`,
`TOKEN_INVALIDO`, `ARQUIVO_INVALIDO`, `ARQUIVO_MUITO_GRANDE`, `MIME_NAO_SUPORTADO`,
`DADOS_OBRIGATORIOS_AUSENTES`, `ENCAMINHAMENTO_NAO_ENCONTRADO`,
`ENCAMINHAMENTO_NAO_EM_PENDENCIA`, `NENHUMA_ACAO_FORNECIDA`, `PACIENTE_NAO_ENCONTRADO`,
`RELATORIO_NAO_DISPONIVEL`, `RATE_LIMIT`, `ERRO_INTERNO`.

## Segurança / produção

- Trocar `JWT_SECRET` e `JWT_REFRESH_SECRET` por valores fortes.
- Habilitar HTTPS / HSTS no proxy reverso.
- Configurar `CORS_ORIGIN` apenas com origens confiáveis.
- Configurar SMTP real para envio do código de redefinição (hoje só logamos).
- Trocar `DiskFileStorage` por S3-compatible com URL pré-assinada e antivírus (ClamAV).
- Plug Prometheus / OpenTelemetry para `/metrics` e tracing distribuído.
