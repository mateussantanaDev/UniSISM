# UNISISM · Face 4 · TFD (Tratamento Fora do Domicílio)

Documento de alinhamento técnico do módulo **Face 4 — Gestão Logística TFD**.
Gerado a partir do frontend SvelteKit (`src/routes/tfd/*`, `src/lib/api/tfd-types.ts`, `src/lib/api/client.ts`, `src/lib/api/erros-tfd.ts`).

**Backend de referência:** `v0.9.0` (2026-04-27) + extensões da v0.10 (esta seção §14).
**Companion backend:** `TFD_API.md` (contrato HTTP) e `TFD_BACKEND_GUIDE.md` (implementação).

**Público**: equipe de backend.
**Objetivo**: implementar o módulo TFD respeitando a UI já consumida — endpoints, schema, máquinas de estado, RBAC, auditoria e regras de negócio.

> **Atualização v0.10 (2026-04-29)** — duas mudanças importantes:
>
> 1. Nova role **`REGULADOR_TFD`** com UI minimalista (Dashboard + Cadastro
>    de Solicitação). A versão completa do TFD passa a ser exclusiva de
>    `GESTOR_TFD` / `ADMIN` / `DESENVOLVEDOR`.
> 2. `POST /tfd/solicitacoes` aceita **paciente inline** (com `paciente:
DadosPacienteInline`) para fluxo de cadastro presencial pelo regulador,
>    e ganha campo `acompanhante`.
> 3. Novo endpoint `GET /tfd/relatorios/especialidades` (gestor) para
>    fundamentar a decisão "contratar especialista local vs. mandar fora".
>    Veja [§14](#14-modo-simplificado-v010) para o contrato completo.

> Convenções globais herdadas do projeto:
>
> - Datas e horários em ISO 8601. Datas isoladas em `YYYY-MM-DD`. Mês em `YYYY-MM`.
> - Valores monetários em `number` (BRL, em reais — não centavos).
> - Erros sempre `{ "error": { "code": "...", "message": "...", "details": { ... } } }`.
> - `prefeituraId` carregado pelo JWT do operador (multi-tenancy obrigatório).
> - Toda operação que muda estado é auditada (hash-chain — ver §10).

---

## Índice

1. [Visão geral e propósito](#1-visão-geral-e-propósito)
2. [Persona e escopo](#2-persona-e-escopo)
3. [RBAC — roles e permissões](#3-rbac)
4. [Estrutura de rotas do frontend](#4-estrutura-de-rotas-do-frontend)
5. [Modelo de domínio (visão alta)](#5-modelo-de-domínio)
6. [Schema relacional sugerido](#6-schema-relacional-sugerido)
7. [Endpoints — referência completa](#7-endpoints--referência-completa)
8. [Máquinas de estado](#8-máquinas-de-estado)
9. [Regras de negócio](#9-regras-de-negócio)
10. [Auditoria e LGPD/TCM](#10-auditoria-e-lgpd-tcm)
11. [Códigos de erro](#11-códigos-de-erro)
12. [Checklist mínimo do backend](#12-checklist-mínimo-do-backend)
13. [Alinhamento frontend ↔ backend v0.9](#13-alinhamento-frontend--backend-v09)
14. [Modo simplificado v0.10](#14-modo-simplificado-v010)

---

## 1. Visão geral e propósito

**TFD** é o programa público que custeia o transporte e a permanência de pacientes que precisam fazer atendimento de média/alta complexidade fora da sua cidade. A Face 4 do UNISISM é o **centro de comando logístico** do TFD na prefeitura:

- **Frota**: cadastro de veículos (vans, ônibus, ambulâncias, carros) e seu estado operacional.
- **Motoristas**: cadastro com CNH + categoria + validade, alertas automáticos.
- **Solicitações TFD**: pedidos de viagem (criados a partir de encaminhamentos aprovados).
- **Viagens**: agendamento da rota, alocação de assentos (UX BlaBlaCar), controle de embarque/desembarque, KM rodado.
- **Abastecimento**: solicitação → liberação → comprovante (cupom fiscal). Modo balcão (valor estimado) e modo cálculo (litros × R$/L).
- **Saldo de Frota**: orçamento mensal de combustível por veículo — com **aporte** (crédito) e **ajuste** (sobrescreve).
- **Saldo de Ajuda de Custo**: orçamento mensal global da prefeitura, dividido em três tetos (alimentação / hospedagem / deslocamento local). Aporte e ajuste auditados.
- **Ajuda de Custo**: repasse a pacientes em viagem (PIX, transferência, dinheiro RH) com itens categorizados.
- **Auditoria**: trilha hash-chained (5 anos), exportável para o Tribunal de Contas (TJ/TCM).
- **Relatórios**: indicadores logísticos (consumo, KM/litro, custo médio etc.).

Princípios não-negociáveis:

1. **Multi-tenancy estrito**: 404 (não 403) para recursos de outra prefeitura.
2. **Auditoria total**: toda mutação grava `antes`/`depois`/`hash`/`hashAnterior`/`operador`/`ip`.
3. **Anexos auditados**: todo upload passa por scan antimalware antes de virar download.
4. **Nada é deletado de verdade**: status `INATIVO`/`CANCELADA`/`AFASTADO`. Apenas `DESENVOLVEDOR` faz `DELETE` físico de cadastros raiz.
5. **Justificativas robustas**: ajustes financeiros exigem texto ≥ 10 caracteres, expostos na auditoria.

---

## 2. Persona e escopo

### 2.1. Persona primária: Gestor TFD

- Servidor da Prefeitura, lotado na SMS, responsável pela operação logística.
- Faz: cadastra frota, abre solicitações de abastecimento, aloca pacientes em viagens, autoriza ajudas de custo, registra comprovantes, fecha o mês.
- Não faz: aprovar encaminhamentos médicos (Face 2), cuidar de prontuário (Face 1).

### 2.2. Persona secundária: Admin / Desenvolvedor

- Faz ajustes manuais de saldo (ajuste sobrescreve), exportação para TCM, manutenção de cadastros.
- `DESENVOLVEDOR` é o único que pode `DELETE` físico de veículo/motorista após zero viagens vinculadas.

### 2.3. Persona auxiliar: Motorista

- Não acessa o sistema diretamente nesta versão.
- É **representado** no sistema (cadastro com CNH).
- Em uma versão futura (mobile), terá app próprio.

### 2.4. Escopo NÃO inclui (por enquanto)

- Pagamento eletrônico real (a integração com PIX/banco é externa — o sistema apenas registra o comprovante).
- Telemetria veicular em tempo real.
- Roteirização automática.

---

## 3. RBAC

Roles relevantes para TFD (conforme `rbac.podeAcessarFace4TFD`):

| Role                 | Acessa Face 4 |        Cadastros/CRUD        | Ajusta Saldo |  Operações diárias   | Aporta Saldo | Exporta TCM |
| -------------------- | :-----------: | :--------------------------: | :----------: | :------------------: | :----------: | :---------: |
| `DESENVOLVEDOR`      |       ✓       |              ✓               |      ✓       |          ✓           |      ✓       |      ✓      |
| `ADMIN_GLOBAL`       |       ✓       |              ✓               |      ✓       |          ✓           |      ✓       |      ✓      |
| `ADMIN_PREFEITURA`   |       ✓       |              ✓               |      ✓       |          ✓           |      ✓       |      ✓      |
| `GESTOR_TFD`         |       ✓       | ✓ (frota/motoristas/viagens) |      —       |          ✓           |  ✓ (frota)   |      —      |
| `OPERADOR_TFD`       |       ✓       |              —               |      —       | ✓ (somente registro) |      —       |      —      |
| Demais (UBS, médico) |       —       |              —               |      —       |          —           |      —       |      —      |

**Regras práticas:**

- `podeGerenciarTFD` = `DESENVOLVEDOR | ADMIN_GLOBAL | ADMIN_PREFEITURA | GESTOR_TFD | OPERADOR_TFD`.
- `ehAdminOuDev` = `DESENVOLVEDOR | ADMIN_GLOBAL | ADMIN_PREFEITURA | GESTOR_TFD`. **Só essa lista** ajusta saldo (sobrescreve).
- Aportar saldo (crédito) requer `podeGerenciarTFD` (o gestor TFD pode lançar aportes; ajuste manual continua restrito).
- Exportação TCM (`/tfd/auditoria`) exige `ehAdminGlobalOuPrefeitura`.

Resposta padrão:

- `403 ROLE_NAO_PERMITIDO` quando autenticado mas sem permissão.
- `404` se o recurso é de outra prefeitura (jamais 403, para não revelar existência).

---

## 4. Estrutura de rotas do frontend

```
/tfd
├── /dashboard                  ← KPIs (viagens hoje, solicitações pendentes)
│   ├── /solicitacoes           ← Atalho fila pendente
│   └── /viagens-ativas         ← Atalho viagens em andamento
├── /solicitacoes               ← Lista de solicitações TFD
│   └── /[id]                   ← Detalhe + aprovar/negar/anexar
├── /viagens                    ← Lista
│   ├── /nova                   ← Criar viagem (data + veículo + motorista)
│   └── /[id]                   ← Detalhe + alocar passageiros + iniciar/concluir
├── /frota                      ← Veículos
│   └── /[id]                   ← Detalhe veículo
├── /motoristas                 ← Motoristas
│   └── /[id]                   ← Detalhe motorista
├── /abastecimento              ← Solicitar/liberar/registrar comprovante
├── /saldo                      ← Saldo de combustível por veículo (aporte + ajuste)
├── /saldo-ajuda-custo          ← Orçamento global de ajuda de custo (aporte + ajuste)
├── /ajuda-custo                ← Ajudas de custo (criar / autorizar / pagar / negar)
├── /relatorios                 ← Relatórios logísticos
├── /auditoria                  ← Trilha + exportar TJ/TCM (ZIP do mês)
└── /perfil                     ← Perfil do operador
```

---

## 5. Modelo de domínio

```
Prefeitura
 ├── Veiculo            (placa, modelo, tipo, capacidade, combustível, hodômetro)
 ├── Motorista          (cpf, cnh + categoria + validade)
 ├── SolicitacaoTFD     (paciente, ubs, especialidade, prioridade)
 │    └── AnexoSolicitacaoTFD (PDF/IMG, scanStatus)
 ├── ViagemFrota        (data, veículo, motorista, vagas, KM)
 │    └── PassageiroViagem (solicitação, assento, presença)
 ├── Abastecimento      (veículo, posto, valor, hodômetro, comprovante)
 ├── SaldoVeiculo       (veículo × mês: mensal, consumido, reservado)
 │    └── AporteSaldoFrota
 ├── SaldoAjudaCusto    (prefeitura × mês: mensal, consumido, reservado, tetos)
 │    └── AporteSaldoAjudaCusto
 ├── AjudaCusto         (viagem, paciente, itens, status, comprovante)
 └── RegistroAuditoriaTFD (hash-chain, antes/depois)
```

Relacionamentos críticos:

- `SolicitacaoTFD ─1..1─ ViagemFrota` via `PassageiroViagem` (solicitação aprovada → alocada).
- `ViagemFrota ─*─ AjudaCusto` (uma viagem pode gerar várias ajudas — uma por paciente; **bloquear duplicada** com `AJUDA_DUPLICADA`).
- `Abastecimento ─*─ Veiculo` e opcionalmente `─*─ Viagem` (modo "abasteci pra esta viagem").
- `SaldoVeiculo` é único por `(prefeituraId, veiculoId, mes)`.
- `SaldoAjudaCusto` é único por `(prefeituraId, mes)`.

---

## 6. Schema relacional sugerido

> SQL em dialeto PostgreSQL. Não-prescritivo: o que importa é o **contrato JSON** dos endpoints; o backend pode usar Mongo, etc.

### 6.1. Frota

```sql
CREATE TABLE veiculos (
  id                   UUID PRIMARY KEY,
  prefeitura_id        UUID NOT NULL,
  placa                VARCHAR(8) NOT NULL,
  modelo               VARCHAR(120) NOT NULL,
  tipo                 VARCHAR(20) NOT NULL,         -- VAN | ONIBUS | CARRO | AMBULANCIA
  capacidade           INT NOT NULL CHECK (capacidade > 0),
  ano                  INT NOT NULL,
  combustivel          VARCHAR(20) NOT NULL,         -- DIESEL | GASOLINA | ETANOL | FLEX | GNV | ELETRICO
  consumo_medio_kml    NUMERIC(6,2) NOT NULL,
  hodometro_atual_km   NUMERIC(10,1) NOT NULL DEFAULT 0,
  proxima_revisao_km   NUMERIC(10,1),
  proxima_revisao_em   DATE,
  status               VARCHAR(20) NOT NULL DEFAULT 'ATIVO',   -- ATIVO | EM_MANUTENCAO | INATIVO
  criado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prefeitura_id, placa) WHERE status <> 'INATIVO'
);

CREATE INDEX idx_veiculos_prefeitura_status ON veiculos (prefeitura_id, status);
```

### 6.2. Motoristas

```sql
CREATE TABLE motoristas (
  id              UUID PRIMARY KEY,
  prefeitura_id   UUID NOT NULL,
  nome            VARCHAR(160) NOT NULL,
  cpf             CHAR(11) NOT NULL,
  cnh             VARCHAR(20) NOT NULL,
  categoria_cnh   CHAR(1) NOT NULL,        -- B | C | D | E
  validade_cnh    DATE NOT NULL,
  telefone        VARCHAR(20) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'ATIVO',  -- ATIVO | AFASTADO | INATIVO
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prefeitura_id, cpf) WHERE status <> 'INATIVO'
);
```

### 6.3. Solicitações TFD

```sql
CREATE TABLE solicitacoes_tfd (
  id                          UUID PRIMARY KEY,
  prefeitura_id               UUID NOT NULL,
  protocolo                   VARCHAR(20) NOT NULL UNIQUE,  -- ex: TFD-2026-000123
  paciente_id                 UUID NOT NULL,
  ubs_id                      UUID NOT NULL,
  encaminhamento_origem_id    UUID,
  destino                     VARCHAR(120) NOT NULL,
  unidade_destino             VARCHAR(160),
  especialidade               VARCHAR(80) NOT NULL,
  motivo                      TEXT NOT NULL,
  data_desejada               DATE NOT NULL,
  acompanhante_necessario     BOOLEAN NOT NULL DEFAULT FALSE,
  prioridade                  VARCHAR(20) NOT NULL,      -- ELETIVA | PRIORITARIA | URGENTE
  status                      VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
  observacoes                 TEXT,
  motivo_negacao              TEXT,
  viagem_id                   UUID,
  criada_em                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decidida_em                 TIMESTAMPTZ,
  decidida_por_id             UUID
);

CREATE TABLE anexos_solicitacao_tfd (
  id              UUID PRIMARY KEY,
  solicitacao_id  UUID NOT NULL REFERENCES solicitacoes_tfd(id),
  nome            VARCHAR(255) NOT NULL,
  tipo            VARCHAR(40) NOT NULL,        -- COMPROVANTE_ENCAMINHAMENTO | EXAME | LAUDO | OUTRO
  tamanho_kb      INT NOT NULL,
  scan_status     VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',  -- PENDENTE | LIMPO | INFECTADO | FALHOU
  storage_key     TEXT NOT NULL,               -- S3/MinIO
  upload_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 6.4. Viagens

```sql
CREATE TABLE viagens (
  id                       UUID PRIMARY KEY,
  prefeitura_id            UUID NOT NULL,
  data                     DATE NOT NULL,
  hora_saida               TIME NOT NULL,
  hora_prevista_retorno    TIME,
  veiculo_id               UUID NOT NULL REFERENCES veiculos(id),
  motorista_id             UUID NOT NULL REFERENCES motoristas(id),
  destino                  VARCHAR(120) NOT NULL,
  unidade_destino          VARCHAR(160),
  rota_resumo              TEXT,
  km_estimados             NUMERIC(10,1),
  km_inicial_hodometro     NUMERIC(10,1),
  km_final_hodometro       NUMERIC(10,1),
  vagas_totais             INT NOT NULL,
  observacoes              TEXT,
  status                   VARCHAR(20) NOT NULL DEFAULT 'AGENDADA', -- AGENDADA | EM_ANDAMENTO | CONCLUIDA | CANCELADA
  motivo_cancelamento      TEXT,
  criada_em                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  iniciada_em              TIMESTAMPTZ,
  concluida_em             TIMESTAMPTZ
);

CREATE TABLE passageiros_viagem (
  id              UUID PRIMARY KEY,
  viagem_id       UUID NOT NULL REFERENCES viagens(id) ON DELETE CASCADE,
  solicitacao_id  UUID NOT NULL REFERENCES solicitacoes_tfd(id),
  numero_assento  INT,
  acompanhante    BOOLEAN NOT NULL DEFAULT FALSE,
  presenca        VARCHAR(20) NOT NULL DEFAULT 'AGUARDANDO',
                     -- AGUARDANDO | CONFIRMADO | EMBARCADO | AUSENTE | DESISTIU
  observacao      TEXT,
  marcado_em      TIMESTAMPTZ,
  UNIQUE (viagem_id, numero_assento) WHERE numero_assento IS NOT NULL,
  UNIQUE (viagem_id, solicitacao_id)
);
```

### 6.5. Abastecimento

```sql
CREATE TABLE abastecimentos (
  id                  UUID PRIMARY KEY,
  prefeitura_id       UUID NOT NULL,
  protocolo           VARCHAR(24) NOT NULL UNIQUE,
  veiculo_id          UUID NOT NULL REFERENCES veiculos(id),
  motorista_id        UUID REFERENCES motoristas(id),
  viagem_id           UUID REFERENCES viagens(id),
  posto               VARCHAR(160) NOT NULL,
  combustivel         VARCHAR(20) NOT NULL,
  litros              NUMERIC(8,3) NOT NULL DEFAULT 0,
  valor_por_litro     NUMERIC(10,3) NOT NULL DEFAULT 0,
  valor_estimado      NUMERIC(10,2) NOT NULL,
  valor_total         NUMERIC(10,2) NOT NULL DEFAULT 0,
  hodometro_km        NUMERIC(10,1) NOT NULL,
  km_desde_ultimo     NUMERIC(10,1),
  consumo_calc_kml    NUMERIC(8,3),
  status              VARCHAR(20) NOT NULL DEFAULT 'SOLICITADO',
                         -- SOLICITADO | LIBERADO | REALIZADO | NEGADO
  motivo_negacao      TEXT,
  comprovante_storage TEXT,
  comprovante_scan    VARCHAR(20),
  solicitado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  liberado_em         TIMESTAMPTZ,
  realizado_em        TIMESTAMPTZ
);
```

### 6.6. Saldo da frota (combustível)

```sql
CREATE TABLE saldo_veiculo (
  id                UUID PRIMARY KEY,
  prefeitura_id     UUID NOT NULL,
  veiculo_id        UUID NOT NULL REFERENCES veiculos(id),
  mes               CHAR(7) NOT NULL,            -- YYYY-MM
  saldo_mensal      NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_consumido   NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_reservado   NUMERIC(12,2) NOT NULL DEFAULT 0,
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prefeitura_id, veiculo_id, mes)
);

CREATE TABLE aportes_saldo_frota (
  id                UUID PRIMARY KEY,
  prefeitura_id     UUID NOT NULL,
  veiculo_id        UUID REFERENCES veiculos(id),  -- NULL quando rateio_geral
  rateio_geral      BOOLEAN NOT NULL DEFAULT FALSE,
  mes               CHAR(7) NOT NULL,
  valor_brl         NUMERIC(12,2) NOT NULL CHECK (valor_brl > 0),
  fonte             VARCHAR(30) NOT NULL,
  numero_documento  VARCHAR(40),
  descricao_fonte   TEXT,
  justificativa     TEXT NOT NULL,
  operador_id       UUID NOT NULL,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 6.7. Saldo de Ajuda de Custo

```sql
CREATE TABLE saldo_ajuda_custo (
  prefeitura_id      UUID NOT NULL,
  mes                CHAR(7) NOT NULL,
  saldo_mensal       NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_consumido    NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_reservado    NUMERIC(12,2) NOT NULL DEFAULT 0,
  teto_alimentacao   NUMERIC(12,2) NOT NULL DEFAULT 0,   -- 0 = sem teto
  teto_hospedagem    NUMERIC(12,2) NOT NULL DEFAULT 0,
  teto_deslocamento  NUMERIC(12,2) NOT NULL DEFAULT 0,
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (prefeitura_id, mes)
);

CREATE TABLE aportes_saldo_ajuda_custo (
  id                UUID PRIMARY KEY,
  prefeitura_id     UUID NOT NULL,
  mes               CHAR(7) NOT NULL,
  valor_brl         NUMERIC(12,2) NOT NULL CHECK (valor_brl > 0),
  fonte             VARCHAR(30) NOT NULL,
  numero_documento  VARCHAR(40),
  descricao_fonte   TEXT,
  justificativa     TEXT NOT NULL,
  operador_id       UUID NOT NULL,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 6.8. Ajuda de Custo

```sql
CREATE TABLE ajudas_custo (
  id                UUID PRIMARY KEY,
  prefeitura_id     UUID NOT NULL,
  protocolo         VARCHAR(24) NOT NULL UNIQUE,
  viagem_id         UUID NOT NULL REFERENCES viagens(id),
  paciente_id       UUID NOT NULL,
  itens             JSONB NOT NULL,   -- [{categoria, descricao, valorBRL}]
  valor_total       NUMERIC(12,2) NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
                       -- PENDENTE | AUTORIZADA | PAGA | NEGADA | CANCELADA
  metodo_pagamento  VARCHAR(20),         -- PIX | TRANSFERENCIA | DINHEIRO_RH
  motivo_negacao    TEXT,
  comprovante_storage TEXT,
  comprovante_scan  VARCHAR(20),
  criada_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  autorizada_em     TIMESTAMPTZ,
  paga_em           TIMESTAMPTZ,
  UNIQUE (viagem_id, paciente_id)        -- regra AJUDA_DUPLICADA
);
```

### 6.9. Auditoria (hash-chain)

```sql
CREATE TABLE auditoria_tfd (
  id                  UUID PRIMARY KEY,
  prefeitura_id       UUID NOT NULL,
  acao                VARCHAR(40) NOT NULL,
  recurso_tipo        VARCHAR(40) NOT NULL,
  recurso_id          UUID NOT NULL,
  recurso_protocolo   VARCHAR(24),
  operador_id         UUID NOT NULL,
  operador_nome       VARCHAR(160) NOT NULL,
  operador_matricula  VARCHAR(40) NOT NULL,
  operador_role       VARCHAR(40) NOT NULL,
  ip                  INET NOT NULL,
  user_agent          TEXT NOT NULL,
  antes               JSONB,
  depois              JSONB,
  hash_anterior       CHAR(64) NOT NULL,
  hash                CHAR(64) NOT NULL,
  em                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auditoria_recurso ON auditoria_tfd (prefeitura_id, recurso_tipo, recurso_id, em DESC);
```

`hash = sha256(hash_anterior || canonical(antes,depois,acao,recurso,operador,em))` — quebra de cadeia → `corrompidos[]` no `verificar`.

---

## 7. Endpoints — referência completa

> Base URL: `/v1`. Autenticação Bearer JWT. Todas as respostas trazem `X-Request-Id`.

### 7.1. Veículos

| Método | Caminho                        | Body / Query              | Retorna     | RBAC          |
| ------ | ------------------------------ | ------------------------- | ----------- | ------------- |
| GET    | `/tfd/veiculos`                | —                         | `Veiculo[]` | gerenciar     |
| POST   | `/tfd/veiculos`                | `CriarVeiculoRequest`     | `Veiculo`   | gerenciar     |
| GET    | `/tfd/veiculos/:id`            | —                         | `Veiculo`   | gerenciar     |
| PATCH  | `/tfd/veiculos/:id`            | `AtualizarVeiculoRequest` | `Veiculo`   | gerenciar     |
| POST   | `/tfd/veiculos/:id/manutencao` | —                         | `Veiculo`   | gerenciar     |
| POST   | `/tfd/veiculos/:id/reativar`   | —                         | `Veiculo`   | gerenciar     |
| DELETE | `/tfd/veiculos/:id`            | —                         | 204         | DESENVOLVEDOR |

`CriarVeiculoRequest`:

```json
{
	"placa": "ABC-1D23",
	"modelo": "Mercedes Sprinter 415",
	"tipo": "VAN",
	"capacidade": 14,
	"ano": 2024,
	"combustivel": "DIESEL",
	"consumoMedioKml": 9.8,
	"hodometroAtualKm": 12450,
	"proximaRevisaoKm": 30000,
	"proximaRevisaoEm": "2026-08-15"
}
```

Erros: `PLACA_DUPLICADA`, `VEICULO_EM_USO` (no DELETE).

### 7.2. Motoristas

| Método | Caminho                        | Body / Query                | Retorna       | RBAC          |
| ------ | ------------------------------ | --------------------------- | ------------- | ------------- |
| GET    | `/tfd/motoristas`              | —                           | `Motorista[]` | gerenciar     |
| POST   | `/tfd/motoristas`              | `CriarMotoristaRequest`     | `Motorista`   | gerenciar     |
| GET    | `/tfd/motoristas/:id`          | —                           | `Motorista`   | gerenciar     |
| PATCH  | `/tfd/motoristas/:id`          | `AtualizarMotoristaRequest` | `Motorista`   | gerenciar     |
| POST   | `/tfd/motoristas/:id/afastar`  | —                           | `Motorista`   | gerenciar     |
| POST   | `/tfd/motoristas/:id/reativar` | —                           | `Motorista`   | gerenciar     |
| DELETE | `/tfd/motoristas/:id`          | —                           | 204           | DESENVOLVEDOR |

Cálculo: `cnhVencidaEm` = `floor((validadeCnh - hoje) / dia)` — negativo se vencida.

Erros: `CPF_DUPLICADO`, `CPF_INVALIDO`, `VALIDADE_CNH_INVALIDA`, `MOTORISTA_EM_USO`.

### 7.3. Solicitações TFD

| Método | Caminho                         | Body / Query                | Retorna               | RBAC      |
| ------ | ------------------------------- | --------------------------- | --------------------- | --------- |
| GET    | `/tfd/solicitacoes`             | `ListSolicitacoesQuery`     | `SolicitacaoTFD[]`    | gerenciar |
| POST   | `/tfd/solicitacoes`             | `CriarSolicitacaoRequest`   | `SolicitacaoTFD`      | gerenciar |
| GET    | `/tfd/solicitacoes/:id`         | —                           | `SolicitacaoTFD`      | gerenciar |
| POST   | `/tfd/solicitacoes/:id/aprovar` | `AprovarSolicitacaoRequest` | `SolicitacaoTFD`      | gerenciar |
| POST   | `/tfd/solicitacoes/:id/negar`   | `{ "motivo": "≥10 chars" }` | `SolicitacaoTFD`      | gerenciar |
| POST   | `/tfd/solicitacoes/:id/anexos`  | multipart `file` + `tipo`   | `AnexoSolicitacaoTFD` | gerenciar |
| GET    | `/tfd/anexos/:anexoId/download` | —                           | binary                | gerenciar |

`AprovarSolicitacaoRequest` — quando vier `alocacao`, é **atomico**: `aprova + cria PassageiroViagem`. Para isso, validar `alocacao.viagemId` no mesmo `prefeituraId`, status `AGENDADA`, capacidade.

Erros: `SOLICITACAO_NAO_APROVADA`, `STATUS_INVALIDO`, `MOTIVO_OBRIGATORIO`, `VIAGEM_STATUS_INVALIDO`, `ASSENTO_OCUPADO`.

### 7.4. Viagens

| Método | Caminho                                      | Body                                               | Retorna         | RBAC      |
| ------ | -------------------------------------------- | -------------------------------------------------- | --------------- | --------- |
| GET    | `/tfd/viagens`                               | `ListViagensQuery`                                 | `ViagemFrota[]` | gerenciar |
| POST   | `/tfd/viagens`                               | `CriarViagemRequest`                               | `ViagemFrota`   | gerenciar |
| GET    | `/tfd/viagens/:id`                           | —                                                  | `ViagemFrota`   | gerenciar |
| PATCH  | `/tfd/viagens/:id`                           | `AtualizarViagemRequest`                           | `ViagemFrota`   | gerenciar |
| POST   | `/tfd/viagens/:id/iniciar`                   | `{ "kmInicialHodometro": 12500 }`                  | `ViagemFrota`   | gerenciar |
| POST   | `/tfd/viagens/:id/concluir`                  | `{ "kmFinalHodometro": 12780, "observacoes": "" }` | `ViagemFrota`   | gerenciar |
| POST   | `/tfd/viagens/:id/cancelar`                  | `{ "motivo": "≥10 chars" }`                        | `ViagemFrota`   | gerenciar |
| POST   | `/tfd/viagens/:id/passageiros`               | `AlocarPassageiroRequest`                          | `ViagemFrota`   | gerenciar |
| DELETE | `/tfd/viagens/:id/passageiros/:passageiroId` | —                                                  | `ViagemFrota`   | gerenciar |
| POST   | `/tfd/viagens/:id/passageiros/:pid/presenca` | `MarcarPresencaRequest`                            | `ViagemFrota`   | gerenciar |

Regras:

- `vagasTotais` ≤ `veiculo.capacidade`. Erro: `VAGAS_EXCEDEM_CAPACIDADE`.
- `kmFinalHodometro` ≥ `kmInicialHodometro`. Erro: `HODOMETRO_INVALIDO`.
- Concluir atualiza `veiculo.hodometroAtualKm = max(atual, kmFinalHodometro)`.
- Não cancelar se `status='CONCLUIDA'`. Erro: `VIAGEM_REALIZADA_IMUTAVEL`.
- Alocar exige solicitação `APROVADA` (não `PENDENTE`). Erro: `SOLICITACAO_NAO_APROVADA`.

### 7.5. Abastecimento

| Método | Caminho                               | Body                                                                           | Retorna           | RBAC      |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------ | ----------------- | --------- |
| GET    | `/tfd/abastecimentos`                 | `ListAbastecimentosQuery`                                                      | `Abastecimento[]` | gerenciar |
| POST   | `/tfd/abastecimentos`                 | `SolicitarAbastecimentoRequest`                                                | `Abastecimento`   | gerenciar |
| POST   | `/tfd/abastecimentos/:id/liberar`     | `{ "observacao"?: "..." }`                                                     | `Abastecimento`   | gerenciar |
| POST   | `/tfd/abastecimentos/:id/negar`       | `{ "motivo": "≥10 chars" }`                                                    | `Abastecimento`   | gerenciar |
| POST   | `/tfd/abastecimentos/:id/comprovante` | multipart (`file` + `litros` + `valorPorLitro` + `valorTotal` + `hodometroKm`) | `Abastecimento`   | gerenciar |
| GET    | `/tfd/abastecimentos/:id/comprovante` | —                                                                              | binary            | gerenciar |

`SolicitarAbastecimentoRequest` — dois modos:

- **Balcão**: informa `valorEstimado`. Backend grava `litros=0`, `valorPorLitro=0`, `valorTotal=0` até comprovante.
- **Cálculo**: informa `litrosEstimados` + `valorPorLitroEstimado`. Backend calcula `valorEstimado = litros × R$/L`.

Validações no `solicitar`:

- `veiculoId` OU `placa` (resolver placa → veiculoId no backend).
- `combustivel` deve bater com `veiculo.combustivel` (a menos que `veiculo.combustivel='FLEX'`). Caso contrário → `PAYLOAD_INVALIDO`.
- `hodometroKm ≥ veiculo.hodometroAtualKm`. Erro `HODOMETRO_INVALIDO`.
- `valorEstimado > 0` ou `(litrosEstimados>0 && valorPorLitroEstimado>0)`. Erro `VALOR_REQUERIDO` / `VALOR_INVALIDO`.
- **Reservar saldo**: `saldo_reservado += valorEstimado`. Se `saldo_disponivel < valorEstimado` → `SALDO_INSUFICIENTE`.

`liberar`:

- Só de `SOLICITADO`. Erro `STATUS_INVALIDO`.

`negar`:

- Só de `SOLICITADO`. Libera reserva (`saldo_reservado -= valorEstimado`).

`comprovante` (registrar realizado):

- Só de `LIBERADO`.
- `valorTotal` não pode exceder `valorEstimado * 1.05` → erro `VALOR_EXCEDE_LIMITE`.
- Atualiza `veiculo.hodometroAtualKm = max(atual, hodometroKm)`.
- Calcula `kmDesdeUltimo` = `hodometroKm - hodometro_anterior_realizado`. Calcula `consumoCalcKml = kmDesdeUltimo / litros` se ambos > 0.
- **Liquida saldo**: `saldo_reservado -= valorEstimado` e `saldo_consumido += valorTotal`.
- Anexo passa por scan antimalware antes do download liberar.

### 7.6. Saldo da Frota

| Método | Caminho              | Body / Query                          | Retorna              |
| ------ | -------------------- | ------------------------------------- | -------------------- |
| GET    | `/tfd/saldo`         | `?mes=YYYY-MM` (opcional → mês atual) | `SaldoVeiculo[]`     |
| POST   | `/tfd/saldo/ajustar` | `AjustarSaldoRequest`                 | `SaldoVeiculo`       |
| POST   | `/tfd/saldo/aportar` | `AporteSaldoFrotaRequest`             | `AporteSaldoFrota`   |
| GET    | `/tfd/saldo/aportes` | `?mes=YYYY-MM` (opcional)             | `AporteSaldoFrota[]` |

**Diferença `ajustar` × `aportar`:**

- `ajustar` → **sobrescreve** o `saldoMensal` do veículo. Use para correções. RBAC: `ehAdminOuDev`.
- `aportar` → **soma** ao `saldoMensal` (crédito). Vincula a empenho/portaria. RBAC: `podeGerenciarTFD`.

`AporteSaldoFrotaRequest`:

```json
{
	"veiculoId": "uuid",
	"rateioGeral": false,
	"mes": "2026-04",
	"valorBRL": 5000.0,
	"fonte": "EMPENHO",
	"numeroDocumento": "2026NE000123",
	"descricaoFonte": null,
	"justificativa": "aporte mensal regular para combustível"
}
```

Validações:

- `valorBRL > 0` → senão `APORTE_INVALIDO`.
- `justificativa.length ≥ 10` → senão `JUSTIFICATIVA_OBRIGATORIA`.
- `fonte ∈ EMPENHO|PORTARIA` ⇒ `numeroDocumento` obrigatório → `APORTE_DOCUMENTO_OBRIGATORIO`.
- `fonte = OUTRO` ⇒ `descricaoFonte` obrigatório → `APORTE_FONTE_INVALIDA`.
- Se `rateioGeral=true`, `veiculoId` deve ser `null/omit`. Backend divide `valorBRL` entre veículos `ATIVO` (parts iguais; resto na primeira placa). Cria N registros `aportes_saldo_frota` (um por veículo) no mesmo grupo (mesmo `criado_em`/`operadorId`/`justificativa`).
- Se `rateioGeral=false`, `veiculoId` é obrigatório.
- **Efeito**: cria/atualiza `saldo_veiculo` upsert para `(prefeituraId, veiculoId, mes)`, somando `saldo_mensal += valorBRL`. Auditoria com `acao='SALDO_APORTADO'`, `antes={saldoMensal: X}`, `depois={saldoMensal: X+v}`.

`AjustarSaldoRequest` — sobrescreve:

```json
{ "veiculoId": "uuid", "mes": "2026-04", "novoSaldoMensal": 12500.0, "justificativa": "..." }
```

### 7.7. Saldo de Ajuda de Custo

| Método | Caminho                          | Body / Query                    | Retorna                   |
| ------ | -------------------------------- | ------------------------------- | ------------------------- |
| GET    | `/tfd/saldo-ajuda-custo`         | `?mes=YYYY-MM` (opcional)       | `SaldoAjudaCusto`         |
| POST   | `/tfd/saldo-ajuda-custo/ajustar` | `AjustarSaldoAjudaCustoRequest` | `SaldoAjudaCusto`         |
| POST   | `/tfd/saldo-ajuda-custo/aportar` | `AporteSaldoAjudaCustoRequest`  | `AporteSaldoAjudaCusto`   |
| GET    | `/tfd/saldo-ajuda-custo/aportes` | `?mes=YYYY-MM` (opcional)       | `AporteSaldoAjudaCusto[]` |

`SaldoAjudaCusto` — **um único registro por (prefeitura, mês)**.

```json
{
	"prefeituraId": "uuid",
	"mes": "2026-04",
	"saldoMensal": 25000.0,
	"saldoConsumido": 8400.0,
	"saldoReservado": 1200.0,
	"saldoDisponivel": 15400.0,
	"tetoAlimentacao": 80.0,
	"tetoHospedagem": 250.0,
	"tetoDeslocamento": 60.0,
	"atualizadoEm": "2026-04-25T14:30:00Z"
}
```

`AjustarSaldoAjudaCustoRequest`:

```json
{
	"mes": "2026-04",
	"novoSaldoMensal": 30000,
	"tetoAlimentacao": 90,
	"tetoHospedagem": 250,
	"tetoDeslocamento": 60,
	"justificativa": "revisão dos tetos conforme Portaria SMS 047/2026"
}
```

Tetos `0` significam **sem teto**. Validar `novoSaldoMensal ≥ 0`. RBAC: `ehAdminOuDev`.

`AporteSaldoAjudaCustoRequest`:

```json
{
	"mes": "2026-04",
	"valorBRL": 10000,
	"fonte": "REPASSE_FEDERAL",
	"numeroDocumento": "FNS-2026-12345",
	"justificativa": "repasse FNS componente TFD abril/2026"
}
```

Mesma validação de fontes/documento que aporte de frota. Auditoria: `SALDO_AJUDA_APORTADO`.

### 7.8. Ajuda de Custo

| Método | Caminho                           | Body                                 | Retorna        | RBAC      |
| ------ | --------------------------------- | ------------------------------------ | -------------- | --------- |
| GET    | `/tfd/ajudas-custo`               | `ListAjudasCustoQuery`               | `AjudaCusto[]` | gerenciar |
| POST   | `/tfd/ajudas-custo`               | `SolicitarAjudaCustoRequest`         | `AjudaCusto`   | gerenciar |
| GET    | `/tfd/ajudas-custo/:id`           | —                                    | `AjudaCusto`   | gerenciar |
| POST   | `/tfd/ajudas-custo/:id/autorizar` | —                                    | `AjudaCusto`   | gerenciar |
| POST   | `/tfd/ajudas-custo/:id/negar`     | `{ "motivo": "≥10" }`                | `AjudaCusto`   | gerenciar |
| POST   | `/tfd/ajudas-custo/:id/pagar`     | multipart `file` + `metodoPagamento` | `AjudaCusto`   | gerenciar |

`SolicitarAjudaCustoRequest`:

```json
{
	"viagemId": "uuid",
	"pacienteId": "uuid",
	"itens": [
		{ "categoria": "ALIMENTACAO", "descricao": "2 refeições no dia da consulta", "valorBRL": 70.0 },
		{ "categoria": "DESLOCAMENTO_LOCAL", "descricao": "Táxi UBS↔hospital", "valorBRL": 50.0 }
	]
}
```

Validações:

- `itens.length ≥ 1` → senão `ITENS_OBRIGATORIOS`.
- Cada `valorBRL > 0` → `VALOR_INVALIDO`.
- Paciente precisa ser **passageiro alocado** na viagem → senão `PAYLOAD_INVALIDO` (recusar).
- Não permitir 2 ajudas ativas para `(viagem, paciente)` → `AJUDA_DUPLICADA`.
- Para cada item, `valorBRL ≤ teto_da_categoria` (se teto > 0). Senão `TETO_CATEGORIA_EXCEDIDO`.
- `valor_total = sum(itens.valorBRL)`.
- **Reservar saldo**: `saldo_ajuda_custo.saldo_reservado += valor_total`. Se `saldo_disponivel < valor_total` → `SALDO_AJUDA_INSUFICIENTE`.

`autorizar` (PENDENTE → AUTORIZADA):

- Mantém reserva.
- Auditoria: `AJUDA_CUSTO_AUTORIZADA`.

`negar` (PENDENTE → NEGADA):

- **Libera reserva**: `saldo_reservado -= valor_total`.

`pagar` (AUTORIZADA → PAGA):

- Anexa comprovante (multipart, scan antimalware).
- **Liquida saldo**: `saldo_reservado -= valor_total`, `saldo_consumido += valor_total`.
- Auditoria: `AJUDA_CUSTO_PAGA` + storage do comprovante.

Estados terminais: `PAGA`, `NEGADA`, `CANCELADA` (apenas via admin, fora do fluxo padrão).

### 7.9. Auditoria

| Método | Caminho                                  | Query                | Retorna                                     |
| ------ | ---------------------------------------- | -------------------- | ------------------------------------------- |
| GET    | `/tfd/auditoria`                         | `ListAuditoriaQuery` | `RegistroAuditoriaTFD[]`                    |
| GET    | `/tfd/auditoria/:id`                     | —                    | `RegistroAuditoriaTFD`                      |
| GET    | `/tfd/auditoria/verificar`               | —                    | `{ total, corrompidos: string[] }`          |
| GET    | `/tfd/auditoria/exportar-tj?mes=YYYY-MM` | —                    | `ZIP` (`Content-Disposition: filename=...`) |

ZIP contém:

```
manifest.json   (assinatura SHA-256 + metadados)
auditoria.csv
veiculos.csv
viagens.csv
abastecimentos.csv
ajudas-custo.csv
saldo.csv
saldo-ajuda-custo.csv
aportes-frota.csv
aportes-ajuda-custo.csv
[opcional] assinatura.p7s   (se ICP-Brasil estiver disponível)
```

---

## 8. Máquinas de estado

### 8.1. SolicitacaoTFD

```
PENDENTE ──aprovar──► APROVADA ──alocar──► ALOCADA ──viagem.concluir──► REALIZADA
   │                      │
   ├─negar──► NEGADA       └──── (ALOCADA também via aprovar+alocacao atomico)
   └─cancelar (admin)──► CANCELADA
```

### 8.2. ViagemFrota

```
AGENDADA ──iniciar──► EM_ANDAMENTO ──concluir──► CONCLUIDA
   │                       │
   └────────cancelar───────┴─► CANCELADA   (não pode após CONCLUIDA)
```

### 8.3. Abastecimento

```
SOLICITADO ──liberar──► LIBERADO ──comprovante──► REALIZADO
     │
     └──negar──► NEGADO
```

- `SOLICITADO` reserva saldo.
- `NEGADO` libera reserva.
- `REALIZADO` liquida (consome) saldo.

### 8.4. AjudaCusto

```
PENDENTE ──autorizar──► AUTORIZADA ──pagar──► PAGA
   │                         │
   └───────negar─────────────┴─► NEGADA  (libera reserva)
```

### 8.5. Saldo de Frota & Ajuda de Custo

Não tem máquina de estado: o saldo é **espelho contábil**. As transições são:

- `aportar` → `saldo_mensal += valor`.
- `ajustar` → `saldo_mensal = novo_valor`.
- `solicitar abastecimento` → `saldo_reservado += valor_estimado`.
- `negar abastecimento` → `saldo_reservado -= valor_estimado`.
- `realizar abastecimento` → `saldo_reservado -= valor_estimado` && `saldo_consumido += valor_total`.
- `solicitar ajuda` → `saldo_reservado += valor_total`.
- `negar ajuda` → `saldo_reservado -= valor_total`.
- `pagar ajuda` → `saldo_reservado -= valor_total` && `saldo_consumido += valor_total`.

Invariante: `saldo_disponivel = saldo_mensal - saldo_consumido - saldo_reservado` ≥ 0 sempre.

---

## 9. Regras de negócio

### 9.1. Cálculo de protocolo

`{TFD|ABA|AJU}-{ANO}-{seq6}` por prefeitura. Ex.: `TFD-2026-000412`. Sequencial atômico (use `nextval` ou tabela de contadores com lock).

### 9.2. Alocação de assento

- `numeroAssento` é opcional na request — quando vier, valida `1 ≤ n ≤ vagasTotais` e unicidade (`ASSENTO_OCUPADO`).
- Quando não vier, backend escolhe o próximo livre (ordem crescente).
- `vagasTotais` ≤ `veiculo.capacidade` no momento da criação da viagem; alterar veículo da viagem é proibido depois (PATCH não aceita `veiculoId`).

### 9.3. Hodômetro

- Toda mutação que envolva hodômetro recalcula `veiculo.hodometroAtualKm = MAX(atual, valor_informado)`.
- Não permitir hodômetro retroativo: se `valor_informado < veiculo.hodometroAtualKm` → `HODOMETRO_INVALIDO`.

### 9.4. Combustível compatível

- Veículo `FLEX` aceita `GASOLINA` ou `ETANOL` no abastecimento.
- Demais: precisa bater exato. Senão `PAYLOAD_INVALIDO`.

### 9.5. Limite de 5%

- Ao registrar comprovante, `valorTotal ≤ valorEstimado × 1.05`. Senão `VALOR_EXCEDE_LIMITE` (motivo: prestação de contas TCM).
- Para variações maiores, **a UI atual não suporta** — backend pode prever um endpoint futuro de "aprovação extra".

### 9.6. CNH vencida

- `motorista.validadeCnh < hoje`: motorista NÃO pode ser alocado em viagem nova → `CNH_VENCIDA`.
- Sistema apenas avisa na UI, não bloqueia cadastro.

### 9.7. Multi-tenancy

- Toda query SQL **obriga** filtro `prefeitura_id = $current`.
- Resposta para recurso de outra prefeitura = `404` (jamais 403, para não vazar existência).

### 9.8. Idempotência

- Endpoints de mutação aceitam header opcional `X-Idempotency-Key`. Se a mesma chave for reutilizada nas próximas 24h, devolver a mesma resposta. Recomendado para `aportar` e `pagar` (evita débito duplo).

---

## 10. Auditoria e LGPD/TCM

### 10.1. O que auditar

Toda chamada que muda estado **deve** gerar 1 registro em `auditoria_tfd`. Lista de `acao`:

```
VEICULO_CRIADO | VEICULO_ATUALIZADO | VEICULO_MANUTENCAO | VEICULO_REATIVADO | VEICULO_DELETADO
MOTORISTA_CRIADO | MOTORISTA_ATUALIZADO | MOTORISTA_AFASTADO | MOTORISTA_REATIVADO | MOTORISTA_DELETADO
SOLICITACAO_CRIADA | SOLICITACAO_APROVADA | SOLICITACAO_NEGADA | SOLICITACAO_ANEXO_ENVIADO
VIAGEM_CRIADA | VIAGEM_ATUALIZADA | VIAGEM_INICIADA | VIAGEM_CONCLUIDA | VIAGEM_CANCELADA
PASSAGEIRO_ALOCADO | PASSAGEIRO_REMOVIDO | PRESENCA_MARCADA
ABASTECIMENTO_SOLICITADO | ABASTECIMENTO_LIBERADO | ABASTECIMENTO_NEGADO | ABASTECIMENTO_REALIZADO
SALDO_AJUSTADO | SALDO_APORTADO
SALDO_AJUDA_AJUSTADO | SALDO_AJUDA_APORTADO
AJUDA_CUSTO_CRIADA | AJUDA_CUSTO_AUTORIZADA | AJUDA_CUSTO_PAGA | AJUDA_CUSTO_NEGADA
```

### 10.2. Hash-chain

- `hash = SHA-256( hash_anterior || canonical_json )`.
- `canonical_json` = JSON ordenado lexicograficamente das chaves (RFC 8785), incluindo `acao`, `recursoTipo`, `recursoId`, `operadorId`, `em`, `antes`, `depois`.
- Primeiro registro: `hash_anterior = '0' * 64`.
- `verificar` percorre todos os registros do tenant, recomputa o hash e devolve `corrompidos: id[]` para os que divergem.

### 10.3. Retenção

- 5 anos. `DELETE` físico bloqueado nesta tabela (somente DESENVOLVEDOR via migration explícita após o prazo).

### 10.4. LGPD

- IPs são **dado pessoal** — só expor para `ehAdminGlobalOuPrefeitura`.
- Pacientes: a auditoria pode referenciar `pacienteId`, mas o nome só vem se já estiver presente em `solicitacao` denormalizada. Não duplicar nome em `antes/depois` quando não for necessário.
- Anexos: `pre-signed URL` com TTL ≤ 5min para download.

---

## 11. Códigos de erro

Catálogo canônico — frontend traduz pelo `code` (estável), nunca pela `message`:

| Code                           | HTTP | Significado                                          |
| ------------------------------ | :--: | ---------------------------------------------------- |
| `PAYLOAD_INVALIDO`             | 400  | Schema do body inválido / tipos errados.             |
| `ROLE_NAO_PERMITIDO`           | 403  | Role autenticada sem permissão.                      |
| `NAO_AUTENTICADO`              | 401  | Sem token / token inválido.                          |
| `TOKEN_EXPIRADO`               | 401  | Token expirado.                                      |
| `VEICULO_NAO_ENCONTRADO`       | 404  | Veículo inexistente ou outra prefeitura.             |
| `MOTORISTA_NAO_ENCONTRADO`     | 404  | Motorista inexistente ou outra prefeitura.           |
| `SOLICITACAO_NAO_ENCONTRADA`   | 404  | —                                                    |
| `VIAGEM_NAO_ENCONTRADA`        | 404  | —                                                    |
| `ABASTECIMENTO_NAO_ENCONTRADO` | 404  | —                                                    |
| `AJUDA_NAO_ENCONTRADA`         | 404  | —                                                    |
| `ANEXO_NAO_ENCONTRADO`         | 404  | —                                                    |
| `COMPROVANTE_AUSENTE`          | 422  | Pagar/realizar sem ter feito upload.                 |
| `PLACA_DUPLICADA`              | 409  | Placa já existe (status ≠ INATIVO).                  |
| `CPF_DUPLICADO`                | 409  | CPF já existe.                                       |
| `STATUS_INVALIDO`              | 409  | Operação no status atual não permitida.              |
| `STATUS_TERMINAL`              | 409  | Recurso já em estado terminal.                       |
| `VIAGEM_STATUS_INVALIDO`       | 409  | Viagem cancelada/concluída — não aceita passageiros. |
| `ASSENTO_OCUPADO`              | 409  | Assento já alocado.                                  |
| `CAPACIDADE_EXCEDIDA`          | 409  | Viagem cheia.                                        |
| `ANEXO_NAO_LIBERADO`           | 409  | Anexo ainda em scan antimalware.                     |
| `AJUDA_DUPLICADA`              | 409  | Já existe ajuda ativa para (viagem, paciente).       |
| `VEICULO_EM_USO`               | 409  | DELETE veículo com viagens ativas.                   |
| `MOTORISTA_EM_USO`             | 409  | DELETE motorista com viagens ativas.                 |
| `VEICULO_REQUERIDO`            | 422  | Faltou veiculoId/placa.                              |
| `VALOR_REQUERIDO`              | 422  | Faltou valor estimado.                               |
| `VALOR_INVALIDO`               | 422  | Valor ≤ 0.                                           |
| `ASSENTO_INVALIDO`             | 422  | Fora do range 1..vagasTotais.                        |
| `VAGAS_INVALIDAS`              | 422  | Vagas ≤ 0.                                           |
| `VAGAS_EXCEDEM_CAPACIDADE`     | 422  | Vagas > capacidade do veículo.                       |
| `CNH_VENCIDA`                  | 422  | Motorista com CNH vencida.                           |
| `MOTORISTA_INDISPONIVEL`       | 422  | Motorista AFASTADO ou INATIVO.                       |
| `VEICULO_INDISPONIVEL`         | 422  | Veículo EM_MANUTENCAO ou INATIVO.                    |
| `HODOMETRO_INVALIDO`           | 422  | Hodômetro retroativo.                                |
| `SALDO_INSUFICIENTE`           | 422  | Saldo da frota insuficiente.                         |
| `SALDO_AJUDA_INSUFICIENTE`     | 422  | Saldo de ajuda de custo insuficiente.                |
| `APORTE_INVALIDO`              | 422  | valorBRL ≤ 0 no aporte.                              |
| `APORTE_FONTE_INVALIDA`        | 422  | Fonte = OUTRO sem `descricaoFonte`.                  |
| `APORTE_DOCUMENTO_OBRIGATORIO` | 422  | Fonte = EMPENHO/PORTARIA sem `numeroDocumento`.      |
| `TETO_CATEGORIA_EXCEDIDO`      | 422  | Item de ajuda excede teto da categoria.              |
| `VALOR_EXCEDE_LIMITE`          | 422  | Comprovante > 105% do estimado.                      |
| `MOTIVO_OBRIGATORIO`           | 422  | Motivo < 10 chars.                                   |
| `JUSTIFICATIVA_OBRIGATORIA`    | 422  | Justificativa < 10 chars.                            |
| `SOLICITACAO_NAO_APROVADA`     | 422  | Tentativa de alocar PENDENTE.                        |
| `DATA_INVALIDA`                | 422  | Data fora do formato/intervalo.                      |
| `CPF_INVALIDO`                 | 422  | CPF != 11 dígitos.                                   |
| `VALIDADE_CNH_INVALIDA`        | 422  | Validade CNH inválida.                               |
| `ITENS_OBRIGATORIOS`           | 422  | Ajuda sem itens.                                     |
| `VIAGEM_REALIZADA_IMUTAVEL`    | 422  | Cancelar viagem CONCLUIDA.                           |
| `TRANSICAO_INVALIDA`           | 422  | Transição não permitida na máquina de estado.        |
| `ERRO_INTERNO`                 | 500  | Genérico.                                            |

Formato HTTP:

```json
{
	"error": {
		"code": "SALDO_INSUFICIENTE",
		"message": "Saldo do mês insuficiente para reservar R$ 850,00.",
		"details": {
			"veiculoId": "...",
			"saldoDisponivel": 300.0,
			"valorSolicitado": 850.0
		}
	}
}
```

---

## 12. Checklist mínimo do backend

Para o módulo TFD ser considerado **funcional** com este frontend:

- [ ] CRUD de veículos com unicidade de placa por prefeitura.
- [ ] CRUD de motoristas com cálculo de `cnhVencidaEm`.
- [ ] CRUD de solicitações TFD com upload de anexo + scan antimalware.
- [ ] Aprovação atômica `aprovar+alocar` numa única chamada.
- [ ] CRUD de viagens com início/conclusão (atualiza hodômetro do veículo).
- [ ] Alocação de passageiros com controle de assento e capacidade.
- [ ] Marcar presença (5 estados) e desalocar.
- [ ] Abastecimento — modo balcão e cálculo, liberação/negação/comprovante.
- [ ] Reserva e liquidação de saldo no abastecimento.
- [ ] Saldo da frota: GET por mês + ajustar (sobrescreve) + **aportar** (crédito) + listar aportes.
- [ ] Saldo de ajuda de custo: GET único por mês + ajustar (com tetos) + aportar + listar aportes.
- [ ] Ajuda de custo: criar (com reserva), autorizar, negar (libera reserva), pagar (com comprovante e liquidação).
- [ ] Validação de teto por categoria na criação da ajuda.
- [ ] Auditoria hash-chain em **todas** as mutações.
- [ ] `GET /tfd/auditoria/verificar` valida cadeia.
- [ ] `GET /tfd/auditoria/exportar-tj?mes=...` devolve ZIP completo.
- [ ] Erros padronizados pelo catálogo §11.
- [ ] Multi-tenancy estrito (404 em vez de 403).
- [ ] RBAC implementado (`ehAdminOuDev` para ajuste manual de saldo, `podeGerenciarTFD` para o resto, `DESENVOLVEDOR` para DELETE).
- [ ] Idempotência (`X-Idempotency-Key`) em `aportar`, `pagar` e `comprovante`.
- [ ] Pre-signed URLs com TTL ≤ 5 min para downloads.
- [ ] Cabeçalho `X-Request-Id` em toda resposta.

---

## Apêndice A · Tipos canônicos (TypeScript)

Fonte: `frontend/src/lib/api/tfd-types.ts`. Reproduzidos abaixo para referência cruzada com o backend.

```ts
export type FonteRecurso =
	| 'EMPENHO'
	| 'PORTARIA'
	| 'REPASSE_FEDERAL'
	| 'REPASSE_ESTADUAL'
	| 'REMANEJAMENTO'
	| 'OUTRO';

export interface AporteSaldoFrotaRequest {
	veiculoId?: string; // requerido se rateioGeral=false
	rateioGeral?: boolean; // se true, rateia entre veículos ATIVOS
	mes: string; // YYYY-MM
	valorBRL: number; // > 0
	fonte: FonteRecurso;
	numeroDocumento?: string; // obrigatório se fonte ∈ EMPENHO|PORTARIA
	descricaoFonte?: string; // obrigatório se fonte=OUTRO
	justificativa: string; // ≥ 10 chars
}

export interface SaldoAjudaCusto {
	prefeituraId: string;
	mes: string;
	saldoMensal: number;
	saldoConsumido: number;
	saldoReservado: number;
	saldoDisponivel: number;
	tetoAlimentacao: number; // 0 = sem teto
	tetoHospedagem: number;
	tetoDeslocamento: number;
	atualizadoEm: string;
}

export interface AjustarSaldoAjudaCustoRequest {
	mes: string;
	novoSaldoMensal: number;
	tetoAlimentacao?: number;
	tetoHospedagem?: number;
	tetoDeslocamento?: number;
	justificativa: string;
}

export interface AporteSaldoAjudaCustoRequest {
	mes: string;
	valorBRL: number;
	fonte: FonteRecurso;
	numeroDocumento?: string;
	descricaoFonte?: string;
	justificativa: string;
}
```

---

## Apêndice B · Convenção de payloads multipart

Endpoints multipart usam `multipart/form-data` com:

- Campo `file` para o binário.
- Demais campos como strings (números enviados como string — o backend converte).

Exemplo `POST /tfd/abastecimentos/:id/comprovante`:

```
file:           @comprovante.pdf
litros:         57.4
valorPorLitro:  6.299
valorTotal:     361.56
hodometroKm:    12783
```

Resposta após scan: o `Abastecimento` retorna com `temComprovante=true` e `status=REALIZADO`. O download de fato só é liberado quando `comprovante_scan='LIMPO'`.

---

**Versão do documento**: 2026-04-29 — `frontend v0.1.0` ↔ `backend v0.10`
(estende v0.9.1 com REGULADOR_TFD + paciente inline + relatório por especialidade).

**Owner**: equipe UNISISM Face 4.

---

## 14. Modo simplificado v0.10

A v0.10 introduz a separação de perfis dentro do TFD: **gestão completa** vs.
**regulador presencial**. Nada do que existia foi removido — apenas estendido.

### 14.1. Nova role: `REGULADOR_TFD`

Adicionar ao enum `Role`:

```diff
 type Role =
   | 'DESENVOLVEDOR'
   | 'ADMIN'
   | 'COORDENADOR_UBS'
   | 'ATENDENTE_UBS'
   | 'REGULADOR_SMS'
-  | 'GESTOR_TFD';
+  | 'GESTOR_TFD'
+  | 'REGULADOR_TFD';
```

| Aspecto                             | `GESTOR_TFD`               | `REGULADOR_TFD`                   |
| ----------------------------------- | -------------------------- | --------------------------------- |
| UI                                  | TFD completo               | Dashboard + Nova Solicitação      |
| Cadastra solicitação?               | Sim                        | Sim (use case principal)          |
| Aprova / aloca em viagem?           | Sim                        | **Não** — é da gestão             |
| Cria/edita frota / motoristas?      | Sim                        | Não                               |
| Aporta saldo / paga ajuda de custo? | Sim                        | Não                               |
| Cria usuários TFD?                  | **Sim — só REGULADOR_TFD** | Não                               |
| Vê relatórios analíticos?           | Sim                        | Não (vê só "minhas solicitações") |
| Acessa auditoria?                   | Não (apenas ADMIN/DEV)     | Não                               |

**Escopo:** PREFEITURA. JWT injeta `prefeituraId`; multi-tenancy aplicado em
todas as queries.

**Acesso à Face 4:** o `podeAcessarFace4TFD` agora aceita `REGULADOR_TFD`,
além das três roles existentes (`GESTOR_TFD` / `ADMIN` / `DESENVOLVEDOR`).
Quem entra com `REGULADOR_TFD` cai em `/tfd/dashboard` por padrão.

### 14.2. Cadastro de usuários TFD

Endpoint reaproveita `POST /v1/admin/usuarios` (existente). Mudanças:

- `role` aceita `'REGULADOR_TFD'` e `'GESTOR_TFD'`.
- `prefeituraId` é obrigatório para ambas as roles.
- RBAC do backend deve permitir:
  - `DESENVOLVEDOR` → cria qualquer role.
  - `ADMIN` → cria todas exceto `DESENVOLVEDOR` (incluindo `GESTOR_TFD` e `REGULADOR_TFD`).
  - **`GESTOR_TFD` → cria apenas `REGULADOR_TFD`** (escalonamento controlado).
    - Backend valida: se quem chama é `GESTOR_TFD` e `req.role !== 'REGULADOR_TFD'`, devolve `403 PERMISSAO_INSUFICIENTE`.
    - Backend valida: `prefeituraId` deve ser igual ao da role do criador (`FORA_DO_ESCOPO` se diferente).
- Lista de usuários (`GET /v1/admin/usuarios`) acessível ao `GESTOR_TFD`
  para sua própria prefeitura, com filtro implícito `prefeituraId = jwt.prefeituraId`.

UI no frontend:

- `/tfd/usuarios` — lista equipe TFD.
- `/tfd/usuarios/novo` — form de cadastro (apenas `GESTOR_TFD`/`ADMIN`/`DEV`).

### 14.3. Cadastro de passageiro inline (`POST /tfd/solicitacoes`)

O endpoint **continua o mesmo**, mas o payload `CriarSolicitacaoRequest`
ganhou três caminhos de uso:

```ts
// Tipo Compartilhado
interface DadosPacienteInline {
	nome: string;
	cpf: string; // 11 dígitos sem máscara
	dataNascimento: string; // YYYY-MM-DD
	sexo: 'M' | 'F' | 'OUTRO';
	telefone: string;
	endereco: string;
	cartaoSus?: string;
	nomeMae?: string;
	rg?: string;
	bairro?: string;
	municipio?: string;
	uf?: string;
	cep?: string;
}

interface DadosAcompanhante {
	nome: string;
	cpf: string;
	dataNascimento: string;
	telefone: string;
	parentesco: string; // CONJUGE | FILHO_A | PAI | MAE | IRMAO_A | AVO | NETO_A | TIO_A | SOBRINHO_A | CUIDADOR | OUTRO
	rg?: string;
}

interface CriarSolicitacaoRequest {
	// Paciente — UM dos dois é obrigatório
	pacienteId?: string; // existente (UBS / encaminhamento)
	paciente?: DadosPacienteInline; // cadastro inline (REGULADOR_TFD)

	ubsId?: string; // opcional p/ REGULADOR_TFD se não houver UBS
	encaminhamentoOrigemId?: string;
	destino: string; // município destino
	unidadeDestino?: string;
	especialidade: string; // texto livre + lista de sugestões na UI
	motivo: string; // ≥ 10 caracteres
	dataDesejada: string; // YYYY-MM-DD
	prioridade: 'ELETIVA' | 'PRIORITARIA' | 'URGENTE';
	acompanhanteNecessario?: boolean;
	acompanhante?: DadosAcompanhante; // obrigatório se acompanhanteNecessario=true
	observacoes?: string;
	prefeituraId?: string;
}
```

**Regras de validação (backend):**

1. `paciente` XOR `pacienteId`. Aceita só um dos dois.
2. `paciente.cpf` precisa ter 11 dígitos numéricos. Backend faz **upsert**:
   - Se já existe paciente com este CPF na prefeitura, **mescla** dados ausentes
     (preserva campos não-vazios já cadastrados).
   - Senão, cria novo registro.
3. `acompanhanteNecessario=true` ⇒ `acompanhante` obrigatório com todos os
   campos não-opcionais. Senão `PAYLOAD_INVALIDO`.
4. `motivo.length >= 10` (a UI já valida; backend reforça).
5. `dataDesejada` ≥ hoje (UTC-3).
6. RBAC:
   - `REGULADOR_TFD` → POST permitido; outros endpoints da fila (aprovar,
     negar, alocar) bloqueados com `403 PERMISSAO_INSUFICIENTE`.
   - `GESTOR_TFD`/`ADMIN`/`DEV` → tudo permitido.

**Resposta** continua sendo `SolicitacaoTFD` (entidade completa) —
agora com:

```diff
 interface SolicitacaoTFD {
   ...
+  acompanhante: DadosAcompanhante | null;
+  criadaPorId: string | null;
+  criadaPorNome: string | null;
   ...
 }
```

### 14.4. Listar "minhas solicitações" — `?criadaPorMim=true`

`GET /v1/tfd/solicitacoes` ganha filtro:

```http
GET /v1/tfd/solicitacoes?criadaPorMim=true
```

- Quando `true`, devolve apenas registros com `criadaPorId === jwt.sub`.
- Default `false`: mantém comportamento atual (lista por prefeitura).
- Usado pelo dashboard simplificado do `REGULADOR_TFD` para mostrar
  "o que eu mandei".

### 14.5. Relatório por especialidade — `GET /v1/tfd/relatorios/especialidades`

Novo endpoint **agregador** que alimenta a decisão estratégica
"contratar especialista local vs. continuar mandando paciente fora".

**Auth:** Bearer JWT.
**RBAC:** `GESTOR_TFD` / `ADMIN` / `DESENVOLVEDOR` (regulador não).

**Query params:**

| Param          | Tipo               | Descrição                                     |
| -------------- | ------------------ | --------------------------------------------- |
| `desde`        | `YYYY-MM-DD`       | Início da janela. Default: `hoje - 12 meses`. |
| `ate`          | `YYYY-MM-DD`       | Fim da janela. Default: hoje.                 |
| `prefeituraId` | string (DEV/ADMIN) | Forçar escopo. Senão, JWT.                    |

**Response 200:**

```json
{
  "periodo": { "desde": "2025-04-29", "ate": "2026-04-29" },
  "totalGeralSolicitacoes": 437,
  "totalGeralCustoBRL": 184250.72,
  "itens": [
    {
      "especialidade": "OFTALMOLOGIA",
      "totalSolicitacoes": 132,
      "totalRealizadas": 121,
      "totalPendentes": 6,
      "totalNegadas": 5,
      "pacientesUnicos": 98,
      "destinosMaisFrequentes": ["Recife/PE", "Caruaru/PE"],
      "custoEstimadoBRL": 67200.00,
      "custoMedioPorViagemBRL": 509.09
    },
    ...
  ]
}
```

**Cálculos (backend):**

- `totalSolicitacoes` = `count(SolicitacaoTFD WHERE criadaEm BETWEEN desde AND ate AND prefeituraId)`.
- `totalRealizadas` = subset com `status='REALIZADA'`.
- `totalPendentes` = subset com `status IN ('PENDENTE','APROVADA','ALOCADA')`.
- `totalNegadas` = subset com `status IN ('NEGADA','CANCELADA')`.
- `pacientesUnicos` = `count(distinct pacienteId)`.
- `destinosMaisFrequentes` = top 3 `destino` por contagem.
- `custoEstimadoBRL` = soma de:
  - rateio do `valorTotal` dos abastecimentos das viagens vinculadas
    (proporcional a `passageiros.length`), e
  - `valorTotal` das ajudas de custo `PAGA` cujos `viagemId` apontam para
    viagens dessa especialidade. Se a viagem mistura especialidades, ratear
    pelo número de passageiros por especialidade.
- `custoMedioPorViagemBRL` = `custoEstimadoBRL / totalRealizadas` (0 quando `totalRealizadas=0`).

Ordenar `itens` desc por `totalSolicitacoes`.

**Cache:** Redis com TTL 1h, chave `tfd:relatorios:especialidades:{prefeituraId}:{desde}:{ate}`.

**Auditoria:** GET puro — não grava na auditoria.

### 14.6. Códigos de erro novos / relevantes

| Code                         | HTTP | Quando                                                    |
| ---------------------------- | :--: | --------------------------------------------------------- |
| `PACIENTE_OU_ID_OBRIGATORIO` | 400  | `POST /tfd/solicitacoes` sem `paciente` nem `pacienteId`. |
| `PACIENTE_E_ID_CONFLITAM`    | 400  | Os dois informados ao mesmo tempo.                        |
| `ACOMPANHANTE_OBRIGATORIO`   | 400  | `acompanhanteNecessario=true` sem `acompanhante`.         |
| `ROLE_INVALIDA_TFD`          | 422  | GESTOR_TFD tentando criar role ≠ REGULADOR_TFD.           |
| `JANELA_INVALIDA`            | 400  | `desde > ate` no relatório.                               |

### 14.7. Endpoints — referência completa da v0.10

```http
# Cadastro de usuários TFD (existente, com novos roles permitidos)
POST   /v1/admin/usuarios               (ADMIN/DEV: todas; GESTOR_TFD: apenas REGULADOR_TFD)
GET    /v1/admin/usuarios               (filtra por prefeitura do JWT)

# Solicitação TFD (estendido)
POST   /v1/tfd/solicitacoes             (paciente inline OU pacienteId; acompanhante opcional)
GET    /v1/tfd/solicitacoes?criadaPorMim=true   (mostrar só "minhas")

# Relatório novo
GET    /v1/tfd/relatorios/especialidades?desde=&ate=
```

### 14.8. Checklist da v0.10

Para o backend ser considerado funcional para o frontend v0.10:

- [ ] Enum `Role` inclui `REGULADOR_TFD`.
- [ ] `POST /v1/auth/login` aceita usuários com role `REGULADOR_TFD`.
- [ ] `GET /v1/auth/me` devolve `escopo='PREFEITURA'` para `REGULADOR_TFD`.
- [ ] `podeAcessarFace4TFD` (RBAC backend) inclui `REGULADOR_TFD`.
- [ ] `POST /v1/tfd/solicitacoes` aceita o novo shape com `paciente` ou `pacienteId`.
  - [ ] Faz upsert por CPF quando `paciente` informado.
  - [ ] Persiste `acompanhante` quando informado.
  - [ ] Grava `criadaPorId` = `jwt.sub`.
- [ ] `GET /v1/tfd/solicitacoes?criadaPorMim=true` filtra por `criadaPorId`.
- [ ] `POST /v1/admin/usuarios` aceita `role=GESTOR_TFD` e `role=REGULADOR_TFD`.
  - [ ] GESTOR_TFD pode criar apenas REGULADOR_TFD; senão `PERMISSAO_INSUFICIENTE`.
- [ ] `GET /v1/tfd/relatorios/especialidades` retorna conforme §14.5.
  - [ ] `403 PERMISSAO_INSUFICIENTE` para REGULADOR_TFD.
- [ ] `SolicitacaoTFD` resposta inclui `acompanhante`, `criadaPorId`, `criadaPorNome`.
- [ ] Auditoria: `SOLICITACAO_CRIADA` continua gravando, agora com `criadaPorId`
      explícito no `depois`.

---

## Apêndice C · Estados que o frontend simples espera ver

A UI do REGULADOR_TFD agrupa status assim no card "Aprovadas / Alocadas":

```
status IN ('APROVADA', 'ALOCADA')
```

E em "Negadas / Canceladas":

```
status IN ('NEGADA', 'CANCELADA')
```

Não há mudança de máquina de estado — a UI só rotula diferente.

---

## 13. Alinhamento frontend ↔ backend v0.9

Esta seção documenta o que o frontend **já consome** do backend v0.9.0 — para
manter visibilidade de qualquer drift futuro.

### 13.1. Idempotência (`X-Idempotency-Key`)

O backend implementa idempotência TTL 24h em 4 endpoints. O frontend gera
`crypto.randomUUID()` ao **abrir** cada modal crítico e mantém a chave durante
toda a sessão dele — clicar duas vezes no botão de confirmar devolve o mesmo
resultado em vez de duplicar.

| Endpoint                                   | Modal frontend                                 |
| ------------------------------------------ | ---------------------------------------------- |
| `POST /tfd/saldo/aportar`                  | `/tfd/saldo` → "+ Aportar Saldo"               |
| `POST /tfd/saldo-ajuda-custo/aportar`      | `/tfd/saldo-ajuda-custo` → "+ Aportar"         |
| `POST /tfd/ajudas-custo/:id/pagar`         | `/tfd/ajuda-custo` → botão "Pagar"             |
| `POST /tfd/abastecimentos/:id/comprovante` | `/tfd/abastecimento` → "Registrar Comprovante" |

Implementação no client (`src/lib/api/client.ts`):

```ts
api.post(path, body, { idempotencyKey }); // adiciona X-Idempotency-Key
api.postMultipart(path, form, { idempotencyKey }); // idem para upload
```

### 13.2. Combustível FLEX

O backend rejeita `combustivel: "FLEX"` no abastecimento. Para veículos
cadastrados como `FLEX`, o frontend:

- Sugere `GASOLINA` por padrão.
- Mostra um `<select>` apenas com `GASOLINA`/`ETANOL` para o operador escolher.
- Para outros combustíveis (DIESEL, GNV, ELETRICO etc.), o select fica
  desabilitado com o valor exato do veículo.

### 13.3. Aporte com rateio (`grupoRateioId`)

`POST /tfd/saldo/aportar` com `rateioGeral=true` retorna **um array** de
`AporteSaldoFrota` — um registro por veículo, todos com o mesmo `grupoRateioId`.
O tipo `AporteSaldoFrota` foi atualizado para incluir `grupoRateioId: string | null`.
A página `/tfd/saldo` lista todos os aportes do mês na tabela "Aportes do Mês"
(ordem cronológica); o `grupoRateioId` permite agrupamento futuro se preciso.

### 13.4. Auditoria — `verificar` opcional por prefeitura

`api.tfd.auditoria.verificar(prefeituraId?)` aceita `prefeituraId` opcional
para uso por `DESENVOLVEDOR`/`ADMIN_GLOBAL`. Sem o argumento, o backend usa
a prefeitura do JWT.

### 13.5. Hash-chain canonical (RFC 8785)

Backend v0.9 usa JSON Canonicalization Scheme (RFC 8785) para o hash do log.
Frontend não precisa de mudança — apenas confiar que `verificar` retorna
`{ corrompidos: [] }` numa cadeia íntegra.

### 13.6. Saldo placeholder

`GET /tfd/saldo-ajuda-custo?mes=YYYY-MM` retorna **placeholder zerado** quando
não há registro no mês. O frontend mantém `.catch(() => null)` apenas como
proteção defensiva contra falhas de rede; em operação normal, o valor sempre
chega populado.

### 13.7. Catálogo de erros — completo

Os códigos novos em v0.9 já estão em `src/lib/api/erros-tfd.ts` com tradução
pt-BR:

- `SALDO_AJUDA_INSUFICIENTE`
- `APORTE_INVALIDO`
- `APORTE_FONTE_INVALIDA`
- `APORTE_DOCUMENTO_OBRIGATORIO`
- `TETO_CATEGORIA_EXCEDIDO`

`mensagemErroTfd(e)` retorna a tradução; quando o code não está no catálogo,
cai pra `e.message` do backend.

### 13.8. Quando precisa rebuildar a cadeia

Se o backend rodar `npm run tfd:rebuild-audit-chain` em produção (migração
v0.8 → v0.9), o frontend não precisa fazer nada — `verificar` continua
funcionando, agora com o algoritmo correto. O endpoint `/tfd/auditoria/exportar-tj`
inclui `manifest.json` com o hash assinado.

### 13.9. Drift detection

Para identificar drift entre frontend e backend rapidamente:

1. **Tipos**: `src/lib/api/tfd-types.ts` deve refletir 1:1 o que vem da API.
2. **Códigos de erro**: `ERROS_TFD` em `src/lib/api/erros-tfd.ts` deve cobrir
   todo o catálogo do backend (§10 deste doc).
3. **Endpoints**: `src/lib/api/client.ts` → classe `TfdApi` é a fonte canônica
   das chamadas que o frontend faz. Cada novo endpoint do backend deve ganhar
   método aqui.
