# UNISISM · Face 4 (TFD / Gestão Logística) — Especificação de Backend

> Módulo de **gestão de frota** ponta-a-ponta para Tratamento Fora do Domicílio.
>
> Cobre: cadastro de veículos e motoristas · solicitações de viagem com anexo
> de comprovante · programação da frota · alocação de passageiros · controle de
> presença/faltas · abastecimento (solicitar/liberar/registrar comprovante) ·
> saldo orçamentário por veículo · ajudas de custo a pacientes · relatórios
> consolidados · **trilha de auditoria imutável encadeada criptograficamente
> para prestação de contas com o Tribunal de Justiça**.
>
> O frontend já consome todos esses contratos via `tfdMock` em
> `src/lib/api/tfd-mock.ts`. Quando o backend subir, basta criar
> `src/lib/api/client.ts` → `TfdApi` com os métodos abaixo e remover o mock.

**Versão:** v0.8.2 · **Última atualização:** 2026-04-25

> **v0.8.2 — UX BlaBlaCar (25/04/2026):**
> - Criar viagem aceita `placa` (atalho de UX — backend resolve `veiculoId`); `vagasTotais` opcional (default = capacidade do veículo)
> - Solicitar abastecimento aceita `placa` + modo "valor direto" (`valorEstimado` em vez de `litros × preço`)
> - Alocar passageiro aceita `numeroAssento` opcional; `viagem.assentosOcupados[]` no GET; uniqueness garantida no DB
> - `POST /solicitacoes/:id/aprovar` aceita `alocacao: { viagemId, numeroAssento }` — aprova + aloca atomicamente
> - Novos códigos de erro: `ASSENTO_OCUPADO` (409), `ASSENTO_INVALIDO` (422), `VEICULO_REQUERIDO` (422), `VALOR_REQUERIDO` (422), `VALOR_INVALIDO` (422)

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Arquitetura e princípios](#2-arquitetura-e-princípios)
3. [RBAC](#3-rbac)
4. [Schema do banco (Postgres)](#4-schema-do-banco)
5. [Endpoints HTTP](#5-endpoints-http)
6. [Auditoria TJ — cadeia imutável](#6-auditoria-tj)
7. [Regras de negócio críticas](#7-regras-de-negócio)
8. [Storage de comprovantes](#8-storage-de-comprovantes)
9. [Relatórios](#9-relatórios)
10. [Conformidade legal](#10-conformidade-legal)
11. [Checklist de entrega](#11-checklist-de-entrega)

---

## 1. Visão geral

A Face 4 do UNISISM atende ao fluxo completo do **Tratamento Fora do
Domicílio** — quando um paciente precisa ser deslocado da UBS de origem
até uma unidade especializada (geralmente em outra cidade) e o município
custeia esse deslocamento.

### Atores

| Ator | Onde opera | O que faz |
|---|---|---|
| **UBS** (Face 1) | `/ubs/*` | Cria solicitação de viagem com comprovante de encaminhamento aprovado |
| **Gestor TFD** | `/tfd/*` | Aprova/nega solicitações, programa viagens, libera abastecimento, registra ajudas |
| **Motorista** | (futuro) app mobile | Recebe escala, registra hodômetro, anexa comprovantes |
| **Admin / Dev** | `/tfd/*` + `/sms/*` | Acompanha auditoria, ajusta saldos, gera relatórios consolidados |
| **Paciente** | App (Face 3) | Recebe notificação de viagem agendada, embarque |
| **Tribunal de Justiça / TCM** | (auditoria externa) | Consulta trilha imutável + ZIP mensal |

### Fluxo macro

```
1. UBS cria SolicitaçãoTFD (paciente + comprovante PDF)        ─┐
                                                                 │
2. Gestor TFD aprova/nega na fila                                │ Operação
                                                                 │
3. Gestor TFD cria Viagem programada e aloca solicitações       │
   → assigna Veiculo + Motorista                                 │
                                                                 │
4. Motorista vai abastecer:                                      │
   ABASTECIMENTO: solicita → gestor libera → registra cupom    │ Financeiro
                                                                 │
5. Antes de viajar: pagar AJUDA DE CUSTO ao paciente             │
   (alimentação, hospedagem, deslocamento local)                │
                                                                 │
6. Dia da viagem:                                                │
   - registra hodômetro inicial → INICIA                         │ Operação
   - marca presença (embarcou/faltou/desistiu) por passageiro    │
   - registra hodômetro final → CONCLUI                          │
                                                                 │
7. Tudo gera evento em ledger imutável (auditoria TJ)            │ Auditoria
                                                                 │
8. Fim do mês: relatório consolidado para prestação de contas    │ TCM/TJ
```

### Visão de telas

| Rota | Função |
|---|---|
| `/tfd/dashboard` | Visão geral · 4 KPIs · solicitações pendentes · saídas próximas |
| `/tfd/dashboard/solicitacoes` | Sub-aba — fila com filtro por status |
| `/tfd/dashboard/viagens-ativas` | Sub-aba — em rota + agendadas |
| `/tfd/solicitacoes` | Lista com busca + filtros |
| `/tfd/solicitacoes/[id]` | Detalhe + anexos + aprovar/negar |
| `/tfd/viagens` | Lista de toda a frota com calendário |
| `/tfd/viagens/nova` | Wizard: dados + alocação de solicitações |
| `/tfd/viagens/[id]` | Detalhe + iniciar/concluir/cancelar + presença |
| `/tfd/frota` | CRUD de veículos |
| `/tfd/frota/[id]` | Detalhe + histórico de viagens + abastecimentos |
| `/tfd/motoristas` | CRUD com alerta de CNH a vencer |
| `/tfd/motoristas/[id]` | Histórico de viagens do motorista |
| `/tfd/abastecimento` | Solicitar · liberar · registrar comprovante |
| `/tfd/saldo` | Orçamento mensal por veículo · ajuste auditado |
| `/tfd/ajuda-custo` | Pendentes · autorizar · pagar (PIX/transferência) |
| `/tfd/relatorios` | Consumo · faltas · produção motoristas · TJ |
| `/tfd/auditoria` | Trilha imutável encadeada (apenas Admin/Dev) |
| `/tfd/perfil` | Sessão ativa do gestor |

---

## 2. Arquitetura e princípios

### 2.1 Princípios

1. **Imutabilidade de operação financeira** — abastecimento, saldo, ajuda de custo. Nenhum registro é editado in-place; correções viram nova operação reversora.
2. **Anexos sempre escaneados** (ClamAV) — comprovantes têm `scanStatus: PENDENTE | LIMPO | INFECTADO | FALHOU`. Download só libera com `LIMPO`.
3. **Hash encadeado** em `tfd_audit_log` — cada registro tem `hash_anterior` + `hash` próprio (SHA-256). Adulteração quebra a cadeia.
4. **Isolation por prefeitura** — middleware central injeta `prefeitura_id` no `WHERE` de toda query. 404 em vez de 403.
5. **Backend rejeita** ações com saldo negativo, CNH vencida, capacidade excedida, transição de status inválida — frontend só esconde botões como UX.

### 2.2 Stack mínima sugerida

- Postgres 15+ com extensão `pgcrypto` (gen_random_uuid)
- Storage S3-compatible (MinIO, S3, GCS) com SSE-KMS
- ClamAV em sidecar pra scan de anexos
- BullMQ ou Postgres NOTIFY pra job de hash
- Logger redactor de PII

---

## 3. RBAC

| Recurso | Operação | GESTOR_TFD | ADMIN | DEV | REGULADOR_SMS | UBS roles |
|---|---|:---:|:---:|:---:|:---:|:---:|
| Veículos | CRUD | ✅ | ✅ | ✅ | ❌ | ❌ |
| Motoristas | CRUD | ✅ | ✅ | ✅ | ❌ | ❌ |
| Solicitações | criar | ❌ | ❌ | ✅ | ❌ | ✅ (UBS) |
| Solicitações | aprovar/negar | ✅ | ✅ | ✅ | ❌ | ❌ |
| Viagens | criar/editar/iniciar/concluir | ✅ | ✅ | ✅ | ❌ | ❌ |
| Viagens | cancelar | ✅ (com motivo) | ✅ | ✅ | ❌ | ❌ |
| Abastecimento | solicitar | ✅ | ✅ | ✅ | ❌ | ❌ |
| Abastecimento | liberar/negar | ✅ | ✅ | ✅ | ❌ | ❌ |
| Saldo | visualizar | ✅ | ✅ | ✅ | ❌ | ❌ |
| Saldo | ajustar | ❌ | ✅ | ✅ | ❌ | ❌ |
| Ajuda de custo | criar/autorizar | ✅ | ✅ | ✅ | ❌ | ❌ |
| Ajuda de custo | pagar | ❌ | ✅ | ✅ | ❌ | ❌ |
| Auditoria | ver trilha | ❌ | ✅ | ✅ | ❌ | ❌ |
| Relatórios TJ | exportar ZIP | ❌ | ✅ | ✅ | ❌ | ❌ |

> **Nota sobre solicitações UBS:** o UBS já cria encaminhamentos via Face 1.
> A `SolicitaçãoTFD` é gerada **automaticamente** pela SMS quando aprova um
> encaminhamento que envolve TFD (destino fora do município). Endpoint
> `POST /v1/tfd/solicitacoes` é interno — não é exposto para roles UBS
> diretamente; recebe apenas chamada server-to-server da Face 2.

---

## 4. Schema do banco

### 4.1 Frota

```sql
CREATE TABLE tfd_veiculo (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefeitura_id       uuid NOT NULL REFERENCES prefeitura(id),
  placa               text NOT NULL,
  modelo              text NOT NULL,
  tipo                text NOT NULL,           -- VAN | ONIBUS | CARRO | AMBULANCIA
  capacidade          int NOT NULL,
  ano                 int NOT NULL,
  combustivel         text NOT NULL,           -- DIESEL | GASOLINA | ETANOL | FLEX | GNV | ELETRICO
  consumo_medio_kml   numeric(5,2) NOT NULL,
  hodometro_atual_km  bigint NOT NULL DEFAULT 0,
  proxima_revisao_km  bigint,
  proxima_revisao_em  date,
  status              text NOT NULL DEFAULT 'ATIVO',  -- ATIVO | EM_MANUTENCAO | INATIVO
  criado_em           timestamptz NOT NULL DEFAULT now(),
  criado_por          uuid NOT NULL REFERENCES usuario(id),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  deletado_em         timestamptz,
  UNIQUE (placa) WHERE deletado_em IS NULL
);
```

### 4.2 Motoristas

```sql
CREATE TABLE tfd_motorista (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefeitura_id     uuid NOT NULL REFERENCES prefeitura(id),
  nome              text NOT NULL,
  cpf               text NOT NULL,                -- só dígitos (11)
  cnh               text NOT NULL,
  categoria_cnh     text NOT NULL,                -- B | C | D | E
  validade_cnh      date NOT NULL,
  telefone          text NOT NULL,
  status            text NOT NULL DEFAULT 'ATIVO', -- ATIVO | AFASTADO | INATIVO
  total_viagens     int NOT NULL DEFAULT 0,
  total_km_rodados  bigint NOT NULL DEFAULT 0,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  criado_por        uuid NOT NULL REFERENCES usuario(id),
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  deletado_em       timestamptz,
  UNIQUE (cpf) WHERE deletado_em IS NULL
);
```

### 4.3 Solicitações

```sql
CREATE TABLE tfd_solicitacao (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo                text UNIQUE NOT NULL,    -- TFD-AAAA-NNNNNN
  prefeitura_id            uuid NOT NULL REFERENCES prefeitura(id),
  paciente_id              uuid NOT NULL REFERENCES paciente(id),
  ubs_id                   uuid NOT NULL REFERENCES ubs(id),
  encaminhamento_origem_id uuid REFERENCES encaminhamento(id),
  destino                  text NOT NULL,
  unidade_destino          text,
  especialidade            text NOT NULL,
  motivo                   text NOT NULL,
  data_desejada            date NOT NULL,
  acompanhante_necessario  boolean NOT NULL DEFAULT false,
  prioridade               text NOT NULL,           -- ELETIVA | PRIORITARIA | URGENTE
  status                   text NOT NULL DEFAULT 'PENDENTE',
  observacoes              text,
  motivo_negacao           text,
  viagem_id                uuid REFERENCES tfd_viagem(id),
  criada_em                timestamptz NOT NULL DEFAULT now(),
  decidida_em              timestamptz,
  decidida_por             uuid REFERENCES usuario(id),
  deletada_em              timestamptz
);

CREATE TABLE tfd_solicitacao_anexo (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id      uuid NOT NULL REFERENCES tfd_solicitacao(id),
  nome                text NOT NULL,
  tipo                text NOT NULL,                  -- COMPROVANTE_ENCAMINHAMENTO | EXAME | LAUDO | OUTRO
  tamanho_kb          int NOT NULL,
  storage_key         text NOT NULL,
  scan_status         text NOT NULL DEFAULT 'PENDENTE',
  upload_em           timestamptz NOT NULL DEFAULT now(),
  upload_por          uuid NOT NULL REFERENCES usuario(id)
);
```

### 4.4 Viagens

```sql
CREATE TABLE tfd_viagem (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefeitura_id            uuid NOT NULL REFERENCES prefeitura(id),
  data                     date NOT NULL,
  hora_saida               text NOT NULL,           -- HH:mm
  hora_prevista_retorno    text,
  veiculo_id               uuid NOT NULL REFERENCES tfd_veiculo(id),
  motorista_id             uuid NOT NULL REFERENCES tfd_motorista(id),
  destino                  text NOT NULL,
  unidade_destino          text,
  rota_resumo              text,
  km_estimados             int,
  km_inicial_hodometro     bigint,
  km_final_hodometro       bigint,
  vagas_totais             int NOT NULL,
  observacoes              text,
  status                   text NOT NULL DEFAULT 'AGENDADA',
  criada_em                timestamptz NOT NULL DEFAULT now(),
  criada_por               uuid NOT NULL REFERENCES usuario(id),
  iniciada_em              timestamptz,
  concluida_em             timestamptz,
  motivo_cancelamento      text
);

CREATE TABLE tfd_viagem_passageiro (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id       uuid NOT NULL REFERENCES tfd_viagem(id),
  solicitacao_id  uuid NOT NULL REFERENCES tfd_solicitacao(id),
  paciente_id     uuid NOT NULL REFERENCES paciente(id),
  acompanhante    boolean NOT NULL DEFAULT false,
  presenca        text NOT NULL DEFAULT 'AGUARDANDO',  -- AGUARDANDO | CONFIRMADO | EMBARCADO | AUSENTE | DESISTIU
  observacao      text,
  ajuda_custo_id  uuid REFERENCES tfd_ajuda_custo(id),
  marcado_em      timestamptz,
  marcado_por     uuid REFERENCES usuario(id)
);
```

### 4.5 Abastecimento + Saldo

```sql
CREATE TABLE tfd_abastecimento (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo                     text UNIQUE NOT NULL,   -- ABT-AAAA-NNNNNN
  prefeitura_id                 uuid NOT NULL REFERENCES prefeitura(id),
  veiculo_id                    uuid NOT NULL REFERENCES tfd_veiculo(id),
  motorista_id                  uuid REFERENCES tfd_motorista(id),
  viagem_id                     uuid REFERENCES tfd_viagem(id),
  posto                         text NOT NULL,
  litros                        numeric(8,2) NOT NULL DEFAULT 0,
  combustivel                   text NOT NULL,
  valor_por_litro               numeric(8,3) NOT NULL DEFAULT 0,
  valor_total                   numeric(12,2) NOT NULL,
  hodometro_km                  bigint NOT NULL,
  km_desde_ultimo_abastecimento int,
  consumo_calculado_kml         numeric(5,2),
  status                        text NOT NULL DEFAULT 'SOLICITADO',
  comprovante_storage_key       text,
  motivo_negacao                text,
  solicitado_em                 timestamptz NOT NULL DEFAULT now(),
  solicitado_por                uuid NOT NULL REFERENCES usuario(id),
  liberado_em                   timestamptz,
  liberado_por                  uuid REFERENCES usuario(id),
  realizado_em                  timestamptz
);

CREATE TABLE tfd_saldo_veiculo (
  veiculo_id            uuid NOT NULL REFERENCES tfd_veiculo(id),
  prefeitura_id         uuid NOT NULL REFERENCES prefeitura(id),
  mes                   text NOT NULL,             -- YYYY-MM
  saldo_mensal_brl      numeric(14,2) NOT NULL,
  saldo_consumido_brl   numeric(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (veiculo_id, mes)
);

CREATE TABLE tfd_saldo_ajuste (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id      uuid NOT NULL,
  mes             text NOT NULL,
  saldo_anterior  numeric(14,2) NOT NULL,
  saldo_novo      numeric(14,2) NOT NULL,
  justificativa   text NOT NULL,
  ajustado_por    uuid NOT NULL REFERENCES usuario(id),
  ajustado_em     timestamptz NOT NULL DEFAULT now()
);
```

### 4.6 Ajuda de Custo

```sql
CREATE TABLE tfd_ajuda_custo (
  id                                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo                          text UNIQUE NOT NULL,    -- AJC-AAAA-NNNNNN
  prefeitura_id                      uuid NOT NULL REFERENCES prefeitura(id),
  viagem_id                          uuid NOT NULL REFERENCES tfd_viagem(id),
  paciente_id                        uuid NOT NULL REFERENCES paciente(id),
  itens                              jsonb NOT NULL,         -- [{ categoria, descricao, valorBRL }]
  valor_total_brl                    numeric(12,2) NOT NULL,
  status                             text NOT NULL DEFAULT 'PENDENTE',
  metodo_pagamento                   text,                   -- PIX | TRANSFERENCIA | DINHEIRO_RH
  comprovante_pagamento_storage_key  text,
  motivo_negacao                     text,
  criada_em                          timestamptz NOT NULL DEFAULT now(),
  criada_por                         uuid NOT NULL REFERENCES usuario(id),
  autorizada_em                      timestamptz,
  autorizada_por                     uuid REFERENCES usuario(id),
  paga_em                            timestamptz,
  paga_por                           uuid REFERENCES usuario(id)
);
```

### 4.7 Auditoria (cadeia imutável TJ)

```sql
CREATE TABLE tfd_audit_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefeitura_id       uuid NOT NULL REFERENCES prefeitura(id),
  acao                text NOT NULL,              -- ver enum AcaoAuditoriaTFD
  recurso_tipo        text NOT NULL,              -- VEICULO | MOTORISTA | ...
  recurso_id          uuid NOT NULL,
  recurso_protocolo   text,
  operador_id         uuid NOT NULL REFERENCES usuario(id),
  operador_nome       text NOT NULL,
  operador_matricula  text NOT NULL,
  operador_role       text NOT NULL,
  ip                  inet NOT NULL,
  user_agent          text NOT NULL,
  antes               jsonb,
  depois              jsonb,
  hash_anterior       text NOT NULL,             -- SHA-256 do registro anterior
  hash                text NOT NULL,             -- SHA-256(this | hash_anterior)
  em                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tfd_audit_prefeitura_em
  ON tfd_audit_log (prefeitura_id, em DESC);

CREATE INDEX idx_tfd_audit_recurso
  ON tfd_audit_log (recurso_tipo, recurso_id, em DESC);

-- TRIGGER que impede UPDATE/DELETE da tabela de auditoria.
CREATE OR REPLACE FUNCTION tfd_audit_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'tfd_audit_log é imutável (LGPD/TJ).';
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER tfd_audit_no_update BEFORE UPDATE ON tfd_audit_log
  FOR EACH ROW EXECUTE FUNCTION tfd_audit_immutable();
CREATE TRIGGER tfd_audit_no_delete BEFORE DELETE ON tfd_audit_log
  FOR EACH ROW EXECUTE FUNCTION tfd_audit_immutable();
```

> **Retenção:** 20 anos. Compatível com prazo de prescrição administrativa
> em obras públicas (LC 101/2000).

---

## 5. Endpoints HTTP

Base: `/v1/tfd/`. Todos exigem `Authorization: Bearer <jwt>` e role compatível
(ver §3). Quando `API_KEY` estiver configurada no backend, também exigem
`x-api-key` ou o header definido em `API_KEY_HEADER`. Erros seguem o padrão
`{ "error": { "code": "...", "message": "..." } }`.

### 5.1 Frota

| Método | Rota | Body / Query | Response |
|---|---|---|---|
| GET    | `/veiculos` | — | `Veiculo[]` |
| POST   | `/veiculos` | `CriarVeiculoRequest` | `Veiculo` |
| GET    | `/veiculos/:id` | — | `Veiculo` |
| PATCH  | `/veiculos/:id` | `AtualizarVeiculoRequest` | `Veiculo` |
| POST   | `/veiculos/:id/manutencao` | — | `Veiculo` (status=EM_MANUTENCAO) |
| POST   | `/veiculos/:id/reativar` | — | `Veiculo` (status=ATIVO) |
| DELETE | `/veiculos/:id` | — | 204 (soft delete · só DEV) |

### 5.2 Motoristas

| Método | Rota | Body / Query | Response |
|---|---|---|---|
| GET    | `/motoristas` | — | `Motorista[]` |
| POST   | `/motoristas` | `CriarMotoristaRequest` | `Motorista` |
| GET    | `/motoristas/:id` | — | `Motorista` |
| PATCH  | `/motoristas/:id` | `AtualizarMotoristaRequest` | `Motorista` |
| POST   | `/motoristas/:id/afastar` | — | `Motorista` |
| POST   | `/motoristas/:id/reativar` | — | `Motorista` |
| DELETE | `/motoristas/:id` | — | 204 (soft delete · só DEV) |

### 5.3 Solicitações TFD

| Método | Rota | Body / Query | Response |
|---|---|---|---|
| GET    | `/solicitacoes` | `?status=&prioridade=&q=` | `SolicitacaoTFD[]` |
| POST   | `/solicitacoes` | `CriarSolicitacaoRequest` | `SolicitacaoTFD` |
| GET    | `/solicitacoes/:id` | — | `SolicitacaoTFD` |
| POST   | `/solicitacoes/:id/aprovar` | `{ observacoes? }` | `SolicitacaoTFD` |
| POST   | `/solicitacoes/:id/negar` | `{ motivo }` (mín. 10 chars) | `SolicitacaoTFD` |
| POST   | `/solicitacoes/:id/anexos` | `multipart/form-data { tipo, file }` | `AnexoSolicitacaoTFD` |
| GET    | `/anexos/:id/download` | — | binary (só `scanStatus=LIMPO`) |

### 5.4 Viagens

| Método | Rota | Body | Response |
|---|---|---|---|
| GET    | `/viagens` | `?status=&desde=&ate=` | `ViagemFrota[]` |
| POST   | `/viagens` | `CriarViagemRequest` | `ViagemFrota` |
| GET    | `/viagens/:id` | — | `ViagemFrota` |
| PATCH  | `/viagens/:id` | `AtualizarViagemRequest` | `ViagemFrota` |
| POST   | `/viagens/:id/iniciar` | `{ kmInicialHodometro }` | `ViagemFrota` |
| POST   | `/viagens/:id/concluir` | `{ kmFinalHodometro, observacoes? }` | `ViagemFrota` |
| POST   | `/viagens/:id/cancelar` | `{ motivo }` | `ViagemFrota` |
| POST   | `/viagens/:id/km-gestor` | `{ kmInicialHodometro?, kmFinalHodometro?, justificativa }` | `ViagemFrota` |
| POST   | `/viagens/:id/alocar` | `{ solicitacaoId, numeroAssento? }` | `ViagemFrota` |
| POST   | `/viagens/:id/passageiros` | `{ solicitacaoId }` | `ViagemFrota` |
| DELETE | `/viagens/:id/passageiros/:pid` | — | `ViagemFrota` |
| POST   | `/viagens/:id/passageiros/:pid/presenca` | `{ presenca, observacao? }` | `ViagemFrota` |

**Validações importantes:**
- Não permitir `INICIAR` se há motorista com CNH vencida
- Não permitir `INICIAR` se veículo está EM_MANUTENCAO
- `vagas_ocupadas` calculado dinamicamente; backend recusa alocar se já cheio
- Transição válida: `AGENDADA → EM_ANDAMENTO → CONCLUIDA`. `* → CANCELADA` aceita; revertida apenas com aprovação ADMIN.

### 5.5 Abastecimento

| Método | Rota | Body | Response |
|---|---|---|---|
| GET    | `/abastecimentos` | `?status=&veiculoId=&desde=&ate=` | `Abastecimento[]` |
| POST   | `/abastecimentos` | `SolicitarAbastecimentoRequest` | `Abastecimento` (status=SOLICITADO) |
| POST   | `/abastecimentos/:id/liberar` | `{ observacao? }` | `Abastecimento` (status=LIBERADO) |
| POST   | `/abastecimentos/:id/negar` | `{ motivo }` | `Abastecimento` (status=NEGADO) |
| POST   | `/abastecimentos/:id/comprovante` | `multipart { litros, valorPorLitro, valorTotal, hodometroKm, file }` | `Abastecimento` (status=REALIZADO) |
| GET    | `/abastecimentos/:id/comprovante` | — | binary |

**Regras críticas:**
- `valorTotal` ao registrar comprovante NÃO pode exceder em mais de 5% o `valor_estimado` solicitado, exceto com aprovação adicional de ADMIN.
- Ao registrar `REALIZADO`: backend automaticamente debita do `tfd_saldo_veiculo` daquele mês.
- Saldo negativo bloqueia novas solicitações até ajuste explícito.

### 5.6 Saldo

| Método | Rota | Body | Response |
|---|---|---|---|
| GET    | `/saldo` | `?mes=YYYY-MM` | `SaldoVeiculo[]` |
| POST   | `/saldo/ajustar` | `AjustarSaldoRequest` | `SaldoVeiculo` (apenas ADMIN/DEV) |

**Backend deve criar registros de saldo automaticamente:** todo dia 1º do mês,
job copia o `saldo_mensal_brl` do mês anterior para o novo mês (zerando o
`saldo_consumido_brl`). Ajustes manuais sempre exigem `justificativa` mínima
de 10 chars + auditoria.

### 5.7 Ajuda de Custo

| Método | Rota | Body | Response |
|---|---|---|---|
| GET    | `/ajudas-custo` | `?status=&pacienteId=` | `AjudaCusto[]` |
| GET    | `/ajudas-custo/:id` | — | `AjudaCusto` |
| POST   | `/ajudas-custo` | `SolicitarAjudaCustoRequest` | `AjudaCusto` |
| POST   | `/ajudas-custo/:id/autorizar` | — | `AjudaCusto` |
| POST   | `/ajudas-custo/:id/pagar` | `multipart { metodoPagamento, file }` | `AjudaCusto` |
| POST   | `/ajudas-custo/:id/negar` | `{ motivo }` | `AjudaCusto` |

**Regra anti-fraude:** o mesmo paciente não pode receber duas ajudas de custo
para a mesma viagem (UNIQUE composto `viagem_id + paciente_id` em ajudas
status ≠ NEGADA/CANCELADA).

### 5.8 Auditoria

| Método | Rota | Body / Query | Response |
|---|---|---|---|
| GET    | `/auditoria` | `?recursoTipo=&recursoId=&desde=&ate=` | `RegistroAuditoriaTFD[]` |
| GET    | `/auditoria/exportar-tj?mes=YYYY-MM` | — | ZIP com CSVs + manifest hash |
| GET    | `/auditoria/verificar` | — | resultado da verificação da cadeia hash |
| GET    | `/auditoria/:id` | — | `RegistroAuditoriaTFD` |

**Apenas ADMIN/DEV.** Endpoint imutável — nunca aceita POST/PATCH/DELETE.

### 5.9 Solicitações do App Paciente

| Método | Rota | Body / Query | Response |
|---|---|---|---|
| GET    | `/solicitacoes-paciente` | `?status=&viagemId=&prioridade=` | `TfdPacienteSolicAdminDto[]` |
| GET    | `/solicitacoes-paciente/:id` | — | `TfdPacienteSolicAdminDto` |
| POST   | `/solicitacoes-paciente/:id/aprovar` | `{ numeroAssento? }` | `TfdPacienteSolicAdminDto` |
| POST   | `/solicitacoes-paciente/:id/recusar` | `{ motivo }` | `TfdPacienteSolicAdminDto` |
| POST   | `/solicitacoes-paciente/:id/embarque` | — | `TfdPacienteSolicAdminDto` |
| POST   | `/solicitacoes-paciente/:id/concluir` | — | `TfdPacienteSolicAdminDto` |

### 5.10 Relatórios

Reaproveita o módulo `Relatorio` existente (§API.md sobre Relatórios) com
novos `TipoRelatorioTFD`:

```
CONSUMO_FROTA · FALTAS_PACIENTES · FALTAS_INDIVIDUAL ·
PRESTACAO_CONTAS_TJ · AJUDAS_CUSTO_PAGAS · PRODUCAO_MOTORISTAS
```

Geração assíncrona com `POST /v1/relatorios` retornando `id` para polling.

---

## 6. Auditoria TJ

### 6.1 Cadeia criptográfica

Cada operação relevante (ver enum `AcaoAuditoriaTFD` em `types.ts`) gera linha:

```text
hash = SHA-256(
  id + acao + recurso_id +
  operador_id + ip + em_iso +
  JSON(antes) + JSON(depois) +
  hash_anterior
)
```

`hash_anterior` é o `hash` do último registro inserido na **mesma prefeitura**.
O primeiro registro de cada prefeitura usa `'0' x 64` como anterior (genesis).

### 6.2 Verificação de integridade

```sql
-- Endpoint GET /v1/tfd/auditoria/verificar (ADMIN/DEV)
-- Re-calcula hash de todos os registros e compara com armazenado.
-- Qualquer discrepância → 500 com lista de IDs corrompidos.
```

### 6.3 Exportação para TJ

`GET /v1/tfd/auditoria/exportar-tj?mes=YYYY-MM` retorna ZIP contendo:

- `auditoria.csv` — todos registros do mês
- `viagens.csv` — viagens do mês com hodômetros e KM rodados
- `abastecimentos.csv` — todos com valor + comprovante (link)
- `ajudas-custo.csv` — todos pagamentos
- `saldo-mensal.csv` — saldo inicial, movimentos, saldo final por veículo
- `manifest.json`:
  ```json
  {
    "mes": "2026-04",
    "prefeitura": "...",
    "geradoEm": "2026-05-01T00:00:00Z",
    "geradoPor": "Carlos Henrique Frota (TFD-001)",
    "totalRegistros": 1834,
    "hashInicial": "abc...",
    "hashFinal": "xyz...",
    "hashManifesto": "SHA-256 do conteúdo deste manifest"
  }
  ```

O ZIP é assinado digitalmente (XMLDSig ou ICP-Brasil se configurado) e
disponibilizado como relatório do tipo `PRESTACAO_CONTAS_TJ`.

---

## 7. Regras de negócio

1. **Capacidade:** ao alocar passageiro, backend valida `passageiros.length < veiculo.capacidade`.
2. **Cancelamento:** cancelar viagem libera as solicitações alocadas (status volta para `APROVADA`).
3. **Hodômetro:** `kmFinal > kmInicial` sempre. Se anterior, recusa.
4. **CNH:** ao iniciar viagem, backend bloqueia se `motorista.validade_cnh < hoje + 1`.
5. **Saldo:** abastecimento `LIBERADO` reserva valor estimado; `REALIZADO` debita real e libera o reservado.
6. **Faltas:** após **3 ausências em 6 meses**, paciente entra em flag `bloqueado=true` (frontend mostra alerta na criação de nova solicitação). Job mensal recalcula.
7. **Idempotência de pagamento:** ajuda de custo só pode ser paga se `status=AUTORIZADA`. Repetir requisição retorna o mesmo registro (header `Idempotency-Key` opcional).
8. **Comprovante obrigatório:** `REALIZADO` (abastecimento) e `PAGA` (ajuda) exigem anexo válido (`scanStatus=LIMPO`). Backend recusa sem.

---

## 8. Storage de comprovantes

### 8.1 Estrutura S3

```
s3://unisism-tfd/<prefeituraId>/<ano>/<mes>/<recurso>/<id>.<ext>
```

Exemplos:
```
.../comprovantes-encaminhamento/abc-uuid.pdf
.../comprovantes-abastecimento/xyz-uuid.pdf
.../comprovantes-pagamento-ajuda/def-uuid.pdf
```

### 8.2 ClamAV scan

- Upload entra em `scan_status='PENDENTE'`
- Job assíncrono passa pelo daemon ClamAV
- Resultado: `LIMPO` (libera download) · `INFECTADO` (bloqueia, notifica DPO) · `FALHOU` (re-tenta 3x, depois marca `FALHOU` para inspeção manual)

### 8.3 SSE

Sempre `SSE-KMS` com chave gerenciada pela prefeitura. Acesso via URLs
pré-assinadas com TTL de 60s — cliente sempre passa pelo backend para baixar
(controle de auditoria).

---

## 9. Relatórios

| Tipo | Roles | Conteúdo |
|---|---|---|
| `CONSUMO_FROTA` | GESTOR_TFD+ | Por veículo: km rodados, litros, R$, consumo médio, saldo restante |
| `FALTAS_PACIENTES` | GESTOR_TFD+ | Lista pacientes com taxa de falta acima de 30% no período |
| `FALTAS_INDIVIDUAL` | GESTOR_TFD+ | Detalhe por paciente com lista de viagens marcadas como ausente/desistência |
| `AJUDAS_CUSTO_PAGAS` | GESTOR_TFD+ | Lista de pagamentos com comprovante (link) por período |
| `PRODUCAO_MOTORISTAS` | GESTOR_TFD+ | Por motorista: total viagens, km, ausências em escala |
| `PRESTACAO_CONTAS_TJ` | ADMIN+ | ZIP completo (§6.3) com cadeia hash íntegra |

Geração assíncrona via job; status `PROCESSANDO → DISPONIVEL → FALHA`. TTL
de download: 7 dias (SSE-KMS).

---

## 10. Conformidade legal

| Norma | Aplicação |
|---|---|
| **LGPD 13.709/2018** | Art. 7º III — execução de política pública. Anexos com PDF têm scan + cifra em repouso. Trilha de auditoria 20 anos. |
| **LC 101/2000 (LRF)** | Lei de Responsabilidade Fiscal · saldo mensal por veículo + ajuste auditado preserva trilha de gasto público. |
| **Lei 14.133/2021 (Licitações)** | Veículos próprios e compras de combustível precisam ter trilha de origem · cada abastecimento com nota fiscal. |
| **Res. CFM 1.821/2007** | Documentos clínicos do paciente (encaminhamento) são prontuário · 20 anos. |
| **Lei 8.080/1990 (SUS)** | TFD é direito do usuário do SUS · documentação obrigatória. |
| **Portaria GM/MS 55/1999** | Tratamento Fora do Domicílio — fluxo, regras, ajuda de custo. |

---

## 11. Checklist de entrega

### Schema
- [ ] 9 tabelas + índices + triggers de imutabilidade auditoria
- [ ] Função SQL `tfd_calcular_saldo(veiculo_id, mes)` para snapshot
- [ ] Job mensal de criação de saldos (cron 1º dia do mês)
- [ ] Job assíncrono de hash da cadeia (BullMQ ou pg_notify)
- [ ] ClamAV em sidecar pra scan de anexos

### Endpoints (57 rotas)
- [ ] Frota: 7 rotas
- [ ] Motoristas: 7 rotas
- [ ] Solicitações: 7 rotas
- [ ] Viagens: 10 rotas (incluindo presença e passageiros)
- [ ] Abastecimento: 6 rotas
- [ ] Saldo: 2 rotas
- [ ] Ajudas de Custo: 5 rotas
- [ ] Auditoria: 3 rotas

### RBAC + Auditoria
- [ ] Middleware central de RBAC (matriz §3)
- [ ] Middleware de isolation por prefeitura
- [ ] Trigger de hash encadeado em `tfd_audit_log`
- [ ] Endpoint de verificação de integridade (DEV apenas)

### Validações
- [ ] CNH não vencida ao iniciar viagem (422 CNH_VENCIDA)
- [ ] Veículo não em manutenção ao iniciar (422 VEICULO_INDISPONIVEL)
- [ ] Capacidade do veículo ao alocar passageiro (422 CAPACIDADE_EXCEDIDA)
- [ ] Saldo positivo ao liberar abastecimento (422 SALDO_INSUFICIENTE)
- [ ] Hodômetro decrescente (422 HODOMETRO_INVALIDO)
- [ ] Ajuda de custo única por paciente+viagem (409 AJUDA_DUPLICADA)
- [ ] Comprovante anexo obrigatório em REALIZADO e PAGA (422 COMPROVANTE_AUSENTE)

### Testes integrados
- [ ] Cadeia de hash íntegra após N inserções
- [ ] Adulteração manual de registro de auditoria → trigger bloqueia
- [ ] Cancelamento de viagem libera solicitações alocadas
- [ ] CONCLUIR viagem soma KM ao motorista e atualiza hodômetro do veículo
- [ ] Comprovante de abastecimento debita saldo automaticamente
- [ ] Ajuste de saldo gera registro auditado com justificativa
- [ ] Export TJ ZIP é determinístico (hashes batem) entre 2 chamadas

### Frontend já pronto
Todos os contratos abaixo já estão implementados em
`src/lib/api/tfd-mock.ts` (será removido quando o backend subir):

```ts
api.tfd.veiculos.list/create/byId/update/setStatus
api.tfd.motoristas.list/create/byId/update/setStatus
api.tfd.solicitacoes.list/byId/aprovar/negar
api.tfd.viagens.list/create/byId/update/iniciar/concluir/cancelar/marcarPresenca
api.tfd.abastecimentos.list/solicitar/liberar/negar/registrar
api.tfd.saldo.list/ajustar
api.tfd.ajudasCusto.list/byId/solicitar/autorizar/pagar/negar
api.tfd.auditoria.list/byId/exportarTJ
```

E os tipos correspondentes em `src/lib/api/types.ts` (já exportados).

**Quando o backend subir as 57 rotas seguindo este documento, basta criar a
classe `TfdApi` em `client.ts` e remover o import do `tfd-mock.ts`. Nenhuma
linha de UI precisa mudar.**

---

*Documento mantido pelo time de arquitetura UNISISM. DPO: definir.*
