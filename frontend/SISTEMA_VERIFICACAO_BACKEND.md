# UNISISM · Verificação Backend ↔ Frontend

> **Propósito:** este documento lista **todos** os endpoints HTTP que o
> frontend SvelteKit consome hoje. Use como checklist para verificar se
> o backend já implementa cada rota e se os contratos batem.
>
> **Fontes canônicas no frontend:**
>
> - [`src/lib/api/client.ts`](src/lib/api/client.ts) — chamadas HTTP
> - [`src/lib/api/types.ts`](src/lib/api/types.ts) — DTOs core (UBS/SMS/Admin/App-Paciente)
> - [`src/lib/api/tfd-types.ts`](src/lib/api/tfd-types.ts) — DTOs TFD
> - [`src/routes/{ubs,sms,tfd}/`](src/routes/) — telas que disparam cada chamada
>
> **Documentos companheiros (mais detalhados em domínios específicos):**
>
> - [`BACKEND_API.md`](BACKEND_API.md) — UBS / Encaminhamentos
> - [`FACE2_SMS.md`](FACE2_SMS.md) — fluxo regulação SMS
> - [`SMS_SIMPLES.md`](SMS_SIMPLES.md) — versão simplificada SMS
> - [`PRONTUARIO_PACIENTE.md`](PRONTUARIO_PACIENTE.md) — prontuário (frontend)
> - [`PRONTUARIO_BACKEND.md`](PRONTUARIO_BACKEND.md) — prontuário (backend)
> - [`TFD_MODULE.md`](TFD_MODULE.md) — Face 4 TFD completo
> - [`BACKEND_GUIDE.md`](BACKEND_GUIDE.md) — guia geral de implementação
> - [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — design system (não-backend)

---

## Sumário rápido

| Domínio                                                            |  Rotas  | Status |
| ------------------------------------------------------------------ | :-----: | ------ |
| [1. Auth](#1-auth)                                                 |    6    | ☐      |
| [2. Perfil do operador](#2-perfil-do-operador)                     |    4    | ☐      |
| [3. Dashboard UBS](#3-dashboard-ubs)                               |    1    | ☐      |
| [4. Encaminhamentos UBS+SMS](#4-encaminhamentos)                   |   13    | ☐      |
| [5. Pacientes + Prontuário](#5-pacientes--prontuário-crud)         |   23    | ☐      |
| [6. Relatórios UBS](#6-relatórios-ubs)                             |    3    | ☐      |
| [7. Admin](#7-admin-prefeituras--ubs--usuários)                    |   14    | ☐      |
| [8. App do Paciente](#8-app-do-paciente-face-3)                    |   10    | ☐      |
| [9. TFD · Veículos](#9-tfd--veículos)                              |    7    | ☐      |
| [10. TFD · Motoristas](#10-tfd--motoristas)                        |    7    | ☐      |
| [11. TFD · Solicitações](#11-tfd--solicitações)                    |    6    | ☐      |
| [12. TFD · Viagens](#12-tfd--viagens)                              |    9    | ☐      |
| [13. TFD · Abastecimento](#13-tfd--abastecimento)                  |    6    | ☐      |
| [14. TFD · Saldo da Frota](#14-tfd--saldo-da-frota)                |    4    | ☐      |
| [15. TFD · Saldo Ajuda de Custo](#15-tfd--saldo-de-ajuda-de-custo) |    4    | ☐      |
| [16. TFD · Ajudas de Custo](#16-tfd--ajudas-de-custo)              |    6    | ☐      |
| [17. TFD · Relatórios](#17-tfd--relatórios-analíticos)             |    1    | ☐      |
| [18. TFD · Auditoria](#18-tfd--auditoria)                          |    3    | ☐      |
| [19. RBAC consolidada](#19-rbac-consolidada)                       |    —    | ☐      |
| [20. Códigos de erro](#20-códigos-de-erro)                         |    —    | ☐      |
| **TOTAL**                                                          | **127** |        |

---

## 0. Convenções globais

### 0.1 Base URL

- `https://api.<dominio>/v1` — prefixo `v1` em **todas** as rotas exceto `/paciente-app/*` (Face 3 tem prefixo próprio).
- Configurável no frontend via `VITE_API_BASE_URL`.

### 0.2 Autenticação

- Header: `Authorization: Bearer <jwt>`.
- JWT carrega `userId`, `role`, `prefeituraId`, `ubsId` (se aplicável), `escopo`.
- Refresh token é `httpOnly` cookie (rota `/auth/login` deve setá-lo).
- App do Paciente usa **token separado** (`Bearer` no `localStorage` `unisism_paciente_token`).

### 0.3 Roles

```ts
'DESENVOLVEDOR' |
	'ADMIN' |
	'COORDENADOR_UBS' |
	'ATENDENTE_UBS' |
	'REGULADOR_SMS' |
	'GESTOR_TFD' |
	'REGULADOR_TFD';
```

### 0.4 Datas

- Date só (`YYYY-MM-DD`) — `desde`, `data`, `dataNascimento`.
- Timestamp completo ISO 8601 UTC — `criadoEm`, `data` em atendimentos, etc.
- Mês: `YYYY-MM`.

### 0.5 Identificadores e protocolos

- IDs: UUID v4 strings.
- Protocolos: gerados pelo backend, imutáveis.
  - Encaminhamento: `UBS-AAAA-NNNNNN`
  - TFD (sub-doc): `TFD-AAAA-NNNNNN`
  - Solicitação TFD (Face 4): `TFD-AAAA-NNNNNN`
  - Viagem TFD (Face 4): `VIA-AAAA-NNNNNN`
  - Abastecimento: `ABA-AAAA-NNNNNN`
  - Ajuda de Custo: `AJU-AAAA-NNNNNN`

### 0.6 Status HTTP

| Código | Uso                                            |
| ------ | ---------------------------------------------- |
| 200    | GET, PATCH, PUT, DELETE bem-sucedidos com body |
| 201    | POST que cria recurso                          |
| 202    | POST assíncrono (relatórios)                   |
| 204    | DELETE sem body, logout                        |
| 400    | Payload inválido / Zod falhou                  |
| 401    | Sem token / token inválido / expirado          |
| 403    | Autenticado, sem permissão                     |
| 404    | Recurso fora do escopo / inexistente           |
| 409    | Conflito (estado, duplicata, idempotência)     |
| 413    | Upload acima do limite                         |
| 415    | MIME não aceito                                |
| 422    | Regra de negócio violada                       |
| 429    | Rate limit                                     |
| 500    | Erro interno                                   |

### 0.7 Formato padrão de erro

```json
{
	"error": {
		"code": "ITEM_DUPLICADO",
		"message": "Já existe alergia ativa para esta substância.",
		"details": { "substancia": "Dipirona" }
	}
}
```

Ver [§20](#20-códigos-de-erro) para a lista completa de `code`.

### 0.8 Multi-tenancy / isolation

- Toda rota deve filtrar por `prefeituraId` do JWT (exceto `DESENVOLVEDOR`).
- `ATENDENTE_UBS` / `COORDENADOR_UBS` adicionalmente limitados à própria `ubsId`.
- Ao falhar isolamento, retornar **404** (nunca 403 cross-tenant — evita
  vazar existência).

### 0.9 Idempotência

- Endpoints com efeito monetário aceitam `X-Idempotency-Key` header:
  - `POST /tfd/saldo/aportar`
  - `POST /tfd/saldo-ajuda-custo/aportar`
  - `POST /tfd/abastecimentos/:id/comprovante`
  - `POST /tfd/ajudas-custo/:id/pagar`
- Mesma key + mesmo body → mesma resposta (sem duplo lançamento).

### 0.10 Multipart

Endpoints multipart aceitam `multipart/form-data`:

- `POST /encaminhamentos/extract-pdf` — `file`
- `POST /encaminhamentos` — `payload` (JSON), `solicitacao` (PDF), `anexo` (N), `tipoAnexo` (N)
- `POST /encaminhamentos/:id/resolve-pendencia` — `nota`, `anexo` (N), `tipoAnexo` (N)
- `POST /encaminhamentos/:id/resposta-sus` — `file`, `observacao`
- `POST /tfd/solicitacoes/:id/anexos` — `file`, `tipo`
- `POST /tfd/abastecimentos/:id/comprovante` — `file`, `litros`, `valorPorLitro`, `valorTotal`, `hodometroKm`
- `POST /tfd/ajudas-custo/:id/pagar` — `file`, `metodoPagamento`

### 0.11 Antivírus em anexos

Toda resposta com `AnexoDocumento` ou `AnexoSolicitacaoTFD` carrega
`scanStatus: 'PENDENTE' | 'LIMPO' | 'INFECTADO' | 'FALHOU'`. Endpoints
de **download** devem responder `409 ANEXO_NAO_LIBERADO` se `scanStatus !== 'LIMPO'`.

---

## 1. Auth

Consumidos por [`AuthApi`](src/lib/api/client.ts) e tela [`/login`](src/routes/login/).

### 1.1 ☐ `POST /auth/login`

**Público.** Login por matrícula ou email.

**Request** (`LoginRequest`):

```ts
{ login: string; senha: string; lembrar?: boolean; }
```

**Response 200** (`LoginResponse`):

```ts
{
	token: string;
	refreshToken: string;
	expiresIn: number; // segundos
	atendente: {
		(id, nome, matricula, iniciais);
	}
}
```

**Erros:** `401 CREDENCIAIS_INVALIDAS`, `403 USUARIO_INATIVO`, `403 USUARIO_BLOQUEADO`,
`403 SENHA_EXPIRADA`.

### 1.2 ☐ `POST /auth/logout`

**Body opcional:** `{ refreshToken: string }`. **Response 204.**

### 1.3 ☐ `POST /auth/forgot-password`

**Público.** Request: `{ login: string }` → Response: `{ tokenEnviado: true }`.

### 1.4 ☐ `POST /auth/verify-code`

**Público.** Request: `{ login: string, codigo: string }` → Response: `{ valido: boolean, resetToken?: string }`.

### 1.5 ☐ `POST /auth/reset-password`

**Público.** Request: `{ resetToken: string, novaSenha: string }` → Response: `{ sucesso: true }`.
Validar política: ≥8 chars, mistura de classes (`SENHA_FRACA`).

### 1.6 ☐ `GET /auth/me`

Retorna `MeResponse`:

```ts
{
  id, nome, matricula, iniciais, role, unidade, prefeitura, cargo,
  escopo: 'GLOBAL' | 'PREFEITURA' | 'UBS'
}
```

---

## 2. Perfil do operador

Consumidos por [`/ubs/perfil/*`](src/routes/ubs/perfil/), [`/sms/perfil/*`](src/routes/sms/perfil/), [`/tfd/perfil`](src/routes/tfd/perfil/).

### 2.1 ☐ `GET /me/profile` → `AtendentePerfil`

Inclui produção (com `porDia`, `porEspecialidade`), `seguranca` e `atividadeRecente`.

### 2.2 ☐ `POST /me/password`

**Request:** `{ senhaAtual: string, novaSenha: string }`. **Response 204.**
Erros: `401 SENHA_ATUAL_INCORRETA`, `400 SENHA_FRACA`.

### 2.3 ☐ `POST /me/sessions/revoke-others` → `{ encerradas: number }`

### 2.4 (já contado em 1.6) `GET /auth/me`

---

## 3. Dashboard UBS

### 3.1 ☐ `GET /dashboard/metrics` → `MetricasDashboard`

```ts
{
	encaminhamentosHoje: number;
	aguardandoRegulacao: number;
	pendenciasDocumento: number;
	aprovadosHoje: number;
	tempoMedioConsolidacaoSegundos: number;
	encaminhamentosSemana: number;
	enviadosAguardandoResposta: number; // v0.9.1
	respondidosTotal: number; // v0.9.1
}
```

Filtros aplicados pelo backend: prefeituraId + ubsId do JWT.

---

## 4. Encaminhamentos

Domínio compartilhado UBS (criação/edição) + SMS (regulação).

### 4.1 ☐ `POST /encaminhamentos/extract-pdf` (multipart)

**OCR + extração estruturada.** Não persiste.
Body: `file` (PDF). Response: `ExtracaoPdfResultado`:

```ts
{
	paciente: Paciente; // shape de identificação
	solicitacao: SolicitacaoMedica;
	confiancaExtracao: number; // 0..1
}
```

### 4.2 ☐ `POST /encaminhamentos` (multipart)

**Consolida.** Body: `payload` (JSON com `{ paciente, solicitacao }`),
`solicitacao` (PDF), `anexo[]`, `tipoAnexo[]`.

Resposta: `CriarEncaminhamentoResponse { id, protocolo }`.

> **Importante:** se já existir paciente com mesmo CPF, fazer **upsert
> incremental** (não sobrescrever campos preenchidos). Ver `Paciente`
> em [`types.ts:257`](src/lib/api/types.ts).

### 4.3 ☐ `GET /encaminhamentos?status=&pacienteId=&desde=&ate=&limit=&respostaSUS=` → `Encaminhamento[]`

### 4.4 ☐ `GET /encaminhamentos/:id` → `Encaminhamento`

Inclui `paciente`, `solicitacao`, `anexos`, `timeline`, `respostaSUS?`.

### 4.5 ☐ `PATCH /encaminhamentos/:id`

Edição limitada (apenas em `AGUARDANDO_REGULACAO`). Body: `AtualizarEncaminhamentoRequest`.
Erros: `403 EDICAO_NAO_PERMITIDA`, `400 NENHUMA_ALTERACAO`.

### 4.6 ☐ `POST /encaminhamentos/:id/resolve-pendencia` (multipart)

Body: `nota`, `anexo[]`, `tipoAnexo[]`. Move status de `PENDENCIA_DOCUMENTO` para `AGUARDANDO_REGULACAO`.
Erros: `409 ENCAMINHAMENTO_NAO_EM_PENDENCIA`.

### 4.7 ☐ `POST /encaminhamentos/:id/aprovar` (SMS)

Body: `{ nota?: string, agendamentoPrevisto?: string }`. Move para `APROVADO`.
RBAC: `REGULADOR_SMS` / `DESENVOLVEDOR`.

### 4.8 ☐ `POST /encaminhamentos/:id/registrar-pendencia` (SMS)

Body: `{ observacao: string }`. Move para `PENDENCIA_DOCUMENTO`.
Erros: `400 OBSERVACAO_OBRIGATORIA`.

### 4.9 ☐ `POST /encaminhamentos/:id/rejeitar` (SMS · terminal)

Body: `{ motivo: string }`. Move para `REJEITADO` (terminal).
Erros: `400 MOTIVO_OBRIGATORIO`.

### 4.10 ☐ `POST /encaminhamentos/:id/resposta-sus` (multipart)

Body: `file` (PDF), `observacao`. Anexa PDF da resposta SUS Federal e enriquece o registro (`respostaSUS` field). Não muda status.
Erros: `409 ENCAMINHAMENTO_NAO_APROVADO`, `409 RESPOSTA_SUS_JA_REGISTRADA`, `400 PDF_RESPOSTA_OBRIGATORIO`.

### 4.11 ☐ `GET /encaminhamentos/arvore?ubsId=&ano=&mes=&respostaSUS=&excluirRascunho=`

Árvore hierárquica para o file-manager SMS (UBS → ano → mês → dia).
Sem params → `ArvoreUbsNode[]`. Cada nó traz `statusContagem`.

### 4.12 ☐ `GET /anexos/:anexoId/download` (blob)

Streams o anexo. Validar `scanStatus = LIMPO` antes de servir
(`409 ANEXO_NAO_LIBERADO` caso contrário).

### 4.13 (renumerar) — `paciente-app` tem download espelho · ver [§8](#8-app-do-paciente-face-3).

---

## 5. Pacientes + Prontuário CRUD

Consumidos por [`/ubs/pacientes/*`](src/routes/ubs/pacientes/) e [`/sms/pacientes/*`](src/routes/sms/pacientes/).

> **Princípio:** TODA rota POST/PATCH/PUT/DELETE de sub-documento retorna
> `PacienteCompleto` no body. Detalhes em
> [`PRONTUARIO_BACKEND.md`](PRONTUARIO_BACKEND.md).

### 5.1 ☐ `GET /pacientes?q=&filtro=&equipeId=&microarea=` → `PacienteResumo[]`

### 5.2 ☐ `GET /pacientes/:id` → `PacienteCompleto`

### 5.3 ☐ `GET /pacientes/por-cpf/:cpf` → `BuscarPacientePorCpfResponse`

**Estável** — nunca retorna 404. Sempre `{ existe, paciente, camposFaltantes, completo }`.

### 5.4 ☐ `PATCH /pacientes/:id` → `PacienteCompleto`

Body: `AtualizarPacienteRequest` (todos opcionais). Sobrescreve campos.
Imutáveis: `cpf`, `cartaoSus`, `ubsId`.

### 5.5 ☐ `POST /pacientes/:id/alergias` → `PacienteCompleto`

Body: `CriarAlergiaRequest`. Erro `409 ITEM_DUPLICADO` quando substância já ativa.

### 5.6 ☐ `DELETE /pacientes/:id/alergias/:alergiaId` → `PacienteCompleto` (soft delete)

### 5.7 ☐ `POST /pacientes/:id/condicoes-cronicas` → `PacienteCompleto`

Body: `CriarCondicaoCronicaRequest`. CID-10 obrigatório (regex).

### 5.8 ☐ `PATCH /pacientes/:id/condicoes-cronicas/:condicaoId` → `PacienteCompleto`

Toggle `ativo` ou `descricao`. `cid10` e `desde` imutáveis.

### 5.9 ☐ `DELETE /pacientes/:id/condicoes-cronicas/:condicaoId` → `PacienteCompleto`

### 5.10 ☐ `POST /pacientes/:id/medicamentos` → `PacienteCompleto`

### 5.11 ☐ `PATCH /pacientes/:id/medicamentos/:medicamentoId` → `PacienteCompleto`

Toggle suspender/reativar via `{ ativo }`.

### 5.12 ☐ `DELETE /pacientes/:id/medicamentos/:medicamentoId` → `PacienteCompleto`

### 5.13 ☐ `PUT /pacientes/:id/historico-familiar` → `PacienteCompleto`

Body: `{ itens: string[] }`. Substituição **total** (replace-all).
Validar: ≤50 itens, cada ≤200 chars (`422 HISTORICO_FAMILIAR_MUITO_LONGO`).

### 5.14 ☐ `POST /pacientes/:id/atendimentos` → `PacienteCompleto`

SOAP completo. `data` ≤ now(), `queixaPrincipal`/`conduta` ≥3 chars.

### 5.15 ☐ `DELETE /pacientes/:id/atendimentos/:atendimentoId` → `PacienteCompleto`

Soft delete. Apenas `COORDENADOR_UBS+`.

### 5.16 ☐ `POST /pacientes/:id/exames` → `PacienteCompleto`

### 5.17 ☐ `DELETE /pacientes/:id/exames/:exameId` → `PacienteCompleto`

### 5.18 ☐ `POST /pacientes/:id/vacinacoes` → `PacienteCompleto`

Unique `(paciente_id, vacina, dose, lote)` — `409 VACINA_DUPLICADA`.

### 5.19 ☐ `DELETE /pacientes/:id/vacinacoes/:vacinaId` → `PacienteCompleto`

Apenas `COORDENADOR_UBS+`.

### 5.20 ☐ `POST /pacientes/:id/viagens` → `PacienteCompleto`

**Sub-documento de viagem TFD** (não confundir com Face 4 frota).
Body: `CriarViagemTfdRequest`. `protocolo` único. `dataVolta >= dataIda`.

### 5.21 ☐ `PATCH /pacientes/:id/viagens/:viagemId` → `PacienteCompleto`

Inclui máquina de status: AGENDADA→EM_ANDAMENTO→REALIZADA→(terminal); ↔CANCELADA.

### 5.22 ☐ `DELETE /pacientes/:id/viagens/:viagemId` → `PacienteCompleto`

Apenas `ADMIN+`.

### 5.23 (futuro) Sub-recursos de paginação

Roadmap: `GET /pacientes/:id/atendimentos?desde=&ate=`, idem exames/vacinas/tfd. Não consumido pelo frontend hoje — não precisa expor agora.

---

## 6. Relatórios UBS

Consumidos em [`/ubs/perfil/relatorios/*`](src/routes/ubs/perfil/relatorios/).

### 6.1 ☐ `GET /relatorios` → `Relatorio[]`

### 6.2 ☐ `POST /relatorios` → `Relatorio` (201) ou `Relatorio { status: 'PROCESSANDO' }` (202)

Body: `CriarRelatorioRequest`. Geração assíncrona aceitável (frontend faz polling via 6.1).
`tipo` ∈ `PRODUCAO_INDIVIDUAL | ENCAMINHAMENTOS_POR_ESPECIALIDADE | FILA_REGULACAO | PENDENCIAS_RESOLVIDAS | TFD_CUSTOS | VACINACAO_UBS | BUSCA_ATIVA`.

### 6.3 ☐ `GET /relatorios/:id/download` (blob)

Erro `409 RELATORIO_NAO_DISPONIVEL` se ainda em PROCESSANDO.

---

## 7. Admin (Prefeituras / UBS / Usuários)

Consumidos em [`/sms/rede/*`](src/routes/sms/rede/) e admin pages dentro do TFD.

### Prefeituras (4 rotas)

#### 7.1 ☐ `GET /admin/prefeituras` → `Prefeitura[]`

#### 7.2 ☐ `POST /admin/prefeituras` → `Prefeitura`

Body: `CriarPrefeituraRequest { nome, municipio, uf, cnpj? }`.
Erro: `409 PREFEITURA_DUPLICADA`.

#### 7.3 ☐ `PATCH /admin/prefeituras/:id` → `Prefeitura`

#### 7.4 ☐ `DELETE /admin/prefeituras/:id` (204)

Apenas `DESENVOLVEDOR`.

### UBS (5 rotas)

#### 7.5 ☐ `GET /admin/ubs?prefeituraId=` → `Ubs[]`

#### 7.6 ☐ `POST /admin/ubs` → `Ubs`

Body: `CriarUbsRequest { nome, municipio, uf, prefeituraId, endereco?, cnes? }`.

#### 7.7 ☐ `PATCH /admin/ubs/:id` → `Ubs`

#### 7.8 ☐ `DELETE /admin/ubs/:id` (204)

#### 7.9 ☐ `POST /admin/ubs/:id/ativo` → `{ id, ativa }`

Body: `{ ativa: boolean }`.

### Usuários (5 rotas)

#### 7.10 ☐ `GET /admin/usuarios?q=&role=&ubsId=&prefeituraId=&ativo=` → `UsuarioListado[]`

#### 7.11 ☐ `POST /admin/usuarios` → `CriarUsuarioResponse`

Body: `CriarUsuarioRequest { nome, email, matricula, cpf, senha, role, ubsId?, prefeituraId?, ... }`.
Validar: `ubsId` exigido para `ATENDENTE_UBS` / `COORDENADOR_UBS`; `prefeituraId` exigido para `ADMIN` / `REGULADOR_SMS`.

#### 7.12 ☐ `PATCH /admin/usuarios/:id` → `CriarUsuarioResponse`

#### 7.13 ☐ `DELETE /admin/usuarios/:id` (204)

Bloquear `AUTO_EXCLUSAO_PROIBIDA`.

#### 7.14 ☐ `POST /admin/usuarios/:id/ativo` → `AlterarAtivoResponse { id, ativo }`

Body: `{ ativo: boolean }`. Bloquear `AUTO_DESATIVACAO_PROIBIDA`.

#### 7.15 ☐ `POST /admin/usuarios/:id/reset-senha` (204)

Body: `{ novaSenha: string }`. Marca senha como provisória → forçar troca no próximo login.

---

## 8. App do Paciente (Face 3)

**Prefixo separado:** `POST /paciente-app/...`. Token próprio.

### 8.1 ☐ `POST /paciente-app/auth/login` → `PacienteLoginResponse`

Body: `{ cpf, senha }`. Senha inicial = CPF; no primeiro acesso `senhaProvisoria=true`
e o app força `/auth/trocar-senha` antes de qualquer navegação.

### 8.2 ☐ `POST /paciente-app/auth/logout` (204)

### 8.3 ☐ `POST /paciente-app/auth/ativar-conta` (legado)

Body: `AtivarContaPacienteRequest { cpf, dataNascimento, senha, nome? }`.

### 8.4 ☐ `POST /paciente-app/auth/trocar-senha` (204)

Body: `{ senhaAtual, novaSenha }`. Validar `≥8 chars, !== senhaAtual`.

### 8.5 ☐ `GET /paciente-app/me` → `PacienteMeResponse`

### 8.6 ☐ `GET /paciente-app/meus-encaminhamentos` → `Encaminhamento[]`

### 8.7 ☐ `GET /paciente-app/notificacoes?apenasNaoLidas=true` → `NotificacaoPacienteDTO[]`

### 8.8 ☐ `GET /paciente-app/notificacoes/count` → `{ naoLidas: number }`

### 8.9 ☐ `POST /paciente-app/notificacoes/:id/lida` (204)

### 8.10 ☐ `POST /paciente-app/notificacoes/marcar-todas-lidas` → `{ atualizadas: number }`

### 8.11 ☐ `GET /paciente-app/anexos/:anexoId/download` (blob)

Mesma regra de scan que [§4.12](#4-encaminhamentos).

---

## 9. TFD · Veículos

Consumidos em [`/tfd/frota/*`](src/routes/tfd/frota/). Tipos: [`tfd-types.ts`](src/lib/api/tfd-types.ts).

### 9.1 ☐ `GET /tfd/veiculos` → `Veiculo[]`

### 9.2 ☐ `POST /tfd/veiculos` → `Veiculo`

Body: `CriarVeiculoRequest { placa, modelo, tipo, capacidade, ano, combustivel, consumoMedioKml, hodometroAtualKm?, proximaRevisaoKm?, proximaRevisaoEm?, prefeituraId? }`.

### 9.3 ☐ `GET /tfd/veiculos/:id` → `Veiculo`

### 9.4 ☐ `PATCH /tfd/veiculos/:id` → `Veiculo`

### 9.5 ☐ `POST /tfd/veiculos/:id/manutencao` → `Veiculo` (status → EM_MANUTENCAO)

### 9.6 ☐ `POST /tfd/veiculos/:id/reativar` → `Veiculo` (status → ATIVO)

### 9.7 ☐ `DELETE /tfd/veiculos/:id` (204)

---

## 10. TFD · Motoristas

Consumidos em [`/tfd/motoristas/*`](src/routes/tfd/motoristas/).

### 10.1 ☐ `GET /tfd/motoristas` → `Motorista[]`

### 10.2 ☐ `POST /tfd/motoristas` → `Motorista`

Body: `CriarMotoristaRequest { nome, cpf, cnh, categoriaCnh, validadeCnh, telefone, prefeituraId? }`.

### 10.3 ☐ `GET /tfd/motoristas/:id` → `Motorista`

### 10.4 ☐ `PATCH /tfd/motoristas/:id` → `Motorista`

### 10.5 ☐ `POST /tfd/motoristas/:id/afastar` → `Motorista`

### 10.6 ☐ `POST /tfd/motoristas/:id/reativar` → `Motorista`

### 10.7 ☐ `DELETE /tfd/motoristas/:id` (204)

> **Computar:** `totalViagens`, `totalKmRodados`, `cnhVencidaEm` (dias até CNH vencer).

---

## 11. TFD · Solicitações

Consumidos em [`/tfd/solicitacoes/*`](src/routes/tfd/solicitacoes/).

### 11.1 ☐ `GET /tfd/solicitacoes?status=&prioridade=&q=&prefeituraId=&criadaPorMim=` → `SolicitacaoTFD[]`

`criadaPorMim=true` filtra por `criadaPorId === me.id` (dashboard simplificado REGULADOR_TFD).

### 11.2 ☐ `POST /tfd/solicitacoes` → `SolicitacaoTFD`

Body: `CriarSolicitacaoRequest`. **Dois modos:**

- **Existente:** `pacienteId`.
- **Inline (REGULADOR_TFD):** `paciente: DadosPacienteInline` → backend faz upsert por CPF antes de gravar.

Quando `acompanhanteNecessario=true`, exigir `acompanhante: DadosAcompanhante`.

### 11.3 ☐ `GET /tfd/solicitacoes/:id` → `SolicitacaoTFD`

### 11.4 ☐ `POST /tfd/solicitacoes/:id/aprovar` → `SolicitacaoTFD`

Body: `AprovarSolicitacaoRequest`. Se `alocacao` informado, **aprova + aloca atomicamente** (UX BlaBlaCar).
Status: PENDENTE → APROVADA (ou ALOCADA se houve alocação).

### 11.5 ☐ `POST /tfd/solicitacoes/:id/negar` → `SolicitacaoTFD`

Body: `{ motivo: string }`. PENDENTE → NEGADA. Terminal.

### 11.6 ☐ `POST /tfd/solicitacoes/:id/anexos` (multipart) → `AnexoSolicitacaoTFD`

Body: `file`, `tipo: TipoAnexoSolicitacaoTFD`. Disparar scan AV.

### 11.7 ☐ `GET /tfd/anexos/:anexoId/download` (blob)

Validar `scanStatus = LIMPO`.

---

## 12. TFD · Viagens

Consumidos em [`/tfd/viagens/*`](src/routes/tfd/viagens/) — o frontend usa
**listagem** (`+page.svelte`) e **detalhe com passageiros + presença**
(`[id]/+page.svelte`).

> **Fluxo completo que o frontend já espera consumir:**
>
> 1. Tela de viagens carrega `GET /tfd/viagens` → exibe **histórico** + total
>    (`viagens.length`) + filtros por status (TODAS · AGENDADA · EM_ANDAMENTO ·
>    CONCLUIDA · CANCELADA).
> 2. Clique numa linha → navega para `/tfd/viagens/:id`.
> 3. Detalhe carrega `GET /tfd/viagens/:id` → renderiza **lista de
>    passageiros** com badge de presença (AGUARDANDO · CONFIRMADO · EMBARCADO ·
>    AUSENTE · DESISTIU) e botões inline "Embarcou / Faltou / Desistiu".
> 4. Botões disparam `POST /tfd/viagens/:id/passageiros/:passageiroId/presenca`
>    e o backend devolve `ViagemFrota` atualizado.

### 12.1 ☐ `GET /tfd/viagens?status=&desde=&ate=&prefeituraId=` → `ViagemFrota[]`

**Listagem completa de viagens** (= histórico). O frontend exibe **total**
diretamente como `viagens.length`; **não há endpoint separado de "stats"**.

**Query params:**

- `status` — filtra por `'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA'`.
- `desde` / `ate` — janela de datas (inclusive). Default: backend pode limitar
  aos últimos 90 dias se nada for informado, mas hoje o frontend chama sem
  filtro e espera **todas** as viagens da prefeitura.
- `prefeituraId` — só `DESENVOLVEDOR` / `ADMIN_GLOBAL` pode apontar para
  outra; senão usar do JWT.

**Forma da resposta** — array de `ViagemFrota` (ver tipo em
[`tfd-types.ts:270`](src/lib/api/tfd-types.ts)). **Cada item DEVE incluir
no mínimo:**

```ts
{
  id, data, horaSaida, horaPrevistaRetorno,
  veiculoId, veiculoPlaca, veiculoModelo, veiculoCapacidade,
  motoristaId, motoristaNome,
  destino, unidadeDestino, rotaResumo, kmEstimados,
  kmInicialHodometro, kmFinalHodometro,
  vagasTotais, vagasOcupadas,           // ← contador derivado de passageiros
  status, motivoCancelamento,
  observacoes, criadaEm, iniciadaEm, concluidaEm,
  passageiros: PassageiroViagem[],      // ← obrigatório (ver 12.3 abaixo)
  assentosOcupados: number[],
  prefeituraId
}
```

**Sobre `passageiros` na listagem:**

A tela de listagem (`/tfd/viagens`) **não desenha** os passageiros nas linhas
— só usa `vagasOcupadas/vagasTotais`. Mas o tipo `ViagemFrota` é o **mesmo**
em listagem e detalhe (frontend não tem dois shapes), e o detalhe (`[id]`)
precisa de `passageiros` populado.

Recomendação: **devolver `passageiros: []` (array vazio) na listagem** se a
performance for problema, e popular completamente no `GET /:id`. Hoje o
frontend só lê `passageiros` na rota de detalhe — listagem ignora. Mas o
campo precisa **existir** no JSON (não pode ser `null` ou ausente).

**Ordenação default:** `data DESC, horaSaida DESC` — frontend exibe a tabela
na ordem que o backend devolveu. Se quiser, o backend pode aceitar
`?sort=data:asc|desc`. Por enquanto, ordem cronológica reversa é o esperado.

**Histórico de "viagens já encerradas":** o frontend usa o filtro de status
local (`filtro = 'CONCLUIDA'` ou `'CANCELADA'`). Não precisa de endpoint
`/historico` separado.

### 12.2 ☐ `POST /tfd/viagens` → `ViagemFrota`

Body: `CriarViagemRequest { data, horaSaida, horaPrevistaRetorno?, veiculoId? OR placa?, motoristaId, destino, ..., vagasTotais?, observacoes?, prefeituraId? }`.
Calcular `vagasTotais` a partir de `veiculo.capacidade` se omitido. Status inicial: `AGENDADA`.
Resposta inclui `passageiros: []` (array vazio).

### 12.3 ☐ `GET /tfd/viagens/:id` → `ViagemFrota` ⭐ (com passageiros completos)

**Esta é a rota crítica para o "ao abrir mostrar quem viajou ou faltou".**

A resposta DEVE incluir o array `passageiros: PassageiroViagem[]` totalmente
populado. Tipo em [`tfd-types.ts:254`](src/lib/api/tfd-types.ts):

```ts
interface PassageiroViagem {
	id: string; // UUID do registro de passageiro
	solicitacaoId: string; // FK para a SolicitacaoTFD original
	protocolo: string | null; // protocolo da solicitação (TFD-2026-XXX)
	pacienteId: string;
	pacienteNome: string | null; // join com paciente
	pacienteCpf: string | null;
	especialidade: string | null; // join com solicitacao.especialidade
	prioridade: PrioridadeTFD | null; // 'ELETIVA' | 'PRIORITARIA' | 'URGENTE'
	numeroAssento: number | null; // 1..vagasTotais
	acompanhante: boolean; // copiado da solicitação
	presenca: PresencaPassageiro; // ⭐ campo principal
	observacao: string | null; // anotação do operador ao marcar presença
	marcadoEm: string | null; // ISO 8601 do último update de presença
}

type PresencaPassageiro =
	| 'AGUARDANDO' // default ao alocar — antes da viagem
	| 'CONFIRMADO' // operador confirmou ainda em fase de planejamento
	| 'EMBARCADO' // ✅ "viajou" — efetivamente embarcou
	| 'AUSENTE' // ❌ "faltou" — não compareceu
	| 'DESISTIU'; // ⚠ desistiu (desmarcação tardia)
```

**Importante:** os JOINs devem ser feitos **server-side** no backend — o
frontend espera `pacienteNome`, `protocolo`, `especialidade`, `prioridade`
já preenchidos. Se vier `null`, a UI mostra `—` mas perde informação.

**Ordenação dos passageiros:** o frontend ordena por `numeroAssento ASC`
(linha 455 de `+page.svelte`). Backend pode devolver na ordem que quiser,
mas é boa prática já vir ordenado.

**Cálculos derivados que o backend deve manter consistentes:**

- `vagasOcupadas = passageiros.length` (excluindo presença=`DESISTIU`? — ver decisão abaixo).
- `assentosOcupados = passageiros.map(p => p.numeroAssento).filter(n => n != null)`.

> **Decisão de produto a confirmar:** se um passageiro `DESISTIU` ele continua
> contando em `vagasOcupadas`? Hoje o frontend trata `vagasOcupadas` como
> "alocados" (qualquer presença ≠ removido). Recomendação: **incluir**, e
> apenas exibir presença DESISTIU como flag visual. Para cancelar a alocação
> de fato, usa `DELETE .../passageiros/:id` (12.9).

### 12.4 ☐ `PATCH /tfd/viagens/:id` → `ViagemFrota`

Body: `AtualizarViagemRequest`. Permitido apenas em `AGENDADA`.

### 12.5 ☐ `POST /tfd/viagens/:id/iniciar` → `ViagemFrota`

Body: `IniciarViagemRequest { kmInicialHodometro }`. AGENDADA → EM_ANDAMENTO. Atualiza hodometro do veículo.

**Side effect sugerido:** todos os passageiros com presença = `AGUARDANDO`
podem virar automaticamente `CONFIRMADO` (operador "encerrou planejamento").
Frontend não exige isso, mas é coerente com o fluxo.

### 12.6 ☐ `POST /tfd/viagens/:id/concluir` → `ViagemFrota`

Body: `ConcluirViagemRequest { kmFinalHodometro, observacoes? }`. EM_ANDAMENTO → CONCLUIDA. Atualiza hodometro + computa `kmRodados`.

**Side effect:** após CONCLUIDA, mover cada `solicitacao` dos passageiros
com `presenca = EMBARCADO` para status `REALIZADA`. Solicitações de passageiros
`AUSENTE`/`DESISTIU` ficam com status que o gestor decidir (sugestão:
voltam para `APROVADA` se quiser remarcar, ou novo status `NAO_COMPARECEU`).

### 12.7 ☐ `POST /tfd/viagens/:id/cancelar` → `ViagemFrota`

Body: `{ motivo: string }`. Reverte cada solicitação alocada para `APROVADA`
(remove `viagemId`).

### 12.8 ☐ `POST /tfd/viagens/:id/passageiros` → `ViagemFrota`

Body: `AlocarPassageiroRequest { solicitacaoId, numeroAssento? }`.

- Permitido apenas em status `AGENDADA` (frontend só mostra "Alocar" nesse estado).
- Validar capacidade (`vagas_ocupadas < vagas_totais` → senão `422 VAGAS_ESGOTADAS`).
- `numeroAssento` único por viagem (`409 ASSENTO_OCUPADO` se conflito) ou usa próximo livre.
- Move `solicitacao.status` para `ALOCADA` e seta `viagemId`.
- Cria registro em `passageiro_viagem` com `presenca = 'AGUARDANDO'`, `marcadoEm = null`.

### 12.9 ☐ `DELETE /tfd/viagens/:id/passageiros/:passageiroId` → `ViagemFrota`

Permitido apenas com viagem `AGENDADA` (botão "Remover" só aparece nesse estado — linha 510 de `+page.svelte`).

- Remove (ou soft-delete) o `passageiro_viagem`.
- Reverte `solicitacao.status` para `APROVADA` (`viagemId = null`).

### 12.10 ☐ `POST /tfd/viagens/:id/passageiros/:passageiroId/presenca` → `ViagemFrota` ⭐

Body: `MarcarPresencaRequest`:

```ts
{
  presenca: 'CONFIRMADO' | 'EMBARCADO' | 'AUSENTE' | 'DESISTIU';
  observacao?: string;
}
```

**Note:** `'AGUARDANDO'` **não** está no body — é o estado inicial,
não pode ser definido manualmente.

**Permitido em viagens com status:** `AGENDADA` ou `EM_ANDAMENTO`.
Em `CONCLUIDA` ou `CANCELADA`, retornar `422 PRESENCA_NAO_PERMITIDA`.

**Atualizar `marcadoEm = now()`** e gravar `observacao`.

**Auditoria:** registrar `PRESENCA_MARCADA` com `antes/depois` em
`paciente_prontuario_audit` (ou tabela TFD equivalente — ver §18).

**Resposta:** `ViagemFrota` completo (re-serializar com a lista atualizada
de passageiros) — o frontend usa essa resposta para reativar a tabela
sem refetch.

---

### 12.11 Schema sugerido — passageiros + presença

```sql
CREATE TYPE presenca_passageiro AS ENUM (
  'AGUARDANDO', 'CONFIRMADO', 'EMBARCADO', 'AUSENTE', 'DESISTIU'
);

CREATE TABLE passageiro_viagem (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id       uuid NOT NULL REFERENCES viagem_tfd(id) ON DELETE CASCADE,
  solicitacao_id  uuid NOT NULL REFERENCES solicitacao_tfd(id),
  paciente_id     uuid NOT NULL REFERENCES paciente(id),
  numero_assento  int  CHECK (numero_assento >= 1),
  acompanhante    boolean NOT NULL DEFAULT false,
  presenca        presenca_passageiro NOT NULL DEFAULT 'AGUARDANDO',
  observacao      text,
  marcado_em      timestamptz,                    -- null até primeira marcação
  marcado_por     uuid REFERENCES usuario(id),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  deletado_em     timestamptz,
  UNIQUE (viagem_id, solicitacao_id) WHERE deletado_em IS NULL,
  UNIQUE (viagem_id, numero_assento) WHERE deletado_em IS NULL AND numero_assento IS NOT NULL
);

CREATE INDEX idx_passageiro_viagem_v ON passageiro_viagem (viagem_id) WHERE deletado_em IS NULL;
CREATE INDEX idx_passageiro_viagem_p ON passageiro_viagem (paciente_id, marcado_em DESC);
```

**Histórico de presença por paciente** (para futura tela "histórico de
viagens do paciente X"): basta `SELECT … FROM passageiro_viagem WHERE
paciente_id = ? ORDER BY criado_em DESC`. Não precisa endpoint dedicado
hoje — frontend não consome ainda.

### 12.12 Computar contadores

Se quiser **stats agregadas** sem trazer todas as viagens (otimização
futura — frontend ainda não chama), exponha:

```
GET /tfd/viagens/stats?desde=&ate=
```

Resposta sugerida (forma livre — não há contrato no frontend ainda):

```json
{
	"totalViagens": 142,
	"porStatus": { "AGENDADA": 8, "EM_ANDAMENTO": 2, "CONCLUIDA": 120, "CANCELADA": 12 },
	"totalPassageirosEmbarcados": 856,
	"totalAusentes": 34,
	"totalDesistiu": 12,
	"kmRodadosTotal": 18420,
	"periodo": { "desde": "2026-01-01", "ate": "2026-04-30" }
}
```

Hoje **não é necessário** — o dashboard TFD calcula tudo localmente a partir
de `GET /tfd/viagens` ([`tfd/dashboard/+page.svelte:27`](src/routes/tfd/dashboard/+page.svelte)).

---

---

## 13. TFD · Abastecimento

Consumidos em [`/tfd/abastecimento`](src/routes/tfd/abastecimento/).

### 13.1 ☐ `GET /tfd/abastecimentos?status=&veiculoId=&desde=&ate=` → `Abastecimento[]`

### 13.2 ☐ `POST /tfd/abastecimentos` → `Abastecimento`

Body: `SolicitarAbastecimentoRequest`. Dois modos:

- **Balcão:** só `valorEstimado`.
- **Cálculo:** `litrosEstimados` + `valorPorLitroEstimado` → backend multiplica.

Reservar saldo no `paciente_viagem` ou veículo (`saldoReservado` aumenta).

### 13.3 ☐ `POST /tfd/abastecimentos/:id/liberar` → `Abastecimento`

Body: `{ observacao?: string }`. SOLICITADO → LIBERADO.

### 13.4 ☐ `POST /tfd/abastecimentos/:id/negar` → `Abastecimento`

Body: `{ motivo: string }`. Libera saldo reservado.

### 13.5 ☐ `POST /tfd/abastecimentos/:id/comprovante` (multipart) → `Abastecimento`

Body: `file`, `litros`, `valorPorLitro`, `valorTotal`, `hodometroKm`. Aceita `X-Idempotency-Key`.
Status → REALIZADO. Atualiza hodômetro veículo. Calcula `consumoCalcKml = (hodometro - última_leitura) / litros`.

### 13.6 ☐ `GET /tfd/abastecimentos/:id/comprovante` (blob) — download do PDF/JPG

---

## 14. TFD · Saldo da Frota

Consumidos em [`/tfd/saldo`](src/routes/tfd/saldo/).

### 14.1 ☐ `GET /tfd/saldo?mes=YYYY-MM` → `SaldoVeiculo[]`

Listagem por veículo com `saldoMensal`, `saldoConsumido`, `saldoReservado`, `saldoDisponivel`.

### 14.2 ☐ `POST /tfd/saldo/ajustar` → `SaldoVeiculo`

Body: `AjustarSaldoRequest { veiculoId, mes, novoSaldoMensal, justificativa }`.
**Sobrescreve** o saldo do mês.

### 14.3 ☐ `POST /tfd/saldo/aportar` → `AporteSaldoFrota[]`

Body: `AporteSaldoFrotaRequest { veiculoId? OR rateioGeral?, mes, valorBRL, fonte: FonteRecurso, ..., justificativa }`.
**Crédito** (não sobrescreve). Se `rateioGeral=true`, retorna N entries com mesmo `grupoRateioId`.
Aceita `X-Idempotency-Key`.

### 14.4 ☐ `GET /tfd/saldo/aportes?mes=` → `AporteSaldoFrota[]`

---

## 15. TFD · Saldo de Ajuda de Custo

Consumidos em [`/tfd/saldo-ajuda-custo`](src/routes/tfd/saldo-ajuda-custo/).

### 15.1 ☐ `GET /tfd/saldo-ajuda-custo?mes=` → `SaldoAjudaCusto`

**Pote único** por (prefeitura, mês) — não é por veículo. Inclui tetos por categoria.

### 15.2 ☐ `POST /tfd/saldo-ajuda-custo/ajustar` → `SaldoAjudaCusto`

### 15.3 ☐ `POST /tfd/saldo-ajuda-custo/aportar` → `AporteSaldoAjudaCusto`

Aceita `X-Idempotency-Key`.

### 15.4 ☐ `GET /tfd/saldo-ajuda-custo/aportes?mes=` → `AporteSaldoAjudaCusto[]`

---

## 16. TFD · Ajudas de Custo

Consumidos em [`/tfd/ajuda-custo`](src/routes/tfd/ajuda-custo/).

### 16.1 ☐ `GET /tfd/ajudas-custo?status=&pacienteId=` → `AjudaCusto[]`

### 16.2 ☐ `GET /tfd/ajudas-custo/:id` → `AjudaCusto`

### 16.3 ☐ `POST /tfd/ajudas-custo` → `AjudaCusto`

Body: `SolicitarAjudaCustoRequest { viagemId, pacienteId, itens: ItemAjudaCusto[], prefeituraId? }`.
Validar tetos por categoria contra `SaldoAjudaCusto`.
Computar `valorTotal = soma(itens.valorBRL)`. Status inicial: `PENDENTE`.

### 16.4 ☐ `POST /tfd/ajudas-custo/:id/autorizar` → `AjudaCusto`

PENDENTE → AUTORIZADA. Reservar saldo (`saldoReservado` ↑).

### 16.5 ☐ `POST /tfd/ajudas-custo/:id/pagar` (multipart) → `AjudaCusto`

Body: `file` (comprovante), `metodoPagamento: 'PIX' | 'TRANSFERENCIA' | 'DINHEIRO_RH'`.
Aceita `X-Idempotency-Key`. AUTORIZADA → PAGA. Move `saldoReservado` → `saldoConsumido`.

### 16.6 ☐ `POST /tfd/ajudas-custo/:id/negar` → `AjudaCusto`

Body: `{ motivo: string }`. Libera reserva se já estava AUTORIZADA.

---

## 17. TFD · Relatórios analíticos

### 17.1 ☐ `GET /tfd/relatorios/especialidades?desde=&ate=&prefeituraId=` → `RelatorioEspecialidadeResposta`

Agregação por especialidade: total solicitações, realizadas, pendentes, negadas; pacientes únicos; destinos mais frequentes; custo estimado total e ticket médio. Janela default: últimos 12 meses.

---

## 18. TFD · Auditoria

### 18.1 ☐ `GET /tfd/auditoria?recursoTipo=&recursoId=&desde=&ate=&prefeituraId=` → `RegistroAuditoriaTFD[]`

Cada registro inclui `hashAnterior` + `hash` (SHA-256 da linha + hash da anterior).

### 18.2 ☐ `GET /tfd/auditoria/:id` → `RegistroAuditoriaTFD`

### 18.3 ☐ `GET /tfd/auditoria/verificar?prefeituraId=` → `{ total: number; corrompidos: string[] }`

Verifica integridade da hash-chain. `prefeituraId` opcional (DEV/ADMIN_GLOBAL apontando para outra).

### 18.4 ☐ `GET /tfd/auditoria/exportar-tj?mes=YYYY-MM` (blob ZIP)

ZIP com `manifest.json` + 5 CSVs + assinatura quando ICP-Brasil. `Content-Disposition` com filename.

---

## 19. RBAC consolidada

> **Princípio:** frontend esconde botões via flags do `AuthContext`
> (`auth.podeConsolidarEncaminhamento`, `auth.ehAdminOuDev`, etc.) — **defesa em
> profundidade**. Backend é a fonte da verdade.

### Recursos × roles (✅ permite, ❌ bloqueia)

| Endpoint                                        | ATEND_UBS | COORD_UBS | REGUL_SMS | REGUL_TFD | GESTOR_TFD | ADMIN | DEV |
| ----------------------------------------------- | :-------: | :-------: | :-------: | :-------: | :--------: | :---: | :-: |
| **AUTH / PERFIL**                               |           |           |           |           |            |       |     |
| `GET /auth/me`, `GET /me/profile`               |    ✅     |    ✅     |    ✅     |    ✅     |     ✅     |  ✅   | ✅  |
| `POST /me/password`                             |    ✅     |    ✅     |    ✅     |    ✅     |     ✅     |  ✅   | ✅  |
| **DASHBOARD UBS**                               |           |           |           |           |            |       |     |
| `GET /dashboard/metrics`                        |    ✅     |    ✅     |    ❌     |    ❌     |     ❌     |  ✅   | ✅  |
| **ENCAMINHAMENTOS UBS**                         |           |           |           |           |            |       |     |
| `POST /encaminhamentos` (criar)                 |    ✅     |    ✅     |    ❌     |    ❌     |     ❌     |  ✅   | ✅  |
| `GET /encaminhamentos`                          |    ✅     |    ✅     |    ✅     |    ❌     |     ❌     |  ✅   | ✅  |
| `PATCH /encaminhamentos/:id`                    |    ✅     |    ✅     |    ❌     |    ❌     |     ❌     |  ✅   | ✅  |
| `POST /encaminhamentos/:id/resolve-pendencia`   |    ✅     |    ✅     |    ❌     |    ❌     |     ❌     |  ✅   | ✅  |
| **ENCAMINHAMENTOS SMS** (regulação)             |           |           |           |           |            |       |     |
| `POST /encaminhamentos/:id/aprovar`             |    ❌     |    ❌     |    ✅     |    ❌     |     ❌     |  ✅   | ✅  |
| `POST /encaminhamentos/:id/registrar-pendencia` |    ❌     |    ❌     |    ✅     |    ❌     |     ❌     |  ✅   | ✅  |
| `POST /encaminhamentos/:id/rejeitar`            |    ❌     |    ❌     |    ✅     |    ❌     |     ❌     |  ✅   | ✅  |
| `POST /encaminhamentos/:id/resposta-sus`        |    ❌     |    ❌     |    ✅     |    ❌     |     ❌     |  ✅   | ✅  |
| `GET /encaminhamentos/arvore`                   |    ❌     |    ❌     |    ✅     |    ❌     |     ❌     |  ✅   | ✅  |
| **PACIENTES** (cadastro + prontuário)           |           |           |           |           |            |       |     |
| `GET /pacientes`, `GET /pacientes/:id`          | ✅ (UBS)  | ✅ (UBS)  |    ✅     | ✅ (TFD)  |  ✅ (TFD)  |  ✅   | ✅  |
| `PATCH /pacientes/:id`                          |    ✅     |    ✅     |    ❌     |    ❌     |     ❌     |  ✅   | ✅  |
| Sub-doc POST/PATCH (prontuário)                 |    ✅     |    ✅     |    ❌     |    ❌     |     ❌     |  ✅   | ✅  |
| Sub-doc DELETE (prontuário)                     |    ❌     |    ✅     |    ❌     |    ❌     |     ❌     |  ✅   | ✅  |
| Viagem TFD POST/PATCH (sub-doc)                 |    ❌     |    ✅     |    ✅     |    ✅     |     ✅     |  ✅   | ✅  |
| Viagem TFD DELETE (sub-doc)                     |    ❌     |    ❌     |    ❌     |    ❌     |     ❌     |  ✅   | ✅  |
| **RELATÓRIOS UBS**                              |           |           |           |           |            |       |     |
| `GET/POST /relatorios`                          |    ✅     |    ✅     |    ✅     |    ❌     |     ❌     |  ✅   | ✅  |
| **ADMIN**                                       |           |           |           |           |            |       |     |
| `*** /admin/prefeituras`                        |    ❌     |    ❌     |    ❌     |    ❌     |     ❌     | ✅(R) | ✅  |
| `*** /admin/ubs`                                |    ❌     |    ❌     |    ❌     |    ❌     |     ❌     |  ✅   | ✅  |
| `*** /admin/usuarios`                           |    ❌     |    ❌     |    ❌     |    ❌     |     ❌     |  ✅   | ✅  |
| **TFD · Cadastros (frota/motoristas)**          |           |           |           |           |            |       |     |
| `GET /tfd/{veiculos,motoristas}`                |    ❌     |    ❌     |    ❌     |    ✅     |     ✅     |  ✅   | ✅  |
| `POST/PATCH/DELETE /tfd/{veiculos,motoristas}`  |    ❌     |    ❌     |    ❌     |    ❌     |     ✅     |  ✅   | ✅  |
| **TFD · Solicitações**                          |           |           |           |           |            |       |     |
| `GET/POST /tfd/solicitacoes`                    |    ❌     |    ❌     |    ❌     |    ✅     |     ✅     |  ✅   | ✅  |
| `POST .../aprovar`, `.../negar`                 |    ❌     |    ❌     |    ❌     |    ❌     |     ✅     |  ✅   | ✅  |
| `POST .../anexos`                               |    ❌     |    ❌     |    ❌     |    ✅     |     ✅     |  ✅   | ✅  |
| **TFD · Viagens**                               |           |           |           |           |            |       |     |
| `GET /tfd/viagens`                              |    ❌     |    ❌     |    ❌     |  ✅ (R)   |     ✅     |  ✅   | ✅  |
| `POST/PATCH /tfd/viagens`                       |    ❌     |    ❌     |    ❌     |    ❌     |     ✅     |  ✅   | ✅  |
| `POST .../{iniciar,concluir,cancelar}`          |    ❌     |    ❌     |    ❌     |    ❌     |     ✅     |  ✅   | ✅  |
| `POST/DELETE .../passageiros/*`                 |    ❌     |    ❌     |    ❌     |    ❌     |     ✅     |  ✅   | ✅  |
| `POST .../passageiros/:id/presenca`             |    ❌     |    ❌     |    ❌     |    ❌     |     ✅     |  ✅   | ✅  |
| **TFD · Abastecimento**                         |           |           |           |           |            |       |     |
| `GET /tfd/abastecimentos`                       |    ❌     |    ❌     |    ❌     |    ❌     |     ✅     |  ✅   | ✅  |
| `POST /tfd/abastecimentos` (solicitar)          |    ❌     |    ❌     |    ❌     |    ❌     |     ✅     |  ✅   | ✅  |
| `POST .../liberar`, `.../negar`                 |    ❌     |    ❌     |    ❌     |    ❌     |     ❌     |  ✅   | ✅  |
| `POST .../comprovante`                          |    ❌     |    ❌     |    ❌     |    ❌     |     ✅     |  ✅   | ✅  |
| **TFD · Saldo (frota e ajuda de custo)**        |           |           |           |           |            |       |     |
| `GET /tfd/saldo*`                               |    ❌     |    ❌     |    ❌     |    ❌     |     ✅     |  ✅   | ✅  |
| `POST /tfd/saldo/{ajustar,aportar}`             |    ❌     |    ❌     |    ❌     |    ❌     |     ❌     |  ✅   | ✅  |
| **TFD · Ajudas de custo**                       |           |           |           |           |            |       |     |
| `GET /tfd/ajudas-custo`                         |    ❌     |    ❌     |    ❌     |    ✅     |     ✅     |  ✅   | ✅  |
| `POST /tfd/ajudas-custo` (solicitar)            |    ❌     |    ❌     |    ❌     |    ❌     |     ✅     |  ✅   | ✅  |
| `POST .../autorizar`, `.../negar`               |    ❌     |    ❌     |    ❌     |    ❌     |     ✅     |  ✅   | ✅  |
| `POST .../pagar`                                |    ❌     |    ❌     |    ❌     |    ❌     |     ❌     |  ✅   | ✅  |
| **TFD · Relatórios e Auditoria**                |           |           |           |           |            |       |     |
| `GET /tfd/relatorios/especialidades`            |    ❌     |    ❌     |    ❌     |    ❌     |     ✅     |  ✅   | ✅  |
| `GET /tfd/auditoria*`                           |    ❌     |    ❌     |    ❌     |    ❌     |     ✅     |  ✅   | ✅  |
| `GET /tfd/auditoria/exportar-tj`                |    ❌     |    ❌     |    ❌     |    ❌     |     ❌     |  ✅   | ✅  |

(R) = leitura. (✅ UBS) = limitado à própria UBS. (✅ R) = só Read.

> **Regra global:** `ATENDENTE_UBS` e `COORDENADOR_UBS` operam **apenas
> dentro da própria UBS**. `ADMIN` opera dentro da própria prefeitura.
> `DESENVOLVEDOR` opera cross-prefeitura.

---

## 20. Códigos de erro

Lista completa em [`types.ts ErrorCode`](src/lib/api/types.ts) (linha 805) e
[`erros-tfd.ts`](src/lib/api/erros-tfd.ts) (TFD-específicos). Resumo dos códigos
que o backend deve emitir:

### Auth

- `CREDENCIAIS_INVALIDAS` (401) · `USUARIO_INATIVO` / `USUARIO_BLOQUEADO` (403)
- `SENHA_EXPIRADA` (403) · `SENHA_FRACA` / `SENHA_ATUAL_INCORRETA` (400/401)
- `TOKEN_AUSENTE` / `TOKEN_EXPIRADO` / `TOKEN_INVALIDO` / `NAO_AUTENTICADO` / `SESSAO_INDETERMINADA` (401)

### Escopo / RBAC

- `PERMISSAO_INSUFICIENTE` (403) · `FORA_DO_ESCOPO` (403)
- `USUARIO_SEM_UBS` / `USUARIO_SEM_PREFEITURA` (400)

### Uploads

- `ARQUIVO_INVALIDO` (400) · `ARQUIVO_MUITO_GRANDE` (413) · `MIME_NAO_SUPORTADO` (415)

### Payload

- `PAYLOAD_AUSENTE` / `PAYLOAD_INVALIDO` (400)
- `DADOS_OBRIGATORIOS_AUSENTES` (400)

### Encaminhamentos

- `ENCAMINHAMENTO_NAO_ENCONTRADO` (404)
- `ENCAMINHAMENTO_NAO_EM_PENDENCIA` (409)
- `NENHUMA_ACAO_FORNECIDA` (400)
- `ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO` (409)
- `OBSERVACAO_OBRIGATORIA` / `MOTIVO_OBRIGATORIO` (400)
- `AGENDAMENTO_INVALIDO` / `AGENDAMENTO_NO_PASSADO` (422)
- `ENCAMINHAMENTO_NAO_APROVADO` (409) · `RESPOSTA_SUS_JA_REGISTRADA` (409)
- `PDF_RESPOSTA_OBRIGATORIO` (400)

### Anexos

- `ANEXO_NAO_ENCONTRADO` (404) · `ANEXO_NAO_LIBERADO` (409 — scan != LIMPO)

### Edição

- `EDICAO_NAO_PERMITIDA` (403) · `NENHUMA_ALTERACAO` (400) · `JUSTIFICATIVA_VAZIA` (400)

### Pacientes / prontuário (sugeridos — não estão todos em `ErrorCode` ainda)

- `PACIENTE_NAO_ENCONTRADO` (404) · `ITEM_NAO_ENCONTRADO` (404)
- `ITEM_DUPLICADO` (409) · `VACINA_DUPLICADA` (409)
- `CID_INVALIDO` (422) · `DATA_INVALIDA` (422)
- `HISTORICO_FAMILIAR_MUITO_LONGO` (422) · `TRANSICAO_INVALIDA` (422)

### App do paciente

- `CONTA_NAO_ATIVADA` / `CONTA_JA_ATIVADA` / `CONTA_NAO_ENCONTRADA` / `CONTA_INATIVA`
- `CONFIRMACAO_INVALIDA` · `NOTIFICACAO_NAO_ENCONTRADA`

### Admin

- `PREFEITURA_OBRIGATORIA` / `UBS_OBRIGATORIA` (400)
- `PREFEITURA_DUPLICADA` / `UBS_DUPLICADA` / `USUARIO_DUPLICADO` (409)
- `PREFEITURA_NAO_ENCONTRADA` / `UBS_NAO_ENCONTRADA` / `ATENDENTE_NAO_ENCONTRADO` (404)
- `AUTO_EXCLUSAO_PROIBIDA` / `AUTO_DESATIVACAO_PROIBIDA` (403)

### TFD-específicos (frontend já trata em [`erros-tfd.ts`](src/lib/api/erros-tfd.ts))

- `VEICULO_DUPLICADO` (placa repetida) · `VEICULO_INATIVO`
- `MOTORISTA_DUPLICADO` (CPF/CNH) · `CNH_VENCIDA`
- `SALDO_INSUFICIENTE` (422) · `TETO_AJUDA_EXCEDIDO` (422)
- `VAGAS_ESGOTADAS` (422) · `ASSENTO_OCUPADO` (409)
- `IDEMPOTENCIA_REUSO` (200 — devolve resposta original)

### Relatórios

- `RELATORIO_NAO_ENCONTRADO` (404) · `RELATORIO_NAO_DISPONIVEL` (409)

### Generic

- `RATE_LIMIT` (429) · `ERRO_INTERNO` (500)
- `PARAMS_INCOMPATIVEIS` (400)

---

## 21. Como verificar contra o backend

Para cada linha com `☐` neste documento:

1. **Existência:** o endpoint está roteado? (`grep -r "/v1/<path>" backend/src/`)
2. **Verbo HTTP correto:** GET vs POST vs PATCH vs PUT vs DELETE.
3. **Auth gating:** middleware de role aplicado conforme [§19](#19-rbac-consolidada).
4. **Schema validado:** Zod/class-validator casa exatamente com os DTOs em
   [`types.ts`](src/lib/api/types.ts) e [`tfd-types.ts`](src/lib/api/tfd-types.ts).
5. **Forma de resposta:** `JSON.stringify` da resposta deve casar com o tipo
   esperado pelo client (sem campos a mais, sem campos a menos).
6. **Códigos de erro:** o ErrorBody segue [§0.7](#07-formato-padrão-de-erro)
   e o `code` está na lista de [§20](#20-códigos-de-erro).
7. **Multi-tenancy:** filtro por `prefeituraId` (e `ubsId` quando aplicável)
   aplicado.
8. **Soft-delete + auditoria** quando o domínio exigir (prontuário, TFD).

### Comandos rápidos para auditar o backend

```bash
# Quais rotas o backend já expõe?
grep -RhE "(get|post|patch|put|delete)\(.*('/v1|'/paciente-app)" backend/src/ \
  | sed -E "s/.*\\.(get|post|patch|put|delete)\\(['\"]([^'\"]+)['\"].*/\\U\\1\\E \\2/" \
  | sort -u

# Comparar com o que o frontend chama
grep -nE "this\.api\.(get|post|patch|put|delete|getBlob|postMultipart)\\b" \
  frontend/src/lib/api/client.ts \
  | sed -E "s/.*\\.(get|post|patch|put|delete|getBlob|postMultipart)\\b[^']*['\"]([^'\"]+)['\"].*/\\U\\1\\E \\2/" \
  | sort -u

# diff lado a lado para achar gaps
diff <(...backend...) <(...frontend...)
```

---

## 22. Roadmap pendente (não-bloqueante)

Recursos planejados que **não** quebram o frontend hoje (frontend ainda não
consome). Listar aqui só para alinhamento futuro:

- `GET /pacientes/:id/atendimentos?desde=&ate=` (paginação por sub-recurso)
- `POST /pacientes/:id/exames/:exameId/laudo` (upload de laudo PDF)
- WebSocket / SSE para `events` em vez de polling de relatórios
- Assinatura ICP-Brasil em PDFs do prontuário (CFM 1.821/2007)
- Hash-chain estendida da auditoria do prontuário (já existe em TFD)
- Resposta paginada `{ data, meta }` para listagens grandes
- Endpoint de transferência de paciente entre UBSs

---

## 23. Resumo executivo

**O que o frontend espera consumir hoje:** **127 endpoints HTTP** distribuídos em
4 faces (UBS, SMS, TFD, App do Paciente) + Admin + Auth.

**Princípios universais que o backend DEVE seguir:**

1. **`PacienteCompleto` em toda mutação de prontuário** — frontend faz `ctx.atualizar()` e renderiza tudo.
2. **404, não 403, em violação de tenant** — proteção contra enumeration.
3. **Soft-delete** em prontuário (CFM 1.821/2007 = 20 anos) e TFD (transparência fiscal).
4. **Hash-chain de auditoria** no TFD (export TJ); estender para prontuário é roadmap.
5. **Idempotência via `X-Idempotency-Key`** em endpoints monetários.
6. **Scan AV em todo upload** com `scanStatus` exposto na entidade; download bloqueado se != LIMPO.
7. **Multipart só onde a UI envia arquivo + JSON juntos** — caso contrário JSON puro.
8. **Datas isoladas em `YYYY-MM-DD`, timestamps em ISO 8601 UTC.**

---

_Versão deste doc: v1 · Frontend referência: pós v0.10 (TFD) + v0.7 (prontuário) · Atualizado: 2026-04-30._
