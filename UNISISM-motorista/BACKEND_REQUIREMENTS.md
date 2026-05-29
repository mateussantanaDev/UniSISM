# UNISISM Motorista — Spec de Backend

Documento de alinhamento entre o **app Flutter** (`UNISISM-motorista/`) e o
**backend** (`unisism-ubs/backend`). Define **tudo** que o backend precisa
expor para o app funcionar end-to-end em produção.

> **Status atual:** o backend já tem o modelo TFD completo
> (`MotoristaTFD`, `VeiculoTFD`, `ViagemFrota`, `ViagemPassageiro`,
> `AjudaCusto`) e endpoints `/v1/tfd/*` para uso do `GESTOR_TFD`. O que
> falta é um **módulo paralelo `motorista-app`** análogo ao
> `paciente-app`, com auth próprio e rotas com escopo do motorista logado.
>
> Enquanto isso não existir, o app Flutter roda com `TfdApiMock` local
> (seed em memória). A interface `TfdApi` no app foi desenhada para ser
> drop-in com o contrato real — basta o backend implementar **exatamente
> as rotas e payloads deste documento**.

**Estimativa**: 3-5 dias para um dev backend que já conhece o módulo
`paciente-app`.

---

## Índice

0. [TL;DR](#0-tldr)
1. [Contexto e relação com `/v1/tfd/*`](#1-contexto)
2. [Schema Prisma — mudanças](#2-schema-prisma)
3. [Convenções de API](#3-convencoes)
4. [Auth — fluxo + endpoints](#4-auth)
5. [Viagens — endpoints + payloads](#5-viagens)
6. [Ajudas de custo (read-only)](#6-ajudas-de-custo)
7. [Push notifications (FCM)](#7-push)
8. [DTOs / schemas completos](#8-dtos)
9. [Códigos de erro consolidados](#9-erros)
10. [Sync engine — como o app consome](#10-sync)
11. [Auditoria TJ](#11-auditoria)
12. [Checklist de entrega](#12-checklist)
13. [FAQ / decisões de produto](#13-faq)

---

## 0. TL;DR

O backend precisa entregar **10 endpoints** sob o prefixo
`/v1/motorista-app/*`, todos exigindo JWT com role `MOTORISTA_TFD`:

```
POST   /motorista-app/auth/login                                    ← matrícula + senha
POST   /motorista-app/auth/trocar-senha                             ← 1º acesso
POST   /motorista-app/auth/logout
GET    /motorista-app/auth/me                                       ← perfil completo
GET    /motorista-app/minhas-viagens?desde=ISO&status=...           ← lista (pull)
GET    /motorista-app/viagens/:id                                   ← detalhe
POST   /motorista-app/viagens/:id/iniciar                           ← hodômetro inicial
POST   /motorista-app/viagens/:id/concluir                          ← hodômetro final
POST   /motorista-app/viagens/:id/passageiros/:pid/presenca         ← chamada digital
GET    /motorista-app/ajudas-custo                                  ← read-only
POST   /motorista-app/me/fcm-token                                  ← push (F15)
DELETE /motorista-app/me/fcm-token                                  ← push (logout)
```

E **3 mudanças no schema Prisma**:

```prisma
model MotoristaTFD {
  // … campos existentes …
  usuarioId     String?   @unique   // NOVO
  usuario       Usuario?  @relation("MotoristaUsuario", fields: [usuarioId], references: [id])
  primeiroLogin Boolean   @default(true)
  fcmToken      String?
}

enum Role {
  // … existentes …
  MOTORISTA_TFD                     // NOVA
}
```

E uma **migration de backfill** que cria um `Usuario` (com senha provisória
de 8 dígitos) para cada `MotoristaTFD` ATIVO existente.

---

## 1. Contexto

### 1.1 Por que módulo separado e não reaproveitar `/v1/tfd/*`?

O `/v1/tfd/viagens/*` que existe hoje exige role `GESTOR_TFD+` e expõe
campos sensíveis (motivo de cancelamento, criadaPor, etc.) que o motorista
não precisa ver. Além disso, o motorista precisa de **auth próprio com
matrícula** (não email do gestor) e de uma view filtrada automaticamente
por `viagem.motoristaId = auth.motoristaId`.

O padrão a seguir é **idêntico** ao `paciente-app`:
`src/modules/paciente-app/` → criar `src/modules/motorista-app/`.

### 1.2 Onde reaproveitar lógica existente

| Já implementado em `/v1/tfd/*` | Reaproveitar como? |
|---|---|
| `POST /v1/tfd/viagens/:id/iniciar` | Extrair use case `IniciarViagemUseCase` e chamar do motorista-app passando `motoristaId` do auth |
| `POST /v1/tfd/viagens/:id/passageiros/:pid/presenca` | Idem, `MarcarPresencaUseCase` |
| `POST /v1/tfd/viagens/:id/concluir` | Idem, `ConcluirViagemUseCase` |
| `tfd_audit_log` cadeia hash | Continuar gravando — só mudar quem é o `usuarioId` |
| Regras de validação (CNH vencida, hodômetro decrescente, etc.) | Reaproveitar 100% |
| `AjudaCustoRepository` | Filtrar `viagem.motoristaId = X` |

O módulo `motorista-app` é basicamente um **adapter HTTP** que:
1. Autentica via matrícula+senha → emite JWT com `motoristaId`
2. Injeta `motoristaId` em todos use cases
3. Filtra resultados pelo `motoristaId`
4. Esconde campos não-públicos no DTO de saída

---

## 2. Schema Prisma

### 2.1 Mudança em `MotoristaTFD`

```prisma
model MotoristaTFD {
  id              String  @id @default(uuid())
  prefeituraId    String
  prefeitura      Prefeitura @relation("MotoristaPrefeitura", fields: [prefeituraId], references: [id])
  nome            String
  cpf             String
  cnh             String
  categoriaCnh    CategoriaCNH
  validadeCnh     DateTime
  telefone        String
  status          StatusMotoristaTFD @default(ATIVO)
  totalViagens    Int     @default(0)
  totalKmRodados  BigInt  @default(0)

  // ── NOVOS CAMPOS ──
  usuarioId       String?  @unique
  usuario         Usuario? @relation("MotoristaUsuario", fields: [usuarioId], references: [id])
  primeiroLogin   Boolean  @default(true)
  fcmToken        String?

  criadoEm        DateTime @default(now())
  atualizadoEm    DateTime @updatedAt
  deletadoEm      DateTime?
  criadoPorId     String

  viagens         ViagemFrota[]
  abastecimentos  Abastecimento[]

  @@index([prefeituraId, status, deletadoEm])
  @@index([cpf])
  @@map("tfd_motoristas")
}
```

### 2.2 Mudança em `Usuario`

Garantir que tenha o campo `matricula`:

```prisma
model Usuario {
  id          String  @id @default(uuid())
  matricula   String  @unique         // ← garantir
  senhaHash   String                  // bcrypt
  role        Role
  motoristaTfd MotoristaTFD? @relation("MotoristaUsuario")
  // … resto …
}
```

### 2.3 Enum `Role`

```prisma
enum Role {
  // … existentes …
  MOTORISTA_TFD
}
```

### 2.4 Migration + backfill

```sql
-- 1. ALTER TABLE
ALTER TABLE tfd_motoristas ADD COLUMN usuario_id text UNIQUE REFERENCES usuario(id);
ALTER TABLE tfd_motoristas ADD COLUMN primeiro_login boolean DEFAULT true;
ALTER TABLE tfd_motoristas ADD COLUMN fcm_token text;

-- 2. Backfill: criar Usuario pra cada motorista ATIVO sem usuário vinculado.
--    Senha provisória = 8 últimos dígitos do CPF, hash bcrypt.
--    Imprimir no log do servidor (gestor pega de lá).
DO $$
DECLARE m RECORD;
BEGIN
  FOR m IN SELECT id, cpf FROM tfd_motoristas
           WHERE usuario_id IS NULL AND status = 'ATIVO' AND deletado_em IS NULL
  LOOP
    INSERT INTO usuario (id, matricula, senha_hash, role)
    VALUES (
      gen_random_uuid(),
      m.cpf,                     -- matrícula inicial = CPF; ajustar conforme padrão da prefeitura
      crypt(RIGHT(m.cpf, 8), gen_salt('bf')),
      'MOTORISTA_TFD'
    )
    RETURNING id INTO STRICT m.usuario_id;
    UPDATE tfd_motoristas SET usuario_id = m.usuario_id WHERE id = m.id;
  END LOOP;
END $$;
```

---

## 3. Convenções

| Convenção | Valor |
|---|---|
| **Base path** | `/v1/motorista-app/*` |
| **Auth** | `Authorization: Bearer <jwt>` em toda rota exceto `/auth/login` |
| **Content-Type** | `application/json; charset=utf-8` |
| **Datas** | ISO 8601 com timezone (`2026-05-25T08:42:13.000-03:00`) |
| **Datas só-dia** | ISO 8601 sem hora (`2026-05-25`) |
| **Hora do dia** | string `HH:mm` (ex.: `"06:00"`) — sem fuso, é hora local da prefeitura |
| **Enums** | string SNAKE_CASE UPPERCASE (`EM_ANDAMENTO`, `AGUARDANDO`) |
| **Casing JSON** | `camelCase` |
| **IDs** | UUID v4 string |
| **Valores monetários** | `number` em reais com até 2 decimais (ex.: `60.50`) |
| **Coordenadas** | `{ lat: number, lng: number }` em graus decimais |
| **BigInt (KM)** | `number` JSON — assume-se que cabe em 2^53; se passar disso, virar string |
| **Sucesso** | `200 OK` com body; `204 No Content` quando sem body |
| **Erro** | shape `{ error: { code, message, details? } }` — ver §9 |
| **Header de timestamp** | `X-Server-Time` em toda resposta `GET` (ISO 8601 UTC) |

### 3.1 Header obrigatório em GETs

```
X-Server-Time: 2026-05-25T11:42:13.000Z
```

O app guarda esse valor como `lastSyncAt` para usar em `?desde=` na próxima
chamada. Sem isso, o sync incremental fura por dessincronização de relógio.

### 3.2 Versionamento

Todas as rotas sob `/v1/`. Quebras de contrato → `/v2/`.

---

## 4. Auth

### 4.1 Fluxo

```
┌──────────────┐
│   app abre   │
└──────┬───────┘
       │ tem token cached?
       ├── sim → GET /auth/me
       │         ├── 200 → loggedIn
       │         ├── 401 → limpa storage → /login
       │         └── timeout → loggedIn modo offline (usa cache local)
       └── não → /login
                ↓
         POST /auth/login {matricula, senha}
         ├── 200 {token, motorista, primeiroLogin:true}  → /login/trocar-senha
         ├── 200 {token, motorista, primeiroLogin:false} → /home
         └── 401 MATRICULA_OU_SENHA_INVALIDA              → erro inline
                ↓
         POST /auth/trocar-senha {senhaAtual, novaSenha}
         ├── 204 → seta primeiroLogin=false → /home
         └── 409 SENHA_FRACA → erro inline
                ↓
         GET /minhas-viagens (com lastSyncAt do header anterior)
         …
```

### 4.2 `POST /motorista-app/auth/login`

**Request**

```http
POST /v1/motorista-app/auth/login HTTP/1.1
Content-Type: application/json

{
  "matricula": "12345",
  "senha": "trocar123"
}
```

**Response 200**

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Server-Time: 2026-05-25T11:42:13.000Z

{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "motorista": {
    "id": "mot-001",
    "nome": "João da Silva",
    "matricula": "12345",
    "status": "ATIVO"
  },
  "primeiroLogin": true
}
```

**Erros**

| Status | Code | Quando |
|---|---|---|
| 400 | `PAYLOAD_INVALIDO` | matricula ou senha ausente / formato inválido |
| 401 | `MATRICULA_OU_SENHA_INVALIDA` | credenciais erradas (mensagem genérica — não revela qual campo está errado) |
| 403 | `MOTORISTA_INATIVO` | motorista AFASTADO ou INATIVO |
| 423 | `CONTA_BLOQUEADA` | (opcional) 5+ tentativas erradas em 10 min |

**Notas**

- JWT com claims mínimas:
  ```json
  {
    "sub": "<usuario.id>",
    "motoristaId": "<motorista.id>",
    "role": "MOTORISTA_TFD",
    "primeiroLogin": false,
    "exp": <unix timestamp>
  }
  ```
- Duração do token: **30 dias** (refresh pelo simples re-login se expirar).
- `primeiroLogin: true` → o app **bloqueia** todas as outras rotas e força
  a tela de troca de senha. O backend pode também rejeitar com `403
  PRIMEIRO_LOGIN_PENDENTE` se um cliente desonesto tentar chamar `/minhas-viagens`
  direto.

### 4.3 `POST /motorista-app/auth/trocar-senha`

**Request**

```http
POST /v1/motorista-app/auth/trocar-senha HTTP/1.1
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "senhaAtual": "trocar123",
  "novaSenha": "MinhaNovaSenha2026"
}
```

**Response**

```http
HTTP/1.1 204 No Content
```

Backend deve:
1. Validar `senhaAtual` contra hash atual.
2. Setar `usuario.senhaHash = bcrypt(novaSenha)`.
3. Setar `motorista.primeiroLogin = false`.
4. Auditar.

**Erros**

| Status | Code | Quando |
|---|---|---|
| 401 | `SENHA_ATUAL_INVALIDA` | hash não bate |
| 409 | `SENHA_FRACA` | novaSenha < 8 caracteres, ou só números |
| 409 | `SENHA_IGUAL` | novaSenha == senhaAtual |

### 4.4 `POST /motorista-app/auth/logout`

**Request**

```http
POST /v1/motorista-app/auth/logout HTTP/1.1
Authorization: Bearer <jwt>
```

**Response**

```http
HTTP/1.1 204 No Content
```

Backend deve:
1. Invalidar token no servidor (se houver blacklist; caso contrário, no-op).
2. Limpar `motorista.fcmToken` (se setado).
3. Auditar.

### 4.5 `GET /motorista-app/auth/me`

**Request**

```http
GET /v1/motorista-app/auth/me HTTP/1.1
Authorization: Bearer <jwt>
```

**Response 200**

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Server-Time: 2026-05-25T11:42:13.000Z

{
  "id": "mot-001",
  "nome": "João da Silva",
  "cpf": "12345678900",
  "matricula": "12345",
  "cnh": "99887766554",
  "categoriaCnh": "D",
  "validadeCnh": "2027-04-10",
  "telefone": "75999990000",
  "status": "ATIVO",
  "totalViagens": 247,
  "totalKmRodados": 38452,
  "prefeituraNome": "Prefeitura de Águas Belas",
  "fotoUrl": null
}
```

---

## 5. Viagens

### 5.1 `GET /motorista-app/minhas-viagens`

Lista as viagens do motorista logado. Suporta filtro incremental por
timestamp (para pull-only-changed).

**Request**

```http
GET /v1/motorista-app/minhas-viagens?desde=2026-05-25T08:00:00Z&status=AGENDADA,EM_ANDAMENTO HTTP/1.1
Authorization: Bearer <jwt>
```

**Query params (todos opcionais)**

| Nome | Tipo | Default | Descrição |
|---|---|---|---|
| `desde` | ISO 8601 UTC | — | Devolver só viagens com `atualizadoEm >= desde`. |
| `status` | csv de `StatusViagem` | tudo | Filtrar por status (`AGENDADA,EM_ANDAMENTO`). |
| `cursor` | string opaca | — | Paginação. Quando devolvido `nextCursor`, app passa de volta. |
| `limit` | int (1-100) | 50 | Tamanho da página. |

**Response 200**

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Server-Time: 2026-05-25T11:42:13.000Z

[
  {
    "id": "viag-2026-001",
    "protocolo": "VIA-2026-000137",
    "data": "2026-05-25",
    "horaSaida": "06:00",
    "horaPrevistaRetorno": "18:30",
    "destino": "Salvador",
    "unidadeDestino": "Hospital Roberto Santos",
    "rotaResumo": "BR-324, retorno via Avenida Paralela",
    "kmEstimados": 220,
    "kmInicialHodometro": 45200,
    "kmFinalHodometro": null,
    "vagasTotais": 14,
    "observacoes": null,
    "status": "EM_ANDAMENTO",
    "iniciadaEm": "2026-05-25T09:05:00.000Z",
    "concluidaEm": null,
    "coordOrigem": { "lat": -12.2569, "lng": -38.9663 },
    "coordDestino": { "lat": -12.9714, "lng": -38.5014 },
    "veiculo": {
      "id": "vei-001",
      "placa": "OKL-3A52",
      "modelo": "Mercedes-Benz Sprinter 415",
      "tipo": "VAN",
      "capacidade": 16,
      "status": "ATIVO"
    },
    "motorista": {
      "id": "mot-001",
      "nome": "João da Silva",
      "matricula": "12345",
      "status": "ATIVO"
    },
    "passageiros": [ /* ver Passageiro abaixo */ ],
    "atualizadoEm": "2026-05-25T09:12:00.000Z"
  }
]
```

> O array é a resposta direta. Se for adotar paginação, embrulhar em
> `{ data: [...], nextCursor: "..." }`.

**Notas**

- Filtra automaticamente por `viagem.motoristaId = auth.motoristaId`.
- Inclui passageiros embedded (ver §5.4 pro shape do `Passageiro`).
- Ordem padrão: `data ASC, horaSaida ASC`.
- `atualizadoEm` é o timestamp da última escrita no banco (qualquer campo
  da viagem ou seus passageiros) — usado pelo app para decidir se precisa
  atualizar o cache local.

### 5.2 `GET /motorista-app/viagens/:id`

Detalhe de uma viagem específica. Mesmo shape do item do array acima.

**Erros**

| Status | Code | Quando |
|---|---|---|
| 404 | `VIAGEM_NAO_ENCONTRADA` | id não existe OU viagem é de outro motorista (resposta única para evitar enumeração) |

### 5.3 `POST /motorista-app/viagens/:id/iniciar`

Marca o início da viagem. Equivalente lógico ao `POST /v1/tfd/viagens/:id/iniciar`
do gestor — mas o `motoristaId` vem do auth, não do body.

**Request**

```http
POST /v1/motorista-app/viagens/viag-2026-001/iniciar HTTP/1.1
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "kmInicialHodometro": 45200
}
```

**Response 200** — Viagem atualizada (status → EM_ANDAMENTO,
`iniciadaEm` setado, `kmInicialHodometro` setado).

**Regras de negócio** (já implementadas no gestor — replicar)

| Validação | Code de erro | HTTP |
|---|---|---|
| Viagem é do motorista logado | `VIAGEM_NAO_ENCONTRADA` | 404 |
| Status atual é `AGENDADA` | `STATUS_INVALIDO` | 409 |
| CNH não vencida (`validadeCnh >= hoje`) | `CNH_VENCIDA` | 422 |
| Motorista `ATIVO` (não AFASTADO/INATIVO) | `MOTORISTA_INDISPONIVEL` | 422 |
| Veículo `ATIVO` (não EM_MANUTENCAO) | `VEICULO_INDISPONIVEL` | 422 |
| `kmInicialHodometro > 0` | `HODOMETRO_INVALIDO` | 422 |
| `kmInicialHodometro >= veiculo.hodometroAtual` | `HODOMETRO_INVALIDO` | 422 |

**Efeitos colaterais**

- Atualiza `tfd_viagem`: status, iniciadaEm, kmInicialHodometro.
- Insere em `tfd_audit_log`: ação `VIAGEM_INICIADA`, `usuarioId = motorista.usuarioId`.
- **Não** atualiza hodômetro do veículo aqui (só no concluir).

### 5.4 `POST /motorista-app/viagens/:id/concluir`

**Request**

```http
POST /v1/motorista-app/viagens/viag-2026-001/concluir HTTP/1.1
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "kmFinalHodometro": 45580
}
```

**Response 200** — Viagem atualizada (status → CONCLUIDA).

**Regras**

| Validação | Code | HTTP |
|---|---|---|
| Viagem é do motorista | `VIAGEM_NAO_ENCONTRADA` | 404 |
| Status atual é `EM_ANDAMENTO` | `STATUS_INVALIDO` | 409 |
| `kmFinalHodometro > kmInicialHodometro` | `HODOMETRO_INVALIDO` | 422 |

**Efeitos colaterais**

- Atualiza `tfd_viagem`: status, concluidaEm, kmFinalHodometro.
- Soma KM rodados (`kmFinal - kmInicial`) ao `motorista.totalKmRodados`.
- Incrementa `motorista.totalViagens`.
- Atualiza `veiculo.hodometroAtual = kmFinalHodometro`.
- Marca solicitações relacionadas como `REALIZADA`.
- Insere em `tfd_audit_log`: `VIAGEM_CONCLUIDA`.

### 5.5 `POST /motorista-app/viagens/:id/passageiros/:pid/presenca`

Chamada digital — marca presença/ausência/etc. de um passageiro.

**Request**

```http
POST /v1/motorista-app/viagens/viag-2026-001/passageiros/pax-001-001/presenca HTTP/1.1
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "presenca": "EMBARCADO",
  "observacao": null
}
```

ou

```json
{
  "presenca": "AUSENTE",
  "observacao": "Família avisou que não comparecerá."
}
```

**Response 200** — Passageiro atualizado.

```json
{
  "id": "pax-001-001",
  "paciente": { /* PacienteResumo — ver §8 */ },
  "solicitacao": { /* SolicitacaoResumo */ },
  "acompanhante": false,
  "presenca": "EMBARCADO",
  "observacao": null,
  "marcadoEm": "2026-05-25T06:32:00.000Z",
  "marcadoPor": "mot-001"
}
```

**Regras**

| Validação | Code | HTTP |
|---|---|---|
| Viagem é do motorista | `VIAGEM_NAO_ENCONTRADA` | 404 |
| Passageiro existe nessa viagem | `PASSAGEIRO_NAO_ENCONTRADO` | 404 |
| Status da viagem ∈ {AGENDADA, EM_ANDAMENTO} | `STATUS_INVALIDO` | 409 |
| `presenca ∈ {CONFIRMADO, EMBARCADO, AUSENTE, DESISTIU, AGUARDANDO}` | `PAYLOAD_INVALIDO` | 400 |
| Se `presenca ∈ {AUSENTE, DESISTIU}`, `observacao` é obrigatória | `OBSERVACAO_OBRIGATORIA` | 422 |

**Efeitos colaterais**

- Atualiza `tfd_viagem_passageiro`.
- Atualiza `tfd_viagem.atualizadoEm = now()` (importante pro sync).
- Auditoria: `PRESENCA_MARCADA`.

---

## 6. Ajudas de custo

### 6.1 `GET /motorista-app/ajudas-custo`

Lista as ajudas de custo associadas às viagens do motorista. **Read-only**
do lado do motorista — quem cria/autoriza/paga é o gestor TFD.

**Request**

```http
GET /v1/motorista-app/ajudas-custo HTTP/1.1
Authorization: Bearer <jwt>
```

**Response 200**

```json
[
  {
    "id": "ajc-001",
    "protocolo": "AJC-2026-000023",
    "viagemId": "viag-2026-001",
    "pacienteId": "pac-001",
    "pacienteNome": "Maria Conceição Almeida",
    "itens": [
      { "categoria": "ALIMENTACAO", "descricao": "Almoço em Salvador", "valorBRL": 35.00 },
      { "categoria": "DESLOCAMENTO_LOCAL", "descricao": "Transporte hospital ↔ rodoviária", "valorBRL": 25.00 }
    ],
    "valorTotalBRL": 60.00,
    "status": "AUTORIZADA",
    "metodoPagamento": "PIX",
    "motivoNegacao": null,
    "criadaEm": "2026-05-25T07:30:00.000Z",
    "autorizadaEm": "2026-05-25T08:00:00.000Z",
    "pagaEm": null
  }
]
```

**Filtro automático**: `viagem.motoristaId = auth.motoristaId`. Suporta
mesmos query params de paginação (`cursor`, `limit`) do `/minhas-viagens`.

---

## 7. Push (FCM)

### 7.1 `POST /motorista-app/me/fcm-token`

Registra o token FCM do dispositivo do motorista.

**Request**

```http
POST /v1/motorista-app/me/fcm-token HTTP/1.1
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "fcmToken": "fGz...JKL"
}
```

**Response**: `204 No Content`.

Backend deve:
1. Salvar `motorista.fcmToken = fcmToken`.
2. Auditar `FCM_TOKEN_REGISTRADO`.

### 7.2 `DELETE /motorista-app/me/fcm-token`

Revoga (no logout).

**Response**: `204`.

### 7.3 Eventos que disparam push para o motorista

| Quando | Título da notificação | Body | Payload `data` |
|---|---|---|---|
| Nova viagem alocada | "Nova viagem amanhã às 06:00" | "Salvador · Hospital Roberto Santos" | `{ "tipo": "NOVA_VIAGEM", "viagemId": "..." }` |
| Passageiro adicionado/removido | "Mudança em viagem amanhã" | "{n} pacientes agora" | `{ "tipo": "VIAGEM_ALTERADA", "viagemId": "..." }` |
| Viagem cancelada | "Viagem cancelada" | "{motivo}" | `{ "tipo": "VIAGEM_CANCELADA", "viagemId": "..." }` |

O app trata o tap navegando para `/viagens/{viagemId}` quando o payload
contém `viagemId`. Foreground pushes disparam `syncEngine.syncAll()`.

Implementação backend: usar `firebase-admin-sdk` (Node). Trigger no
`save` de `ViagemFrota` quando `motoristaId` muda ou status muda.

---

## 8. DTOs / schemas

Estes são os **shapes** de saída que o app espera. Os tipos Dart espelham
exatamente isto em `lib/domain/models/`. Para o backend (TypeScript):

### 8.1 Enums

```typescript
type StatusViagem = 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
type PresencaPassageiro = 'AGUARDANDO' | 'CONFIRMADO' | 'EMBARCADO' | 'AUSENTE' | 'DESISTIU';
type StatusMotorista = 'ATIVO' | 'AFASTADO' | 'INATIVO';
type StatusVeiculo = 'ATIVO' | 'EM_MANUTENCAO' | 'INATIVO';
type TipoVeiculo = 'VAN' | 'ONIBUS' | 'CARRO' | 'AMBULANCIA';
type CategoriaCnh = 'B' | 'C' | 'D' | 'E';
type PrioridadeSolicitacao = 'ELETIVA' | 'PRIORITARIA' | 'URGENTE';
type StatusAjudaCusto = 'PENDENTE' | 'AUTORIZADA' | 'PAGA' | 'NEGADA' | 'CANCELADA';
```

### 8.2 Tipos primários

```typescript
interface GeoCoord {
  lat: number;            // -90 a 90
  lng: number;            // -180 a 180
}

interface MotoristaResumo {
  id: string;             // UUID
  nome: string;
  matricula: string;
  status: StatusMotorista;
}

interface Motorista {
  id: string;
  nome: string;
  cpf: string;            // 11 dígitos sem máscara
  matricula: string;
  cnh: string;
  categoriaCnh: CategoriaCnh;
  validadeCnh: string;    // ISO date "2027-04-10"
  telefone: string;       // só dígitos
  status: StatusMotorista;
  totalViagens: number;
  totalKmRodados: number;
  prefeituraNome: string;
  fotoUrl?: string | null;
}

interface VeiculoResumo {
  id: string;
  placa: string;          // "OKL-3A52" com hífen
  modelo: string;         // "Mercedes-Benz Sprinter 415"
  tipo: TipoVeiculo;
  capacidade: number;     // lugares totais
  status: StatusVeiculo;
}

interface UbsResumo {
  id: string;
  nome: string;
  bairro: string;
  coord?: GeoCoord | null;
  endereco?: string | null;
}

interface PacienteResumo {
  id: string;
  nome: string;
  cpf: string;
  dataNascimento: string;          // ISO date
  telefone?: string | null;
  fotoUrl?: string | null;
  ubs?: UbsResumo | null;
  observacoesMobilidade?: string | null;  // ex.: "Cadeirante", "Usa muletas"
}

interface SolicitacaoResumo {
  id: string;
  protocolo: string;               // TFD-2026-NNNNNN
  prioridade: PrioridadeSolicitacao;
  destino: string;
  unidadeDestino?: string | null;
}

interface Passageiro {
  id: string;                      // PK da tabela tfd_viagem_passageiro
  paciente: PacienteResumo;
  solicitacao: SolicitacaoResumo;
  acompanhante: boolean;           // true = é acompanhante de outro paciente
  presenca: PresencaPassageiro;
  observacao?: string | null;
  marcadoEm?: string | null;       // ISO datetime
  marcadoPor?: string | null;      // motoristaId
}

interface Viagem {
  id: string;
  protocolo?: string | null;       // VIA-2026-NNNNNN
  data: string;                    // ISO date
  horaSaida: string;               // "HH:mm"
  horaPrevistaRetorno?: string | null;  // "HH:mm"
  destino: string;
  unidadeDestino?: string | null;
  rotaResumo?: string | null;
  kmEstimados?: number | null;
  kmInicialHodometro?: number | null;
  kmFinalHodometro?: number | null;
  vagasTotais: number;
  observacoes?: string | null;
  status: StatusViagem;
  iniciadaEm?: string | null;
  concluidaEm?: string | null;
  coordOrigem?: GeoCoord | null;
  coordDestino?: GeoCoord | null;
  veiculo: VeiculoResumo;
  motorista: MotoristaResumo;
  passageiros: Passageiro[];       // sempre presente, pode ser []
  atualizadoEm?: string | null;    // usado pelo sync incremental
}

interface AjudaCustoItem {
  categoria: string;               // string livre: ALIMENTACAO, DESLOCAMENTO_LOCAL, HOSPEDAGEM…
  descricao: string;
  valorBRL: number;                // ATENÇÃO: BRL maiúsculo no JSON
}

interface AjudaCusto {
  id: string;
  protocolo?: string | null;       // AJC-2026-NNNNNN
  viagemId: string;
  pacienteId: string;
  pacienteNome: string;
  itens: AjudaCustoItem[];
  valorTotalBRL: number;           // BRL maiúsculo
  status: StatusAjudaCusto;
  metodoPagamento?: string | null; // PIX | TRANSFERENCIA | DINHEIRO_RH
  motivoNegacao?: string | null;
  criadaEm: string;
  autorizadaEm?: string | null;
  pagaEm?: string | null;
}

interface AuthSession {
  token: string;
  motorista: MotoristaResumo;
  primeiroLogin: boolean;
}
```

### 8.3 Atenção a casing

- `valorBRL` / `valorTotalBRL` ← `BRL` em maiúsculas (consistência com o resto do TFD).
- `dataNascimento`, `validadeCnh` ← ISO **date** (`YYYY-MM-DD`), sem hora.
- `iniciadaEm`, `concluidaEm`, `marcadoEm`, `criadaEm`, `autorizadaEm`, `pagaEm`, `atualizadoEm` ← ISO **datetime** com timezone.

---

## 9. Códigos de erro

Toda resposta de erro segue:

```json
{
  "error": {
    "code": "STATUS_INVALIDO",
    "message": "A viagem precisa estar AGENDADA para ser iniciada",
    "details": { "statusAtual": "EM_ANDAMENTO" }
  }
}
```

| HTTP | Code | Quando | Como o app trata |
|---|---|---|---|
| **400** | `PAYLOAD_INVALIDO` | validação Zod falhou (`details.issues`) | mostra campo a campo |
| **401** | `MATRICULA_OU_SENHA_INVALIDA` | login falhou | "Matrícula ou senha errada" inline |
| **401** | `TOKEN_INVALIDO` | JWT malformado | logout silencioso → `/login` |
| **401** | `TOKEN_EXPIRADO` | JWT expirado | logout silencioso → `/login` |
| **401** | `SENHA_ATUAL_INVALIDA` | em `/trocar-senha`, hash da senha atual não bate | "Senha atual errada" inline |
| **403** | `ROLE_NAO_PERMITIDO` | role do JWT ≠ MOTORISTA_TFD | logout (não deveria acontecer em uso normal) |
| **403** | `PRIMEIRO_LOGIN_PENDENTE` | tentou rota protegida antes de trocar senha | redireciona pra `/login/trocar-senha` |
| **403** | `MOTORISTA_INATIVO` | motorista AFASTADO/INATIVO tentando logar | "Conta inativa — contate a gestão" |
| **404** | `VIAGEM_NAO_ENCONTRADA` | id inexistente OU de outro motorista | "Viagem não encontrada" |
| **404** | `PASSAGEIRO_NAO_ENCONTRADO` | pid não está na viagem | "Passageiro não encontrado" |
| **409** | `STATUS_INVALIDO` | tentou ação em status incompatível | esconde botão / "Não dá pra fazer isso agora" |
| **409** | `SENHA_FRACA` | nova senha < 8 chars ou só números | "Use pelo menos 8 letras ou números" |
| **409** | `SENHA_IGUAL` | nova senha == atual | "Escolha uma senha diferente" |
| **422** | `CNH_VENCIDA` | iniciar viagem com CNH vencida | "Sua CNH venceu — renove antes" |
| **422** | `VEICULO_INDISPONIVEL` | veículo EM_MANUTENCAO | "Veículo em manutenção" |
| **422** | `MOTORISTA_INDISPONIVEL` | motorista AFASTADO/INATIVO | "Conta inativa" |
| **422** | `HODOMETRO_INVALIDO` | km decrescente ou ≤ 0 | "Quilometragem precisa ser maior que X" |
| **422** | `OBSERVACAO_OBRIGATORIA` | AUSENTE/DESISTIU sem observação | "Diga o motivo" |
| **423** | `CONTA_BLOQUEADA` | 5+ tentativas erradas em 10 min (opcional) | "Muitas tentativas. Tente em alguns minutos." |
| **500** | `ERRO_INTERNO` | exceção não tratada | "Tivemos um problema, tente de novo" + retry |
| **503** | `MANUTENCAO` | backend em janela de manutenção | "App em manutenção, volte mais tarde" |

**Erros de rede no client** (não vêm do backend):

| Code | Quando |
|---|---|
| `OFFLINE` | dispositivo sem internet |
| `TIMEOUT` | request demorou demais |
| `NO_CONNECTION` | host inacessível |

---

## 10. Sync engine — como o app consome

O app é **offline-first**. Tem uma camada Drift (SQLite) que espelha as
viagens e passageiros, e uma fila de mutações pendentes (`outbox`).

### 10.1 Fluxo de leitura

```
UI → SQLite local (sempre disponível, mesmo offline)
```

### 10.2 Fluxo de pull (sincronização do servidor → local)

```
Triggers:
- Login bem-sucedido
- Mudança de connectivity (offline → online)
- Timer a cada 5 minutos
- Pull-to-refresh manual

Ação:
1. lastSyncAt ← SQLite (vazio na 1ª vez)
2. GET /minhas-viagens?desde=<lastSyncAt>
3. Recebe lista de viagens atualizadas
4. Recebe header X-Server-Time: 2026-05-25T11:42:13Z
5. Upsert no SQLite local (preservando linhas com flag dirty=true)
6. Salva lastSyncAt = X-Server-Time
```

### 10.3 Fluxo de push (mutações locais → servidor)

```
Quando o motorista marca presença (offline ou online):

1. UI chama repository.marcarPresenca(...)
2. Repository:
   a. Grava no SQLite local imediatamente (presenca, marcadoEm, dirty=true)
   b. Enfileira na outbox: { op:"POST", path:"/motorista-app/viagens/.../presenca", body:{...} }
3. UI atualiza ao vivo (StreamBuilder lê do SQLite)

Quando online:
4. OutboxProcessor pega rows PENDING, faz o POST de verdade
5. On success: marca outbox row DONE, limpa flag dirty da entidade
6. On 409 conflict: marca CONFLICT (UI manual depois)
7. On 5xx/offline: marca RETRYING, backoff exponencial até 5 tentativas
```

### 10.4 Implicações para o backend

- **Endpoints PUSH devem ser idempotentes** (ou pelo menos seguros pra
  re-tentativa). Ex.: `POST /presenca` com o mesmo body deve ser OK
  re-aplicar (não duplicar audit log? ou marcar idempotency).
- **Sugestão de idempotency key**: cliente pode mandar header
  `Idempotency-Key: <uuid>` em todo POST. Backend guarda em cache (Redis
  ou tabela) por 24h e devolve o mesmo response se chegar duplicado.
  Esse é o padrão Stripe.
- **Conflitos**: se o servidor já tem `presenca = AUSENTE` e o app manda
  `EMBARCADO`, qual ganha? Decisão proposta: **servidor é source of truth**,
  devolve `409` com o estado atual, app reconcilia mostrando alerta.

---

## 11. Auditoria TJ

Toda mutação feita pelo motorista (`POST /iniciar`, `/concluir`, `/presenca`)
**continua entrando na `tfd_audit_log`** com a cadeia hash padrão
(ver `backend/docs/TFD_API.md §6`).

Campo `usuarioId` na audit log = `motorista.usuarioId` (não `motorista.id`).

Novas ações no enum `AcaoAuditoriaTFD`:

```prisma
enum AcaoAuditoriaTFD {
  // … existentes …
  MOTORISTA_LOGIN
  MOTORISTA_LOGOUT
  MOTORISTA_TROCOU_SENHA
  FCM_TOKEN_REGISTRADO
  FCM_TOKEN_REVOGADO
}
```

---

## 12. Checklist de entrega

### Schema (Prisma + migration)
- [ ] `MotoristaTFD.usuarioId`, `primeiroLogin`, `fcmToken`
- [ ] `Usuario.matricula` (se não existe)
- [ ] Enum `Role.MOTORISTA_TFD`
- [ ] Enum `AcaoAuditoriaTFD` ganha as 5 novas entradas
- [ ] Migration SQL com backfill (criar Usuario p/ cada Motorista ATIVO)
- [ ] Endpoint admin de "regenerar senha provisória" (gestor TFD usa)

### Módulo `src/modules/motorista-app/`
Espelhar a estrutura de `src/modules/paciente-app/`:

- [ ] `application/use-cases/`
  - [ ] `LoginMotoristaUseCase`
  - [ ] `TrocarSenhaMotoristaUseCase`
  - [ ] `LogoutMotoristaUseCase`
  - [ ] `MeMotoristaUseCase`
  - [ ] `ListarMinhasViagensUseCase`
  - [ ] `ObterViagemMotoristaUseCase`
  - [ ] `IniciarViagemMotoristaUseCase` (delega ao use case existente)
  - [ ] `ConcluirViagemMotoristaUseCase` (idem)
  - [ ] `MarcarPresencaMotoristaUseCase` (idem)
  - [ ] `ListarMinhasAjudasUseCase`
  - [ ] `RegistrarFcmTokenUseCase`
  - [ ] `RevogarFcmTokenUseCase`
- [ ] `presentation/controllers/MotoristaAppController.ts`
- [ ] `presentation/routes/motorista-app.routes.ts`
- [ ] Middleware `requireMotoristaTfd` (valida JWT + injeta motoristaId)

### Middleware / Infra
- [ ] Middleware adiciona `X-Server-Time` em toda resposta GET
- [ ] (Opcional) Suporte a `Idempotency-Key` header em POSTs
- [ ] Rate limit no `/auth/login` (ex.: 10 tentativas/IP/hora)

### Push (FCM)
- [ ] `firebase-admin` instalado
- [ ] Service account JSON em ambiente seguro
- [ ] Trigger em `ViagemFrota.save` quando `motoristaId` muda
- [ ] Trigger em mudança de status pra `CANCELADA`
- [ ] Trigger em adição/remoção de passageiro em viagem AGENDADA

### Testes integrados
- [ ] Golden path: login → me → minhas-viagens → iniciar → presença → concluir
- [ ] Cobertura de cada código de erro (CNH_VENCIDA, STATUS_INVALIDO, etc.)
- [ ] Idempotência de POSTs com mesma Idempotency-Key
- [ ] Filtro automático por `motoristaId` (mot A não vê viagem do mot B)

### Documentação
- [ ] Atualizar `backend/docs/BACKEND_API.md` documentando o módulo
- [ ] Adicionar `backend/docs/MOTORISTA_APP_API.md` específico (este doc reverse-engineered)
- [ ] Atualizar `backend/docs/TFD_API.md` com as novas ações de auditoria

---

## 13. FAQ / decisões

**Q: Por que matrícula em vez de email?**
A: Servidor público brasileiro tem matrícula funcional como identidade
canônica. Email às vezes não está cadastrado, ou é o pessoal (Gmail).
Matrícula é única, conhecida e oficial.

**Q: Por que JWT em vez de session cookie?**
A: Mobile não tem ergonomia de cookie. JWT no SecureStorage cifrado é o
padrão Flutter (e do `paciente-app`).

**Q: Token expira em 30 dias? Não é muito?**
A: Sim, é generoso. Justificativa: motorista opera offline por dias
seguidos e a sessão precisa sobreviver. Em compensação, **logout do app
remove o token do storage cifrado** e o backend também invalida no
servidor (ou bloqueia no próximo uso). Refresh token foi descartado para
simplificar (motorista refaz login se passar 30 dias).

**Q: Por que `?desde=` em vez de polling completo?**
A: Pra reduzir tráfego em conexões 3G de interior. Quando o motorista
sincroniza, traz só o que mudou.

**Q: Por que header `X-Server-Time` e não usar o `atualizadoEm` da última
viagem retornada?**
A: Porque entre a consulta SQL e a resposta HTTP pode passar tempo. Usar
o `X-Server-Time` do servidor evita race condition (motorista pula uma
viagem que foi atualizada *depois* da query mas *antes* da resposta).

**Q: Quem cria o `MotoristaTFD.usuario`?**
A: O `GESTOR_TFD` ao cadastrar um motorista no `/v1/tfd/motoristas`. O
endpoint atual deve passar a também criar o `Usuario` com senha
provisória e devolver a senha no response (uma única vez — gestor anota
e entrega ao motorista pessoalmente). Ver `BACKEND_REQUIREMENTS.md §2.4`
(backfill).

**Q: Foto do paciente — onde fica?**
A: `paciente.fotoUrl` aponta pro storage S3 ou similar. O app **não**
faz upload — apenas exibe. URL deve ser pré-assinada ou pública com TTL
curto. **Não-bloqueante**: se `fotoUrl` for `null`, o app mostra iniciais
do nome em circuito azul institucional.

**Q: O motorista pode editar dados do paciente?**
A: Não. App é read-only pra dados do paciente — só pode marcar presença
(`tfd_viagem_passageiro.presenca`).

**Q: E se a regulação cancelar uma viagem que o motorista já está fazendo?**
A: Push notification "Viagem cancelada" + o `GET /viagens/:id` retorna
status `CANCELADA`. App mostra alerta vermelho na tela. Em prod, sugestão:
**não permitir cancelar viagem `EM_ANDAMENTO`** no lado da regulação.

**Q: O motorista vê histórico de outros motoristas?**
A: **Não.** Filtro automático por `motoristaId` em todas as queries.
Tentativa de acessar `/viagens/:id` de outro motorista retorna `404`
(não 403, pra evitar enumeração de IDs).

**Q: E rota traçada no mapa?**
A: **Fora do escopo do MVP.** O app só mostra markers (origem, destino,
UBSs dos passageiros) no mapa OpenStreetMap offline-friendly. Rota
traçada requer OSRM/GraphHopper self-hosted — fase futura.

**Q: Versionamento de quebra de contrato?**
A: Tudo em `/v1/motorista-app/*`. Mudança incompatível → `/v2/`. App
detecta pelo header `X-API-Version: 1` (sugerido).

---

## Apêndice A — Setup do app pra apontar pro backend real

No `pubspec.yaml` do app já tem as deps. Para rodar contra o backend:

```bash
flutter run \
  --dart-define=USE_MOCK=false \
  --dart-define=API_BASE_URL=http://10.0.2.2:3333/v1
```

| Ambiente | URL |
|---|---|
| Android emulator | `http://10.0.2.2:3333/v1` |
| iOS Simulator | `http://localhost:3333/v1` |
| Device físico (mesma Wi-Fi) | `http://<IP-DEV>:3333/v1` |
| Produção | `https://api.unisism.aguasbelas.pe.gov.br/v1` |

Sem o backend rodando, app cai em `TfdApiMock` (default em dev).

---

## Apêndice B — Quem mexer

| Arquivo | O que precisa mudar |
|---|---|
| `backend/prisma/schema.prisma` | §2.1, §2.2, §2.3 (3 mudanças) |
| `backend/prisma/migrations/` | nova migration com SQL do §2.4 |
| `backend/src/modules/motorista-app/` | criar módulo inteiro (espelhar `paciente-app/`) |
| `backend/src/presentation/routes/index.ts` | registrar `motorista-app.routes.ts` |
| `backend/src/main/container.ts` | DI dos novos use cases |
| `backend/docs/BACKEND_API.md` | adicionar seção do módulo |
| `backend/docs/TFD_API.md` | novas ações de auditoria |

Estimativa final: **3-5 dias** para um dev backend que já conhece o
módulo `paciente-app` (pattern idêntico).
