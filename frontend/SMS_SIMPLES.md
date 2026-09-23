# UNISISM · Face 2 · SMS — Variante Simplificada (REGULADOR_SMS)

Documento de alinhamento técnico do **modo simplificado da Face 2 (SMS)**,
destinado ao usuário **REGULADOR_SMS** que **não é** `ADMIN`/`DESENVOLVEDOR`.

**Backend de referência:** `v0.9.1` (2026-04-29). Companion: `SMS_SIMPLES_BACKEND.md`.
**Frontend:** `v0.1.0` (rotas `/sms/dashboard` simples · `/sms/solicitacoes` ·
`/sms/respostas` · `/sms/encaminhamentos/:id` · `AnexoActions.svelte`).

**Público:** equipe de backend.
**Objetivo:** documentar o que o frontend **efetivamente consome** —
contrato, headers, regras de erro e fluxos. Tudo já alinhado com a v0.9.1.

> Convenções globais herdadas do projeto:
>
> - Datas/horas em ISO 8601. Mês em `YYYY-MM`. Data isolada `YYYY-MM-DD`.
> - Erros: `{ "error": { "code": "...", "message": "...", "details": {...} } }`.
> - Multi-tenancy estrito: `prefeituraId` injetado pelo JWT; recursos de
>   outra prefeitura → 404 (jamais 403).
> - Toda mutação é auditada na trilha hash-chained existente.

---

## Índice

1. [Persona e contexto](#1-persona-e-contexto)
2. [RBAC — quem cai no modo simples](#2-rbac--quem-cai-no-modo-simples)
3. [Mapa de telas](#3-mapa-de-telas)
4. [Dashboard simplificado](#4-dashboard-simplificado)
5. [Explorador de Solicitações Recebidas](#5-explorador-de-solicitações-recebidas)
6. [Explorador de Respostas do SUS](#6-explorador-de-respostas-do-sus)
7. [Detalhe minimalista (3 abas)](#7-detalhe-minimalista-3-abas)
8. [Anexos · Visualizar · Baixar · Compartilhar](#8-anexos--visualizar--baixar--compartilhar)
9. [Endpoints consumidos](#9-endpoints-consumidos)
10. [Endpoints sugeridos (opcionais)](#10-endpoints-sugeridos-opcionais)
11. [Códigos de erro relevantes](#11-códigos-de-erro-relevantes)
12. [Checklist de backend](#12-checklist-de-backend)

---

## 1. Persona e contexto

O **atendente da Secretaria de Saúde** é o servidor que recebe os
encaminhamentos enviados pelas UBSs, consulta a documentação clínica,
encaminha para o SUS federal e — quando volta a resposta oficial — repassa
ao paciente.

Esse atendente:

- **Não regula** clinicamente (a aprovação técnica é feita por outro
  profissional / regulador médico via UI completa).
- **Não administra** a rede de UBSs nem usuários (isso é do `ADMIN`/`DEV`).
- **Não precisa** de KPIs analíticos, gráficos ou auditoria detalhada.
- **Precisa**, todo dia, de quatro respostas:
  1. Quantos encaminhamentos chegaram hoje?
  2. Quantos estão pendentes (aguardando análise)?
  3. Quantos foram enviados (aprovados, aguardando retorno do SUS)?
  4. Quantos foram respondidos (resposta oficial recebida)?

E precisa de **dois exploradores** (estilo "arquivos do Windows") para abrir
qualquer caso por UBS → ano → mês → dia, com o detalhe minimal: paciente,
clínico, anexos.

---

## 2. RBAC — quem cai no modo simples

A UI decide o "modo simples" exclusivamente pela role do JWT:

```ts
// frontend/src/lib/presentation/contexts/authContext.ts
rbac.ehReguladorSimples(role) === (role === 'REGULADOR_SMS');
```

| Role            | Vê modo  | Onde cai por padrão         |
| --------------- | :------: | --------------------------- |
| `REGULADOR_SMS` | Simples  | `/sms/dashboard` (simples)  |
| `ADMIN`         | Completo | `/sms/dashboard` (completo) |
| `DESENVOLVEDOR` | Completo | `/sms/dashboard` (completo) |

A diferença é **somente UI** — o backend continua aplicando o RBAC habitual:

- `REGULADOR_SMS` pode listar/ver encaminhamentos da prefeitura, baixar anexos
  liberados pelo scan e (em rotas avançadas) aprovar/negar/registrar pendência.
- O modo simplificado **omite** os botões de aprovar/negar/etc., mas o
  backend deve manter o suporte (a UI completa segue funcionando paralelamente
  para `ADMIN`/`DEV` no mesmo deploy).

---

## 3. Mapa de telas

```
/sms
├── /dashboard                              ← versão simples para REGULADOR_SMS
├── /solicitacoes                           ← explorador (UBS·Ano·Mês·Dia)
├── /respostas                              ← explorador (UBS·Ano·Mês·Dia)
└── /encaminhamentos/:id                    ← detalhe simplificado (3 abas)
```

A UI do `ADMIN`/`DEV` continua tendo `/sms/dashboard` (completo),
`/sms/ingestoes` (file-manager por slug), `/sms/encaminhamento/:id` (cinco
abas com aprovar/negar/etc.), `/sms/analytics`, `/sms/auditoria`,
`/sms/configuracoes` etc. — nada disso muda.

Sidebar (frontend `SidebarSMS.svelte`):

- Modo simples: 3 itens — `Dashboard`, `Solicitações`, `Respostas`.
- Modo completo: bloco `OPERAÇÃO` (Dashboard, Solicitações, Respostas,
  Ingestões, Rede, Pacientes, Auditoria) + `INTELIGÊNCIA` + `CONFIGURAÇÃO`.

---

## 4. Dashboard simplificado

`GET /sms/dashboard` (página) renderiza 4 cards clicáveis:

| Card              | Valor (v0.9.1)                                 | Clica vai para      |
| ----------------- | ---------------------------------------------- | ------------------- |
| **Chegaram Hoje** | `MetricasDashboard.encaminhamentosHoje`        | `/sms/solicitacoes` |
| **Pendentes**     | `MetricasDashboard.aguardandoRegulacao`        | `/sms/solicitacoes` |
| **Enviados**      | `MetricasDashboard.enviadosAguardandoResposta` | `/sms/solicitacoes` |
| **Respondidos**   | `MetricasDashboard.respondidosTotal`           | `/sms/respostas`    |

### Chamada efetiva

```http
GET /v1/dashboard/metrics
Authorization: Bearer <jwt>
```

Resposta esperada (campos novos em **v0.9.1**):

```json
{
	"encaminhamentosHoje": 12,
	"aguardandoRegulacao": 47,
	"pendenciasDocumento": 3,
	"aprovadosHoje": 8,
	"tempoMedioConsolidacaoSegundos": 342,
	"encaminhamentosSemana": 91,
	"enviadosAguardandoResposta": 28,
	"respondidosTotal": 156
}
```

> Antes da v0.9.1 o frontend baixava `?status=APROVADO&limit=1000` e
> bucketizava no cliente. Agora **uma única chamada** preenche os 4 cards.

---

## 5. Explorador de Solicitações Recebidas

`/sms/solicitacoes`

Visualização **estilo file-manager**: o atendente clica em uma UBS, depois
um ano, depois mês, depois dia, depois o caso.

### Estrutura via query string

```
/sms/solicitacoes                                              ← grid de UBSs
/sms/solicitacoes?ubsId=<uuid>&ubs=UBS+Centro                  ← grid de Anos
/sms/solicitacoes?ubsId=<uuid>&ubs=...&ano=2026                ← grid de Meses
/sms/solicitacoes?ubsId=<uuid>&ubs=...&ano=2026&mes=4          ← grid de Dias
/sms/solicitacoes?ubsId=<uuid>&ubs=...&ano=2026&mes=4&dia=29   ← lista do dia
```

> `ubs` (nome) é mantido apenas para o **breadcrumb**. A query oficial é
> `ubsId` (UUID) — alinhada com `ArvoreQuery` do backend.

### Filtro padrão

Inclui qualquer encaminhamento com `status != RASCUNHO`. Ou seja, o
atendente vê tudo que efetivamente chegou — `AGUARDANDO_REGULACAO`,
`PENDENCIA_DOCUMENTO`, `APROVADO` e `REJEITADO`.

### Chamadas efetivas (v0.9.1)

Cada nível chama o endpoint agregado, descendo apenas o necessário:

```http
# Nível 1 (UBSs)
GET /v1/encaminhamentos/arvore?excluirRascunho=true

# Nível 2 (anos da UBS)
GET /v1/encaminhamentos/arvore?ubsId=<id>&excluirRascunho=true

# Nível 3 (meses do ano)
GET /v1/encaminhamentos/arvore?ubsId=<id>&ano=2026&excluirRascunho=true

# Nível 4 (dias do mês)
GET /v1/encaminhamentos/arvore?ubsId=<id>&ano=2026&mes=4&excluirRascunho=true

# Nível 5 (encaminhamentos do dia)
GET /v1/encaminhamentos?desde=2026-04-29&ate=2026-04-29&limit=500
```

> A árvore tem cache em Redis no backend (chave inclui `excluirRascunho`),
> então a navegação é praticamente instantânea após o primeiro hit.

---

## 6. Explorador de Respostas do SUS

`/sms/respostas`

Mesma estrutura do explorador anterior, mas filtrando apenas casos com
`respostaSUS != null`. A intenção é o atendente abrir o PDF oficial e
encaminhar/imprimir/baixar para o paciente.

```
/sms/respostas?ubsId=<uuid>&ubs=...&ano=...&mes=...&dia=...
```

### Chamadas efetivas (v0.9.1)

Idêntico ao §5, com **um query param adicional** em todos os níveis:

```http
GET /v1/encaminhamentos/arvore?respostaSUS=true&excluirRascunho=true
GET /v1/encaminhamentos/arvore?ubsId=<id>&respostaSUS=true&excluirRascunho=true
# ... e assim por diante até o dia.

# No nível folha:
GET /v1/encaminhamentos?desde=...&ate=...&respostaSUS=true&limit=500
```

> Sem `respostaSUS=true` o explorador continua funcionando, mas mostra
> aprovados sem retorno + retornados misturados. A flag é o que dá foco
> ao "trabalho de notificar paciente" do atendente.

---

## 7. Detalhe minimalista (3 abas)

`/sms/encaminhamentos/:id`

Carrega o encaminhamento via:

```http
GET /v1/encaminhamentos/:id
```

Renderiza apenas:

1. **Paciente** — nome, CPF, dataNasc, sexo, telefone, cartão SUS,
   endereço (string única), bairro, município, UF, CEP. **Nenhum** dado clínico
   sensível adicional.
2. **Solicitação Clínica** — especialidade, prioridade, CID-10 (código +
   descrição), médico solicitante (nome + CRM), data da solicitação,
   justificativa clínica completa.
3. **Anexos** — tabela com `nome`, `tipo`, `tamanhoKb`, `scanStatus`,
   `uploadEm` + ações (§8).

> **Não tem** linha do tempo, observações da regulação, agendamento previsto
> editável, botões de aprovar/rejeitar/registrar pendência. Esses ficam só
> na rota completa `/sms/encaminhamento/:id` (REGULADOR_SMS+ADMIN/DEV).

### Diferença das URLs

- `/sms/encaminhamento/:id` (singular) — UI completa (5 abas + ações).
- `/sms/encaminhamentos/:id` (plural) — UI simples (3 abas, somente leitura).

Ambas chamam o mesmo `GET /v1/encaminhamentos/:id`. **Backend não precisa
de mudança** — apenas serve a entidade completa, e o frontend escolhe
qual subset exibir.

---

## 8. Anexos · Visualizar · Baixar · Compartilhar

Componente reutilizável: `frontend/src/lib/presentation/components/AnexoActions.svelte`.

Cada linha de anexo expõe **3 ações**, todas começando pelo mesmo download:

```http
GET /v1/anexos/:id/download
```

Espera-se resposta binária com:

- `Content-Type` apropriado (`application/pdf`, `image/png`, etc.).
- `Content-Disposition: attachment; filename="<original>.pdf"` ou
  `inline` — o frontend lê o filename via regex.
- **409 `ANEXO_NAO_LIBERADO`** quando `scanStatus` ainda é `PENDENTE`
  ou `INFECTADO`. UI desabilita os botões nesses estados.

### 8.1. Visualizar

Carrega o blob, cria `URL.createObjectURL(blob)` e renderiza `<iframe>`
**dentro de um modal**. O navegador usa o motor PDF nativo (Chrome PDF
Viewer, Firefox PDF.js, Safari Quick Look — qualquer um). Para imagens,
renderiza `<img>`.

Esse modo é "embarcado" — o usuário não sai da página atual.

### 8.2. Baixar

Carrega o blob e chama `window.open(objectUrl, '_blank')` — abre o
**visualizador padrão** do navegador em uma **nova aba**, com o cabeçalho
nativo (botões "Baixar", "Imprimir", "Zoom"). É exatamente a "aba do
Google" pedida.

Fallback (pop-up bloqueado): cria `<a download>` e dispara o salvamento
direto.

### 8.3. Compartilhar

1. Tenta `navigator.share({ files: [file] })` quando `navigator.canShare`
   aceita arquivos (Android/iOS/Edge moderno) → o sistema operacional abre
   a sheet de compartilhamento (WhatsApp/Email/Drive/etc.).
2. Senão, tenta `navigator.share({ title, text })` (texto puro).
3. Senão, copia para o clipboard a referência:
   `Encaminhamento {protocolo} · anexo: {nome}`.

**Importante:** o frontend **nunca expõe um link público** com token. O
compartilhamento é **do arquivo** (binário), não de uma URL — por LGPD.

### 8.4. Requisitos do backend para `/anexos/:id/download`

| Item                      | Comportamento esperado                                                           |
| ------------------------- | -------------------------------------------------------------------------------- |
| Auth                      | `Authorization: Bearer <jwt>` obrigatório.                                       |
| RBAC                      | Servir apenas se o anexo pertence à prefeitura do JWT.                           |
| Scan                      | Servir somente se `scanStatus = LIMPO`. Senão 409 com code `ANEXO_NAO_LIBERADO`. |
| Content-Type              | Real do arquivo. PDF → `application/pdf`. Não `octet-stream` indevido.           |
| Content-Disposition       | `inline; filename="..."` preferido — habilita visualização sem download forçado. |
| Cache-Control             | `private, max-age=0, must-revalidate`. Não cachear em proxies.                   |
| Tamanho máximo            | 10 MB por anexo (definido pelo PDF do encaminhamento).                           |
| Pre-signed URL (opcional) | Aceita; backend pode redirecionar 302 para S3 com TTL ≤ 60s.                     |

---

## 9. Endpoints consumidos (v0.9.1)

| Tela                                   | Método | Rota                                                                   |
| -------------------------------------- | :----: | ---------------------------------------------------------------------- |
| Dashboard simples                      |  GET   | `/v1/dashboard/metrics`                                                |
| Solicitações Recebidas — níveis 1–4    |  GET   | `/v1/encaminhamentos/arvore?excluirRascunho=true&[ubsId&ano&mes]`      |
| Solicitações Recebidas — nível 5       |  GET   | `/v1/encaminhamentos?desde=&ate=&limit=500`                            |
| Respostas do SUS — níveis 1–4          |  GET   | `/v1/encaminhamentos/arvore?respostaSUS=true&excluirRascunho=true&[…]` |
| Respostas do SUS — nível 5             |  GET   | `/v1/encaminhamentos?desde=&ate=&respostaSUS=true&limit=500`           |
| Detalhe simplificado                   |  GET   | `/v1/encaminhamentos/:id`                                              |
| Download/Visualizar/Compartilhar anexo |  GET   | `/v1/anexos/:id/download`                                              |

### `MetricasDashboard` (referência de tipo · v0.9.1)

```ts
interface MetricasDashboard {
	encaminhamentosHoje: number;
	aguardandoRegulacao: number;
	pendenciasDocumento: number;
	aprovadosHoje: number;
	tempoMedioConsolidacaoSegundos: number;
	encaminhamentosSemana: number;
	// ▼ adicionados na v0.9.1
	enviadosAguardandoResposta: number; // APROVADO sem respostaSUS
	respondidosTotal: number; // APROVADO com respostaSUS
}
```

### `ArvoreQuery` (referência de tipo · v0.9.1)

```ts
interface ArvoreQuery {
	ubsId?: string; // desce um nível
	ano?: number; // exige ubsId
	mes?: number; // exige ubsId + ano
	respostaSUS?: boolean; // v0.9.1 — filtra pelo flag
	excluirRascunho?: boolean; // v0.9.1 — exclui RASCUNHO
}
```

### `ListEncaminhamentosQuery` (extensão · v0.9.1)

```ts
interface ListEncaminhamentosQuery {
	status?: StatusEncaminhamento;
	pacienteId?: string;
	desde?: string;
	ate?: string;
	limit?: number;
	respostaSUS?: boolean; // v0.9.1
}
```

---

## 10. Histórico de alinhamento

Tudo que estava listado como **opcional** na primeira versão deste doc
foi entregue pelo backend na **v0.9.1** e já é consumido pelo frontend.

| Item                                                                             |  Status   |
| -------------------------------------------------------------------------------- | :-------: |
| Campos `enviadosAguardandoResposta` e `respondidosTotal` em `/dashboard/metrics` | ✅ v0.9.1 |
| Filtros `respostaSUS` e `excluirRascunho` em `/encaminhamentos/arvore`           | ✅ v0.9.1 |
| Filtro `respostaSUS` em `/encaminhamentos`                                       | ✅ v0.9.1 |
| Endpoint top-level `GET /v1/anexos/:id/download`                                 | ✅ v0.9.1 |

Resultado: o dashboard caiu de 2 chamadas para 1; os exploradores deixaram
de baixar 1000 encaminhamentos por carregamento; o detalhe simplificado
usa o mesmo endpoint do completo (zero custo extra).

---

## 11. Códigos de erro relevantes

Todos já traduzidos em `frontend/src/lib/api/erros-sms.ts`
(função `mensagemErroSms()`):

| Code                            | HTTP | Quando                                                      |
| ------------------------------- | :--: | ----------------------------------------------------------- |
| `TOKEN_AUSENTE`                 | 401  | Sem header `Authorization`.                                 |
| `TOKEN_EXPIRADO`                | 401  | JWT fora da validade.                                       |
| `NAO_AUTENTICADO`               | 401  | Token inválido / assinatura quebrada.                       |
| `PERMISSAO_INSUFICIENTE`        | 403  | Role autenticada não pode chamar este endpoint.             |
| `ENCAMINHAMENTO_NAO_ENCONTRADO` | 404  | ID inválido ou outra prefeitura.                            |
| `ANEXO_NAO_ENCONTRADO`          | 404  | Idem para anexos.                                           |
| `UBS_NAO_ENCONTRADA`            | 404  | `ubsId` inválido na árvore.                                 |
| `PARAMS_INCOMPATIVEIS`          | 400  | Query da árvore com combinação inválida (mês sem ano etc.). |
| `PAYLOAD_INVALIDO`              | 400  | Schema rejeita query/body.                                  |
| `ANEXO_NAO_LIBERADO`            | 409  | Scan ≠ `LIMPO`. `details.scanStatus`.                       |
| `ERRO_INTERNO`                  | 500  | Genérico.                                                   |

Formato canônico:

```json
{ "error": { "code": "...", "message": "...", "details": {} } }
```

---

## 12. Checklist de backend (v0.9.1)

Tudo abaixo já está implementado no backend e exercitado pelo frontend:

- [x] `GET /v1/dashboard/metrics` devolve, no escopo da prefeitura do JWT,
      todos os campos do tipo `MetricasDashboard` v0.9.1, incluindo
      `enviadosAguardandoResposta` e `respondidosTotal`.
- [x] `GET /v1/encaminhamentos/:id` devolve `respostaSUS` quando preenchida
      (`anexoId`, `observacao`, `registradoEm`, `registradoPor`).
- [x] `GET /v1/encaminhamentos` aceita `?respostaSUS=true|false`,
      `?desde=`, `?ate=`, `?limit=`.
- [x] `GET /v1/encaminhamentos/arvore` aceita `?ubsId`, `?ano`, `?mes`,
      `?respostaSUS`, `?excluirRascunho`. Cache Redis com chave por variante.
- [x] `GET /v1/anexos/:id/download`:
  - [x] Bloqueia anexos de outra prefeitura com 404.
  - [x] Bloqueia anexos não `LIMPO` com 409 `ANEXO_NAO_LIBERADO`
        (com `details.scanStatus`).
  - [x] Devolve `Content-Type` correto e
        `Content-Disposition: inline; filename="..."`.
  - [x] `Cache-Control: private, max-age=0, must-revalidate` e
        `X-Content-Type-Options: nosniff`.
- [x] `REGULADOR_SMS` pode chamar todos os 4 endpoints acima da sua
      prefeitura (RBAC permissivo de leitura).

> A UI **simples** apenas omite os botões de aprovar/rejeitar/etc., mas
> esses endpoints continuam disponíveis para o REGULADOR_SMS quando ele
> entra na rota completa (`/sms/encaminhamento/:id`).

---

## 13. Pontos de atenção do frontend

Para a equipe de backend não se surpreender com o tráfego:

1. **Ordem das chamadas dos exploradores** — cada vez que o usuário sobe
   um nível (clicar no breadcrumb) o frontend dispara nova GET; o
   `?excluirRascunho=true` (ou `?respostaSUS=true`) viaja em todos.
2. **Idempotência** — não há mutação aqui; nenhum `X-Idempotency-Key`
   é necessário nestes 4 endpoints.
3. **Tradução de erros** — o frontend usa `mensagemErroSms(e)` para
   converter `code` → texto pt-BR; codes desconhecidos caem para
   `e.message` do backend.
4. **Compartilhamento de anexos** — o frontend nunca expõe a URL com
   token; usa Web Share API com o `File` em memória ou cai pra clipboard
   (LGPD).
5. **Visualizar PDF** — o frontend cria `URL.createObjectURL(blob)` em
   memória e renderiza dentro de `<iframe>`. O backend deve servir com
   `inline` para isso funcionar.

---

**Versão:** 2026-04-29 — alinhado com o frontend `v0.1.0` ↔ backend `v0.9.1`
(rotas `/sms/dashboard` simples · `/sms/solicitacoes` · `/sms/respostas` ·
`/sms/encaminhamentos/:id` · componente `AnexoActions.svelte` ·
catálogo `erros-sms.ts`).
