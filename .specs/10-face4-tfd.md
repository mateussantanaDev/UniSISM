# 10 · Face 4 — Tratamento Fora do Domicílio (TFD)

> Módulo de **gestão logística** ponta-a-ponta. Cobre cadastro de veículos
> e motoristas, solicitações de viagem com comprovante, programação da frota,
> alocação de passageiros, controle de presença, abastecimento controlado,
> saldo orçamentário por veículo, ajudas de custo a pacientes, relatórios e
> **trilha de auditoria imutável criptograficamente encadeada para prestação
> de contas com o Tribunal de Justiça / Tribunal de Contas dos Municípios**.

---

## Atores

| Ator | Onde opera |
|---|---|
| **Gestor TFD** (`GESTOR_TFD`) | Web `/tfd/*` |
| **Atendente TFD** (`ATENDENTE_TFD`) | Web subset (terminal rodoviário) |
| **Motorista** (`MOTORISTA_TFD`) | App Flutter (`UNISISM-motorista/`) |
| **ADMIN / DEV** | Web `/tfd/*` (com privilégios elevados) |
| **Atendente UBS** | Pode criar `SolicitacaoTFD` (subset de `/tfd/solicitacoes`) |
| **Paciente** | App Face 3 — read-only do próprio TFD |

## Fluxo macro

```
1. Atendente UBS / Terminal cria SolicitacaoTFD
   ├─ paciente
   ├─ origem → destino
   ├─ motivo (consulta especialidade)
   ├─ data desejada
   └─ comprovante (PDF encaminhamento aprovado)

2. Gestor TFD vê na fila
   ├─ Aprova → opcionalmente já aloca em uma viagem
   ├─ Nega   → motivo obrigatório (>= 10 chars)

3. Gestor TFD cria ViagemFrota
   ├─ data + hora
   ├─ veículo (placa) + motorista
   ├─ vagas (default = capacidade do veículo)
   └─ aloca solicitações aprovadas (numeroAssento opcional)

4. Antes da viagem:
   ├─ Solicitar abastecimento → Gestor libera → motorista anexa cupom
   └─ Autorizar ajuda de custo do paciente (PIX) → ADM paga + anexa comprovante

5. Dia da viagem (app motorista):
   ├─ Motorista vê escala
   ├─ Inicia viagem (km inicial obrigatório, valida CNH + hodômetro)
   ├─ Chamada digital de presença (cada passageiro: PRESENTE / AUSENTE / DESISTIU)
   └─ Conclui viagem (km final → atualiza hodômetro do veículo)

6. Tudo gera linha em tfd_audit_log (hash chain SHA-256)
   └─ Exportável como ZIP para o TJ/TCM com manifest assinado (ICP-Brasil opcional)
```

## Rotas frontend (gestão)

```
/tfd                          layout principal
/tfd/dashboard                4 KPIs + solicitações pendentes + viagens próximas
  ├── solicitacoes            sub-aba
  └── viagens-ativas          sub-aba
/tfd/solicitacoes             lista + filtros
/tfd/solicitacoes/[id]        detalhe + aprovar/negar
/tfd/viagens                  calendário + lista
/tfd/viagens/nova             wizard: dados + alocação
/tfd/viagens/[id]             detalhe + iniciar/concluir/cancelar + presença
/tfd/frota                    CRUD veículos
/tfd/frota/[id]               detalhe + histórico
/tfd/motoristas               CRUD motoristas + alerta CNH
/tfd/motoristas/[id]          histórico
/tfd/abastecimento            solicitar · liberar · comprovante
/tfd/saldo                    orçamento mensal por veículo
/tfd/saldo-ajuda-custo        orçamento mensal de AJC
/tfd/ajuda-custo              pendentes · autorizar · pagar
/tfd/relatorios               consumo · faltas · produção · TJ
/tfd/relatorios/especialidades
/tfd/auditoria                trilha hash chain (ADM/DEV)
/tfd/usuarios                 CRUD usuários TFD
/tfd/perfil                   sessão ativa
```

## Endpoints (47 — referência completa em `backend/docs/TFD_API.md`)

### Frota (7)

```
GET    /v1/tfd/veiculos
POST   /v1/tfd/veiculos
GET    /v1/tfd/veiculos/:id
PATCH  /v1/tfd/veiculos/:id
POST   /v1/tfd/veiculos/:id/manutencao
POST   /v1/tfd/veiculos/:id/reativar
DELETE /v1/tfd/veiculos/:id        (ADM/DEV)
```

### Motoristas (7)

```
GET    /v1/tfd/motoristas
POST   /v1/tfd/motoristas          ← cria Atendente role MOTORISTA_TFD + senha provisória
GET    /v1/tfd/motoristas/:id
PATCH  /v1/tfd/motoristas/:id
POST   /v1/tfd/motoristas/:id/afastar
POST   /v1/tfd/motoristas/:id/reativar
DELETE /v1/tfd/motoristas/:id      (ADM/DEV)
```

### Solicitações (7)

```
GET    /v1/tfd/solicitacoes
POST   /v1/tfd/solicitacoes
GET    /v1/tfd/solicitacoes/:id
POST   /v1/tfd/solicitacoes/:id/aprovar    body: { alocacao: { viagemId, numeroAssento? } }
POST   /v1/tfd/solicitacoes/:id/negar
POST   /v1/tfd/solicitacoes/:id/anexos
GET    /v1/tfd/anexos/:id/download
```

### Viagens (10)

```
GET    /v1/tfd/viagens
POST   /v1/tfd/viagens             body: { placa | veiculoId, motoristaId, dataSaida, vagasTotais? }
GET    /v1/tfd/viagens/:id
PATCH  /v1/tfd/viagens/:id
POST   /v1/tfd/viagens/:id/iniciar
POST   /v1/tfd/viagens/:id/concluir
POST   /v1/tfd/viagens/:id/cancelar
POST   /v1/tfd/viagens/:id/passageiros
DELETE /v1/tfd/viagens/:id/passageiros/:pid
POST   /v1/tfd/viagens/:id/passageiros/:pid/presenca
```

### Abastecimento (6)

```
GET    /v1/tfd/abastecimentos
POST   /v1/tfd/abastecimentos      body: { placa | veiculoId, valorEstimado | litros + precoLitro }
POST   /v1/tfd/abastecimentos/:id/liberar
POST   /v1/tfd/abastecimentos/:id/negar
POST   /v1/tfd/abastecimentos/:id/comprovante  multipart
GET    /v1/tfd/abastecimentos/:id/comprovante
```

### Saldo (2)

```
GET    /v1/tfd/saldo
POST   /v1/tfd/saldo/ajustar       (ADM/DEV)
```

### Ajuda de Custo (6)

```
GET    /v1/tfd/ajudas-custo
GET    /v1/tfd/ajudas-custo/:id
POST   /v1/tfd/ajudas-custo
POST   /v1/tfd/ajudas-custo/:id/autorizar
POST   /v1/tfd/ajudas-custo/:id/pagar       (ADM/DEV, multipart com comprovante)
POST   /v1/tfd/ajudas-custo/:id/negar
```

### Auditoria TJ (4)

```
GET    /v1/tfd/auditoria                     lista paginada
GET    /v1/tfd/auditoria/:id                 detalhe (payload jsonb)
GET    /v1/tfd/auditoria/exportar-tj         ZIP — query: ?inicio=YYYY-MM&fim=YYYY-MM
GET    /v1/tfd/auditoria/verificar           verifica integridade da cadeia hash
```

### App motorista (12 — `backend/docs/MOTORISTA_APP_API.md`)

Cobertos em [`09-face3-paciente-app.md`](./09-face3-paciente-app.md) (mesmo
formato Flutter) e detalhados em `backend/docs/MOTORISTA_APP_API.md`.

## Regras de negócio críticas

### Aprovar solicitação com alocação atômica

```
1. Inicia transaction.
2. SELECT id FROM tfd_viagens WHERE id = $viagemId FOR UPDATE
   ← lock pessimista para evitar overbook.
3. count(passageiros aprovados) < viagem.vagasTotais?
   ├─ Não → 409 TFD_VIAGEM_SEM_VAGAS
   └─ Sim → continua.
4. Se numeroAssento foi passado:
   ├─ Já ocupado? → 409 TFD_ASSENTO_OCUPADO
   └─ Livre? → usa.
5. Se numeroAssento NÃO foi passado:
   ├─ Tenta gerar automaticamente até 20 tentativas.
   └─ Não achou? → 409 TFD_ASSENTO_INDISPONIVEL
6. INSERT ViagemPassageiro + UPDATE SolicitacaoTFD status APROVADA.
7. Audit log com hash chain.
8. Commit.
```

### Iniciar viagem (app motorista)

```
1. CNH vigente? cnhVigencia >= today
   ├─ Não → 422 TFD_CNH_VENCIDA
2. kmInicialHodometro >= último hodômetro registrado do veículo?
   ├─ Não → 422 TFD_HODOMETRO_REGRESSO
3. Status = AGENDADA?
   ├─ Não → 409 TFD_VIAGEM_STATUS_INVALIDO
4. Update viagem (status EM_ANDAMENTO + kmInicialHodometro).
5. Update veículo.kmAtualHodometro.
6. Audit log.
```

### Concluir viagem

```
1. Status = EM_ANDAMENTO?
2. kmFinalHodometro > kmInicialHodometro?
3. Pelo menos UM passageiro com presença registrada?
4. Update viagem (status CONCLUIDA + kmFinalHodometro).
5. Update veículo.kmAtualHodometro.
6. Atualiza saldo do veículo (custo estimado por km).
7. Audit log.
```

### Solicitar abastecimento — UX BlaBlaCar

Dois modos:

- **Litros × preço**: `{ litros: 50, precoLitro: 5.99 }` → backend calcula `valorEstimado`.
- **Valor direto**: `{ valorEstimado: 299.50 }` (motorista não sabe preço exato).

Atalho: passar `placa` em vez de `veiculoId` (backend resolve).

### Saldo

- Saldo mensal por veículo, alimentado por `AporteSaldoFrota`.
- Toda abastecimento aprovado deduz do saldo.
- Ajuste manual (ADM/DEV) gera linha de audit + motivo obrigatório.
- Saldo negativo bloqueia novos abastecimentos → 422 `TFD_SALDO_INSUFICIENTE`.

### Ajuda de Custo

- Categorias: ALIMENTACAO / HOSPEDAGEM / DESLOCAMENTO_LOCAL.
- Fluxo: `criar → autorizar → pagar (com comprovante)`.
- Pagamento via PIX ou transferência (campo `formaPagamento` + `chavePix?`).
- Saldo de AJC mensal separado do saldo de frota.

## Audit TJ — hash chain SHA-256

### Estrutura

```sql
CREATE TABLE tfd_audit_log (
  id              UUID PRIMARY KEY,
  prefeitura_id   UUID NOT NULL,
  evento          TEXT NOT NULL,             -- SCREAMING_SNAKE
  payload         JSONB NOT NULL,            -- estado anterior + ação + novo
  hash_anterior   CHAR(64) NOT NULL,         -- 64 zeros no genesis
  hash            CHAR(64) NOT NULL,         -- SHA-256(canonical(payload) || hash_anterior)
  assinatura_icp  TEXT,                      -- opcional, quando TFD_SIGN_REQUIRED=true
  atendente_id    UUID,
  ip              INET,
  user_agent      TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- trigger SQL bloqueia UPDATE e DELETE
CREATE TRIGGER trg_tfd_audit_imutavel BEFORE UPDATE OR DELETE ON tfd_audit_log
  FOR EACH ROW EXECUTE FUNCTION raise_imutavel();
```

### Cadeia por tenant

Cada `prefeitura_id` tem sua própria cadeia. Linha 0 (genesis):
`hash_anterior = '0'.repeat(64)`. Cada linha seguinte usa `hash` da anterior.

### Verificar integridade

`GET /v1/tfd/auditoria/verificar` percorre todas as linhas do tenant em ordem
cronológica, recalcula o hash e compara. Resultado:

```json
{ "valido": true, "totalLinhas": 12345 }
```

ou

```json
{
  "valido": false,
  "quebraEm": "<id>",
  "esperado": "<hash>",
  "encontrado": "<hash>"
}
```

### Exportar TJ

`GET /v1/tfd/auditoria/exportar-tj?inicio=YYYY-MM&fim=YYYY-MM` retorna ZIP com:

```
manifest.json            { tenant, periodo, totalLinhas, primeiroHash, ultimoHash }
manifest.json.sig        assinatura ICP-Brasil (se TFD_SIGN_REQUIRED=true)
audit.csv                todas as linhas do período
comprovantes/            anexos referenciados no payload
README.txt               instruções de verificação para o TJ/TCM
```

## Storage de comprovantes

| Tipo | TTL signed URL | Antivirus | Compressão |
|---|---|---|---|
| Comprovante solicitação | 5 min | sim | PDF Ghostscript |
| Comprovante abastecimento | 5 min | sim | PDF / imagem |
| Comprovante ajuda de custo | 5 min | sim | PDF / imagem |
| Resposta SUS | 5 min | sim | PDF Ghostscript |

Bucket: `tfd/<prefeituraId>/<entidade>/<id>/<uuid>.<ext>`.

## RBAC — UI

| Elemento | Para quem |
|---|---|
| `/tfd/dashboard` | GES/ADM/DEV |
| `/tfd/solicitacoes` (lista + criar) | GES/ADM/DEV + COORD/AT_UBS (criar) + AT_TFD (terminal — subset) |
| `/tfd/solicitacoes/:id/aprovar` | GES/ADM/DEV apenas |
| `/tfd/viagens` (programar) | GES/ADM/DEV apenas |
| `/tfd/frota`, `/tfd/motoristas` | GES/ADM/DEV apenas |
| `/tfd/saldo/ajustar` | ADM/DEV apenas |
| `/tfd/ajuda-custo/:id/pagar` | ADM/DEV apenas |
| `/tfd/auditoria` | ADM/DEV apenas |

## Métricas que importam

- **Custo por km** (somatório de abastecimento ÷ km rodados).
- **Taxa de ocupação por viagem** (passageiros presentes ÷ vagas totais).
- **Saldo restante por veículo** (do orçamento mensal).
- **Taxa de faltas** (AUSENTE+DESISTIU ÷ alocações).
- **Alertas de CNH** a vencer em 30 dias.
- **Cadeia hash íntegra** (verificada periodicamente).

## Erros TFD mais comuns

| Code | Quando |
|---|---|
| `TFD_VIAGEM_SEM_VAGAS` | Alocar passageiro em viagem cheia |
| `TFD_ASSENTO_OCUPADO` | Assento explícito já em uso |
| `TFD_ASSENTO_INDISPONIVEL` | Auto-gen falhou em 20 tentativas |
| `TFD_VEICULO_REQUERIDO` | Faltou placa/veiculoId |
| `TFD_VALOR_REQUERIDO` | Faltou valor estimado e litros |
| `TFD_VALOR_INVALIDO` | Negativo ou inconsistente |
| `TFD_CNH_VENCIDA` | Tentativa de iniciar com CNH expirada |
| `TFD_HODOMETRO_REGRESSO` | km informado < último registrado |
| `TFD_SALDO_INSUFICIENTE` | Abastecimento estoura orçamento |
| `TFD_AJUDA_CUSTO_STATUS_INVALIDO` | Pagar AJC não autorizada |
| `TFD_VIAGEM_STATUS_INVALIDO` | Iniciar viagem já em andamento, etc. |
