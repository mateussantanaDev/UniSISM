# UNISISM · Prontuário do Paciente · Especificação Backend

> Guia de implementação do backend para suportar **registro completo** do
> prontuário do paciente — alergias, condições crônicas, medicamentos,
> histórico familiar, atendimentos, exames, vacinação e viagens TFD.
>
> **Status do frontend (UBS · v0.7.0+):** UI, tipos, client HTTP e fluxos
> de modais já estão prontos em
> [`src/lib/presentation/components/prontuario/*`](src/lib/presentation/components/prontuario/),
> [`src/lib/api/types.ts`](src/lib/api/types.ts) e
> [`src/lib/api/client.ts`](src/lib/api/client.ts) (classe `PacientesApi`).
> **Quando o backend subir as rotas listadas abaixo, nada muda no frontend
> — só liga.**
>
> Documento companheiro: [`PRONTUARIO_PACIENTE.md`](PRONTUARIO_PACIENTE.md)
> (perspectiva do frontend).

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Convenções](#2-convenções)
3. [Schema sugerido (PostgreSQL)](#3-schema-sugerido-postgresql)
4. [Cadastro do paciente](#4-cadastro-do-paciente)
5. [Quadro clínico](#5-quadro-clínico)
6. [Atendimentos](#6-atendimentos)
7. [Exames](#7-exames)
8. [Vacinação](#8-vacinação)
9. [Viagens TFD](#9-viagens-tfd)
10. [Matriz RBAC](#10-matriz-rbac)
11. [Auditoria (Res. CFM 1.821/2007)](#11-auditoria)
12. [Códigos de erro](#12-códigos-de-erro)
13. [Checklist de entrega](#13-checklist-de-entrega)

---

## 1. Visão geral

Todas as entidades do prontuário são **sub-documentos de `Paciente`** —
nascem com `id` UUID atribuído pelo backend e vivem em rotas aninhadas:

```
/v1/pacientes/:pacienteId/<recurso>[/:recursoId]
```

### 1.1 Princípio fundamental: resposta sempre completa

**Todas as rotas POST / PATCH / PUT / DELETE listadas neste documento
DEVEM retornar `PacienteCompleto` no corpo da resposta.**

Isso elimina refetch no cliente — o frontend faz `ctx.atualizar(resposta)`
e todas as abas/badges/contadores se reativam por reactivity de runes.
A única operação que pode usar `204 No Content` seria DELETE; mas como
o frontend já espera `PacienteCompleto` em DELETE, mantenha 200 + body.

### 1.2 Total de rotas

| Recurso             | POST | PATCH/PUT | DELETE | Total |
| ------------------- | :--: | :-------: | :----: | :---: |
| Paciente (cadastro) |  —   |    1      |   —    |   1   |
| Alergias            |  1   |    —      |   1    |   2   |
| Condições crônicas  |  1   |    1      |   1    |   3   |
| Medicamentos        |  1   |    1      |   1    |   3   |
| Histórico familiar  |  —   |    1      |   —    |   1   |
| Atendimentos        |  1   |    —      |   1    |   2   |
| Exames              |  1   |    —      |   1    |   2   |
| Vacinação           |  1   |    —      |   1    |   2   |
| Viagens TFD         |  1   |    1      |   1    |   3   |
| **Total**           | **7**| **5**     | **7**  |**19** |

(+1 do PATCH `/pacientes/:id` já existente como contrato em `AtualizarPacienteRequest`.)

---

## 2. Convenções

### 2.1 Base URL e auth

- Base: `https://api.unisism.<município>.gov.br/v1`
- Header: `Authorization: Bearer <jwt>` (todas as rotas autenticadas).
- O JWT carrega `userId`, `role`, `prefeituraId` e `ubsId` (quando aplicável).

### 2.2 Datas

- Calendário (sem hora): `YYYY-MM-DD`
- Timestamps completos: ISO 8601 UTC (`2026-04-30T14:32:18.000Z`)
- Frontend converte para `America/Pernambuco` na apresentação.

### 2.3 Identificadores

- `id` é UUID v4 (string). Gerado pelo backend no POST.
- Protocolos institucionais (ex.: `TFD-2026-000123`) seguem convenção própria
  e são **únicos por prefeitura**.

### 2.4 Multi-tenancy / isolation

Toda rota recebe `pacienteId` no path. O backend DEVE:

1. Resolver `paciente` por `pacienteId`.
2. Validar que o paciente está dentro do escopo do JWT:
   - `ATENDENTE_UBS` / `COORDENADOR_UBS` → mesma UBS
   - `ADMIN` → mesma prefeitura
   - `REGULADOR_SMS` → mesma prefeitura, **leitura apenas** no prontuário
     primário; pode escrever em **TFD**
   - `REGULADOR_TFD` → mesma prefeitura, escopo restrito a TFD
   - `GESTOR_TFD` → mesma prefeitura, **operações TFD**
   - `DESENVOLVEDOR` → tudo
3. Se o paciente não estiver acessível: `404 PACIENTE_NAO_ENCONTRADO`
   (nunca 403 — evita vazamento de existência cross-tenant).

### 2.5 Status HTTP

| Código | Uso                                               |
| ------ | ------------------------------------------------- |
| 200    | GET, PATCH, PUT, DELETE bem-sucedidos (com body)  |
| 201    | POST que cria recurso (com body `PacienteCompleto`) |
| 400    | Payload mal-formado / Zod falhou                  |
| 401    | Sem token / token inválido                        |
| 403    | Autenticado mas sem permissão na ação             |
| 404    | Paciente fora do escopo OU recurso filho inexistente |
| 409    | Duplicata (substância de alergia, protocolo TFD…) |
| 422    | Regra de negócio (transição inválida, data futura…) |
| 500    | Falha não tratada                                 |

### 2.6 Formato de erro padrão

```json
{
  "error": {
    "code": "ITEM_DUPLICADO",
    "message": "Já existe alergia ativa para esta substância.",
    "details": {
      "substancia": "Dipirona",
      "alergiaExistenteId": "9b8c..."
    }
  }
}
```

`code` é um dos valores de [§12](#12-códigos-de-erro). O frontend traduz
códigos conhecidos para mensagens em pt-BR; mensagens novas são exibidas
direto via `e.message` (ver [`erros-tfd.ts`](src/lib/api/erros-tfd.ts) e
[`client.ts`](src/lib/api/client.ts)).

---

## 3. Schema sugerido (PostgreSQL)

Migrações novas — todas em soft-delete (`deletado_em` nullable). Use
`gen_random_uuid()` (ext. `pgcrypto`).

```sql
-- ──────── Alergias ────────
CREATE TABLE paciente_alergia (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id   uuid NOT NULL REFERENCES paciente(id) ON DELETE RESTRICT,
  substancia    text NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN
                  ('MEDICAMENTO','ALIMENTO','AMBIENTAL','OUTRO')),
  gravidade     text NOT NULL CHECK (gravidade IN ('LEVE','MODERADA','GRAVE')),
  observacao    text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  criado_por    uuid NOT NULL REFERENCES usuario(id),
  deletado_em   timestamptz
);
CREATE UNIQUE INDEX uq_paciente_alergia_substancia_ativa
  ON paciente_alergia (paciente_id, lower(substancia))
  WHERE deletado_em IS NULL;

-- ──────── Condições crônicas ────────
CREATE TABLE paciente_condicao_cronica (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id   uuid NOT NULL REFERENCES paciente(id),
  cid10         text NOT NULL,
  descricao     text NOT NULL,
  desde         date NOT NULL,
  ativo         boolean NOT NULL DEFAULT true,
  observacao    text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  criado_por    uuid NOT NULL REFERENCES usuario(id),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deletado_em   timestamptz
);
CREATE UNIQUE INDEX uq_paciente_condicao_cid_ativa
  ON paciente_condicao_cronica (paciente_id, cid10)
  WHERE deletado_em IS NULL AND ativo = true;

-- ──────── Medicamentos em uso ────────
CREATE TABLE paciente_medicamento (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id   uuid NOT NULL REFERENCES paciente(id),
  nome          text NOT NULL,
  dosagem       text NOT NULL,
  frequencia    text NOT NULL,
  desde         date NOT NULL,
  prescritor    text NOT NULL,
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  criado_por    uuid NOT NULL REFERENCES usuario(id),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deletado_em   timestamptz
);

-- ──────── Histórico familiar (lista ordenada de strings) ────────
CREATE TABLE paciente_historico_familiar (
  paciente_id   uuid NOT NULL REFERENCES paciente(id),
  ordem         int  NOT NULL,
  texto         text NOT NULL CHECK (length(texto) BETWEEN 1 AND 200),
  PRIMARY KEY (paciente_id, ordem)
);

-- ──────── Atendimentos ────────
CREATE TABLE paciente_atendimento (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id            uuid NOT NULL REFERENCES paciente(id),
  data                   timestamptz NOT NULL,
  tipo                   text NOT NULL CHECK (tipo IN
                           ('CONSULTA_MEDICA','ENFERMAGEM','VACINACAO',
                            'CURATIVO','ODONTOLOGICO','PROCEDIMENTO','ACOLHIMENTO')),
  profissional           text NOT NULL,
  registro_profissional  text NOT NULL,
  especialidade          text,
  unidade                text NOT NULL,
  queixa_principal       text NOT NULL,
  diagnostico            text,
  cid10                  text,
  conduta                text NOT NULL,
  prescricao_resumo      text,
  criado_em              timestamptz NOT NULL DEFAULT now(),
  criado_por             uuid NOT NULL REFERENCES usuario(id),
  deletado_em            timestamptz
);
CREATE INDEX idx_atendimento_paciente_data
  ON paciente_atendimento (paciente_id, data DESC)
  WHERE deletado_em IS NULL;

-- ──────── Exames ────────
CREATE TABLE paciente_exame (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id        uuid NOT NULL REFERENCES paciente(id),
  data               date NOT NULL,
  tipo               text NOT NULL,
  categoria          text NOT NULL CHECK (categoria IN
                       ('LABORATORIAL','IMAGEM','FUNCIONAL','OUTROS')),
  solicitante        text NOT NULL,
  unidade_executora  text,
  resultado          text NOT NULL CHECK (resultado IN
                       ('NORMAL','ALTERADO','CRITICO','PENDENTE')),
  observacao         text,
  laudo_storage_key  text,            -- futuro: upload de PDF
  criado_em          timestamptz NOT NULL DEFAULT now(),
  criado_por         uuid NOT NULL REFERENCES usuario(id),
  deletado_em        timestamptz
);

-- ──────── Vacinação ────────
CREATE TABLE paciente_vacina (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES paciente(id),
  data        date NOT NULL,
  vacina      text NOT NULL,
  dose        text NOT NULL,
  lote        text NOT NULL,
  aplicador   text NOT NULL,
  unidade     text NOT NULL,
  via         text NOT NULL CHECK (via IN
                ('INTRAMUSCULAR','SUBCUTANEA','ORAL','INTRADERMICA')),
  criado_em   timestamptz NOT NULL DEFAULT now(),
  criado_por  uuid NOT NULL REFERENCES usuario(id),
  deletado_em timestamptz
);
CREATE UNIQUE INDEX uq_paciente_vacina_dose_lote
  ON paciente_vacina (paciente_id, vacina, dose, lote)
  WHERE deletado_em IS NULL;

-- ──────── Viagens TFD ────────
CREATE TABLE paciente_viagem_tfd (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id         uuid NOT NULL REFERENCES paciente(id),
  protocolo           text NOT NULL,
  data_ida            date NOT NULL,
  data_volta          date NOT NULL,
  destino             text NOT NULL,
  unidade_destino     text,
  motivo              text NOT NULL,
  especialidade       text NOT NULL,
  acompanhante        boolean NOT NULL DEFAULT false,
  transporte          text NOT NULL CHECK (transporte IN
                       ('VAN_SMS','AMBULANCIA','PASSAGEM_RODOVIARIA','PASSAGEM_AEREA')),
  status              text NOT NULL DEFAULT 'AGENDADA' CHECK (status IN
                       ('AGENDADA','EM_ANDAMENTO','REALIZADA','CANCELADA')),
  custo_estimado_brl  numeric(12,2) NOT NULL DEFAULT 0 CHECK (custo_estimado_brl >= 0),
  criado_em           timestamptz NOT NULL DEFAULT now(),
  criado_por          uuid NOT NULL REFERENCES usuario(id),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  deletado_em         timestamptz,
  CHECK (data_volta >= data_ida)
);
CREATE UNIQUE INDEX uq_viagem_protocolo_prefeitura
  ON paciente_viagem_tfd (protocolo)
  WHERE deletado_em IS NULL;

-- ──────── Auditoria (ver §11) ────────
CREATE TABLE paciente_prontuario_audit (
  id           bigserial PRIMARY KEY,
  operador_id  uuid NOT NULL REFERENCES usuario(id),
  paciente_id  uuid NOT NULL REFERENCES paciente(id),
  recurso      text NOT NULL,
  recurso_id   uuid,
  acao         text NOT NULL CHECK (acao IN ('CREATE','UPDATE','DELETE')),
  antes        jsonb,
  depois       jsonb,
  ip           inet,
  user_agent   text,
  em           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_paciente_em ON paciente_prontuario_audit (paciente_id, em DESC);
CREATE INDEX idx_audit_operador_em ON paciente_prontuario_audit (operador_id, em DESC);
```

> **Para Prisma:** o `schema.prisma` deve mapear cada tabela acima como
> model. Use `@@map("paciente_alergia")` etc., `@default(uuid())`, e
> índices via `@@index` / `@@unique` com `where:` clause (Prisma 5.x+
> aceita `index … where` via `previewFeatures = ["fullTextIndex","extendedWhereUnique"]`
> ou via raw SQL na migration).

---

## 4. Cadastro do paciente

### 4.1 `PATCH /v1/pacientes/:pacienteId`

Edita campos sociodemográficos do paciente. **Sobrescreve** explicitamente
(diferente do upsert-via-encaminhamento, que só preenche campo vazio).

**Request body** — todos opcionais, ver `AtualizarPacienteRequest` em
[`types.ts:635`](src/lib/api/types.ts):

```ts
{
  nome?: string;
  nomeSocial?: string | null;
  nomeMae?: string;
  nomePai?: string | null;
  dataNascimento?: string;        // YYYY-MM-DD
  sexo?: 'M' | 'F' | 'OUTRO';
  estadoCivil?: 'SOLTEIRO' | 'CASADO' | 'DIVORCIADO' | 'VIUVO' | 'UNIAO_ESTAVEL' | 'OUTRO';
  escolaridade?: string;
  profissao?: string | null;
  racaCor?: 'BRANCA' | 'PRETA' | 'PARDA' | 'AMARELA' | 'INDIGENA' | 'NAO_INFORMADA';
  telefone?: string;
  telefoneSecundario?: string | null;
  email?: string | null;
  endereco?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  grupoSanguineo?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'NAO_INFORMADO';
  agenteComunitario?: string | null;
  microarea?: string | null;
}
```

**Resposta:** `200 OK` com `PacienteCompleto`.

**Regras:**

- `cpf`, `cartaoSus`, `ubsId` e `prefeituraId` **NÃO** são alteráveis aqui
  (transferência tem endpoint próprio futuro).
- Validar formato:
  - `email`: regex padrão.
  - `cep`: 8 dígitos (aceitar com hífen, normalizar).
  - `uf`: 2 letras maiúsculas, lista de UFs do BR.
  - `dataNascimento`: data válida, não futura, `1900 ≤ ano ≤ ano atual`.
- `nomeSocial`/`nomePai`/`telefoneSecundario`/`email`/`profissao`/`agenteComunitario`/`microarea`
  podem receber `null` para limpar.
- Tratar request vazio como `400 NENHUMA_ALTERACAO`.

**Erros:**

- `404 PACIENTE_NAO_ENCONTRADO` (fora do escopo).
- `400 PAYLOAD_INVALIDO` (Zod).
- `400 NENHUMA_ALTERACAO`.
- `403 PERMISSAO_INSUFICIENTE` (REGULADOR_SMS / REGULADOR_TFD).

---

## 5. Quadro clínico

### 5.1 Alergias — 2 endpoints

#### `POST /v1/pacientes/:pacienteId/alergias`

Consumido em [`RegistrarAlergia.svelte`](src/lib/presentation/components/prontuario/RegistrarAlergia.svelte).

**Request** (`CriarAlergiaRequest` em [`types.ts:861`](src/lib/api/types.ts)):

```ts
{
  substancia: string;                      // obrigatório, trim, ≥1 char
  tipo: 'MEDICAMENTO' | 'ALIMENTO' | 'AMBIENTAL' | 'OUTRO';
  gravidade: 'LEVE' | 'MODERADA' | 'GRAVE';
  observacao?: string;                     // opcional
}
```

**Resposta:** `201 Created` → `PacienteCompleto`.

**Validações:**

- `substancia.trim().length ≥ 1` (frontend já trima).
- Comparação case-insensitive ao detectar duplicata.

**Erros específicos:**

- `409 ITEM_DUPLICADO` — já existe alergia ativa com mesma `substancia`
  (case-insensitive). Detalhe: `{ alergiaExistenteId, substancia }`.

#### `DELETE /v1/pacientes/:pacienteId/alergias/:alergiaId`

**Resposta:** `200 OK` → `PacienteCompleto`.

**Comportamento:** soft delete (alergia é crítica — preservar histórico).

**Erros:** `404 ITEM_NAO_ENCONTRADO`.

---

### 5.2 Condições crônicas — 3 endpoints

#### `POST /v1/pacientes/:pacienteId/condicoes-cronicas`

Consumido em [`RegistrarCondicaoCronica.svelte`](src/lib/presentation/components/prontuario/RegistrarCondicaoCronica.svelte).

**Request** (`CriarCondicaoCronicaRequest`):

```ts
{
  cid10: string;          // OBRIGATÓRIO. Frontend já uppercase
  descricao: string;      // OBRIGATÓRIO
  desde: string;          // YYYY-MM-DD
  ativo?: boolean;        // default true
  observacao?: string;
}
```

**Resposta:** `201 Created` → `PacienteCompleto`.

**Validações:**

- `cid10`: regex `^[A-Z][0-9]{2}(\.[0-9A-Z]+)?$` (ex.: `I10`, `E11.9`).
- `desde`: data válida ≤ hoje.

**Erros:**

- `422 CID_INVALIDO`
- `422 DATA_INVALIDA`
- `409 ITEM_DUPLICADO` — já existe condição **ativa** com mesmo `cid10`.

#### `PATCH /v1/pacientes/:pacienteId/condicoes-cronicas/:condicaoId`

Usado para "encerrar" / "reativar" condição (toggle `ativo`) e ajustar texto.

**Request** (`AtualizarCondicaoCronicaRequest`):

```ts
{
  descricao?: string;
  ativo?: boolean;             // toggle "encerrar" / "reativar"
  observacao?: string | null;
}
```

**Resposta:** `200 OK` → `PacienteCompleto`.

**Imutáveis:** `cid10` e `desde` **não** podem mudar (criar nova condição se errado).

**Erros:** `400 NENHUMA_ALTERACAO`, `404 ITEM_NAO_ENCONTRADO`.

#### `DELETE /v1/pacientes/:pacienteId/condicoes-cronicas/:condicaoId`

Soft delete. Preferir `PATCH ativo=false`. Disponível só para `COORDENADOR_UBS+`.

---

### 5.3 Medicamentos em uso — 3 endpoints

#### `POST /v1/pacientes/:pacienteId/medicamentos`

Consumido em [`RegistrarMedicamento.svelte`](src/lib/presentation/components/prontuario/RegistrarMedicamento.svelte).

**Request** (`CriarMedicamentoRequest`):

```ts
{
  nome: string;             // OBRIGATÓRIO ex.: "Losartana potássica"
  dosagem: string;          // OBRIGATÓRIO ex.: "50 mg"
  frequencia: string;       // OBRIGATÓRIO ex.: "1 comp de 12/12h"
  desde: string;            // YYYY-MM-DD
  prescritor: string;       // OBRIGATÓRIO ex.: "Dr. João · CRM/BA 12345"
  ativo?: boolean;          // default true
}
```

**Resposta:** `201 Created` → `PacienteCompleto`.

#### `PATCH /v1/pacientes/:pacienteId/medicamentos/:medicamentoId`

Usado para suspender/reativar e atualizar posologia.

**Request** (`AtualizarMedicamentoRequest`):

```ts
{
  dosagem?: string;
  frequencia?: string;
  prescritor?: string;
  ativo?: boolean;          // toggle SUSPENSO / EM USO
}
```

**Resposta:** `200 OK` → `PacienteCompleto`.

**Imutáveis:** `nome` e `desde`.

#### `DELETE /v1/pacientes/:pacienteId/medicamentos/:medicamentoId`

Soft delete. Só `COORDENADOR_UBS+`.

---

### 5.4 Histórico familiar — 1 endpoint

#### `PUT /v1/pacientes/:pacienteId/historico-familiar`

Substituição **total** da lista (não merge). O frontend adiciona/remove
tags localmente e dispara um único PUT com a lista final.

**Request** (`AtualizarHistoricoFamiliarRequest`):

```ts
{
  itens: string[];           // ex.: ["Pai — Diabetes tipo 2", "Mãe — Hipertensão"]
}
```

**Resposta:** `200 OK` → `PacienteCompleto`.

**Validações:**

- `itens.length ≤ 50`.
- Cada item: `1 ≤ length ≤ 200`, sem `\n`.
- Itens duplicados (case-insensitive trim) → dedup silencioso ou erro a critério.

**Implementação sugerida (transação):**

```sql
BEGIN;
DELETE FROM paciente_historico_familiar WHERE paciente_id = :id;
INSERT INTO paciente_historico_familiar (paciente_id, ordem, texto)
VALUES (:id, 0, 'Pai — DM2'), (:id, 1, 'Mãe — HAS') ...;
COMMIT;
```

**Erros:** `422 HISTORICO_FAMILIAR_MUITO_LONGO` (>50), `400 PAYLOAD_INVALIDO`.

---

## 6. Atendimentos

### 6.1 `POST /v1/pacientes/:pacienteId/atendimentos`

Consumido em [`RegistrarAtendimento.svelte`](src/lib/presentation/components/prontuario/RegistrarAtendimento.svelte).
Modal XL com campos no padrão SOAP.

**Request** (`CriarAtendimentoRequest` em [`types.ts:908`](src/lib/api/types.ts)):

```ts
{
  data: string;                // ISO 8601 completo. Frontend envia toISOString()
  tipo: 'CONSULTA_MEDICA' | 'ENFERMAGEM' | 'VACINACAO'
      | 'CURATIVO' | 'ODONTOLOGICO' | 'PROCEDIMENTO' | 'ACOLHIMENTO';
  profissional: string;        // OBRIGATÓRIO (frontend exige .trim().length > 0)
  registroProfissional: string;
  especialidade: string;
  unidade: string;
  queixaPrincipal: string;     // OBRIGATÓRIO (S do SOAP)
  diagnostico: string;
  cid10: string;               // frontend já envia em UPPER
  conduta: string;             // OBRIGATÓRIO (P do SOAP)
  prescricaoResumo?: string;
}
```

**Resposta:** `201 Created` → `PacienteCompleto`.

**Validações:**

- `data` ISO válida, ≤ now() + 5 min de tolerância (não pode registrar futuro).
- `queixaPrincipal`, `conduta`, `profissional` ≥ 3 chars (após trim).
- `cid10` opcional, mas se presente deve casar com regex (mesma de §5.2).
- `tipo` ∈ enum.

**Comportamento:**

- Após persistir, **atualizar** `paciente.ultimoAtendimento = data` quando
  for o atendimento mais recente. Esse campo já é consumido pelo card
  "Último Atendimento" do frontend.

**Erros:** `422 DATA_INVALIDA`, `422 CID_INVALIDO`, `400 PAYLOAD_INVALIDO`.

### 6.2 `DELETE /v1/pacientes/:pacienteId/atendimentos/:atendimentoId`

Soft delete. Só `COORDENADOR_UBS+`.

> Modal de confirmação no frontend já avisa: "Considere apenas para
> cadastros indevidos. Correções devem ser feitas via novo atendimento."

---

## 7. Exames

### 7.1 `POST /v1/pacientes/:pacienteId/exames`

Consumido em [`RegistrarExame.svelte`](src/lib/presentation/components/prontuario/RegistrarExame.svelte).

**Request** (`CriarExameRequest`):

```ts
{
  data: string;                // YYYY-MM-DD (data da realização)
  tipo: string;                // OBRIGATÓRIO ex.: "Hemograma completo"
  categoria: 'LABORATORIAL' | 'IMAGEM' | 'FUNCIONAL' | 'OUTROS';
  solicitante: string;         // OBRIGATÓRIO
  unidadeExecutora: string;
  resultado: 'NORMAL' | 'ALTERADO' | 'CRITICO' | 'PENDENTE';
  observacao?: string;
}
```

**Resposta:** `201 Created` → `PacienteCompleto`.

**Validações:**

- `data` ≤ hoje.
- `tipo`, `solicitante` não vazios após trim.

### 7.2 `DELETE /v1/pacientes/:pacienteId/exames/:exameId`

Soft delete. Só `COORDENADOR_UBS+`.

> **Roadmap:** anexar laudo PDF via
> `POST /v1/pacientes/:id/exames/:exameId/laudo` (multipart). Reaproveitar
> pipeline de scan de antivírus dos anexos de encaminhamento (`StatusScanAnexo`).

---

## 8. Vacinação

### 8.1 `POST /v1/pacientes/:pacienteId/vacinacoes`

Consumido em [`RegistrarVacina.svelte`](src/lib/presentation/components/prontuario/RegistrarVacina.svelte).

**Request** (`CriarVacinaRequest`):

```ts
{
  data: string;                // YYYY-MM-DD
  vacina: string;              // OBRIGATÓRIO ex.: "Pfizer COVID-19"
  dose: string;                // OBRIGATÓRIO ex.: "1ª Dose", "Reforço"
  lote: string;                // OBRIGATÓRIO
  aplicador: string;           // OBRIGATÓRIO ex.: "Enf. Ana · COREN/BA 012345"
  unidade: string;
  via: 'INTRAMUSCULAR' | 'SUBCUTANEA' | 'ORAL' | 'INTRADERMICA';
}
```

**Resposta:** `201 Created` → `PacienteCompleto`.

**Validações:**

- `data` ≤ hoje.
- Unique constraint (`paciente_id`, `vacina`, `dose`, `lote`) → impede duplicata.

**Erros:** `409 VACINA_DUPLICADA` quando bate na unique.

### 8.2 `DELETE /v1/pacientes/:pacienteId/vacinacoes/:vacinaId`

Soft delete. Só `COORDENADOR_UBS+` — caderneta é documento oficial.

---

## 9. Viagens TFD

### 9.1 `POST /v1/pacientes/:pacienteId/viagens`

Consumido em [`RegistrarViagemTfd.svelte`](src/lib/presentation/components/prontuario/RegistrarViagemTfd.svelte).

**Request** (`CriarViagemTfdRequest`):

```ts
{
  protocolo: string;           // OBRIGATÓRIO. Único por prefeitura
  dataIda: string;             // YYYY-MM-DD
  dataVolta: string;           // YYYY-MM-DD, >= dataIda
  destino: string;             // OBRIGATÓRIO ex.: "Salvador/BA"
  unidadeDestino: string;
  motivo: string;              // OBRIGATÓRIO
  especialidade: string;       // OBRIGATÓRIO
  acompanhante: boolean;
  transporte: 'VAN_SMS' | 'AMBULANCIA' | 'PASSAGEM_RODOVIARIA' | 'PASSAGEM_AEREA';
  status?: 'AGENDADA' | 'EM_ANDAMENTO' | 'REALIZADA' | 'CANCELADA';  // default AGENDADA
  custoEstimadoBRL: number;    // >= 0
}
```

**Resposta:** `201 Created` → `PacienteCompleto`.

**Validações:**

- `dataVolta >= dataIda` (frontend já valida, mas backend é fonte da verdade).
- `protocolo` único (active rows) por prefeitura.
- `custoEstimadoBRL >= 0`.

**Erros:** `409 ITEM_DUPLICADO` (protocolo), `422 DATA_INVALIDA`.

### 9.2 `PATCH /v1/pacientes/:pacienteId/viagens/:viagemId`

Usado tanto para editar campos quanto para **transições de status** clicadas
inline na aba (`/ubs/pacientes/:id/viagens`).

**Request** (`AtualizarViagemTfdRequest`):

```ts
{
  dataIda?: string;
  dataVolta?: string;
  destino?: string;
  unidadeDestino?: string;
  motivo?: string;
  especialidade?: string;
  acompanhante?: boolean;
  transporte?: 'VAN_SMS' | 'AMBULANCIA' | 'PASSAGEM_RODOVIARIA' | 'PASSAGEM_AEREA';
  status?: 'AGENDADA' | 'EM_ANDAMENTO' | 'REALIZADA' | 'CANCELADA';
  custoEstimadoBRL?: number;
}
```

**Resposta:** `200 OK` → `PacienteCompleto`.

**Imutáveis:** `protocolo`.

**Máquina de estados (status):**

```
AGENDADA      ──[Iniciar]──→ EM_ANDAMENTO
AGENDADA      ──[Cancelar]──→ CANCELADA
EM_ANDAMENTO  ──[Marcar Realizada]──→ REALIZADA
EM_ANDAMENTO  ──[Cancelar]──→ CANCELADA
CANCELADA     ──[Reagendar]──→ AGENDADA
REALIZADA     → (terminal — nenhuma transição válida)
```

Transição inválida → `422 TRANSICAO_INVALIDA` com `details: { de, para }`.

### 9.3 `DELETE /v1/pacientes/:pacienteId/viagens/:viagemId`

Soft delete. **Apenas `ADMIN+`** — viagem afeta orçamento municipal.

---

## 10. Matriz RBAC

| Recurso              | ATEND_UBS | COORD_UBS | REGUL_SMS | REGUL_TFD | GESTOR_TFD | ADMIN | DEV |
| -------------------- | :-------: | :-------: | :-------: | :-------: | :--------: | :---: | :-: |
| **Cadastro paciente**|           |           |           |           |            |       |     |
| PATCH                | ✅        | ✅        | ❌        | ❌        | ❌         | ✅    | ✅  |
| **Alergias**         |           |           |           |           |            |       |     |
| POST                 | ✅        | ✅        | ❌        | ❌        | ❌         | ✅    | ✅  |
| DELETE               | ✅        | ✅        | ❌        | ❌        | ❌         | ✅    | ✅  |
| **Condições**        |           |           |           |           |            |       |     |
| POST                 | ✅        | ✅        | ❌        | ❌        | ❌         | ✅    | ✅  |
| PATCH                | ✅        | ✅        | ❌        | ❌        | ❌         | ✅    | ✅  |
| DELETE               | ❌        | ✅        | ❌        | ❌        | ❌         | ✅    | ✅  |
| **Medicamentos**     |           |           |           |           |            |       |     |
| POST                 | ✅        | ✅        | ❌        | ❌        | ❌         | ✅    | ✅  |
| PATCH                | ✅        | ✅        | ❌        | ❌        | ❌         | ✅    | ✅  |
| DELETE               | ❌        | ✅        | ❌        | ❌        | ❌         | ✅    | ✅  |
| **Histórico**        |           |           |           |           |            |       |     |
| PUT                  | ✅        | ✅        | ❌        | ❌        | ❌         | ✅    | ✅  |
| **Atendimentos**     |           |           |           |           |            |       |     |
| POST                 | ✅        | ✅        | ❌        | ❌        | ❌         | ✅    | ✅  |
| DELETE               | ❌        | ✅        | ❌        | ❌        | ❌         | ✅    | ✅  |
| **Exames**           |           |           |           |           |            |       |     |
| POST                 | ✅        | ✅        | ❌        | ❌        | ❌         | ✅    | ✅  |
| DELETE               | ❌        | ✅        | ❌        | ❌        | ❌         | ✅    | ✅  |
| **Vacinação**        |           |           |           |           |            |       |     |
| POST                 | ✅        | ✅        | ❌        | ❌        | ❌         | ✅    | ✅  |
| DELETE               | ❌        | ✅        | ❌        | ❌        | ❌         | ✅    | ✅  |
| **Viagens TFD**      |           |           |           |           |            |       |     |
| POST                 | ❌        | ✅        | ✅        | ✅        | ✅         | ✅    | ✅  |
| PATCH (status/dados) | ❌        | ✅        | ✅        | ✅        | ✅         | ✅    | ✅  |
| DELETE               | ❌        | ❌        | ❌        | ❌        | ❌         | ✅    | ✅  |

**Princípios:**

1. Atendente cria (linha de frente), só coord+ remove → preserva rastreabilidade.
2. Reguladores SMS/TFD **não tocam** o prontuário primário (escopo é regulação,
   não atendimento). Só TFD entra no escopo deles.
3. Admin opera dentro da própria prefeitura. DEV cross-prefeitura.
4. Frontend já esconde botões via `auth.podeConsolidarEncaminhamento ||
   auth.ehAdminOuDev` ([`+page.svelte` de cada aba](src/routes/ubs/pacientes/[id]/)).
   **Backend é a fonte da verdade** — retornar 403 mesmo que o frontend tenha
   deixado escapar.

---

## 11. Auditoria

Toda escrita gera linha em `paciente_prontuario_audit` (schema em §3).

**Colunas obrigatórias por linha:**

| Coluna       | Origem                                                |
| ------------ | ----------------------------------------------------- |
| `operador_id`| `req.user.id` (do JWT)                                |
| `paciente_id`| Path param                                            |
| `recurso`    | `ALERGIA \| CONDICAO \| MEDICAMENTO \| HISTORICO_FAMILIAR \| ATENDIMENTO \| EXAME \| VACINA \| VIAGEM_TFD \| PACIENTE` |
| `recurso_id` | UUID do sub-doc (null em `HISTORICO_FAMILIAR` e `PACIENTE` PATCH) |
| `acao`       | `CREATE \| UPDATE \| DELETE`                          |
| `antes`      | snapshot JSON do estado anterior (null em CREATE)     |
| `depois`     | snapshot JSON do estado novo (null em DELETE)         |
| `ip`         | `X-Forwarded-For` ou `req.ip`                         |
| `user_agent` | `req.headers['user-agent']`                           |

**Implementação sugerida:** middleware/decorator que envolve cada handler
e grava a auditoria após o commit da transação principal. Ou trigger
PostgreSQL escutando os tabelas (mais à prova de bugs em rotas novas).

**Retenção: 20 anos** — Res. CFM 1.821/2007 exige preservação mínima do
prontuário. Configure política de partition + cold storage para os anos
mais antigos.

**Hash-chain (opcional v0.10+):** o módulo TFD já usa cadeia de hash em
auditoria. Aplicar o mesmo padrão aqui torna a tabela imutável forensicamente
(cada linha contém `hash_anterior + sha256(linha)` da linha imediatamente
anterior).

---

## 12. Códigos de erro

Os códigos abaixo já estão em
[`types.ts ErrorCode`](src/lib/api/types.ts) (tipo `ErrorCode`) e/ou
serão adicionados — o frontend só exibe códigos conhecidos com mensagem
traduzida; demais caem em `e.message` direto.

| Code                              | HTTP | Quando                                              |
| --------------------------------- | :--: | --------------------------------------------------- |
| `PACIENTE_NAO_ENCONTRADO`         | 404  | Paciente fora do escopo do JWT, ou inexistente      |
| `ITEM_NAO_ENCONTRADO`             | 404  | Sub-documento (alergia/medicamento/etc.) inexistente|
| `PERMISSAO_INSUFICIENTE`          | 403  | Role sem permissão na ação                          |
| `PAYLOAD_INVALIDO`                | 400  | Falha de schema (Zod / class-validator)             |
| `DADOS_OBRIGATORIOS_AUSENTES`     | 400  | Campos required missing                             |
| `NENHUMA_ALTERACAO`               | 400  | PATCH/PUT sem mudança real                          |
| `CID_INVALIDO`                    | 422  | Regex CID-10 não casa                               |
| `DATA_INVALIDA`                   | 422  | Data futura proibida, formato inválido              |
| `ITEM_DUPLICADO`                  | 409  | Substância de alergia / CID ativo / protocolo TFD   |
| `VACINA_DUPLICADA`                | 409  | (paciente,vacina,dose,lote) repetidos               |
| `HISTORICO_FAMILIAR_MUITO_LONGO`  | 422  | `itens.length > 50`                                 |
| `TRANSICAO_INVALIDA`              | 422  | Status TFD muda para estado não permitido           |
| `EDICAO_NAO_PERMITIDA`            | 403  | Tentar alterar campo imutável (cid10, protocolo…)   |
| `RATE_LIMIT`                      | 429  | Limite por IP/operador                              |
| `ERRO_INTERNO`                    | 500  | Genérico                                            |

> **Observação:** se algum código novo aparecer aqui que não exista em
> `ErrorCode`, basta adicioná-lo no enum em [`types.ts:805`](src/lib/api/types.ts).
> O frontend não quebra com códigos desconhecidos — apenas exibe a mensagem do
> backend literalmente.

---

## 13. Checklist de entrega

### Schema / migrations

- [ ] 8 tabelas novas + 1 tabela de auditoria (ver §3)
- [ ] Soft-delete (`deletado_em` nullable) em todas
- [ ] Unique partial indexes (substância+ativa, cid10+ativo, protocolo TFD,
      lote+vacina+dose)
- [ ] FK `criado_por → usuario(id)` em todas
- [ ] Schema da auditoria com retenção configurada (20 anos)

### Endpoints (19 rotas + PATCH paciente)

- [ ] `PATCH  /v1/pacientes/:id`                                   · §4
- [ ] `POST   /v1/pacientes/:id/alergias`                          · §5.1
- [ ] `DELETE /v1/pacientes/:id/alergias/:alergiaId`               · §5.1
- [ ] `POST   /v1/pacientes/:id/condicoes-cronicas`                · §5.2
- [ ] `PATCH  /v1/pacientes/:id/condicoes-cronicas/:condicaoId`    · §5.2
- [ ] `DELETE /v1/pacientes/:id/condicoes-cronicas/:condicaoId`    · §5.2
- [ ] `POST   /v1/pacientes/:id/medicamentos`                      · §5.3
- [ ] `PATCH  /v1/pacientes/:id/medicamentos/:medicamentoId`       · §5.3
- [ ] `DELETE /v1/pacientes/:id/medicamentos/:medicamentoId`       · §5.3
- [ ] `PUT    /v1/pacientes/:id/historico-familiar`                · §5.4
- [ ] `POST   /v1/pacientes/:id/atendimentos`                      · §6.1
- [ ] `DELETE /v1/pacientes/:id/atendimentos/:atendimentoId`       · §6.2
- [ ] `POST   /v1/pacientes/:id/exames`                            · §7.1
- [ ] `DELETE /v1/pacientes/:id/exames/:exameId`                   · §7.2
- [ ] `POST   /v1/pacientes/:id/vacinacoes`                        · §8.1
- [ ] `DELETE /v1/pacientes/:id/vacinacoes/:vacinaId`              · §8.2
- [ ] `POST   /v1/pacientes/:id/viagens`                           · §9.1
- [ ] `PATCH  /v1/pacientes/:id/viagens/:viagemId`                 · §9.2
- [ ] `DELETE /v1/pacientes/:id/viagens/:viagemId`                 · §9.3
- [ ] **Todos retornam `PacienteCompleto` em 200/201** (corpo completo)

### Validação

- [ ] Schemas Zod / class-validator para cada DTO listado
- [ ] CID-10: regex `^[A-Z][0-9]{2}(\.[0-9A-Z]+)?$`
- [ ] Datas ISO 8601, regras de "não futuro" onde aplicável
- [ ] `email`, `cep`, `uf` no PATCH paciente
- [ ] Protocolo TFD único por prefeitura (case-sensitive, trim)
- [ ] Histórico familiar: cada item ≤ 200 chars, lista ≤ 50

### RBAC + isolation

- [ ] Middleware decide com base em §10
- [ ] `paciente.ubs.prefeitura_id == jwt.prefeituraId` (exceto DEV cross)
- [ ] `ATENDENTE_UBS` só na sua UBS
- [ ] `REGULADOR_SMS` / `REGULADOR_TFD`: bloqueado fora de TFD
- [ ] Resposta = `404 PACIENTE_NAO_ENCONTRADO` quando paciente está fora
      do escopo (não 403 — evita vazamento)

### Auditoria

- [ ] Trigger ou middleware grava `antes/depois` em jsonb
- [ ] IP + user-agent capturados
- [ ] Retenção 20 anos aplicada via partição mensal/anual
- [ ] (opcional v0.10) hash-chain igual ao módulo TFD

### Testes integrados (mínimos)

- [ ] ATENDENTE da UBS A tenta criar atendimento em paciente da UBS B → `404 PACIENTE_NAO_ENCONTRADO`
- [ ] REGULADOR_SMS tenta `POST /alergias` → `403 PERMISSAO_INSUFICIENTE`
- [ ] Criar alergia com mesma substância → `409 ITEM_DUPLICADO`
- [ ] DELETE de medicamento por ATENDENTE → `403 PERMISSAO_INSUFICIENTE`
- [ ] PATCH viagem `REALIZADA → AGENDADA` → `422 TRANSICAO_INVALIDA`
- [ ] PUT histórico-familiar com 51 itens → `422 HISTORICO_FAMILIAR_MUITO_LONGO`
- [ ] POST atendimento com `data` futura → `422 DATA_INVALIDA`
- [ ] PATCH paciente com body `{}` → `400 NENHUMA_ALTERACAO`
- [ ] Resposta de POST atendimento contém o atendimento recém-criado dentro do array `paciente.atendimentos`

### Frontend (não precisa mexer)

- [x] `PacientesApi` com 20+ métodos · [`client.ts:485`](src/lib/api/client.ts)
- [x] DTOs em `types.ts` · [`types.ts:855`](src/lib/api/types.ts)
- [x] Modais em `prontuario/Registrar*.svelte`
- [x] Páginas integradas em `routes/ubs/pacientes/[id]/`
- [x] `pacienteContext.atualizar()` no `+layout.svelte`

> Quando todas as caixas acima estiverem marcadas, o frontend faz o switch
> automaticamente — basta apontar `VITE_API_BASE_URL` para o backend novo.

---

## 14. Mapa de arquivos relevantes

### Frontend (referência — não alterar)

| Arquivo                                                                                       | Papel                                                  |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [`src/lib/api/types.ts`](src/lib/api/types.ts)                                                | Todos os DTOs e enums citados aqui (canônico)          |
| [`src/lib/api/client.ts`](src/lib/api/client.ts) (`PacientesApi`)                             | Métodos HTTP — ver §1.2                                |
| [`src/lib/api/erros-tfd.ts`](src/lib/api/erros-tfd.ts)                                        | Tradução de códigos TFD para pt-BR                     |
| [`src/lib/presentation/components/prontuario/`](src/lib/presentation/components/prontuario/)  | Modais de registro (referência de validação)           |
| [`src/lib/presentation/contexts/pacienteContext.ts`](src/lib/presentation/contexts/pacienteContext.ts) | Estado canônico do paciente — `atualizar(p)`           |
| [`src/routes/ubs/pacientes/[id]/`](src/routes/ubs/pacientes/[id]/)                            | Páginas que consomem cada endpoint                     |

### Backend (a implementar)

```
backend/src/modules/prontuario/
├── presentation/
│   ├── prontuario.routes.ts       ← registra as 19 rotas
│   ├── ProntuarioController.ts    ← 1 método por rota
│   └── schemas.ts                 ← Zod para cada DTO
├── application/
│   ├── alergias.ts                ← regras de §5.1
│   ├── condicoes-cronicas.ts      ← regras de §5.2
│   ├── medicamentos.ts            ← regras de §5.3
│   ├── historico-familiar.ts      ← regras de §5.4
│   ├── atendimentos.ts            ← regras de §6
│   ├── exames.ts                  ← regras de §7
│   ├── vacinas.ts                 ← regras de §8
│   ├── viagens-tfd.ts             ← regras de §9 + máquina de status
│   └── _helpers.ts                ← `loadPacienteByScope`, `recarregarCompleto`
└── infrastructure/
    └── PrismaProntuarioAuditLogger.ts   ← grava `paciente_prontuario_audit`
```

(Esse layout já existe em
[`backend/src/modules/prontuario/`](../backend/src/modules/prontuario/) —
verificar gaps contra esta especificação.)

---

*Versão: v0.7.0+ · Frontend pós-prontuário-completo · Atualizado em 2026-04-30.*
