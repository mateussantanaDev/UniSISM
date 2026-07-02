# PEC e-SUS APS → UNISISM · Pipeline ETL paralelo

Scripts standalone para extrair dados do **PEC e-SUS APS** (Águas Belas / PE) e
importar para o backend UNISISM, com **3 níveis de paralelismo seguro** que
respeitam LGPD/CFM (audit imutável) e protegem a conta de anti-bot.

## ⚡ Arquitetura de paralelismo

```
┌─────────────────────────────────────────────────────────────┐
│ NÍVEL 1 · Browser contexts compartilhando sessão            │
│  1 login → storage state JSON → N contexts (default 4)     │
│  Throttle global 6 req/s (defesa anti-bot)                  │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ NÍVEL 2 · Worker pool Node                                  │
│  (CPU cores - 2) workers paralelos                          │
│  Parse CSV + bulk insert Prisma — não toca no PEC           │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ NÍVEL 3 · Download paralelo                                 │
│  N downloads simultâneos de CSVs "Pronto" da fila do PEC    │
└─────────────────────────────────────────────────────────────┘
```

**Por que NÃO 10 logins paralelos**: PEC tem "único acesso por usuário" + anti-bot
por IP — 10 logins = 9 derrubadas + risco de banimento. Por isso usamos **1 login
+ N contexts** (PEC vê como 1 usuário, 1 IP, dentro do throttle).

## Setup

### 1. Credenciais (já configurado)

`backend/.env.pec`:

```env
PEC_BASE_URL=https://aguasbelas.esuscloud.com.br/
PEC_USER=08934043490
PEC_PASSWORD=saude2026ab
PEC_HEADLESS=true            # false pra debugar
PEC_POOL_SIZE=4              # contexts paralelos (3-5 ideal)
PEC_RATE_DELAY_MS=3500       # ms entre requests por context
PEC_GLOBAL_RATE_HZ=6         # máx req/s global
PEC_IMPORT_WORKERS=10        # workers Node pra import
```

### 2. Dependências

```bash
cd backend
npm install                       # garante deps
npx playwright install chromium   # download do browser (~100 MB)
npm install -g pm2                # gerenciador de processos
```

### 3. Banco UNISISM

A `Prefeitura "Prefeitura Municipal de Águas Belas"` é criada automaticamente
pelo `pec-import.ts`. As 13 UBSs também (CNES → INE de cada).

## Pipeline

### 1️⃣ `pec-export-all.ts` — Exportador paralelo (Nível 1+3)

Estimativa: **20-50 min** com pool=4 (era 1-3h serial).

```bash
# Foreground
npx ts-node-dev --transpile-only scripts/pec/pec-export-all.ts

# Background
pm2 start --interpreter "npx" --interpreter-args "ts-node-dev --transpile-only" \
  scripts/pec/pec-export-all.ts --name pec-exports
pm2 logs pec-exports
```

**Output**: `backend/data/pec-csv/<relatorio>__c<chunk>.csv`

### 2️⃣ `pec-deep-scraper.ts` — Tour das UBSs (Nível 1)

Estimativa: **2-22 dias** contínuos (era 9-90 serial).

```bash
pm2 start --interpreter "npx" --interpreter-args "ts-node-dev --transpile-only" \
  scripts/pec/pec-deep-scraper.ts --name pec-deep
pm2 logs pec-deep --lines 100
pm2 stop pec-deep        # pausar (resumível)
pm2 start pec-deep       # continua do checkpoint
```

**Output**: `backend/data/pec-pacientes/<ubs-slug>/<cpf>.json`

> ⚠️ Os métodos `listarPacientesUbs()` e `capturarPaciente()` têm TODOs —
> serão completados após mapear UI dentro do perfil Enfermeira no 1º run de teste.

### 3️⃣ `pec-import.ts` — Import paralelo no UNISISM (Nível 2)

Estimativa: minutos.

```bash
# DRY-RUN (default)
npx ts-node-dev --transpile-only scripts/pec/pec-import.ts

# COMMIT
npx ts-node-dev --transpile-only scripts/pec/pec-import.ts --commit
```

**Workers paralelos**: `PEC_IMPORT_WORKERS=10` (default = CPU cores - 2).

## Resiliência

Todos os 3 scripts são **resumíveis** via `data/pec-progress.json`:

```json
{
  "exports": {
    "atendimento-individual__c0": { "status": "downloaded", "filename": "..." },
    "vacinacao__c0": { "status": "dispatched", "dispatchedAt": "2026-06-01..." }
  },
  "ubsPacientes": {
    "ubs-abel-dias-da-silva": {
      "coletados": ["12345678900", "..."],
      "restantes": 423,
      "finalizado": false
    }
  }
}
```

PC desliga / sessão expira / PEC fora do ar → reinicia, retoma de onde parou.

## Monitoramento

```bash
pm2 status                                   # estado dos processos
pm2 logs pec-deep --lines 100                # últimos logs
find data/pec-pacientes -name "*.json" | wc  # contagem pacientes coletados
ls -la data/pec-csv/                         # CSVs prontos
du -sh data/                                 # tamanho total
```

## LGPD / CFM (não-negociável)

- ✅ Cada paciente importado → `paciente_prontuario_audit` (retenção 20 anos)
- ✅ Audit `auditoria_logs` com ação `IMPORT_PEC`, data, fonte, contagem
- ✅ Pasta `backend/data/` em `.gitignore`
- ⚠️ Após import bem-sucedido, considere apagar `data/pec-pacientes/`
- ⚠️ Trocar senha do PEC quando terminar

## Troubleshooting

**"Após 5 tentativas o login será bloqueado"** → pare TUDO. Verifique credenciais.

**Sessão expirou no pool** → os scripts re-logam automaticamente. Se persistir,
apague `data/pec-state/storage-state.json` e relance.

**Anti-bot disparou** → reduza `PEC_GLOBAL_RATE_HZ=3` e `PEC_POOL_SIZE=2`.

**Browser trava** → `pm2 restart pec-deep`.

**TypeError dentro do worker** → o ts-node precisa estar instalado: `npm i -D ts-node`.

## Estimativa final

| Etapa | Sem pool | Com pool 4× |
|---|---|---|
| Export 12 relatórios | 1-3h | 20-50 min |
| Tour 13 UBSs × N pacientes | 9-90 dias | 2-22 dias |
| Import no UNISISM | minutos | minutos |
| **TOTAL** | **9-90 dias** | **2-22 dias** |
