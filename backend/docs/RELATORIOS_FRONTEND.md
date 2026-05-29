# UNISISM · Módulo de Relatórios — Guia de Implementação Frontend

> Guia prático de consumo. Para a arquitetura do backend, ver [`RELATORIOS.md`](RELATORIOS.md).
> Contratos tipados: [`types.ts`](types.ts) · Cliente HTTP: [`api-client.ts`](api-client.ts).

---

## Sumário

1. [Visão geral do fluxo](#1-visão-geral-do-fluxo)
2. [Os 3 endpoints em 30 segundos](#2-os-3-endpoints-em-30-segundos)
3. [Contratos TypeScript (fonte da verdade)](#3-contratos-typescript)
4. [Os 7 tipos de relatório](#4-os-7-tipos-de-relatório)
5. [Matriz de permissões por role](#5-matriz-de-permissões-por-role)
6. [Fluxo de uso (polling + download)](#6-fluxo-de-uso)
7. [Receitas em SvelteKit](#7-receitas-em-sveltekit)
8. [Tratamento de erros](#8-tratamento-de-erros)
9. [Modo nominal (BUSCA_ATIVA opt-in)](#9-modo-nominal-busca_ativa)
10. [UX recomendada](#10-ux-recomendada)
11. [Rate limit — como lidar na UI](#11-rate-limit)
12. [Checklist de implementação](#12-checklist-de-implementação)

---

## 1. Visão geral do fluxo

```
┌────────────────────────────────────────────────────────────────┐
│ Tela /sms/relatorios                                            │
│                                                                 │
│  1. Usuário escolhe: tipo + dataInicial + dataFinal + formato  │
│  2. POST /relatorios          →  { id, status: 'PROCESSANDO' } │
│  3. Polling GET /relatorios    →  status: DISPONIVEL            │
│  4. GET /relatorios/:id/download  →  blob (PDF|CSV|XLSX)       │
└────────────────────────────────────────────────────────────────┘
```

**Regras de ouro:**

- ✅ O frontend **nunca** gera arquivo (nem preview). Tudo acontece no backend.
- ✅ O frontend **nunca** interpreta o conteúdo do blob — só baixa e deixa o SO abrir.
- ✅ O frontend **nunca** precisa saber que dados tem no relatório — isso é decisão do tipo + escopo do usuário logado.
- ✅ O contrato é **invariante**: os 3 endpoints têm o mesmo shape desde a v0.1 e vão continuar assim.

---

## 2. Os 3 endpoints em 30 segundos

| Método | Rota                       | Retorno                                  |
|--------|----------------------------|------------------------------------------|
| POST   | `/v1/relatorios`           | `Relatorio` · HTTP 202 · `status: PROCESSANDO` |
| GET    | `/v1/relatorios`           | `Relatorio[]` · metadados dos últimos 90 dias |
| GET    | `/v1/relatorios/:id/download` | Blob (PDF/CSV/XLSX) · HTTP 200 |

**Auth:** todos exigem `Authorization: Bearer <jwt>`.
**Visibilidade da lista:**
- Atendentes veem **só o que eles próprios geraram**.
- `ADMIN` vê **todos da sua prefeitura**.
- `DESENVOLVEDOR` vê tudo.

---

## 3. Contratos TypeScript

Colados de [`types.ts`](types.ts) — única fonte da verdade:

```ts
export type TipoRelatorio =
  | 'PRODUCAO_INDIVIDUAL'
  | 'ENCAMINHAMENTOS_POR_ESPECIALIDADE'
  | 'FILA_REGULACAO'
  | 'PENDENCIAS_RESOLVIDAS'
  | 'TFD_CUSTOS'
  | 'VACINACAO_UBS'
  | 'BUSCA_ATIVA';

export type FormatoRelatorio = 'PDF' | 'CSV' | 'XLSX';
export type StatusRelatorio  = 'DISPONIVEL' | 'PROCESSANDO' | 'FALHA';

export interface Relatorio {
  id: string;
  titulo: string;           // "Fila de Regulação · 01/04/2026 – 22/04/2026"
  tipo: TipoRelatorio;
  periodo: string;          // "01/04/2026 – 22/04/2026" já formatado
  formato: FormatoRelatorio;
  geradoEm: string;         // ISO 8601
  tamanhoKb: number;        // 0 enquanto PROCESSANDO
  status: StatusRelatorio;
}

export interface CriarRelatorioRequest {
  tipo: TipoRelatorio;
  dataInicial: string;      // YYYY-MM-DD
  dataFinal: string;        // YYYY-MM-DD
  formato: FormatoRelatorio;
  filtros?: Record<string, unknown>;
}
```

---

## 4. Os 7 tipos de relatório

### 4.1 `FILA_REGULACAO`
**Quem pode gerar:** `REGULADOR_SMS`, `ADMIN`, `DESENVOLVEDOR`
**Finalidade:** Monitoramento operacional da fila de regulação municipal (LGPD art. 7º III).
**Contém:** `protocolo`, `especialidade`, `prioridade`, `ubs_origem`, `data_entrada`, `tempo_em_fila_h`, `sla_status`
**PII:** nenhum. Classificação `USO_INTERNO`.
**Período:** ignorado — é sempre o "estado atual" (quem está esperando agora).

### 4.2 `ENCAMINHAMENTOS_POR_ESPECIALIDADE`
**Quem:** `COORDENADOR_UBS`, `REGULADOR_SMS`, `ADMIN`, `DESENVOLVEDOR`
**Finalidade:** Planejamento de capacidade assistencial.
**Contém:** `especialidade`, `total`, `aprovados`, `rejeitados`, `pendencias`, `tempo_medio_dias`
**PII:** zero. Classificação `PUBLICO_INSTITUCIONAL` — mais seguro para uso amplo.

### 4.3 `PENDENCIAS_RESOLVIDAS`
**Quem:** `COORDENADOR_UBS`, `REGULADOR_SMS`, `ADMIN`, `DESENVOLVEDOR`
**Contém:** `protocolo`, `ubs_origem`, `registrada_em`, `resolvida_em`, `tempo_resolucao_horas`, `motivo_categoria`
**PII:** nenhum. O motivo é **categorizado** no backend (não vem o texto livre).

### 4.4 `TFD_CUSTOS` (Tratamento Fora do Domicílio)
**Quem:** `ADMIN`, `REGULADOR_SMS`, `DESENVOLVEDOR`
**Contém:** `protocolo`, `destino`, `especialidade`, `data_viagem`, `valor`, `status`
**Classificação:** `RESTRITO` — gera PDF com marca d'água "CONFIDENCIAL".

### 4.5 `VACINACAO_UBS`
**Quem:** `COORDENADOR_UBS`, `ADMIN`, `DESENVOLVEDOR`
**Contém:** `ubs`, `vacina`, `campanha`, `doses`, `faixa_etaria`
**PII:** zero. Só agregado por faixa etária (`0-5`, `6-17`, `18-59`, `60+`).

### 4.6 `BUSCA_ATIVA`
**Quem:** `COORDENADOR_UBS`, `ADMIN`, `DESENVOLVEDOR`
**Dois modos:**
- **Agregado (default):** `bairro`, `microarea`, `quantidade`
- **Nominal (opt-in):** acrescenta `nome`, `cartao_sus_mascarado`, `telefone_mascarado`, `endereco_bairro`, `cpf_mascarado`
**Ver seção [§9](#9-modo-nominal-busca_ativa)** para regras do modo nominal.

### 4.7 `PRODUCAO_INDIVIDUAL`
**Quem:** `ATENDENTE_UBS`, `COORDENADOR_UBS`, `REGULADOR_SMS`, `ADMIN`, `DESENVOLVEDOR`
**Escopo automático:**
- `ATENDENTE_UBS` → **só o próprio**
- `COORDENADOR_UBS` → **toda sua UBS**
- `ADMIN`/`SMS` → **toda a prefeitura**
**Contém:** `atendente_nome`, `matricula`, `periodo`, `total_ingeridos`, `aprovados`, `pendencias`, `tempo_medio_m`
**Classificação:** `RESTRITO` (dados funcionais).

---

## 5. Matriz de permissões por role

Se o usuário tentar gerar um tipo fora da sua permissão, recebe **`403 PERMISSAO_INSUFICIENTE`**. A UI deve esconder o card do tipo proativamente (defesa em camadas), mas o backend é a fonte de verdade.

| Tipo                                  | ATENDENTE | COORDENADOR UBS | REGULADOR SMS | ADMIN | DEV |
|---------------------------------------|:---------:|:--------------:|:-------------:|:-----:|:---:|
| `PRODUCAO_INDIVIDUAL`                 |     ✅     |       ✅        |       ✅       |   ✅   |  ✅  |
| `ENCAMINHAMENTOS_POR_ESPECIALIDADE`   |     ❌     |       ✅        |       ✅       |   ✅   |  ✅  |
| `FILA_REGULACAO`                      |     ❌     |       ❌        |       ✅       |   ✅   |  ✅  |
| `PENDENCIAS_RESOLVIDAS`               |     ❌     |       ✅        |       ✅       |   ✅   |  ✅  |
| `TFD_CUSTOS`                          |     ❌     |       ❌        |       ✅       |   ✅   |  ✅  |
| `VACINACAO_UBS`                       |     ❌     |       ✅        |       ❌       |   ✅   |  ✅  |
| `BUSCA_ATIVA`                         |     ❌     |       ✅        |       ❌       |   ✅   |  ✅  |

**Para o DEV:** exige `filtros.prefeituraId` no POST (senão `422 PREFEITURA_OBRIGATORIA`).

---

## 6. Fluxo de uso

### 6.1 Diagrama de estados

```
     POST /relatorios
          │
          ▼
   ┌─────────────┐   worker renderiza   ┌─────────────┐
   │ PROCESSANDO │ ───────────────────▶ │ DISPONIVEL  │
   └─────────────┘                      └─────────────┘
          │                                    │
          │ erro no worker                     │ GET /download
          ▼                                    ▼
   ┌─────────────┐                      [blob baixa]
   │   FALHA     │                             │
   └─────────────┘                             │
                                    7 dias ──▶ FALHA (com erroTraceId='EXPIRADO')
```

### 6.2 Poll interval recomendado

- **2s** entre tentativas
- **30 tentativas máximas** (1 minuto total)
- Após isso, avisar usuário que o relatório demorou demais — provavelmente é período muito grande; recomendar reduzir.

O cliente TS já tem um helper que faz isso:

```ts
const r = await api.relatorios.createAndWait(
  {
    tipo: 'ENCAMINHAMENTOS_POR_ESPECIALIDADE',
    dataInicial: '2026-04-01',
    dataFinal: '2026-04-30',
    formato: 'PDF',
  },
  { intervalMs: 2000, timeoutMs: 60_000 },
);
```

---

## 7. Receitas em SvelteKit

### 7.1 Tela listar + gerar

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api';
  import type { Relatorio, TipoRelatorio, FormatoRelatorio } from '$lib/api/types';

  let lista: Relatorio[] = $state([]);
  let carregando = $state(true);
  let erro: string | null = $state(null);

  let form = $state({
    tipo: 'ENCAMINHAMENTOS_POR_ESPECIALIDADE' as TipoRelatorio,
    dataInicial: '2026-04-01',
    dataFinal: '2026-04-30',
    formato: 'PDF' as FormatoRelatorio,
  });

  async function carregar() {
    try {
      lista = await api.relatorios.list();
    } catch (e) {
      erro = e instanceof ApiError ? e.message : 'Falha ao carregar relatórios';
    } finally {
      carregando = false;
    }
  }

  async function gerar() {
    try {
      const criado = await api.relatorios.create(form);
      lista = [criado, ...lista]; // adiciona no topo com status PROCESSANDO
      pollear(criado.id);
    } catch (e) {
      if (e instanceof ApiError) erro = mensagemAmigavel(e);
      else erro = 'Erro inesperado';
    }
  }

  async function pollear(id: string) {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const atualizada = await api.relatorios.list();
      lista = atualizada;
      const r = atualizada.find(x => x.id === id);
      if (r && r.status !== 'PROCESSANDO') return;
    }
  }

  async function baixar(r: Relatorio) {
    try {
      const { blob, filename } = await api.relatorios.download(r.id);
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: filename });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (e instanceof ApiError) erro = mensagemAmigavel(e);
    }
  }

  function mensagemAmigavel(e: ApiError): string {
    switch (e.code) {
      case 'PERMISSAO_INSUFICIENTE': return 'Você não tem permissão para gerar este tipo.';
      case 'PERIODO_INVALIDO':       return 'Período inválido. Máximo 12 meses, dataInicial ≤ dataFinal ≤ hoje.';
      case 'RATE_LIMIT_EXCEDIDO':    return 'Muitos relatórios recentes. Aguarde alguns minutos.';
      case 'RELATORIO_NAO_DISPONIVEL': return 'Relatório ainda está sendo gerado.';
      case 'RELATORIO_EXPIRADO':     return 'Este relatório expirou. Gere novamente.';
      case 'JUSTIFICATIVA_OBRIGATORIA': return 'Modo nominal exige justificativa de 30+ caracteres.';
      default: return e.message;
    }
  }

  onMount(carregar);
</script>

<form onsubmit={(e) => { e.preventDefault(); gerar(); }}>
  <select bind:value={form.tipo}>
    <option value="ENCAMINHAMENTOS_POR_ESPECIALIDADE">Encaminhamentos por Especialidade</option>
    <option value="FILA_REGULACAO">Fila de Regulação</option>
    <!-- ... outros 5 tipos -->
  </select>
  <input type="date" bind:value={form.dataInicial} />
  <input type="date" bind:value={form.dataFinal} />
  <select bind:value={form.formato}>
    <option value="PDF">PDF</option>
    <option value="CSV">CSV</option>
    <option value="XLSX">XLSX (Excel)</option>
  </select>
  <button type="submit">Gerar relatório</button>
</form>

{#if erro}
  <div class="erro">{erro}</div>
{/if}

<table>
  {#each lista as r}
    <tr>
      <td>{r.titulo}</td>
      <td>{r.periodo}</td>
      <td>{r.formato}</td>
      <td>
        {#if r.status === 'PROCESSANDO'}
          <span class="badge-amarelo">⏳ Gerando...</span>
        {:else if r.status === 'DISPONIVEL'}
          <span class="badge-verde">✓ Pronto</span>
        {:else}
          <span class="badge-vermelho">✗ Falha</span>
        {/if}
      </td>
      <td>
        {#if r.status === 'DISPONIVEL'}
          <button onclick={() => baixar(r)}>Baixar</button>
        {/if}
      </td>
    </tr>
  {/each}
</table>
```

### 7.2 Cards cosméticos dos tipos

Se você quiser renderizar cards explicando cada tipo antes da seleção:

```ts
const TIPOS_DISPONIVEIS = [
  {
    tipo: 'ENCAMINHAMENTOS_POR_ESPECIALIDADE',
    label: 'Demanda por Especialidade',
    descricao: 'Agregado estatístico — ideal para planejamento.',
    icone: '📊',
    cor: 'blue',
  },
  {
    tipo: 'FILA_REGULACAO',
    label: 'Fila de Regulação',
    descricao: 'Quem está aguardando agora + SLA.',
    icone: '⏱️',
    cor: 'amber',
  },
  {
    tipo: 'PENDENCIAS_RESOLVIDAS',
    label: 'Pendências Resolvidas',
    descricao: 'Tempo médio de readequação de documentos.',
    icone: '🔄',
    cor: 'emerald',
  },
  {
    tipo: 'TFD_CUSTOS',
    label: 'TFD · Custos',
    descricao: 'Viagens custeadas (Tratamento Fora do Domicílio).',
    icone: '💰',
    cor: 'rose',
    restrito: true, // indica marca d'água no PDF
  },
  {
    tipo: 'VACINACAO_UBS',
    label: 'Vacinação',
    descricao: 'Doses aplicadas por campanha e faixa etária.',
    icone: '💉',
    cor: 'green',
  },
  {
    tipo: 'BUSCA_ATIVA',
    label: 'Busca Ativa',
    descricao: 'Pacientes sem atendimento há mais de 90 dias.',
    icone: '🔍',
    cor: 'indigo',
    permiteNominal: true,
  },
  {
    tipo: 'PRODUCAO_INDIVIDUAL',
    label: 'Produção Individual',
    descricao: 'Volume e tempo médio do atendente.',
    icone: '📈',
    cor: 'purple',
    restrito: true,
  },
];
```

Filtre com base na role do `me.role`:

```ts
const meusTipos = $derived.by(() => {
  const r = me?.role;
  if (!r) return [];
  return TIPOS_DISPONIVEIS.filter(t => rolesPermitidas[t.tipo].includes(r));
});
```

---

## 8. Tratamento de erros

Shape invariante de erro:

```json
{
  "error": {
    "code": "CODIGO_ESTAVEL",
    "message": "Mensagem em pt-BR",
    "details": { "opcional": "contexto" }
  }
}
```

### 8.1 Tabela completa (sempre trate pelo `code`, nunca pelo `message`)

| Code                          | HTTP | Quando                          | UX sugerida                      |
|-------------------------------|:----:|---------------------------------|----------------------------------|
| `TIPO_RELATORIO_INVALIDO`     | 400  | Tipo desconhecido               | Bug de frontend — tratar antes   |
| `PERIODO_INVALIDO`            | 400  | Datas invertidas/futura/>12m    | Destacar os inputs de data       |
| `FORMATO_INVALIDO`            | 400  | Formato desconhecido            | Bug de frontend                  |
| `PERMISSAO_INSUFICIENTE`      | 403  | Role não pode gerar esse tipo   | Não devia chegar aqui se UI filtra |
| `PREFEITURA_OBRIGATORIA`      | 422  | DEV sem `filtros.prefeituraId`  | Mostrar seletor de prefeitura    |
| `NOMINAL_NAO_PERMITIDO`       | 422  | `incluirNomes=true` em tipo errado | Esconder checkbox nesse tipo  |
| `JUSTIFICATIVA_OBRIGATORIA`   | 422  | Nominal sem justificativa de 30+ chars | Exigir textarea preenchido |
| `RATE_LIMIT_EXCEDIDO`         | 429  | Excedeu limites (§11)           | Aguardar + contador regressivo   |
| `RELATORIO_NAO_DISPONIVEL`    | 409  | Download antes do worker terminar | Polling mais um pouco         |
| `RELATORIO_EXPIRADO`          | 410  | Passou do TTL de 7 dias         | Oferecer "Gerar novamente"       |
| `RELATORIO_NAO_ENCONTRADO`    | 404  | ID inexistente OU outra prefeitura | Voltar pra lista              |
| `ARQUIVO_NAO_ENCONTRADO`      | 404  | Job DISPONIVEL mas arquivo sumiu | Oferecer "Gerar novamente"      |
| `ERRO_INTERNO`                | 500  | Worker falhou — DPO investiga   | "Tente novamente em instantes"   |

### 8.2 Erro específico de `RATE_LIMIT_EXCEDIDO`

O backend não devolve "tente em X segundos". Interpretação sugerida:

```ts
case 'RATE_LIMIT_EXCEDIDO':
  // Bloqueia o botão por 1 minuto
  botaoDesabilitado = true;
  setTimeout(() => { botaoDesabilitado = false; }, 60_000);
  toast.erro('Muitos relatórios recentes. Aguarde 1 minuto e tente de novo.');
  break;
```

---

## 9. Modo nominal (BUSCA_ATIVA)

**O único tipo que expõe nomes de pacientes é `BUSCA_ATIVA`** — e mesmo assim **apenas em modo opt-in explícito**.

### 9.1 Pré-requisitos

1. Role: `COORDENADOR_UBS`, `ADMIN` ou `DESENVOLVEDOR`
2. `filtros.incluirNomes = true`
3. `filtros.justificativa`: string de **no mínimo 30 caracteres**

### 9.2 Request exemplo

```ts
await api.relatorios.create({
  tipo: 'BUSCA_ATIVA',
  dataInicial: '2025-01-01',  // ignorado — a query é "agora, sem atendimento há 90d"
  dataFinal: '2026-04-24',
  formato: 'XLSX',
  filtros: {
    incluirNomes: true,
    justificativa: 'Lista nominal solicitada para campanha de busca ativa de hipertensos no PSF 7.',
  },
});
```

### 9.3 UX

- Mostrar checkbox "Incluir nomes dos pacientes" **apenas se role tiver permissão**.
- Ao marcar, abre modal: campo textarea obrigatório "Justificativa (mínimo 30 caracteres)".
- Badge "USO RESTRITO · NOMINAL" no card do relatório gerado.
- No download, o arquivo já vem com:
  - Sufixo "(NOMINAL)" no título
  - Marca d'água "CONFIDENCIAL" diagonal (se PDF)
  - CPF mascarado (`123.***.***-45`), Cartão SUS mascarado (`****1234`), telefone mascarado

### 9.4 Conformidade LGPD

A justificativa é **gravada em `relatorio_audit`** por 5 anos. Se o DPO auditar depois, ela aparece como trilha da necessidade que motivou a exposição.

---

## 10. UX recomendada

### 10.1 Badges de status

```svelte
{#if r.status === 'PROCESSANDO'}
  <span class="bg-amber-100 text-amber-800">⏳ Gerando...</span>
{:else if r.status === 'DISPONIVEL'}
  <span class="bg-emerald-100 text-emerald-800">✓ Pronto para baixar</span>
{:else if r.status === 'FALHA'}
  <span class="bg-rose-100 text-rose-800">✗ Falha na geração</span>
{/if}
```

### 10.2 Validações client-side antes do POST

Evitam 400 desnecessário:

```ts
function validarPeriodo(ini: string, fim: string): string | null {
  const a = new Date(ini);
  const b = new Date(fim);
  const hoje = new Date(); hoje.setHours(23, 59, 59);
  if (a > b) return 'Data inicial deve ser anterior à final';
  if (b > hoje) return 'Data final não pode ser futura';
  const diffDias = (b.getTime() - a.getTime()) / 86_400_000;
  if (diffDias > 366) return 'Período máximo: 12 meses';
  return null;
}
```

### 10.3 Nomes de arquivo

O backend já manda o `Content-Disposition` com filename sugerido — **use esse valor**:

```
encaminhamentos-por-especialidade-76e33ca1.pdf
fila-regulacao-52f16867.xlsx
busca-ativa-a1b2c3d4.csv          ← (nominal usa o mesmo padrão)
```

O cliente TS já extrai e retorna em `{ blob, filename }`:

```ts
const { blob, filename } = await api.relatorios.download(id);
```

### 10.4 Polling com feedback visual

Em vez de bloquear a tela, deixe a tabela continuar navegável:
- Linha nova entra com badge "Gerando..."
- Botão "Baixar" fica **desabilitado**
- Refresh automático a cada 2s atualiza o badge
- Quando vira "Pronto", botão habilita + pode dar um toast discreto

---

## 11. Rate limit

Limites do backend:

| Limite                           | Valor |
|----------------------------------|-------|
| POSTs por usuário por hora       | 10    |
| POSTs por usuário por dia        | 30    |
| Gerações simultâneas por prefeitura | 3  |

### UX sugerida quando receber 429

```ts
if (e.code === 'RATE_LIMIT_EXCEDIDO') {
  // Desabilita o botão por 60s (simples e funcional)
  bloqueado = true;
  setTimeout(() => { bloqueado = false; }, 60_000);
  toast('Você atingiu o limite de relatórios. Aguarde 1 minuto.');
}
```

Você pode ficar esperto e contar locally quantos POSTs a pessoa fez, mostrando um contador "9/10 restantes nesta hora" antes de clicar — mas não é obrigatório.

---

## 12. Checklist de implementação

Ordem sugerida pra implementar a tela `/sms/relatorios`:

### Fase 1 — MVP
- [ ] Copiar `types.ts` + `api-client.ts` para `frontend/src/lib/api/`
- [ ] Importar `api.relatorios.list()`, `create()`, `download()`
- [ ] Listar os últimos 90 dias com badge de status
- [ ] Formulário simples: seletor de tipo + datas + formato
- [ ] Validação client-side de período (§10.2)
- [ ] Polling a cada 2s após criar
- [ ] Botão baixar que usa `{ blob, filename }`

### Fase 2 — Polimento
- [ ] Cards cosméticos explicando cada tipo
- [ ] Filtro por role (usuário só vê tipos que pode gerar)
- [ ] Tradução de todos os `ErrorCode` para mensagens pt-BR
- [ ] Feedback visual de rate limit (desabilita botão por 60s em 429)

### Fase 3 — Modo nominal (BUSCA_ATIVA)
- [ ] Checkbox "Incluir nomes" só visível pra role permitida
- [ ] Modal com textarea de justificativa (30+ caracteres)
- [ ] Badge visual "USO RESTRITO" no card do relatório nominal

### Fase 4 — Nice to have
- [ ] Helper `api.relatorios.createAndWait(req)` (já existe no cliente)
- [ ] Toast de sucesso quando download começa
- [ ] Link "Gerar novamente" em relatórios expirados (410)
- [ ] Contador regressivo amigável quando 429

---

## Apêndice · testando localmente

Conta do seed (ver [`README.md`](README.md)):

```
ADM-001 / 12345678      → ADMIN da Prefeitura Águas Belas
SMS-099101 / 12345678   → REGULADOR_SMS (Face 2)
```

Fluxo de teste end-to-end:

```bash
# 1. Login
TOK=$(curl -sS -X POST http://localhost:3333/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"ADM-001","senha":"12345678"}' | jq -r .token)

# 2. Criar
JOB=$(curl -sS -X POST http://localhost:3333/v1/relatorios \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"tipo":"ENCAMINHAMENTOS_POR_ESPECIALIDADE","dataInicial":"2026-04-01","dataFinal":"2026-04-30","formato":"CSV"}')
ID=$(echo "$JOB" | jq -r .id)

# 3. Pollear até DISPONIVEL
while true; do
  STATUS=$(curl -sS http://localhost:3333/v1/relatorios -H "Authorization: Bearer $TOK" \
    | jq -r ".[] | select(.id==\"$ID\") | .status")
  echo "$STATUS"
  [ "$STATUS" = "DISPONIVEL" ] && break
  sleep 2
done

# 4. Baixar
curl -sS "http://localhost:3333/v1/relatorios/$ID/download" \
  -H "Authorization: Bearer $TOK" -o /tmp/r.csv
head -15 /tmp/r.csv   # vai ter header LGPD + SHA-256
```

---

## Referências

| Documento | Para quê |
|---|---|
| [`RELATORIOS.md`](RELATORIOS.md) | Spec arquitetural (backend) |
| [`API.md`](API.md) | Referência canônica de todas as rotas |
| [`CHANGELOG.md`](CHANGELOG.md) | Delta versão-a-versão (v0.5.0 detalha mudanças deste módulo) |
| [`types.ts`](types.ts) | Interfaces TypeScript (fonte de verdade) |
| [`api-client.ts`](api-client.ts) | Cliente HTTP tipado |

**Dúvidas de contrato:** a única fonte de verdade é [`types.ts`](types.ts). Tudo o que não estiver lá, não existe no API.

*Última atualização: 2026-04-24. Versão backend: 0.5.0.*
