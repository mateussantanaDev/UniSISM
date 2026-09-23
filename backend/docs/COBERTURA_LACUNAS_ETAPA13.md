# Etapa 13 - Cobertura e lacunas de testes

Data da revisao: 2026-09-22

## Resumo executivo

A base esta forte em validacao de contrato, build, lint de backend e smokes de
fluxos criticos. O ponto fraco atual nao e "o sistema nao testa nada"; e que a
maior parte da protecao esta em smokes de ponta a ponta, enquanto regras de
negocio importantes ainda tem pouca cobertura unitario/integrada isolada.

## Inventario atual

| Area | Volume encontrado | Cobertura automatizada atual |
|---|---:|---|
| Backend TypeScript | 258 arquivos em `src` | `npm run validate` passa |
| Backend use cases | 95 arquivos `*UseCase.ts` | 4 arquivos formais em `tests` + smokes |
| Backend rotas Express | 272 definicoes de rota, incluindo aliases | smokes HTTP e fluxos criticos |
| Backend smokes/scripts | 22 scripts/arquivos de smoke | etapas 1 a 12 + HTTP suite |
| Frontend Svelte/TS | 242 arquivos em `src` | `npm run check`, `npm run lint`, testes e build passam |
| Frontend paginas | 147 `+page.svelte` | sem cobertura de paginas reais |
| Frontend componentes | 47 componentes Svelte | 1 spec browser inicial com 3 testes de componentes compartilhados |
| Frontend specs | 4 specs reais | 18 testes server-side + 3 testes browser/componentizados |

## O que esta bom

- Backend: `npm run validate` passou, incluindo typecheck, lint, build e testes
  unitarios existentes.
- Backend: smokes de producao validam Dockerfile, compose, env fail-fast,
  CORS/Vercel e observabilidade opcional.
- Backend: ja existe comando unico para smokes em banco isolado:
  `npm run test:smoke:all`.
- Backend: existem smokes HTTP para contrato app, admin, TFD gestao, centro,
  prontuario, app motorista e fluxos criticos.
- Backend: a cobertura formal ja inclui seguranca, escopo LGPD/prontuario,
  validacoes TFD financeiras e cadeia de auditoria TFD.
- Backend: existe gate numerico inicial de cobertura com `npm run
  test:coverage`.
- Frontend: `npm run check` passou sem erros nem warnings Svelte.
- Frontend: `npm test` passou com 18 testes reais server-side.
- Frontend: `npm run lint` e `npm run lint:eslint:baseline` passaram com a
  baseline de ESLint zerada; `.eslint-suppressions.json` ficou vazio.
- Frontend: `npm run test:browser` passou com spec `.svelte` real usando
  `VITEST_BROWSER_CHANNEL=chrome` para reaproveitar o Chrome local quando o CDN
  do Playwright falhou.
- Frontend: existe gate numerico inicial de cobertura server-side com `npm run
  test:coverage`.
- Frontend: build de producao passou com `VITE_API_BASE_URL` configurado.
- CI: workflow `Validate` roda backend, frontend, cobertura, migrations e
  smokes completos com banco de smoke separado.

## O que nao funciona ou nao esta confiavel ainda

- A cobertura numerica existe, mas ainda cobre uma fatia inicial: backend pelos
  testes formais carregados em `node --test`, frontend pelo projeto Vitest
  `server` sem Chromium. Thresholds por modulo/pacote ainda devem subir depois
  de novas specs.
- Backend tem 95 use cases e a cobertura formal ainda esta no inicio; a
  primeira fatia P0 foi coberta, mas varias regras de negocio seguem testadas
  apenas indiretamente por HTTP.
- Frontend tem 147 paginas e 47 componentes; a primeira fatia de specs reais
  server-side e browser foi adicionada, mas ainda faltam specs dos formularios,
  fluxos de tela e estados de erro principais.
- O ESLint legado do frontend tinha 471 problemas suprimidos em 110 arquivos ao
  fim da etapa 13. Na etapa 14.6, a baseline foi zerada e o gate agora precisa
  ser mantido sem novas supressoes.
- `npm run lint:format` reprovava na etapa 13 por baseline de formatacao
  Prettier existente. O erro de parsing em `PRONTUARIO_PACIENTE.md` foi
  removido na etapa 13, e a limpeza completa de formato foi concluida depois na
  etapa 14.3.
- A suite browser do frontend agora cobre componentes reais. Localmente, o
  download do Chromium gerenciado pelo Playwright sofreu timeout/ECONNRESET;
  por isso o `vite.config.ts` aceita `VITEST_BROWSER_CHANNEL=chrome` como
  fallback sem mudar o comportamento padrao do CI.
- A execucao completa de `npm run test:smoke:all` no CI aumenta tempo de build,
  mas protege contrato HTTP, fluxos criticos e regressao de deploy em um unico
  gate.

## Lacunas prioritarias para implementar

### Atividade 1 implementada - seguranca backend

- Criado `tests/security.test.js` com testes formais para CORS Vercel, wildcard
  em producao, API key, `apiKeyGuard`, autenticacao Bearer, encaminhamento de
  erro de token invalido, RBAC por role e schemas basicos de auth.
- `npm run validate` passou com 9 testes `node:test` formais e a suite existente
  do Centro.

### Atividade 2 implementada - use cases prioritarios backend

- Criado `tests/priority-use-cases.test.js` com testes formais para escopo LGPD,
  bloqueio por prefeitura/UBS, acesso a prontuario, validacao de datas,
  resolucao de prefeitura efetiva no TFD, isolamento entre prefeituras, saldo
  financeiro invalido e cadeia de hash da auditoria TFD.
- `npm run validate` passou com 17 testes `node:test` formais e a suite
  existente do Centro.

### Atividade 3 implementada - specs reais frontend

- Removidos os exemplos do template em `src/lib/vitest-examples`.
- `src/lib/api/client.spec.ts` foi expandido para cobrir contrato HTTP real:
  headers, querystring, API key, token, idempotencia, login/logout, 401,
  download de blob e `ApiError`.
- Criados `src/lib/api/tfd-client.spec.ts` e `src/lib/api/erros.spec.ts` para
  validar rotas TFD/Centro/Paciente App e mensagens amigaveis SMS/TFD.
- `npm test -- --project server` passou com 3 arquivos de spec e 18 testes.
- `npm run check` e `VITE_API_BASE_URL=http://localhost:3333/v1 npm run build`
  passaram; na atividade 3 ainda restavam 2 warnings antigos em
  `RemarcarEncaminhamento.svelte`.

### Atividade 4 implementada - warnings frontend

- Corrigido `src/lib/presentation/components/RemarcarEncaminhamento.svelte`
  usando snapshot inicial com `untrack` e sincronizacao controlada por
  `$effect` quando o encaminhamento recebido muda.
- Removidos imports sem uso do componente.
- `npm run check` passou com 0 erros e 0 warnings.
- `npm test -- --project server` passou com 3 arquivos de spec e 18 testes.
- `VITE_API_BASE_URL=http://localhost:3333/v1 npm run build` passou sem os
  warnings anteriores do `RemarcarEncaminhamento.svelte`.

### Atividade 5 implementada - cobertura e thresholds

- Criado `docs/COBERTURA_THRESHOLDS_ETAPA13.md` com baseline, thresholds
  atuais e plano de subida progressiva.
- Backend ganhou `npm run test:coverage` usando coverage nativo do Node:
  thresholds de 60% linhas, 50% funcoes e 50% branches.
- Frontend ganhou `npm run test:coverage` com Vitest + provider V8:
  thresholds de 30% statements, 30% linhas, 15% funcoes e 35% branches.
- `@vitest/coverage-v8` foi adicionado como devDependency do frontend.
- Os comandos de cobertura passaram nos dois projetos. Baseline medido:
  backend 75.48% linhas / 72.16% branches / 68.97% funcoes; frontend 37.30%
  statements / 37.50% linhas / 43.38% branches / 17.88% funcoes.

### Atividade 6 implementada - lint/frontend e Playwright

- Frontend ganhou scripts separados para `lint:eslint`,
  `lint:eslint:baseline`, `lint:eslint:refresh`, `lint:format`,
  `test:server`, `test:browser` e `playwright:install`.
- `npm run lint` agora e um gate incremental de ESLint: passa com a baseline
  versionada em `.eslint-suppressions.json` e deve falhar se novas violacoes nao
  estiverem mapeadas.
- A baseline criada nesta atividade registrava 471 problemas legados de ESLint em
  110 arquivos, sem tentar misturar a limpeza inteira na etapa 13. Depois, a
  etapa 14.4 reduziu a baseline para 214 problemas em 40 arquivos e ajustou
  `lint:eslint:refresh` para podar e formatar suppressions obsoletas.
- `npm test` ficou focado no projeto server do Vitest, que hoje contem as specs
  reais existentes.
- `npm run test:browser` roda o projeto client com `--passWithNoTests`, evitando
  falso bloqueio enquanto ainda nao ha specs `.svelte`.
- O exemplo pseudo-Svelte em `frontend/PRONTUARIO_PACIENTE.md` deixou de quebrar
  o parser do Prettier.

### Atividade 7 implementada - CI e thresholds progressivos

- `.github/workflows/validate.yml` foi expandido para rodar `npm run validate`,
  `npm run test:coverage`, `npm run db:validate-migrations`, `npm run
  test:smoke:all` e `npm audit --omit=dev` no backend.
- O job backend passou a definir `SMOKE_DATABASE_URL` separado de
  `DATABASE_URL`, evitando que smokes usem o banco principal do CI.
- `scripts/smoke/env.sh` e `scripts/db/validate-migrations.sh` agora conseguem
  criar/recriar bancos descartaveis tanto via container local
  `unisism-postgres` quanto via `psql`, que e o caminho usado no GitHub
  Actions.
- O job frontend passou a rodar `npm run check`, `npm run lint`, `npm test`,
  `npm run test:browser`, `npm run test:coverage` e `npm run build`.
- `frontend/README.md` foi atualizado para refletir o novo gate incremental de
  ESLint e deixar `lint:format` como diagnostico de baseline Prettier.

### Atualizacao etapa 14.5/14.6 - ESLint zerado e specs browser

- A baseline de ESLint do frontend foi reduzida de 214 itens para 0; o arquivo
  `frontend/.eslint-suppressions.json` ficou vazio.
- Foram corrigidos imports sem uso, chaves de loops Svelte, callbacks, estados
  derivados e casts inseguros em rotas de Centro, SMS e TFD.
- `frontend/src/lib/presentation/components/StatusBadge.svelte.spec.ts` foi
  criado com 3 testes browser reais para `StatusBadge`, `ScanBadge` e
  `PrimaryButton`.
- `frontend/vite.config.ts` passou a aceitar `VITEST_BROWSER_CHANNEL`, mantendo
  o Chromium gerenciado como padrao e permitindo usar Chrome local quando o
  download do Playwright estiver instavel.
- `npm run lint`, `npm run lint:eslint:baseline`, `npm run lint:format`,
  `npm run check`, `npm test`, `npm run test:coverage`,
  `VITE_API_BASE_URL=http://localhost:3333/v1 npm run build`, `npm audit` e
  `npm audit --omit=dev` passaram.
- `VITEST_BROWSER_CHANNEL=chrome npm run test:browser` passou com 1 arquivo de
  spec e 3 testes browser.

### P0 - Seguranca e autorizacao

- Expandir os testes de RBAC para matrizes por rota/perfil em admin, SMS, UBS,
  TFD, centro e prontuario.
- Testes negativos para API key, JWT expirado, refresh token revogado e troca de
  senha obrigatoria.
- Testes de CORS cobrindo origem Vercel de producao, preview do projeto
  `unisism`, preview de outro projeto e wildcard em producao.

### P0 - Prontuario e LGPD/CFM

- Testes para append-only/auditoria em alergias, condicoes, medicamentos,
  atendimentos, exames, vacinas e viagens TFD.
- Testes de escopo: usuario de uma UBS/prefeitura nao pode consultar ou alterar
  paciente fora do seu dominio.
- Testes de download de anexos com path traversal, MIME esperado e headers de
  cache/Content-Disposition.

### P0 - TFD financeiro e auditoria

- Testes isolados para saldo, ajuda de custo, abastecimento, autorizacao,
  pagamento, negacao e comprovantes.
- Testes para cadeia de auditoria TFD: hash anterior, integridade, exportacao TJ
  e bloqueio de mutacao historica.
- Testes de alocacao/presenca/conclusao garantindo invariantes de capacidade,
  status e quilometragem.

### P1 - Centro/CEM/CEO

- Testes de regras de agenda, fila, remarcacao, ausencia medica e procedimentos.
- Testes de cotas, salas, especialidades e remanejamento em lote com cenarios de
  erro e concorrencia.
- Testes para garantir compatibilidade dos aliases de rotas legadas.

### P1 - Frontend

- Specs de componentes para formularios criticos: login, redefinir senha,
  `RemarcarEncaminhamento`, `ResolverPendencia`, `AprovarEncaminhamento`,
  `RejeitarEncaminhamento`, `Dropzone`, `SeatPicker`.
- Testes de API client para 401, refresh/logout, erro padrao, querystring e
  headers sem API key.
- Playwright E2E minimo para login, dashboard, criar encaminhamento, anexar
  arquivo, aprovar/rejeitar, prontuario e TFD gestao.

### P1 - Qualidade de gate

- Subir cobertura com thresholds progressivos por modulo depois da base inicial
  criada na atividade 5.
- Manter a baseline de ESLint zerada e impedir novas supressoes em
  `.eslint-suppressions.json`.
- Manter `npm run lint:format` como gate de formato do frontend depois da
  limpeza completa concluida na etapa 14.3.
- Subir thresholds progressivamente depois que os proximos testes reais forem
  incluidos.

## Validacoes executadas nesta etapa

| Comando | Resultado |
|---|---|
| `backend: npm run validate` | Passou, 17 testes `node:test` + Centro |
| `backend: npm run test:coverage` | Passou, 75.48% linhas |
| `backend: npm run test:smoke:production` | Passou, 41 asserts |
| `frontend: npm run check` | Passou, 0 erros e 0 warnings |
| `frontend: npm run lint` | Passou com baseline ESLint vazia |
| `frontend: npm test` | Passou, 18 testes |
| `frontend: VITEST_BROWSER_CHANNEL=chrome npm run test:browser` | Passou, 1 spec browser e 3 testes |
| `frontend: npm run test:coverage` | Passou, 37.50% linhas |
| `frontend: npm run build` | Passou |
| `workflow Validate` | Atualizado para rodar coverage, migrations, smokes, lint e browser test |

## Roadmap restante da etapa 13

Implementar primeiro um pacote pequeno de cobertura P0, sem tentar resolver tudo
de uma vez:

1. Backend: criar testes unitarios/integrados para CORS/API key/RBAC e escopo de
   prontuario. Concluido nas atividades 1 e 2.
2. Backend: criar testes TFD para saldo, ajuda de custo e cadeia de auditoria.
   Parcialmente concluido na atividade 2; ainda falta ampliar para ajuda de
   custo, abastecimento, autorizacao, pagamento, negacao e comprovantes.
3. Frontend: trocar specs de exemplo por specs reais. Concluido na atividade 3
   com 18 testes server-side; primeira fatia browser/componentizada concluida
   na etapa 14.6 com 3 testes.
4. Frontend: limpar o warning de `RemarcarEncaminhamento.svelte`. Concluido na
   atividade 4.
5. Adicionar thresholds de cobertura progressivos. Concluido na atividade 5.
6. Frontend: configurar Playwright de forma reproduzivel no CI e documentar o
   comando local quando o browser ja estiver instalado. Concluido na atividade
   6 e reforcado na etapa 14.6 com fallback `VITEST_BROWSER_CHANNEL`.
7. CI: manter build/check/smokes como gate e subir thresholds conforme os
   proximos testes forem incluidos. Concluido na atividade 7 para os gates
   atuais; a subida numerica continua progressiva.

## Risco fora do escopo desta atividade

- `frontend: npm audit --omit=dev` apontou 1 vulnerabilidade runtime moderada em
  `dompurify`, transitiva do fluxo de PDF. Na etapa 13, nao foi corrigida
  para nao misturar cobertura com mudanca de seguranca/dependencia runtime.
  Corrigido depois na etapa 14.1 com `dompurify` 3.4.15 no
  `frontend/package-lock.json`; o audit completo do frontend tambem foi zerado
  na etapa 14.2 com upgrades de tooling e override de `cookie@0.7.2`.
- `frontend: npm run lint:format` apontava baseline legado de Prettier; a
  limpeza completa foi feita em lote separado na etapa 14.3, com 188 arquivos
  normalizados.
- `frontend: npm run test:browser` depende de Chromium gerenciado quando nenhum
  canal local e informado; no Mac usado nesta revisao o download falhou por
  rede, e o comando passou com `VITEST_BROWSER_CHANNEL=chrome`.
