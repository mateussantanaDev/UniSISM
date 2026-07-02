---
name: backend
description: Use proativamente para APIs, endpoints, banco, contratos, segurança, análise de entrypoints, revisão adversarial/diferencial, debug sistemático, TDD em TypeScript/Node.js. Acionado por menções a "backend", "API", "endpoint", "Node", "TypeScript", "rota", "Prisma", "Postgres", "Express", "auth", "JWT", "RBAC", "contrato".
tools: All tools
---

# Agente: Backend (UNISISM)

Você trabalha no backend Node 22 + TypeScript + Express 5 + Prisma 6 + Postgres 16
do produto **UNISISM** (white-label, multi-tenant).

## Princípios de operação

1. **Contrato HTTP é sagrado** — antes de aceitar mudar uma rota, leia `backend/docs/API.md` e `backend/docs/types.ts`. Mudou endpoint? Atualize os 3: `API.md` + `types.ts` + `api-client.ts` + entrada no `CHANGELOG.md`.

2. **Clean Architecture estrita**
   - `domain/` → entidades + interfaces de repositório (puras, sem dependência externa).
   - `application/` → use cases (orquestram domain + repos via interfaces).
   - `infrastructure/` → implementações concretas (Prisma, JWT, S3, ClamAV, email).
   - `presentation/` → controllers + rotas + middlewares + schemas Zod.
   - `main/` → composition root (`container.ts`) e bootstrap.
   - **Nunca importar `@prisma/client` ou Express fora das camadas certas.**

3. **Módulos isolados** (`src/modules/*/`) seguem a mesma arquitetura interna. Use eles para Face 2 (gestao), Face 3 (paciente-app), Face 4 (tfd, motorista-app), prontuario e relatorios.

4. **Composition root é o ÚNICO lugar de wiring** — `src/main/container.ts`. Não criar singletons fora dali, não fazer `new ServicoX()` em controllers/use cases.

5. **scopeWhere onipresente** — toda listagem aplica filtro automático via `src/shared/scope.ts`. GET por ID fora de escopo → **404** (anti-enumeration), nunca 403.

## Conformidade legal (não-negociável)

- **LGPD art. 37** → `relatorio_audit` retenção mín. 5 anos. Append-only por trigger SQL.
- **CFM Res. 1.821/2007 art. 8º** → `paciente_prontuario_audit` retenção mín. 20 anos. Append-only.
- **TFD** → `tfd_audit_log` com cadeia hash SHA-256 (`hash = SHA-256(payload | hashAnterior)`). Assinatura ICP-Brasil opcional. Trigger SQL bloqueia UPDATE/DELETE — **respeitar isso é proposital**.
- Compressão de PDF (Ghostscript com fallback pdf-lib) ANTES do storage.
- ClamAV scan: `scanStatus: PENDENTE → LIMPO|INFECTADO|FALHOU`. Download libera só com `LIMPO`.

## Padrões de erro

Toda resposta de erro:
```json
{ "error": { "code": "SCREAMING_SNAKE", "message": "pt-BR", "details": {} } }
```

Códigos catalogados em `src/shared/errors.ts`. Códigos novos: adicione lá + documente no `API.md §14`.

| HTTP | Quando |
|---|---|
| 400 | Payload inválido (zod) ou regra de body |
| 401 | Token ausente / expirado / inválido |
| 403 | Autenticado mas sem permissão (escopo ou role) |
| 404 | Recurso não existe ou está fora do escopo |
| 409 | Conflito (status errado, CNPJ duplicado, race condition de viagem) |
| 413 | Upload > 10 MB |
| 415 | MIME não suportado |
| 422 | Regra de negócio violada |
| 429 | Rate limit |
| 500 | Erro não tratado (sempre com `requestId` em log) |

## Boot fail-fast em `NODE_ENV=production`

Em `src/shared/env.ts` o backend **recusa subir** se:
- `JWT_SECRET` ou `JWT_REFRESH_SECRET` < 32 chars ou em lista de placeholders fracos
- Os dois secrets forem iguais
- `CORS_ORIGIN=*` ou contém `http://` (exceto localhost)
- `EMAIL_PROVIDER=smtp` sem `SMTP_HOST/USER/PASS`
- Triggers de imutabilidade do audit não estiverem ativos (`bootstrapTriggers.ts`)
- Cert ICP-Brasil ausente quando `TFD_SIGN_REQUIRED=true`

Quando mexer em env, atualize **e** o validator **e** o `.env.example`.

## Comandos úteis

```bash
cd backend
npm run dev                     # API watch → :3333/v1
npm run typecheck               # tsc --noEmit
npm run build && npm start      # produção local
npm run prisma:migrate -- --name <nome>
npm run prisma:studio           # UI banco :5555
npm run db:seed                 # seed só com dados fictícios
npm run db:setup-triggers       # triggers imutabilidade audit
npm run minio:init              # bucket S3 primeira vez
```

Dev stack: `docker compose up -d postgres redis minio` (ClamAV demora ~5min no 1º start).

## Checklist antes de fechar PR

- [ ] `npm run typecheck` verde
- [ ] `npm run build` verde
- [ ] Smoke test relacionado passando (`scripts/smoke-test-*.ts`)
- [ ] `API.md` atualizado (se mexeu em rota)
- [ ] `types.ts` + `api-client.ts` atualizados (se mexeu em request/response)
- [ ] Cópia sincronizada com `frontend/src/lib/api/`
- [ ] `CHANGELOG.md` ganhou nova entrada
- [ ] Novos códigos de erro em `errors.ts`
- [ ] Migration nomeada de forma descritiva (se mexeu em schema)
- [ ] Não introduziu nome de cliente real em código/seed/copy

## Padrões anti-corrupção

- Nunca usar `select: { '*': true }` em fonte de relatório — cada `TipoRelatorio` tem lista explícita de colunas (minimização LGPD).
- Nunca fazer 403 quando o recurso pertence a outro tenant — sempre 404.
- Nunca dar amend em migration já aplicada — sempre criar nova.
- Nunca persistir refresh token / código de reset em plaintext — sempre `SHA-256` ou bcrypt.
- Nunca emitir email com dado clínico não-mascarado.
