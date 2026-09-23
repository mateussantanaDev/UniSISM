# Retomada da etapa 14 - separacao de escopo

Data: 2026-09-23

## Estado da retomada

- Branch de trabalho: `codex/retomar-etapa14`.
- Base preservada: `main` continua no fechamento funcional.
- Backup aplicado na branch: `codex/backup-pre-rollback-etapa14-20260923`.
- Stash aplicado na branch: `stash@{0}`.
- O stash foi aplicado com `git stash apply`, entao continua preservado.

## Volume encontrado

O merge recuperado traz 229 arquivos em relacao a `main`.

Classificacao aproximada do merge:

- Produto backend: 80 arquivos.
- Produto frontend: 97 arquivos.
- Landing, SEO, favicons e configuracao raiz de Vercel: 10 arquivos.
- PEC/importacao: 11 arquivos.
- Operacao/reset/playwright auxiliar: 2 arquivos.
- Auditorias E2E auxiliares: 8 arquivos.
- Motorista: 2 arquivos.
- Outros acoplados a produto, app paciente, relatorios e TFD: 19 arquivos.

O stash aplicado soma 68 arquivos frontend modificados, principalmente para
estabilizar lint, check, testes browser, API client e telas de Centro/CEM/CEO.

## Entra no foco imediato da etapa 14

Este lote deve focar no que afeta diretamente o backend em VPS e o frontend na
Vercel:

- Backend principal: auth, admin, pacientes, prontuario, relatorios, TFD,
  Centro/CEM/CEO e UBS atendimento.
- Prisma schema e migrations necessarias para os modulos principais.
- Frontend principal: API client, tipos, auth context, layouts, sidebars, telas
  SMS, UBS, TFD, Centro, CEM, CEO, TV e proxy `/api-proxy`.
- Ajustes de Vercel do frontend quando forem necessarios para conectar o
  frontend ao backend da VPS.
- Correcoes do stash que forem necessarias para `check`, `lint`, testes,
  cobertura, audit e build voltarem a passar.

## Fica para atividade separada

Estes itens vieram misturados no merge, mas nao devem ser tratados como
correcao obrigatoria da etapa 14 sem nova permissao:

- PEC/importacao: `backend/.env.pec.example` e `backend/scripts/pec/*`.
- Reset operacional sensivel: `backend/scripts/reset-production.ts`.
- Playwright/auditorias auxiliares: `TODO_Playwright.txt`,
  `backend/scripts/test-pacientes-playwright.ts`, `frontend/test_qa_audit.ts` e
  `tests/e2e/*`.
- Landing/SEO/favicons/site institucional: `frontend/src/routes/+page.svelte`,
  `frontend/static/*`, `frontend/src/lib/assets/favicon.svg`, `README.md`,
  `package.json` raiz e `vercel.json` raiz.
- Motorista: `backend/src/modules/motorista-app/*` e
  `frontend/src/routes/tfd/motoristas/*`, a menos que o usuario peça
  explicitamente incluir motorista neste lote.

## Decisao para a proxima atividade

Na atividade 14.9, a recomendacao era estabilizar os gates mantendo o escopo
principal:

1. Rodar validacoes backend e frontend na branch `codex/retomar-etapa14`.
2. Corrigir apenas quebras necessarias para o produto principal.
3. Evitar ampliar ou refatorar PEC, landing, E2E auxiliar e motorista.
4. Se algum item fora do escopo quebrar um gate global, decidir entre isolar,
   remover do lote ou validar em atividade propria.

## Atividade 14.9 - gates estabilizados

Correcoes aplicadas:

- Regenerado o Prisma Client depois da retomada do schema.
- Corrigido uso de `scope` em prontuario medico.
- Ajustadas migrations para rodarem do zero quando tabelas/enums do Centro ainda
  nao existem.
- Restaurados scripts de gate no `backend/package.json`, mantendo scripts novos
  do merge.
- Limpas sobras de imports, parametros e constantes sem uso no backend.
- Reforcado `buildScope` para bloquear usuario nao global sem prefeitura/UBS em
  vez de usar prefeitura padrao implicita.
- Atualizados testes formais de seguranca/auditoria para os contratos atuais.

Validacoes aprovadas na branch:

- `backend: npm run validate` com `DATABASE_URL` apontando para banco smoke.
- `backend: npm run test:coverage` com thresholds atuais.
- `backend: npm run db:validate-migrations`.
- `backend: npm audit` e `backend: npm audit --omit=dev`.
- `frontend: npm run check`.
- `frontend: npm run lint`.
- `frontend: npm test`.
- `frontend: VITEST_BROWSER_CHANNEL=chrome npm run test:browser`.
- `frontend: npm run test:coverage`.
- `frontend: npm audit` e `frontend: npm audit --omit=dev`.
- `frontend: npm run lint:format`.
- `frontend: VITE_API_BASE_URL=http://localhost:3333/v1 npm run build`.
- `git diff --check`.

Risco residual da retomada:

- A baseline ESLint do frontend no estado retomado tem 462 supressoes em 43
  arquivos. O gate incremental passa, mas a baseline nao esta zerada como no
  ponto funcional `b82019c`.
- O merge recuperado ainda contem itens fora do foco imediato registrados acima
  (PEC, landing/SEO/favicons, auditorias E2E auxiliares e motorista). Eles nao
  foram removidos nesta atividade porque fazem parte do backup aplicado.

## Atividade 14.10 - escopo residual separado

Limpeza aplicada:

- Removidos do lote da branch os arquivos adicionados de PEC/importacao,
  reset operacional, Playwright/auditorias auxiliares, landing/SEO/favicons e
  configuracao raiz de Vercel.
- Restaurados para o estado da `main` os arquivos modificados fora do foco
  imediato: scripts PEC existentes, login do app motorista, pagina inicial,
  tela de detalhe de motorista, favicons e `package.json` raiz.
- Removidos do `backend/package.json` os scripts que apontavam para PEC e para
  `reset-production.ts`, evitando comandos quebrados depois da separacao.
- Podadas supressoes ESLint orfas do frontend apos a remocao dos arquivos fora
  de escopo. A baseline retomada caiu de 462 supressoes em 43 arquivos para 439
  supressoes em 41 arquivos.
- O diff final contra `main` ficou com 212 arquivos, focado em backend/frontend
  principal, migrations, testes formais, Vercel do frontend e documentacao.

Validacoes aprovadas depois da limpeza:

- `backend: npm run validate` com `DATABASE_URL` apontando para banco smoke.
- `backend: npm run test:coverage` com thresholds atuais.
- `backend: npm run db:validate-migrations`.
- `backend: npm audit` e `backend: npm audit --omit=dev`.
- `frontend: npm run check`.
- `frontend: npm run lint`.
- `frontend: npm run lint:format`.
- `frontend: npm test`.
- `frontend: VITEST_BROWSER_CHANNEL=chrome npm run test:browser`.
- `frontend: npm run test:coverage`.
- `frontend: npm audit` e `frontend: npm audit --omit=dev`.
- `frontend: VITE_API_BASE_URL=http://localhost:3333/v1 npm run build`.

## Observacao importante

Como o backup entrou como merge grande, a atividade 14.10 separou o excesso
mais evidente antes de qualquer revisao/deploy da branch. Itens como PEC,
motorista, landing/SEO/favicons e auditorias E2E auxiliares devem voltar apenas
em atividades proprias, com validacao dedicada.
