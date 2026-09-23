# Etapa 13.5 - Cobertura e thresholds progressivos

Data: 2026-09-22

## Objetivo

Criar um gate numerico inicial de cobertura sem fingir que a base ja esta toda
coberta. Os thresholds comecam baixos, passam no estado atual e devem subir
conforme novas specs forem adicionadas.

## Backend

Comando:

```bash
npm run test:coverage
```

Ferramenta: coverage nativo do `node --test` sobre os arquivos carregados em
`dist/**/*.js` pelos testes formais `tests/*.test.js`, seguido da suite atual
`tests/centro.test.ts`.

Thresholds atuais:

| Metrica | Threshold |
|---|---:|
| Linhas | 60% |
| Funcoes | 50% |
| Branches | 50% |

Baseline medido na atividade:

| Metrica | Resultado |
|---|---:|
| Linhas | 75.48% |
| Funcoes | 68.97% |
| Branches | 72.16% |

## Frontend

Comando:

```bash
npm run test:coverage
```

Ferramenta: Vitest com provider V8 no projeto `server`, cobrindo a primeira
fatia testavel sem Chromium: `ApiClient`, traducoes de erro SMS e traducoes de
erro TFD.

Thresholds atuais:

| Metrica | Threshold |
|---|---:|
| Statements | 30% |
| Linhas | 30% |
| Funcoes | 15% |
| Branches | 35% |

Baseline medido na atividade:

| Metrica | Resultado |
|---|---:|
| Statements | 37.30% |
| Linhas | 37.50% |
| Funcoes | 17.88% |
| Branches | 43.38% |

## Proxima subida

- Backend: subir thresholds para 70/60/60 depois de cobrir ajuda de custo,
  abastecimento, autorizacao, pagamento, negacao e comprovantes TFD.
- Frontend: subir funcoes para 25% e linhas/statements para 40% depois de
  adicionar specs para formularios reais ou habilitar cobertura browser.
- Browser/Playwright: adicionar cobertura de componentes Svelte quando o
  Chromium local/CI estiver reproduzivel.

## Gate de CI

O workflow `Validate` executa os comandos de cobertura dos dois projetos:

- Backend: `npm run test:coverage`.
- Frontend: `npm run test:coverage`.

Tambem rodam no CI:

- `npm run db:validate-migrations`, com banco descartavel recriado por `psql`.
- `npm run test:smoke:all`, com `SMOKE_DATABASE_URL` separado do banco principal
  do job.
- `npm run test:browser`, apos instalar Chromium via Playwright.

Os thresholds devem subir somente quando a nova cobertura real entrar no mesmo
commit ou em commit anterior ja validado pelo workflow.
