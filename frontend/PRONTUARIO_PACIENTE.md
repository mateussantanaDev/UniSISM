# UNISISM · Prontuário do Paciente · Frontend

> Documento de arquitetura e operação do módulo de **Prontuário Eletrônico
> do Paciente** no frontend SvelteKit (Face 1 UBS e Face 2 SMS).
>
> Companheiro do spec do backend em [`backend/docs/PRONTUARIO_CRUD.md`](../backend/docs/PRONTUARIO_CRUD.md).
>
> Versão: v0.7.0 (24/04/2026)

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Estrutura de rotas](#2-estrutura-de-rotas)
3. [Árvore de componentes](#3-árvore-de-componentes)
4. [Estado compartilhado: `pacienteContext`](#4-estado-compartilhado-pacientecontext)
5. [RBAC — quem pode editar o quê](#5-rbac)
6. [Contrato com o backend](#6-contrato-com-o-backend)
7. [Padrão de UI para CRUD](#7-padrão-de-ui-para-crud)
8. [Impressão do prontuário](#8-impressão-do-prontuário)
9. [Badges e indicadores de UI](#9-badges-e-indicadores-de-ui)
10. [Fluxos ponta-a-ponta](#10-fluxos-ponta-a-ponta)
11. [Índice de arquivos modificados](#11-índice-de-arquivos-modificados)

---

## 1. Visão geral

O prontuário do paciente é a tela mais densa do UNISISM. Um paciente tem:

- **Identificação** (cadastro sociodemográfico completo)
- **Quadro clínico** — alergias, condições crônicas, medicamentos, histórico familiar
- **Histórico operacional** — atendimentos, exames, vacinação, viagens TFD
- **Encaminhamentos** (já existia; agora integra com o cadastro incremental)

Todas as abas:

- Consomem dados via **context compartilhado** (`usePaciente()`)
- Fazem escrita via `api.pacientes.*` → retornam `PacienteCompleto` completo
- Atualizam o context automaticamente com `ctx.atualizar(novo)`

Princípio: **uma única fonte da verdade** por paciente — o context é
sempre o estado canônico, atualizado em cada resposta do backend.

---

## 2. Estrutura de rotas

```
src/routes/ubs/pacientes/
├── +page.svelte                    ← lista com busca e filtros
├── [id]/
│   ├── +layout.svelte              ← carrega paciente, header + tabs, modais globais
│   ├── +page.svelte                ← aba Resumo (overview)
│   ├── cadastro/+page.svelte       ← aba Cadastro (só leitura — edição via modal)
│   ├── quadro-clinico/+page.svelte ← CRUD: alergias · crônicas · medicamentos · histórico
│   ├── atendimentos/+page.svelte   ← CRUD: atendimentos
│   ├── encaminhamentos/+page.svelte
│   ├── exames/+page.svelte         ← CRUD: exames
│   ├── vacinas/+page.svelte        ← CRUD: vacinação
│   └── viagens/+page.svelte        ← CRUD: viagens TFD
```

O espelho **`src/routes/sms/pacientes/[id]/...`** tem o mesmo shape e todas
as mesmas abas — mas na SMS a edição do prontuário é gated por
`auth.ehAdminOuDev` (REGULADOR_SMS só lê).

---

## 3. Árvore de componentes

### 3.1 Componentes de prontuário (`src/lib/presentation/components/prontuario/`)

```
prontuario/
├── RegistrarAlergia.svelte            → POST /pacientes/:id/alergias
├── RegistrarCondicaoCronica.svelte    → POST /pacientes/:id/condicoes-cronicas
├── RegistrarMedicamento.svelte        → POST /pacientes/:id/medicamentos
├── RegistrarAtendimento.svelte        → POST /pacientes/:id/atendimentos (SOAP)
├── RegistrarExame.svelte              → POST /pacientes/:id/exames
├── RegistrarVacina.svelte             → POST /pacientes/:id/vacinacoes
├── RegistrarViagemTfd.svelte          → POST /pacientes/:id/viagens
├── ConfirmarRemocao.svelte            → modal genérico de confirmação
└── ImprimirProntuario.svelte          → prévia print-friendly A4 + window.print()
```

### 3.2 Componentes "cadastro-base" (fora da pasta prontuario/)

- **`EditarPaciente.svelte`** — modal grande com 6 seções (identidade, filiação, socio, contato, endereço, clínico). Acessado pelo botão "Editar Cadastro" no header do layout de paciente.

### 3.3 Relação com os modais do sistema

Todos os modais de registro seguem o mesmo contrato:

```ts
interface Props {
	pacienteId: string;
	onCancel: () => void;
	onSalvo: (atualizado: PacienteCompleto) => void;
}
```

Chamam `api.pacientes.add*()`, recebem o `PacienteCompleto`, repassam ao
caller, que chama `ctx.atualizar(atualizado)`. Zero refetch.

---

## 4. Estado compartilhado: `pacienteContext`

**Arquivo:** `src/lib/presentation/contexts/pacienteContext.ts`

```ts
export interface PacienteContext {
	readonly paciente: PacienteCompleto | null;
	readonly carregando: boolean;
	readonly erro: boolean;
	/** Atualiza o paciente no context após um PATCH/POST/DELETE. */
	atualizar?: (novo: PacienteCompleto) => void;
}
```

O `+layout.svelte` do paciente:

1. Carrega o paciente via `api.pacientes.byId(id)` (em `$effect`)
2. Popula o context com getters reativos (`get paciente() { return paciente; }`)
3. Expõe `atualizar` que substitui o `paciente` local

**Qualquer aba filha:**

```svelte
<script>
	import { usePaciente } from '$lib/presentation/contexts/pacienteContext';
	const ctx = usePaciente();
	let p = $derived(ctx.paciente!);
</script>
```

Quando um modal de registro dispara `onSalvo(atualizado)`, a aba faz:

```ts
function handleSalvo(atualizado: PacienteCompleto) {
	ctx.atualizar?.(atualizado);
	modalAberto = false;
	notificar('ok', 'Registro criado.');
}
```

Svelte 5 re-renderiza todas as abas automaticamente via reactivity de runes.

---

## 5. RBAC

### 5.1 Flags do `AuthContext`

```ts
auth.podeConsolidarEncaminhamento; // ATENDENTE_UBS · COORDENADOR_UBS · DEV
auth.ehAdminOuDev; // ADMIN · DEV
```

### 5.2 Regra de edição no frontend

Cada aba do prontuário computa:

```ts
let podeEditar = $derived(auth.podeConsolidarEncaminhamento || auth.ehAdminOuDev);
```

- **Face UBS**: ATENDENTE_UBS e COORDENADOR_UBS podem editar (são linha de frente)
- **Face SMS**: só ADMIN/DEV podem editar (REGULADOR_SMS é gestão de demanda, não atendimento primário)

### 5.3 Backend é fonte de verdade

O frontend esconde botões como **defesa em profundidade**, mas é o backend
quem devolve 403 se alguém tentar forçar. A matriz completa está em
`backend/docs/PRONTUARIO_CRUD.md §9`.

### 5.4 Ações com RBAC mais fino (dentro do mesmo role)

Não implementadas hoje no frontend — se no futuro você quiser que
ATENDENTE_UBS crie atendimento mas só COORDENADOR delete, o frontend já
está preparado: basta trocar `podeEditar` por `podeDeletar` em botões
específicos. O backend já valida por rota.

---

## 6. Contrato com o backend

### 6.1 Client TS — `src/lib/api/client.ts` · classe `PacientesApi`

**19 métodos novos agrupados por entidade:**

```ts
// Alergias (2)
addAlergia(pacienteId, req)                   → PacienteCompleto
removeAlergia(pacienteId, alergiaId)          → PacienteCompleto

// Condições crônicas (3)
addCondicaoCronica(pacienteId, req)           → PacienteCompleto
updateCondicaoCronica(pacienteId, id, req)    → PacienteCompleto  // toggle ativo
removeCondicaoCronica(pacienteId, id)         → PacienteCompleto

// Medicamentos (3)
addMedicamento(pacienteId, req)               → PacienteCompleto
updateMedicamento(pacienteId, id, req)        → PacienteCompleto  // toggle ativo
removeMedicamento(pacienteId, id)             → PacienteCompleto

// Histórico familiar (1)
setHistoricoFamiliar(pacienteId, itens)       → PacienteCompleto  // PUT substitui toda lista

// Atendimentos (2)
addAtendimento(pacienteId, req)               → PacienteCompleto
removeAtendimento(pacienteId, id)             → PacienteCompleto

// Exames (2)
addExame(pacienteId, req)                     → PacienteCompleto
removeExame(pacienteId, id)                   → PacienteCompleto

// Vacinação (2)
addVacina(pacienteId, req)                    → PacienteCompleto
removeVacina(pacienteId, id)                  → PacienteCompleto

// Viagens TFD (3)
addViagemTfd(pacienteId, req)                 → PacienteCompleto
updateViagemTfd(pacienteId, id, req)          → PacienteCompleto  // transições de status
removeViagemTfd(pacienteId, id)               → PacienteCompleto
```

### 6.2 Tipos — `src/lib/api/types.ts`

**Entidades com `id: string` (v0.7.0+):**

- `Alergia`, `CondicaoCronica`, `MedicamentoEmUso` — agora têm id
- `Atendimento`, `ExameRealizado`, `VacinaAplicada`, `ViagemTFD` — já tinham

**DTOs de criação/atualização (10 tipos novos):**

```ts
CriarAlergiaRequest
CriarCondicaoCronicaRequest        ·  AtualizarCondicaoCronicaRequest
CriarMedicamentoRequest            ·  AtualizarMedicamentoRequest
AtualizarHistoricoFamiliarRequest
CriarAtendimentoRequest
CriarExameRequest
CriarVacinaRequest
CriarViagemTfdRequest              ·  AtualizarViagemTfdRequest
```

### 6.3 Endpoints HTTP (backend precisa expor)

Lista completa em `backend/docs/PRONTUARIO_CRUD.md §4-§8`. Resumo:

```
POST   /v1/pacientes/:pacienteId/alergias
DELETE /v1/pacientes/:pacienteId/alergias/:id

POST   /v1/pacientes/:pacienteId/condicoes-cronicas
PATCH  /v1/pacientes/:pacienteId/condicoes-cronicas/:id
DELETE /v1/pacientes/:pacienteId/condicoes-cronicas/:id

POST   /v1/pacientes/:pacienteId/medicamentos
PATCH  /v1/pacientes/:pacienteId/medicamentos/:id
DELETE /v1/pacientes/:pacienteId/medicamentos/:id

PUT    /v1/pacientes/:pacienteId/historico-familiar

POST   /v1/pacientes/:pacienteId/atendimentos
DELETE /v1/pacientes/:pacienteId/atendimentos/:id

POST   /v1/pacientes/:pacienteId/exames
DELETE /v1/pacientes/:pacienteId/exames/:id

POST   /v1/pacientes/:pacienteId/vacinacoes
DELETE /v1/pacientes/:pacienteId/vacinacoes/:id

POST   /v1/pacientes/:pacienteId/viagens
PATCH  /v1/pacientes/:pacienteId/viagens/:id
DELETE /v1/pacientes/:pacienteId/viagens/:id
```

### 6.4 Novo método HTTP base: `api.put()`

Adicionado ao `ApiClient` em `client.ts`:

```ts
async put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(this.buildUrl(path), {
    method: 'PUT',
    headers: this.headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  return this.parse<T>(res);
}
```

Usado exclusivamente em `setHistoricoFamiliar` (substituição total da lista).

---

## 7. Padrão de UI para CRUD

Cada aba segue o mesmo esqueleto:

### 7.1 Setup do script

```svelte
<script>
	import PanelHeader from '...';
	import PrimaryButton from '...';
	import Modal from '...';
	import RegistrarEntidade from '...prontuario/...';
	import ConfirmarRemocao from '...prontuario/ConfirmarRemocao.svelte';
	import { usePaciente } from '...';
	import { useAuth } from '...';
	import { api, ApiError } from '$lib/api';

	const ctx = usePaciente();
	const auth = useAuth();
	let p = $derived(ctx.paciente!);
	let podeEditar = $derived(auth.podeConsolidarEncaminhamento || auth.ehAdminOuDev);

	// Estado dos modais
	let modalAberto = $state(false);
	let removendoId = $state<string | null>(null);
	let removendo = $state(false);
	let mensagem = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

	function notificar(tipo, texto) {
		mensagem = { tipo, texto };
		setTimeout(() => (mensagem = null), 4000);
	}

	function handleSalvo(atualizado) {
		ctx.atualizar?.(atualizado);
		modalAberto = false;
		notificar('ok', '...');
	}

	async function confirmarRemocao() {
		if (!removendoId) return;
		removendo = true;
		try {
			const atualizado = await api.pacientes.remove<Entidade>(p.id, removendoId);
			ctx.atualizar?.(atualizado);
			notificar('ok', 'Registro removido.');
		} catch (e) {
			notificar('erro', e instanceof ApiError ? e.message : 'Falha ao remover.');
		} finally {
			removendo = false;
			removendoId = null;
		}
	}
</script>
```

### 7.2 Template de marcação

```svelte
<!-- Banner de feedback -->
{#if mensagem}
	<div
		class="border ... {mensagem.tipo === 'ok' ? 'border-emerald-700 ...' : 'border-red-700 ...'}"
	>
		{mensagem.tipo === 'ok' ? '✓' : '⚠'}
		{mensagem.texto}
	</div>
{/if}

<!-- Panel com botão Adicionar -->
<PanelHeader ...>
	{#if podeEditar}
		<PrimaryButton label="+ Entidade" onclick={() => (modalAberto = true)} />
	{/if}
</PanelHeader>

<!-- Linhas com botão Remover (gated) -->
{#each lista as item (item.id)}
	<tr>
		<td>...</td>
		{#if podeEditar}
			<td>
				<button onclick={() => (removendoId = item.id)} class="text-red-700 ... ...">
					Remover
				</button>
			</td>
		{/if}
	</tr>
{/each}

<!-- Modais -->
<Modal isOpen={modalAberto} ...>
	<RegistrarEntidade
		pacienteId={p.id}
		onCancel={() => (modalAberto = false)}
		onSalvo={handleSalvo}
	/>
</Modal>

<Modal isOpen={removendoId !== null} ...>
	<ConfirmarRemocao
		mensagem="..."
		detalhe="..."
		processando={removendo}
		onConfirmar={confirmarRemocao}
		onCancelar={() => (removendoId = null)}
	/>
</Modal>
```

Esse esqueleto vale para **atendimentos**, **exames**, **vacinas**, **viagens**
com adaptações mínimas de label.

### 7.3 Variantes no `quadro-clinico`

A aba de quadro clínico é a mais complexa porque agrupa **4 coleções**
(alergias, crônicas, medicamentos, histórico familiar) em painéis separados:

- Uma única "barra de mensagens" no topo da página
- Cada painel tem seu próprio botão "+ Entidade"
- Condições crônicas e medicamentos têm botões inline **Encerrar/Reativar** e **Suspender/Reativar** (chamam `updateCondicaoCronica`/`updateMedicamento` com `{ ativo }`)
- Histórico familiar é edição inline tag-like (tags adicionadas/removidas → `setHistoricoFamiliar` único PUT)

### 7.4 Viagens TFD: transições de status

A aba de viagens oferece botões inline para avançar no workflow:

```
AGENDADA ──[Iniciar]──→ EM_ANDAMENTO ──[Marcar Realizada]──→ REALIZADA
                                        ↓
              [Cancelar] ──────────────→ CANCELADA
```

Cada botão chama `api.pacientes.updateViagemTfd(pid, vid, { status })`. O
backend valida a transição; transições inválidas retornam `422`.

---

## 8. Impressão do prontuário

### 8.1 Componente `ImprimirProntuario.svelte`

Localização: `src/lib/presentation/components/prontuario/ImprimirProntuario.svelte`

**Arquitetura:**

- Overlay **full-screen fixo** (`position: fixed; inset: 0; z-50`)
- Duas zonas: **toolbar** (botões Fechar/Imprimir) + **documento A4**
- CSS `@media print` esconde toda a chrome do app (sidebar, header, tabs) e deixa **apenas o `.print-scope`** visível

**Estratégia:** 100% **client-side**. Não chama backend. Usa o `PacienteCompleto`
já carregado no `pacienteContext`. Zero PII transita pela rede no momento
da impressão (o paciente já estava aberto na tela do médico).

### 8.2 Layout do documento

O documento A4 renderizado tem 8 seções:

1. **Cabeçalho institucional** — prefeitura, unidade, operador, data/hora, banner LGPD
2. **Identificação** — 14 campos sociodemográficos
3. **Alergias** — destaque vermelho; verificar antes de prescrever
4. **Condições crônicas** + **Medicamentos** — lado a lado
5. **Histórico familiar** — lista simples
6. **Atendimentos** — registro SOAP por linha
7. **Exames** — tabela compacta
8. **Vacinação** — tabela compacta (caderneta)
9. **Viagens TFD** — só aparece se há registros

Rodapé em todas as páginas com ID do paciente + banner legal (LGPD + Res. CFM 1.821/2007).

### 8.3 CSS `@media print`

```css
@media print {
	:global(body *) {
		visibility: hidden !important;
	}
	.print-overlay,
	.print-overlay * {
		visibility: visible !important;
	}
	.print-toolbar {
		display: none !important;
	}
	.print-overlay {
		position: static !important;
		background: white !important;
	}
	.print-scope {
		box-shadow: none !important;
		margin: 0 !important;
		max-width: none !important;
		padding: 10mm 12mm !important;
	}
	.page-break {
		page-break-before: always;
	}
	@page {
		size: A4;
		margin: 0;
	}
}
```

**Efeito:** ao clicar "Imprimir" ou `Ctrl+P`, o browser renderiza SÓ o
documento — sem sidebar, sem botões, sem nada além do prontuário
formatado para A4.

### 8.4 Como abrir

No `+layout.svelte` do paciente (UBS e SMS):

```svelte
<PrimaryButton
	label="Imprimir Prontuário"
	variant="secondary"
	onclick={() => (imprimirAberto = true)}
/>

{#if imprimirAberto && paciente}
	<ImprimirProntuario
		{paciente}
		operador={auth.me ? `${auth.me.nome} (${auth.me.matricula})` : '—'}
		prefeitura={auth.me?.prefeitura ?? null}
		unidade={auth.me?.unidade ?? paciente.unidadeVinculada}
		onFechar={() => (imprimirAberto = false)}
	/>
{/if}
```

**Atalhos de teclado:**

- `ESC` — fecha a prévia sem imprimir
- `Ctrl+P` / `Cmd+P` — dispara impressão nativa (mesma que botão "Imprimir")

### 8.5 Limites e futuros

- **Não gera PDF server-side.** Se você quiser PDF canônico (arquivo enviado
  por email, por exemplo), adicionar endpoint `GET /pacientes/:id/prontuario.pdf`
  no backend com pdfkit ou puppeteer e usar o padrão de relatórios já
  existente (`api.relatorios.download`).
- **Não há marca d'água CONFIDENCIAL automática.** Adicionar CSS
  `position: fixed; transform: rotate(-45deg); opacity: 0.1` se regra LGPD
  do município exigir.
- **Não assina digitalmente.** Impressão física é documento "sem fé pública"
  até o operador assinar. Se quiser certificação ICP-Brasil, é fluxo PDF
  server-side com GOV.BR.

---

## 9. Badges e indicadores de UI

No header do paciente (acima das tabs):

- `⚠ N CAMPOS PENDENTES` — `pacienteGaps.camposFaltantesPaciente(p)`. Calcula
  os 10 campos essenciais canônicos do backend
  (`nome`, `dataNascimento`, `sexo`, `telefone`, `nomeMae`, `endereco`,
  `bairro`, `municipio`, `uf`, `cep`). Só mostra se > 0.
- `GRUPO X+` — grupo sanguíneo
- `⚠ N ALERGIAS` — sempre vermelho se há alergias
- `N CRÔNICAS` — amber se há condições ativas

Cada uma dessas badges vira "dado vivo" após qualquer edição, porque
o `ctx.atualizar()` substitui o paciente inteiro.

---

## 10. Fluxos ponta-a-ponta

### 10.1 Atendente registra um novo atendimento

```
1. Navega para /ubs/pacientes/:id/atendimentos
2. Clica "+ Atendimento"
3. Modal abre com form SOAP (queixa / diagnóstico / conduta)
4. Salva → POST /pacientes/:id/atendimentos
5. Backend retorna PacienteCompleto atualizado
6. ctx.atualizar(p) → todas as abas atualizam
7. Banner verde "Atendimento registrado" por 4s
8. Métrica "Total de Atendimentos" incrementa automaticamente
```

### 10.2 Enfermeiro remove dose registrada por engano

```
1. Aba /ubs/pacientes/:id/vacinas
2. Clica "Remover" na linha errada
3. Modal ConfirmarRemocao abre ("A caderneta é documento oficial")
4. Confirma → DELETE /pacientes/:id/vacinacoes/:vid
5. ctx.atualizar → dose some da tabela
6. Contagem de doses atualiza
```

### 10.3 Coordenador suspende medicamento

```
1. Aba /ubs/pacientes/:id/quadro-clinico
2. No painel Medicamentos, clica "Suspender" na linha
3. PATCH /pacientes/:id/medicamentos/:mid { ativo: false }
4. Badge da linha muda de ATIVO → SUSPENSO
5. Contador "EM USO" decrementa, "SUSPENSO" incrementa
```

### 10.4 Imprime prontuário completo

```
1. Em qualquer aba do paciente, clica "Imprimir Prontuário" no header
2. Overlay full-screen abre com prévia A4
3. Usa ESC para fechar, ou clica "Imprimir"
4. Browser abre diálogo de impressão nativo
5. CSS @media print: toda a chrome some, só o documento aparece
6. Operador pode salvar como PDF (Ctrl+P → "Salvar como PDF")
   ou enviar à impressora física
```

### 10.5 Edita cadastro direto + wizard de encaminhamento completam juntos

```
1. Paciente cadastrado faltando nome da mãe, bairro, CEP
2. Badge "⚠ 3 CAMPOS PENDENTES" aparece no header
3. Duas formas de completar:

   Direto (a qualquer momento):
   - Click "Editar Cadastro" → modal EditarPaciente
   - Preenche os 3 campos → PATCH /pacientes/:id
   - Badge desaparece

   Automático (no próximo encaminhamento):
   - Upload PDF → extrai CPF → GET /pacientes/por-cpf/:cpf
   - Backend responde { completo: false, camposFaltantes: [...] }
   - Wizard renderiza seção "Completar Cadastro"
   - Usuário preenche, consolida → POST /encaminhamentos
   - Backend faz upsert atômico (preserva dados existentes)
   - Badge desaparece
```

---

## 11. Índice de arquivos modificados

### 11.1 Camada de tipos (`src/lib/api/types.ts`)

- Adicionado `id: string` em `Alergia`, `CondicaoCronica`, `MedicamentoEmUso`
- Nova seção "PACIENTES · CRUD de sub-documentos" com 10 DTOs

### 11.2 Camada de API (`src/lib/api/client.ts`)

- Método base `put<T>()` adicionado
- `PacientesApi` ganhou **19 métodos** agrupados por entidade
- Imports dos tipos novos

### 11.3 Componentes (`src/lib/presentation/components/prontuario/`)

Novos:

- `RegistrarAlergia.svelte`
- `RegistrarCondicaoCronica.svelte`
- `RegistrarMedicamento.svelte`
- `RegistrarAtendimento.svelte`
- `RegistrarExame.svelte`
- `RegistrarVacina.svelte`
- `RegistrarViagemTfd.svelte`
- `ConfirmarRemocao.svelte`
- `ImprimirProntuario.svelte`

### 11.4 Rotas (`src/routes/ubs/pacientes/[id]/`)

Modificados:

- `+layout.svelte` — wiring de `ImprimirProntuario` no botão
- `quadro-clinico/+page.svelte` — reescrita completa com CRUD
- `atendimentos/+page.svelte` — botão "+ Atendimento" + Remover
- `exames/+page.svelte` — botão "+ Exame" + Remover
- `vacinas/+page.svelte` — botão "+ Dose Aplicada" + Remover
- `viagens/+page.svelte` — botão "+ Viagem TFD" + status transitions + Remover

### 11.5 Rotas (`src/routes/sms/pacientes/[id]/`)

Modificados:

- `+layout.svelte` — wiring de `ImprimirProntuario` idêntico ao UBS

_O SMS tem os mesmos arquivos que UBS mas ainda não ganhou os botões
"+ Entidade" nas abas filhas. Se quiser que ADMIN/DEV também cadastre
direto via SMS, duplique o padrão do UBS nas abas espelho (o código é
praticamente idêntico, só muda o guard)._

### 11.6 Documentação

- `frontend/PRONTUARIO_PACIENTE.md` — **este arquivo**
- `backend/docs/PRONTUARIO_CRUD.md` — contrato HTTP + schema SQL + RBAC detalhado para o time do backend

---

## 12. Apêndice · atalhos e convenções

### 12.1 Atalhos de teclado

Dentro do `ImprimirProntuario`:

- `ESC` → fecha prévia
- `Ctrl+P` / `Cmd+P` → dispara impressão

Dentro dos modais de registro: o padrão Svelte (ESC fecha, Enter submete
em inputs de texto — com exceção de textareas).

### 12.2 Mensagens de erro

Todos os modais tratam `ApiError` e mostram `e.message` quando não há code
específico. Códigos conhecidos são traduzidos para pt-BR (ex.:
`ITEM_DUPLICADO` → "Já existe um registro igual").

### 12.3 Data/hora

- **Entrada em formulários:** `<input type="date">` YYYY-MM-DD; `<input
type="datetime-local">` para atendimentos (sem timezone, localtime)
- **Saída em telas:** `new Date(iso).toLocaleString('pt-BR', {...})`
- **Envio ao backend:** sempre ISO 8601 (`new Date(value).toISOString()`)

### 12.4 LGPD / Segurança

- Nenhum dado sensível é persistido no `localStorage` além do JWT de sessão
- Impressão é 100% client-side — o conteúdo só existe no DOM da tela
- Backend é quem valida RBAC; frontend esconde botões por defesa em
  profundidade
- Todas as escritas são auditadas pelo backend (`paciente_prontuario_audit`
  — retenção 20 anos conforme Res. CFM 1.821/2007)

---

_Última atualização: 2026-04-24. Versão: frontend pós-v0.7.0._
