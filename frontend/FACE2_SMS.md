# UNISISM · Face 2 · SMS (Secretaria / Regulação / Moderação)

Documento de alinhamento técnico do módulo **Face 2 — Regulação da Secretaria Municipal de Saúde**.
Gerado a partir do código já consumido no frontend SvelteKit (`src/routes/sms/*` e componentes em `src/lib/presentation/components/*`).

**Público**: equipe de backend.
**Objetivo**: entregar os endpoints e regras necessários pra tornar o módulo operacional em produção, respeitando a arquitetura existente.

---

## Índice

1. [Visão geral e propósito](#1-visão-geral-e-propósito)
2. [Persona e escopo](#2-persona-e-escopo)
3. [RBAC — roles e permissões](#3-rbac--roles-e-permissões)
4. [Estrutura de rotas (frontend)](#4-estrutura-de-rotas)
5. [Componentes novos da Face 2](#5-componentes-novos-da-face-2)
6. [Endpoints consumidos](#6-endpoints-consumidos)
7. [Máquina de estados · perspectiva da Regulação](#7-máquina-de-estados--perspectiva-da-regulação)
8. [Tela por tela — o que cada rota consome e mostra](#8-tela-por-tela)
9. [Regras de negócio específicas](#9-regras-de-negócio-específicas)
10. [Códigos de erro da Face 2](#10-códigos-de-erro-da-face-2)
11. [Checklist mínimo do backend](#11-checklist-mínimo-do-backend)
12. [Referências rápidas](#12-referências-rápidas)

---

## 1. Visão geral e propósito

**Face 1 (UBS)** é o canal de **ingestão**: o atendente da Unidade Básica de Saúde recebe a solicitação médica em PDF, faz OCR/extração, consolida e envia à Regulação.

**Face 2 (SMS)** é o canal de **moderação/regulação**: o regulador da Secretaria Municipal de Saúde recebe a fila de encaminhamentos e **decide** cada caso.

O que a Face 2 faz:

- **Consulta** a fila de encaminhamentos em `AGUARDANDO_REGULACAO` na sua prefeitura
- **Aprova** um encaminhamento (opcionalmente com data prevista de agendamento)
- **Solicita correção** à UBS (gera pendência documental — a UBS pode readequar e reenviar)
- **Rejeita** definitivamente um encaminhamento (terminal)
- **Acompanha** a produção (aprovados/rejeitados/pendências) da prefeitura
- Futuro: relatórios de regulação, PEC da rede.

Todo encaminhamento segue o mesmo fluxo de estado documentado em [BACKEND_API.md §10.1](BACKEND_API.md). A Face 2 atua **apenas** sobre os encaminhamentos em `AGUARDANDO_REGULACAO`.

---

## 2. Persona e escopo

### 2.1. Persona primária: Regulador SMS

| Atributo         | Descrição                                                                        |
| ---------------- | -------------------------------------------------------------------------------- |
| Cargo típico     | Enfermeira/médico regulador, auditor clínico da SMS                              |
| Jornada          | ≥ 8h diárias em terminal; opera com muitos encaminhamentos ao dia                |
| Input principal  | Encaminhamentos consolidados pela UBS (lê/decide)                                |
| Output principal | Aprovações, pendências, rejeições — cada uma gerando notificação à UBS de origem |
| KPI pessoal      | SLA de decisão (horas de fila) · Taxa de aprovação · Volume decidido             |

### 2.2. Escopo de acesso: Prefeitura

Toda sessão de REGULADOR_SMS tem claim `prefeituraId` no JWT. O backend **deve** filtrar todas as listagens por essa prefeitura. Regulador da Prefeitura A **não vê** nada da Prefeitura B (isolation garantido pelo backend, ver [BACKEND_API.md §2](BACKEND_API.md)).

### 2.3. Roles secundárias com acesso à Face 2

| Role                                | Escopo efetivo na Face 2                             |
| ----------------------------------- | ---------------------------------------------------- |
| `REGULADOR_SMS`                     | sua prefeitura · pode aprovar/rejeitar/pendenciar    |
| `ADMIN`                             | sua prefeitura · apenas leitura (fila, estatísticas) |
| `DESENVOLVEDOR`                     | todas as prefeituras · todas as ações (técnico)      |
| `ATENDENTE_UBS` / `COORDENADOR_UBS` | **sem acesso** à Face 2 (stack da Face 1)            |

---

## 3. RBAC — roles e permissões

### 3.1. Matriz de ação

| Ação                    | Endpoint                                           | `REGULADOR_SMS` | `ADMIN` | `DESENVOLVEDOR` | demais |
| ----------------------- | -------------------------------------------------- | --------------- | ------- | --------------- | ------ |
| Ver fila de análise     | `GET /encaminhamentos?status=AGUARDANDO_REGULACAO` | ✅              | ✅      | ✅              | 403    |
| Ver detalhe             | `GET /encaminhamentos/:id`                         | ✅              | ✅      | ✅              | 403    |
| **Aprovar**             | `POST /encaminhamentos/:id/aprovar`                | ✅              | ❌      | ✅              | 403    |
| **Registrar pendência** | `POST /encaminhamentos/:id/registrar-pendencia`    | ✅              | ❌      | ✅              | 403    |
| **Rejeitar**            | `POST /encaminhamentos/:id/rejeitar`               | ✅              | ❌      | ✅              | 403    |

`ADMIN` é um papel administrativo (criar UBSs/usuários) — **não** assume decisão clínica de regulação.

### 3.2. Helpers no frontend

Implementados em [src/lib/presentation/contexts/authContext.ts](src/lib/presentation/contexts/authContext.ts):

```ts
rbac.podeAprovarEncaminhamento(role); // REGULADOR_SMS | DESENVOLVEDOR
rbac.podeRegistrarPendencia(role); // REGULADOR_SMS | DESENVOLVEDOR
rbac.podeRejeitarEncaminhamento(role); // REGULADOR_SMS | DESENVOLVEDOR
rbac.podeVerFilaRegulacao(role); // REGULADOR_SMS | ADMIN | DESENVOLVEDOR
```

O frontend usa esses helpers pra esconder botões (defesa em profundidade). O **backend é a fonte de verdade** — precisa validar independentemente.

### 3.3. Isolation por prefeitura (critical)

- Listagem: `GET /encaminhamentos` → filtrar automaticamente pelo `prefeituraId` do JWT
- Detalhe: `GET /encaminhamentos/:id` → se o encaminhamento não for da prefeitura do requisitante, retornar **`404 ENCAMINHAMENTO_NAO_ENCONTRADO`** (não 403, pra não vazar existência)
- Mutações (aprovar/rejeitar/pendenciar): mesma regra → 404 se fora do escopo

---

## 4. Estrutura de rotas

```
src/routes/sms/
├── +layout.svelte                          ← shell + auth guard + contexto de auth
├── dashboard/
│   ├── +layout.svelte                      ← SubNav com 4 abas
│   ├── +page.svelte                         → Visão Geral (fila de análise)
│   ├── pendentes/+page.svelte              → encaminhamentos em PENDENCIA_DOCUMENTO
│   ├── aprovados/+page.svelte              → encaminhamentos APROVADOS
│   └── rejeitados/+page.svelte             → encaminhamentos REJEITADOS
└── encaminhamento/[id]/
    ├── +layout.svelte                      ← action bar + SubNav + contexto de dados
    ├── +page.svelte                         → Resumo (decisão)
    ├── paciente/+page.svelte               → dados do paciente
    ├── clinico/+page.svelte                → solicitação clínica + justificativa
    ├── anexos/+page.svelte                 → tabela de anexos
    └── historico/+page.svelte              → linha do tempo + auditoria
```

**Placeholders (futuras implementações na Face 2)**: `/sms/pacientes` (PEC da rede), `/sms/relatorios`, `/sms/perfil`. Links existem mas as rotas ainda não foram construídas.

---

## 5. Componentes novos da Face 2

### 5.1. Componentes exclusivos

| Arquivo                                                                                        | Papel                                                            |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [SidebarSMS.svelte](src/lib/presentation/components/SidebarSMS.svelte)                         | Sidebar específica da Face 2 (label "SMS / FACE 2", nav própria) |
| [AprovarEncaminhamento.svelte](src/lib/presentation/components/AprovarEncaminhamento.svelte)   | Modal da ação Aprovar                                            |
| [SolicitarCorrecao.svelte](src/lib/presentation/components/SolicitarCorrecao.svelte)           | Modal da ação Solicitar Correção (gerar pendência)               |
| [RejeitarEncaminhamento.svelte](src/lib/presentation/components/RejeitarEncaminhamento.svelte) | Modal da ação Rejeitar (com confirmação obrigatória)             |

### 5.2. Componentes reutilizados da Face 1 (sem duplicação)

- `PanelHeader`, `MetricCard`, `StatusBadge`, `PrimaryButton`, `SubNav`, `Modal`, `TimelineStep` — inalterados
- `HistoricoTable` — ganhou prop **`detalheBasePath?: string`** (default `/ubs/encaminhamento`). A Face 2 passa `"/sms/encaminhamento"`. Zero duplicação de lógica de listagem.

### 5.3. Contextos reutilizados

| Contexto                | Quem popula                               | Quem consome                                      |
| ----------------------- | ----------------------------------------- | ------------------------------------------------- |
| `authContext`           | `/sms/+layout.svelte`                     | `SidebarSMS`, todas as páginas SMS que fazem RBAC |
| `encaminhamentoContext` | `/sms/encaminhamento/[id]/+layout.svelte` | as 5 sub-páginas do detalhe                       |

---

## 6. Endpoints consumidos

### 6.1. Já existentes (reutilizados da Face 1)

Documentação em [BACKEND_API.md](BACKEND_API.md).

| Endpoint                          | Consumido em                              | Nota sobre a Face 2                                           |
| --------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| `POST /auth/login`                | `/login`                                  | compartilhado · role do JWT indica Face destino               |
| `GET /auth/me`                    | `/sms/+layout.svelte` (guard)             | usado pra hidratar `me` no context                            |
| `POST /auth/logout`               | `/sms/+layout.svelte` (logout)            | —                                                             |
| `GET /dashboard/metrics`          | `/sms/dashboard/+page.svelte`             | **escopo PREFEITURA** — mesmo shape, backend agrega diferente |
| `GET /encaminhamentos?status=...` | todas as 4 sub-tabs do dashboard          | filtro por status                                             |
| `GET /encaminhamentos/:id`        | `/sms/encaminhamento/[id]/+layout.svelte` | retorna full com timeline + anexos                            |

### 6.2. Novos endpoints · **3 obrigatórios**

#### 6.2.1. `POST /encaminhamentos/:id/aprovar`

**Documentação completa**: [BACKEND_API.md §5.6](BACKEND_API.md).

Resumo:

```http
POST /v1/encaminhamentos/{id}/aprovar
Authorization: Bearer <JWT REGULADOR_SMS>
Content-Type: application/json

{
  "nota": "Paciente inserido na fila da Cardiologia · Hospital Ana Nery.",
  "agendamentoPrevisto": "2026-05-14"
}
```

- `nota` (string, opcional): vira evento `OBSERVACAO` na timeline, com `autor = regulador autenticado`.
- `agendamentoPrevisto` (string `YYYY-MM-DD`, opcional): data prevista do atendimento especializado.

**Response 200**: retorna o `Encaminhamento` completo atualizado.

**Transições** (aplicar nesta ordem atômica):

1. Validar `status === AGUARDANDO_REGULACAO` → senão `409 ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO`
2. Se `nota` presente: criar evento `OBSERVACAO`
3. Criar evento `APROVADO` (autor = regulador, papel = "Regulação · SMS")
4. Se `agendamentoPrevisto` presente: criar evento `AGENDADO` + preencher campo `agendamentoPrevisto`
5. Status → `APROVADO`
6. `atualizadoEm` = agora
7. Enfileirar notificação pra UBS de origem (webhook/fila)

#### 6.2.2. `POST /encaminhamentos/:id/registrar-pendencia`

**Documentação completa**: [BACKEND_API.md §5.7](BACKEND_API.md).

```http
POST /v1/encaminhamentos/{id}/registrar-pendencia
Authorization: Bearer <JWT REGULADOR_SMS>
Content-Type: application/json

{
  "observacao": "Anexar laudo médico com data inferior a 90 dias. O laudo atual está desatualizado (datado de 12/2024). Reenviar após correção."
}
```

- `observacao` (string, **obrigatório**, ≥ 10 caracteres recomendado): texto visível ao atendente na UBS.

**Response 200**: `Encaminhamento` atualizado.

**Transições**:

1. Validar `status === AGUARDANDO_REGULACAO` → senão `409 ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO`
2. Validar `observacao.trim().length > 0` → senão `422 OBSERVACAO_OBRIGATORIA`
3. Preencher `observacoesRegulacao = observacao`
4. Criar evento `PENDENCIA_REGISTRADA` (autor = regulador, descricao = observacao)
5. Status → `PENDENCIA_DOCUMENTO`
6. `atualizadoEm` = agora
7. Enfileirar notificação pra UBS de origem

Após essa transição, a UBS tem a opção de chamar o `resolve-pendencia` (já existe) pra reenviar, voltando pro ciclo.

#### 6.2.3. `POST /encaminhamentos/:id/rejeitar`

**Documentação completa**: [BACKEND_API.md §5.8](BACKEND_API.md).

```http
POST /v1/encaminhamentos/{id}/rejeitar
Authorization: Bearer <JWT REGULADOR_SMS>
Content-Type: application/json

{
  "motivo": "Paciente não atende aos critérios de protocolo para a especialidade. Indicar tratamento conservador na atenção básica."
}
```

- `motivo` (string, **obrigatório**, ≥ 10 caracteres recomendado): justificativa da rejeição.

**Response 200**: `Encaminhamento` atualizado.

**Transições**:

1. Validar `status === AGUARDANDO_REGULACAO` → senão `409 ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO`
2. Validar `motivo.trim().length > 0` → senão `422 MOTIVO_OBRIGATORIO`
3. Criar evento `REJEITADO` (autor = regulador, descricao = motivo)
4. Status → `REJEITADO`
5. Limpar `observacoesRegulacao`
6. `atualizadoEm` = agora
7. Enfileirar notificação pra UBS de origem

**`REJEITADO` é terminal** — a UBS **não** pode reenviar o mesmo protocolo. Se precisar, a UBS cria um novo encaminhamento do zero.

---

## 7. Máquina de estados · perspectiva da Regulação

Diagrama completo em [BACKEND_API.md §10.1](BACKEND_API.md). Do ponto de vista da Face 2:

```
Entrada:  AGUARDANDO_REGULACAO  (enviado pela UBS)
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
   APROVADO   PENDENCIA    REJEITADO
  (terminal)  (volta à     (terminal)
              UBS)
                  │
                  │ resolve-pendencia (UBS)
                  ▼
       AGUARDANDO_REGULACAO  ← volta pro topo
```

**Transições que a Face 2 dispara**: **apenas 3** (as linhas ↓ do topo).
**Gate obrigatório**: todas as 3 exigem `status === AGUARDANDO_REGULACAO`.

---

## 8. Tela por tela

### 8.1. `/sms/dashboard` · Visão Geral

**Arquivo**: [+page.svelte](src/routes/sms/dashboard/+page.svelte)

**Consome**:

- `GET /dashboard/metrics` — já existe, escopo PREFEITURA
- `GET /encaminhamentos?status=AGUARDANDO_REGULACAO&limit=100` — fila de análise

**Renderiza**:

- 4 MetricCards: Fila de Análise · Pendências Ativas · Aprovados Hoje · Taxa de Aprovação (derivada no client)
- `HistoricoTable` da fila com cliques levando pro detalhe SMS

**Nota pro backend**: `MetricasDashboard` não tem ainda `rejeitadosHoje` nem `tempoMedioAnaliseSegundos` — taxas são derivadas no frontend. Se quiserem expor números dedicados no futuro, basta adicionar campos ao shape existente.

### 8.2. `/sms/dashboard/pendentes`

**Arquivo**: [pendentes/+page.svelte](src/routes/sms/dashboard/pendentes/+page.svelte)

**Consome**: `GET /encaminhamentos?status=PENDENCIA_DOCUMENTO&limit=500`

**Renderiza**:

- 4 MetricCards: Total · SLA Estourado (>48h) · Prioridade Urgente · Taxa de Readequação (placeholder)
- Tabela

**Regra**: esses casos **estão fora do controle da Regulação** — aguardam a UBS responder. Serve pra auditoria e pressionar UBSs em atraso.

### 8.3. `/sms/dashboard/aprovados`

**Arquivo**: [aprovados/+page.svelte](src/routes/sms/dashboard/aprovados/+page.svelte)

**Consome**: `GET /encaminhamentos?status=APROVADO&limit=500`

**Renderiza**: Total · Aprovados Hoje · Última Semana · Com Agendamento · tabela.

**Filtro por período no futuro**: o frontend vai precisar enviar `desde` e `ate`. Os campos já estão no [`ListEncaminhamentosQuery`](src/lib/api/types.ts) — sem mudança de contrato.

### 8.4. `/sms/dashboard/rejeitados`

**Arquivo**: [rejeitados/+page.svelte](src/routes/sms/dashboard/rejeitados/+page.svelte)

**Consome**: `GET /encaminhamentos?status=REJEITADO&limit=500`

**Renderiza**: Total · Rejeitados Hoje · Última Semana · Especialidade Top (derivada) · tabela.

### 8.5. `/sms/encaminhamento/[id]` · Resumo

**Arquivo**: [+layout.svelte](src/routes/sms/encaminhamento/[id]/+layout.svelte) + [+page.svelte](src/routes/sms/encaminhamento/[id]/+page.svelte)

**Consome**: `GET /encaminhamentos/:id`

**Ações** (action bar):

- Sempre visíveis: Voltar · Imprimir · Baixar PDF
- Só se `status === AGUARDANDO_REGULACAO` e RBAC: Aprovar · Solicitar Correção · Rejeitar

**Sub-tabs** (5):

| Slug          | Foco                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------- |
| `''` (Resumo) | Situação, tempo em fila, últimos 3 eventos, cards compactos do paciente e da solicitação |
| `/paciente`   | Dados do paciente + link pro PEC (futuro)                                                |
| `/clinico`    | Solicitação médica completa + justificativa clínica em blockquote destacada              |
| `/anexos`     | Tabela de anexos com visualizar/baixar + métrica de integridade (solicitação presente?)  |
| `/historico`  | Timeline completa + auditoria + legenda de tipos de evento                               |

**Observações de UX**:

- Após cada ação (Aprovar/Pendência/Rejeitar), o modal chama o endpoint, recebe o `Encaminhamento` atualizado e o context se atualiza automaticamente — **sem refetch** (economia de round-trip).
- Se o backend quiser ser mais conservador e sempre fazer o frontend buscar de novo, tudo bem também — o context tem método `atualizar(enc)` que aceita qualquer shape válido.

---

## 9. Regras de negócio específicas

### 9.1. Isolation por prefeitura (RBAC crítico)

Qualquer `REGULADOR_SMS` **só enxerga** encaminhamentos da sua prefeitura. O backend **deve** aplicar esse filtro em:

- `GET /encaminhamentos` (listagem)
- `GET /encaminhamentos/:id` (retornar `404` se fora de escopo)
- `POST /encaminhamentos/:id/aprovar|registrar-pendencia|rejeitar` (retornar `404` se fora de escopo)
- `GET /dashboard/metrics` (agregar apenas dentro da prefeitura)

### 9.2. Apenas 1 decisão por encaminhamento

- `AGUARDANDO_REGULACAO` é o **único** estado em que as 3 ações da Regulação funcionam.
- Uma vez em `APROVADO` ou `REJEITADO`, qualquer tentativa de re-acionar → `409 ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO`.
- `PENDENCIA_DOCUMENTO` aceita só `resolve-pendencia` (Face 1) — não aceita ações da Regulação diretamente.

### 9.3. Autor dos eventos timeline

Em eventos gerados pela Face 2:

- `autor`: nome completo do regulador autenticado (ex.: `"DRA. HELENA COSTA"`)
- `autorPapel`: `"Regulação · SMS"` (ou personalizado, ex.: `"Regulação SMS · Águas Belas/PE"`)

Em eventos automáticos (envio de notificação, integração):

- `autor`: `"SISTEMA"`
- `autorPapel`: `"UNISISM · Integração"`

### 9.4. Notificação pra UBS

Toda ação da Regulação (aprovar/pendenciar/rejeitar) **deve** disparar uma notificação pra UBS de origem. Sugestão:

- Webhook ou fila interna da UBS-bus
- Notificação visível no dashboard UBS (badge em `/ubs/historico/pendencias` etc.)

Hoje o frontend UBS **não** faz polling — a notificação só aparece quando a UBS atualiza o dashboard. Para notificação em tempo real, considerar SSE no futuro.

### 9.5. Audit log

Toda transição de status (Face 1 e Face 2) deve ir pra **audit log** persistente, com:

```ts
{
  ts: '2026-04-22T14:32:18Z',
  atendenteId: 'uuid',
  atendenteMatricula: 'SMS-099101',
  action: 'APROVAR_ENCAMINHAMENTO' | 'REGISTRAR_PENDENCIA' | 'REJEITAR_ENCAMINHAMENTO',
  encaminhamentoId: 'uuid',
  protocolo: 'UBS-2026-100137',
  statusAntes: 'AGUARDANDO_REGULACAO',
  statusDepois: 'APROVADO',
  payload: { ... },           // nota, agendamentoPrevisto, motivo, observacao
  ip: '177.18.44.12',
  userAgent: '...',
  requestId: 'req-...'
}
```

### 9.6. Rate limit recomendado

Mesmos limites globais da Face 1 ([BACKEND_API.md §12](BACKEND_API.md)). Adicional:

- `POST /encaminhamentos/:id/{aprovar|registrar-pendencia|rejeitar}` — **30/min/usuário**. Proteção contra clique duplo + scripts mal-intencionados.

---

## 10. Códigos de erro da Face 2

Novos códigos adicionados ao enum `ErrorCode` em [src/lib/api/types.ts](src/lib/api/types.ts). Frontend mapeia cada um para mensagem pt-BR específica — mantenham os códigos **estáveis**.

| `code`                                    | HTTP | Quando ocorrer                                                                                             |
| ----------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| `ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO` | 409  | Qualquer tentativa de aprovar/rejeitar/pendenciar um encaminhamento que não está em `AGUARDANDO_REGULACAO` |
| `OBSERVACAO_OBRIGATORIA`                  | 422  | `registrar-pendencia` com `observacao` vazia ou ausente                                                    |
| `MOTIVO_OBRIGATORIO`                      | 422  | `rejeitar` com `motivo` vazio ou ausente                                                                   |
| `PERMISSAO_INSUFICIENTE`                  | 403  | Role sem permissão (já existente, reutilizado)                                                             |
| `ENCAMINHAMENTO_NAO_ENCONTRADO`           | 404  | Inclui o caso "fora da prefeitura do regulador" (já existente, reutilizado)                                |

Shape do body de erro (igual ao resto da API):

```json
{
	"error": {
		"code": "ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO",
		"message": "Encaminhamento não está aguardando regulação.",
		"details": {
			"statusAtual": "APROVADO"
		}
	}
}
```

O frontend **ignora `message`** (substitui por texto curado em pt-BR) e trata pelo `code`. Mantenham os códigos invariantes.

---

## 11. Checklist mínimo do backend

Extensão do checklist geral em [BACKEND_API.md §14](BACKEND_API.md). Para liberar a Face 2 em produção:

### 11.1. Endpoints

- [ ] `POST /encaminhamentos/:id/aprovar`
- [ ] `POST /encaminhamentos/:id/registrar-pendencia`
- [ ] `POST /encaminhamentos/:id/rejeitar`

### 11.2. Máquina de estados

- [ ] Gate: todas as 3 ações exigem status atual `AGUARDANDO_REGULACAO`
- [ ] Transições atômicas (transação DB única por request)
- [ ] Rollback completo em falha (nenhum evento timeline criado se a transação falhar)

### 11.3. Timeline

- [ ] Eventos criados na ordem especificada em cada endpoint (§6.2)
- [ ] `autor` e `autorPapel` preenchidos corretamente por fonte (regulador real vs. "SISTEMA")

### 11.4. RBAC

- [ ] JWT com claim `role = REGULADOR_SMS` autoriza as 3 ações
- [ ] JWT com claim `role = DESENVOLVEDOR` também autoriza (global)
- [ ] Demais roles → `403 PERMISSAO_INSUFICIENTE`
- [ ] Isolation por `prefeituraId` em **todas** as queries (incluindo single-get)

### 11.5. Validação

- [ ] `observacao` e `motivo` com `trim()` antes de salvar; vazio → 422
- [ ] `agendamentoPrevisto` se presente: validar formato `YYYY-MM-DD` e data futura

### 11.6. Integrações

- [ ] Webhook/fila pra UBS a cada ação (nome sugerido: `encaminhamento.regulado`)
- [ ] Audit log persistente (§9.5)

### 11.7. Dashboard

- [ ] `GET /dashboard/metrics` com escopo PREFEITURA quando `role === REGULADOR_SMS`
- [ ] Agregados incluem apenas encaminhamentos da prefeitura do requisitante

### 11.8. Testes essenciais

- [ ] Happy path de cada uma das 3 ações (payload válido, status correto, timeline correta)
- [ ] Tentativa em status errado → 409
- [ ] Tentativa sem payload obrigatório → 422
- [ ] Tentativa em encaminhamento de outra prefeitura → 404
- [ ] Tentativa sem role autorizada → 403
- [ ] Audit log gravado em todas as ações bem-sucedidas
- [ ] Notificação disparada em todas as ações bem-sucedidas

---

## 12. Referências rápidas

### 12.1. Arquivos-fonte do frontend

| Tópico               | Arquivo                                                                                                                                                                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell + auth guard   | [src/routes/sms/+layout.svelte](src/routes/sms/+layout.svelte)                                                                                                                                                                                                                                                       |
| Sidebar SMS          | [src/lib/presentation/components/SidebarSMS.svelte](src/lib/presentation/components/SidebarSMS.svelte)                                                                                                                                                                                                               |
| RBAC helpers         | [src/lib/presentation/contexts/authContext.ts](src/lib/presentation/contexts/authContext.ts)                                                                                                                                                                                                                         |
| Dashboard (4 tabs)   | [src/routes/sms/dashboard/](src/routes/sms/dashboard/)                                                                                                                                                                                                                                                               |
| Detalhe (5 sub-tabs) | [src/routes/sms/encaminhamento/[id]/](src/routes/sms/encaminhamento/[id]/)                                                                                                                                                                                                                                           |
| Modais de ação       | [src/lib/presentation/components/AprovarEncaminhamento.svelte](src/lib/presentation/components/AprovarEncaminhamento.svelte) · [SolicitarCorrecao.svelte](src/lib/presentation/components/SolicitarCorrecao.svelte) · [RejeitarEncaminhamento.svelte](src/lib/presentation/components/RejeitarEncaminhamento.svelte) |
| Contrato TS          | [src/lib/api/types.ts](src/lib/api/types.ts) · `AprovarEncaminhamentoRequest` · `RegistrarPendenciaRequest` · `RejeitarEncaminhamentoRequest`                                                                                                                                                                        |
| Cliente HTTP tipado  | [src/lib/api/client.ts](src/lib/api/client.ts) · `api.encaminhamentos.aprovar()` · `.registrarPendencia()` · `.rejeitar()`                                                                                                                                                                                           |

### 12.2. Documentos relacionados

| Doc                                  | Conteúdo                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| [BACKEND_API.md](BACKEND_API.md)     | Spec completa de **todos** os endpoints (Face 1 + Face 2 + Admin + Auth) — fonte de verdade |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Tokens, componentes, padrões visuais e regras de UX (replicáveis em todas as Faces)         |
| [FACE2_SMS.md](FACE2_SMS.md)         | Este documento — recorte focado na Face 2                                                   |

### 12.3. Exemplo de chamada curl (dev local)

```bash
# 1. Login como regulador
TOKEN=$(curl -s -X POST http://localhost:3333/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"SMS-099101","senha":"12345678"}' \
  | jq -r .token)

# 2. Ver fila
curl -s http://localhost:3333/v1/encaminhamentos?status=AGUARDANDO_REGULACAO \
  -H "Authorization: Bearer $TOKEN" | jq

# 3. Aprovar
curl -X POST http://localhost:3333/v1/encaminhamentos/enc-uuid/aprovar \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"nota":"Paciente inserido na fila","agendamentoPrevisto":"2026-05-14"}'

# 4. Registrar pendência
curl -X POST http://localhost:3333/v1/encaminhamentos/enc-uuid/registrar-pendencia \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"observacao":"Anexar laudo com data < 90 dias."}'

# 5. Rejeitar
curl -X POST http://localhost:3333/v1/encaminhamentos/enc-uuid/rejeitar \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"motivo":"Fora dos critérios de protocolo."}'
```

### 12.4. Sugestão de seed (dev local)

Para testar o fluxo ponta-a-ponta (Face 1 → Face 2), adicionar ao seed:

- 1 usuário REGULADOR_SMS da prefeitura Águas Belas, ex.: `SMS-099101` / `regulador@aguasbelas.pe.gov.br`
- Alguns encaminhamentos em `AGUARDANDO_REGULACAO` (originados da seed UBS)
- Ao menos 1 encaminhamento em cada estado: `AGUARDANDO_REGULACAO`, `PENDENCIA_DOCUMENTO`, `APROVADO`, `REJEITADO`

---

## Apêndice · Divergências entre Face 1 e Face 2

Documentadas aqui pra evitar confusão:

| Aspecto            | Face 1 (UBS)                                             | Face 2 (SMS)                                                                   |
| ------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Sidebar label      | `UBS / FACE 1`                                           | `SMS / FACE 2`                                                                 |
| Escopo padrão      | UBS específica (claim `ubsId`)                           | Prefeitura (claim `prefeituraId`)                                              |
| Ação principal     | Consolidar encaminhamento (POST `/encaminhamentos`)      | Decidir encaminhamento (POST `/:id/aprovar`, etc.)                             |
| Upload             | PDF + anexos (multipart)                                 | Apenas JSON (sem upload)                                                       |
| Role primária      | `ATENDENTE_UBS`                                          | `REGULADOR_SMS`                                                                |
| Tabelas            | Todos os encaminhamentos da UBS                          | Todos os encaminhamentos da prefeitura                                         |
| Rotas base         | `/ubs/*`                                                 | `/sms/*`                                                                       |
| Componente detalhe | reusa `encaminhamentoContext`                            | reusa `encaminhamentoContext`                                                  |
| Action bar         | Imprimir · Baixar PDF · Resolver Pendência (condicional) | Imprimir · Baixar PDF · Aprovar · Solicitar Correção · Rejeitar (condicionais) |

O **domínio é o mesmo** — muda o quem-faz-o-quê. É por isso que `Encaminhamento`, `Paciente`, `SolicitacaoMedica`, `AnexoDocumento`, `EventoTimeline` são compartilhados via `src/lib/api/types.ts`.

---

**Divergência entre este documento e o código-fonte → o código-fonte vence.** Este documento reflete o estado atual do frontend e é a ponte de contrato entre times.
