# UNISISM · App do Motorista (Face 4 · mobile) — API

> **Base path:** `/v1/motorista-app/*`
> **Status:** v0.9.0 (implementado em 2026-05-26)
> **Cliente:** `UNISISM-motorista/` (Flutter) — drop-in pelo `TfdApi` (substitui o `TfdApiMock`)

Este documento é a fonte de verdade do contrato HTTP entre o app Flutter do
motorista e o backend Node. A spec original do app está em
`UNISISM-motorista/BACKEND_REQUIREMENTS.md` — este documento descreve o que **foi
implementado** no backend (alinhado a essa spec, com adaptações marcadas
explicitamente).

## Índice

1. [Conceitos e arquitetura](#1-conceitos)
2. [Setup e migração de schema](#2-setup)
3. [Convenções](#3-convencoes)
4. [Auth](#4-auth)
5. [Viagens](#5-viagens)
6. [Ajudas de custo](#6-ajudas-de-custo)
7. [FCM push](#7-fcm)
8. [DTOs / shapes](#8-dtos)
9. [Códigos de erro](#9-erros)
10. [Sync incremental — como o app consome](#10-sync)
11. [Auditoria TJ](#11-auditoria)
12. [Apêndice — diferenças vs. spec original](#12-apendice)

---

## 1. Conceitos

### Vínculo `MotoristaTFD` ↔ `Atendente`

Diferente da spec original (que falava em `Usuario`), o schema do UNISISM
chama-se **`Atendente`**. O backend criou uma relação **1:1** entre
`MotoristaTFD` e `Atendente` (role=`MOTORISTA_TFD`).

- O `Atendente` é a entidade de autenticação (matrícula, senha, JWT).
- O `MotoristaTFD` é a entidade operacional (CNH, frota, viagens, KM).
- Ao criar um `MotoristaTFD` via `POST /v1/tfd/motoristas`, o backend
  **automaticamente** cria o `Atendente` vinculado e devolve a **senha
  provisória** (últimos 8 dígitos do CPF) UMA vez no response.
- Para motoristas pré-existentes (criados antes da v0.9.0), rodar
  `npm run db:backfill-motoristas` no servidor (ver §2).

### Fluxo de auth

```
1. Gestor cria motorista → recebe { matricula: "MOT-345678", senhaProvisoria: "12345678" }
2. Gestor entrega pessoalmente ao motorista
3. Motorista abre o app → /login com matricula+senha
4. Response: { token, motorista, primeiroLogin: true }
5. App força tela /trocar-senha → POST /auth/trocar-senha
6. Backend zera motorista.primeiroLogin → app libera navegação
```

### Roles e isolamento

- O JWT inclui `role: "MOTORISTA_TFD"` + `motoristaId`.
- Middleware `authenticateMotorista` valida JWT + role + ativo + status.
- Todos os endpoints (exceto `/auth/*`) filtram automaticamente por
  `viagem.motoristaId = auth.motoristaId`. Viagem de outro motorista →
  `404 VIAGEM_NAO_ENCONTRADA` (não 403, anti-enumeração).

---

## 2. Setup

### 2.1 Aplicar schema (uma vez por ambiente)

```bash
# 1. Atualizar Prisma Client
npm run prisma:generate

# 2. Sincronizar schema (DEV — sem migrações versionadas)
npx prisma db push

# 3. Backfill (cria Atendente p/ motoristas pré-existentes)
npm run db:backfill-motoristas
```

O backfill faz 3 coisas (script `scripts/backfill-motoristas.ts`):

1. Aplica `prisma/sql/motorista-app-backfill.sql`:
   - Adiciona enum value `MOTORISTA_TFD` em `RoleAtendente`
   - Adiciona 5 enum values em `AcaoAuditoriaTFD`
   - `ALTER TABLE tfd_viagens ADD atualizadoEm`
   - `ALTER TABLE tfd_motoristas ADD atendenteId, primeiroLogin, fcmToken`
   - INSERT esqueleto de `Atendente` (com `senhaHash='!provisorio!'`) p/ cada motorista ativo
2. Define `bcrypt(últimos 8 dígitos do CPF)` para cada Atendente novo
3. Imprime no stdout a tabela `{matricula, senhaProvisoria}` — gestor entrega
   pessoalmente

> ⚠️ Em **produção**, rodar o backfill é **obrigatório** depois de aplicar o
> schema, ou os motoristas nunca conseguirão logar (a senha placeholder
> `!provisorio!` nunca casa com bcrypt).

### 2.2 Variáveis de ambiente

Nenhuma nova. O módulo usa `JWT_SECRET` existente (token de 30 dias é
definido em código — `LoginMotoristaUseCase.TOKEN_TTL_SECONDS_DEFAULT`).

### 2.3 Apontar o app Flutter

```bash
# Dev local — Android emulator
flutter run --dart-define=USE_MOCK=false --dart-define=API_BASE_URL=http://10.0.2.2:3333/v1

# iOS Simulator
flutter run --dart-define=USE_MOCK=false --dart-define=API_BASE_URL=http://localhost:3333/v1

# Produção
flutter run --dart-define=USE_MOCK=false --dart-define=API_BASE_URL=https://api.unisism.aguasbelas.pe.gov.br/v1
```

---

## 3. Convenções

| Convenção | Valor |
|---|---|
| Base path | `/v1/motorista-app/*` |
| Auth | `Authorization: Bearer <jwt>` em toda rota exceto `/auth/login` |
| Content-Type | `application/json; charset=utf-8` |
| Datas (datetime) | ISO 8601 UTC com `Z` (ex.: `2026-05-25T11:42:13.000Z`) |
| Datas só-dia | ISO date sem hora (ex.: `2026-05-25`) |
| Hora do dia | string `HH:mm` (sem fuso, hora local da prefeitura) |
| Enums | string SNAKE_CASE UPPERCASE |
| Casing JSON | `camelCase` |
| IDs | UUID v4 string |
| Valor monetário | `number` em reais com até 2 decimais |
| BigInt KM | `number` (assume-se que cabe em 2^53) |
| Erro | `{ error: { code, message, details? } }` (ver §9) |
| Header de sync | `X-Server-Time` em **toda resposta GET** (ISO 8601 UTC) |

---

## 4. Auth

### 4.1 `POST /motorista-app/auth/login`

**Público.** Login por matrícula + senha. Devolve JWT de 30 dias.

**Request**

```json
{ "matricula": "MOT-345678", "senha": "12345678" }
```

**Response 200**

```http
HTTP/1.1 200 OK
X-Server-Time: 2026-05-25T11:42:13.000Z

{
  "token": "eyJhbGciOi...",
  "motorista": {
    "id": "uuid",
    "nome": "JOAO DA SILVA",
    "matricula": "MOT-345678",
    "status": "ATIVO"
  },
  "primeiroLogin": true
}
```

Claims do JWT:

```json
{
  "sub": "<atendenteId>",
  "role": "MOTORISTA_TFD",
  "prefeituraId": "<uuid>",
  "motoristaId": "<uuid>",
  "primeiroLogin": true,
  "iat": 1716624000,
  "exp": 1719216000
}
```

**Erros**

| HTTP | code | Quando |
|---|---|---|
| 400 | `PAYLOAD_INVALIDO` | matricula ou senha ausentes/curtas |
| 401 | `MATRICULA_OU_SENHA_INVALIDA` | credenciais erradas, role ≠ MOTORISTA_TFD, atendente sem vínculo OU senha provisória ainda não setada |
| 403 | `MOTORISTA_INATIVO` | Atendente inativo OU MotoristaTFD com status AFASTADO/INATIVO |

### 4.2 `POST /motorista-app/auth/trocar-senha`

**Autenticado** (não checa primeiroLogin — é a única rota que pode rodar
nesse estado, junto com `/me` e `/logout`).

**Request**

```json
{ "senhaAtual": "12345678", "novaSenha": "MinhaNova2026" }
```

**Response**: `204 No Content`.

Efeito: `senhaHash` recebe bcrypt da nova; `motorista.primeiroLogin = false`.

**Validações da nova senha**: ≥ 8 chars E contém letras E contém números.

**Erros**

| HTTP | code | Quando |
|---|---|---|
| 401 | `SENHA_ATUAL_INVALIDA` | bcrypt não bate |
| 409 | `SENHA_FRACA` | < 8 chars OU só letras OU só números |
| 409 | `SENHA_IGUAL` | nova == atual |

### 4.3 `POST /motorista-app/auth/logout`

**Autenticado.** Limpa `fcmToken` (para de receber push) + audit.

> O JWT continua válido até expirar (stateless). O app DEVE apagar o
> SecureStorage local após o 204.

**Response**: `204`.

### 4.4 `GET /motorista-app/auth/me`

**Autenticado.** Perfil completo do motorista logado.

**Response 200**

```json
{
  "id": "uuid",
  "nome": "JOAO DA SILVA",
  "cpf": "12345678900",
  "matricula": "MOT-345678",
  "cnh": "99887766554",
  "categoriaCnh": "D",
  "validadeCnh": "2027-04-10",
  "telefone": "75999990000",
  "status": "ATIVO",
  "totalViagens": 247,
  "totalKmRodados": 38452,
  "prefeituraNome": "Prefeitura Municipal de Águas Belas",
  "fotoUrl": null,
  "primeiroLogin": false
}
```

---

## 5. Viagens

Todas as rotas abaixo são **autenticadas + bloqueio primeiro login** (403
`PRIMEIRO_LOGIN_PENDENTE` se `primeiroLogin=true`).

### 5.1 `GET /motorista-app/minhas-viagens`

Lista as viagens do motorista. Suporta sync incremental.

**Query params** (todos opcionais)

| Nome | Tipo | Default | Descrição |
|---|---|---|---|
| `desde` | ISO 8601 UTC | — | só viagens com `atualizadoEm >= desde` |
| `status` | csv de StatusViagem | tudo | `"AGENDADA,EM_ANDAMENTO"` |
| `limit` | int (1-100) | 50 | tamanho da página |

**Response 200**: array de `Viagem` (ver §8). Ordem: `data ASC, horaSaida ASC`.

Header: `X-Server-Time: <ISO>` — guardar como `lastSyncAt` pro próximo pull.

### 5.2 `GET /motorista-app/viagens/:id`

Detalhe de uma viagem.

**Response 200**: `Viagem`.

**Erros**

| HTTP | code | Quando |
|---|---|---|
| 404 | `VIAGEM_NAO_ENCONTRADA` | id inexistente OU viagem de outro motorista |

### 5.3 `POST /motorista-app/viagens/:id/iniciar`

Marca o início da viagem.

**Request**

```json
{ "kmInicialHodometro": 45200 }
```

**Response 200**: `Viagem` atualizada (status=`EM_ANDAMENTO`, `iniciadaEm` setado).

**Regras de negócio** (replicadas do gestor — `/v1/tfd/viagens/:id/iniciar`)

| Validação | code | HTTP |
|---|---|---|
| Viagem é do motorista | `VIAGEM_NAO_ENCONTRADA` | 404 |
| Status atual = `AGENDADA` | `STATUS_INVALIDO` | 409 |
| Veículo `ATIVO` | `VEICULO_INDISPONIVEL` | 422 |
| Motorista `ATIVO` | `MOTORISTA_INDISPONIVEL` | 422 |
| CNH não vencida | `CNH_VENCIDA` | 422 |
| `kmInicialHodometro >= veiculo.hodometroAtualKm` | `HODOMETRO_INVALIDO` | 422 |

### 5.4 `POST /motorista-app/viagens/:id/concluir`

**Request**

```json
{ "kmFinalHodometro": 45580 }
```

**Response 200**: `Viagem` atualizada (status=`CONCLUIDA`, `concluidaEm` setado).

**Efeitos colaterais**

- Atualiza `veiculo.hodometroAtualKm = kmFinalHodometro`
- Incrementa `motorista.totalViagens` e soma `(kmFin - kmIni)` em `totalKmRodados`
- Marca todas as solicitações associadas como `REALIZADA`

**Regras**

| Validação | code | HTTP |
|---|---|---|
| Viagem é do motorista | `VIAGEM_NAO_ENCONTRADA` | 404 |
| Status atual = `EM_ANDAMENTO` | `STATUS_INVALIDO` | 409 |
| `kmFinalHodometro > kmInicialHodometro` | `HODOMETRO_INVALIDO` | 422 |

### 5.5 `POST /motorista-app/viagens/:id/passageiros/:pid/presenca`

Chamada digital — marca presença/ausência de um passageiro.

**Request**

```json
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

**Response 200**: `Passageiro` atualizado.

**Regras**

| Validação | code | HTTP |
|---|---|---|
| Viagem é do motorista | `VIAGEM_NAO_ENCONTRADA` | 404 |
| Passageiro pertence à viagem | `PASSAGEIRO_NAO_ENCONTRADO` | 404 |
| Status da viagem ∈ {AGENDADA, EM_ANDAMENTO} | `STATUS_INVALIDO` | 409 |
| presenca ∈ {AGUARDANDO, CONFIRMADO, EMBARCADO, AUSENTE, DESISTIU} | `PAYLOAD_INVALIDO` | 400 |
| Se AUSENTE/DESISTIU, observacao obrigatória | `OBSERVACAO_OBRIGATORIA` | 422 |

**Efeitos colaterais**

- Atualiza `tfd_viagem_passageiros` (presenca, observacao, marcadoEm, marcadoPorId)
- **Touch** em `tfd_viagens.atualizadoEm` (importante pro sync incremental)
- Audit `PRESENCA_MARCADA` na cadeia TFD

---

## 6. Ajudas de custo

### 6.1 `GET /motorista-app/ajudas-custo`

**Read-only.** Lista ajudas de custo das viagens do motorista logado.

Filtro: `ajuda.viagem.motoristaId = auth.motoristaId`.
Quem cria/autoriza/paga é o gestor TFD via `/v1/tfd/ajudas-custo/*`.

**Response 200**

```json
[
  {
    "id": "uuid",
    "protocolo": "AJC-2026-000023",
    "viagemId": "uuid",
    "pacienteId": "uuid",
    "pacienteNome": "MARIA CONCEIÇÃO ALMEIDA",
    "itens": [
      { "categoria": "ALIMENTACAO", "descricao": "Almoço em Salvador", "valorBRL": 35.00 },
      { "categoria": "DESLOCAMENTO_LOCAL", "descricao": "Transporte rodoviária→hospital", "valorBRL": 25.00 }
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

---

## 7. FCM

### 7.1 `POST /motorista-app/me/fcm-token`

Registra o token FCM do dispositivo do motorista (push notifications).

**Request**

```json
{ "fcmToken": "fGz...JKL" }
```

**Response**: `204`.

**Erros**: `422 PAYLOAD_INVALIDO` se `fcmToken.length < 20`.

### 7.2 `DELETE /motorista-app/me/fcm-token`

Revoga (usado no logout).

**Response**: `204`.

### 7.3 Eventos do servidor → push (futuro)

> **Status atual**: o backend salva `fcmToken` e registra audit, mas o envio
> real do push ainda não está implementado (firebase-admin-sdk a integrar).
> O app deve **continuar funcionando** via `syncEngine` mesmo sem push.

Quando implementado (roadmap), os eventos serão:

| Quando | Título | Body | Payload `data` |
|---|---|---|---|
| Nova viagem alocada | "Nova viagem amanhã às 06:00" | "Salvador · Hospital Roberto Santos" | `{ "tipo": "NOVA_VIAGEM", "viagemId": "..." }` |
| Passageiro adicionado/removido | "Mudança em viagem amanhã" | "{n} pacientes agora" | `{ "tipo": "VIAGEM_ALTERADA", "viagemId": "..." }` |
| Viagem cancelada | "Viagem cancelada" | "{motivo}" | `{ "tipo": "VIAGEM_CANCELADA", "viagemId": "..." }` |

---

## 8. DTOs

Tipos TypeScript canônicos (`src/modules/motorista-app/application/use-cases/_viagemMapper.ts`).
O app Flutter espelha em `lib/domain/models/`.

```ts
type StatusViagem = 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
type PresencaPassageiro = 'AGUARDANDO' | 'CONFIRMADO' | 'EMBARCADO' | 'AUSENTE' | 'DESISTIU';
type StatusMotorista = 'ATIVO' | 'AFASTADO' | 'INATIVO';
type StatusVeiculo = 'ATIVO' | 'EM_MANUTENCAO' | 'INATIVO';
type TipoVeiculo = 'VAN' | 'ONIBUS' | 'CARRO' | 'AMBULANCIA';
type CategoriaCnh = 'B' | 'C' | 'D' | 'E';
type PrioridadeSolicitacao = 'ELETIVA' | 'PRIORITARIA' | 'URGENTE';
type StatusAjudaCusto = 'PENDENTE' | 'AUTORIZADA' | 'PAGA' | 'NEGADA' | 'CANCELADA';

interface GeoCoord { lat: number; lng: number; }

interface VeiculoResumo {
  id: string;
  placa: string;
  modelo: string;
  tipo: TipoVeiculo;
  capacidade: number;
  status: StatusVeiculo;
}

interface MotoristaResumo {
  id: string;
  nome: string;
  matricula: string;
  status: StatusMotorista;
}

interface UbsResumo {
  id: string;
  nome: string;
  bairro: string;        // backend devolve `municipio` aqui (schema atual não tem bairro)
  coord: GeoCoord | null; // sempre null por enquanto
  endereco: string | null;
}

interface PacienteResumo {
  id: string;
  nome: string;
  cpf: string;
  dataNascimento: string;        // YYYY-MM-DD
  telefone: string | null;
  fotoUrl: string | null;         // sempre null (não implementado)
  ubs: UbsResumo | null;
  observacoesMobilidade: string | null;  // sempre null (schema não tem)
}

interface SolicitacaoResumo {
  id: string;
  protocolo: string;             // TFD-2026-NNNNNN
  prioridade: PrioridadeSolicitacao;
  destino: string;
  unidadeDestino: string | null;
}

interface Passageiro {
  id: string;                    // viagem_passageiro.id
  paciente: PacienteResumo;
  solicitacao: SolicitacaoResumo;
  acompanhante: boolean;
  presenca: PresencaPassageiro;
  observacao: string | null;
  marcadoEm: string | null;      // ISO datetime
  marcadoPor: string | null;     // atendenteId
}

interface Viagem {
  id: string;
  protocolo: string | null;      // sempre null por enquanto (ViagemFrota não tem protocolo)
  data: string;                  // YYYY-MM-DD
  horaSaida: string;             // "HH:mm"
  horaPrevistaRetorno: string | null;
  destino: string;
  unidadeDestino: string | null;
  rotaResumo: string | null;
  kmEstimados: number | null;
  kmInicialHodometro: number | null;
  kmFinalHodometro: number | null;
  vagasTotais: number;
  observacoes: string | null;
  status: StatusViagem;
  iniciadaEm: string | null;
  concluidaEm: string | null;
  coordOrigem: GeoCoord | null;  // sempre null (schema não tem lat/lng)
  coordDestino: GeoCoord | null; // sempre null
  veiculo: VeiculoResumo;
  motorista: MotoristaResumo;
  passageiros: Passageiro[];     // sempre presente, pode ser []
  atualizadoEm: string | null;   // cursor sync incremental
}

interface AjudaCustoItem {
  categoria: string;             // ALIMENTACAO | HOSPEDAGEM | DESLOCAMENTO_LOCAL | OUTRO
  descricao: string;
  valorBRL: number;
}

interface AjudaCusto {
  id: string;
  protocolo: string;             // AJC-2026-NNNNNN
  viagemId: string;
  pacienteId: string;
  pacienteNome: string;
  itens: AjudaCustoItem[];
  valorTotalBRL: number;
  status: StatusAjudaCusto;
  metodoPagamento: 'PIX' | 'TRANSFERENCIA' | 'DINHEIRO_RH' | null;
  motivoNegacao: string | null;
  criadaEm: string;
  autorizadaEm: string | null;
  pagaEm: string | null;
}

interface AuthSession {
  token: string;
  motorista: MotoristaResumo;
  primeiroLogin: boolean;
}

interface MotoristaMe extends MotoristaResumo {
  cpf: string;
  cnh: string;
  categoriaCnh: CategoriaCnh;
  validadeCnh: string;
  telefone: string;
  totalViagens: number;
  totalKmRodados: number;
  prefeituraNome: string;
  fotoUrl: string | null;
  primeiroLogin: boolean;
}
```

---

## 9. Códigos de erro

Toda resposta de erro:

```json
{
  "error": {
    "code": "STATUS_INVALIDO",
    "message": "A viagem precisa estar AGENDADA para ser iniciada",
    "details": { "statusAtual": "EM_ANDAMENTO" }
  }
}
```

| HTTP | code | Quando |
|---|---|---|
| 400 | `PAYLOAD_INVALIDO` | Zod falhou na validação (`details.issues`) |
| 401 | `TOKEN_AUSENTE` | sem header Authorization |
| 401 | `TOKEN_INVALIDO` | JWT malformado / sem `motoristaId` / vínculo quebrado |
| 401 | `TOKEN_EXPIRADO` | JWT expirou |
| 401 | `MATRICULA_OU_SENHA_INVALIDA` | login: credenciais erradas |
| 401 | `SENHA_ATUAL_INVALIDA` | trocar-senha: senha atual errada |
| 403 | `ROLE_NAO_PERMITIDO` | role ≠ MOTORISTA_TFD acessando módulo |
| 403 | `PRIMEIRO_LOGIN_PENDENTE` | rota protegida antes de trocar senha |
| 403 | `MOTORISTA_INATIVO` | Atendente desativado ou Motorista AFASTADO/INATIVO |
| 404 | `VIAGEM_NAO_ENCONTRADA` | id inexistente OU viagem de outro motorista |
| 404 | `PASSAGEIRO_NAO_ENCONTRADO` | pid não está na viagem |
| 409 | `STATUS_INVALIDO` | ação em viagem com status incompatível (`details.statusAtual`) |
| 409 | `SENHA_FRACA` | nova senha < 8 chars ou só letras/só números |
| 409 | `SENHA_IGUAL` | nova == atual |
| 422 | `CNH_VENCIDA` | iniciar com CNH vencida |
| 422 | `VEICULO_INDISPONIVEL` | veículo EM_MANUTENCAO/INATIVO |
| 422 | `MOTORISTA_INDISPONIVEL` | motorista AFASTADO/INATIVO |
| 422 | `HODOMETRO_INVALIDO` | km decrescente ou ≤ 0 |
| 422 | `OBSERVACAO_OBRIGATORIA` | AUSENTE/DESISTIU sem observacao |
| 500 | `ERRO_INTERNO` | exceção não tratada |

> **Anti-enumeração**: viagem de outro motorista NUNCA retorna 403 —
> sempre 404, igual ao padrão das Faces 1-2.

---

## 10. Sync incremental

O app é offline-first com SQLite local (Drift). Lê do cache, escreve na
outbox, sincroniza quando online.

### 10.1 Pull (servidor → local)

```
Triggers: login, connectivity online, timer 5min, pull-to-refresh

1. lastSyncAt ← SQLite (vazio na 1ª vez)
2. GET /minhas-viagens?desde=<lastSyncAt>
3. Recebe lista de viagens com atualizadoEm >= lastSyncAt
4. Lê header X-Server-Time: <ISO>
5. Upsert no SQLite local (preservando linhas com flag dirty=true)
6. Salva lastSyncAt = X-Server-Time (do header, não do client)
```

### 10.2 Push (mutações locais → servidor)

```
Marcar presença offline:

1. UI chama repository.marcarPresenca(...)
2. SQLite grava + dirty=true
3. Outbox enfileira { op: POST, path, body }

Quando online:
4. OutboxProcessor faz POST
5. 200 → marca DONE + limpa dirty
6. 409 → marca CONFLICT (UI manual)
7. 5xx/offline → RETRYING com backoff exponencial
```

### 10.3 Por que `X-Server-Time` em vez de `Date.now()`?

- Cliente pode ter clock drift
- Entre a query SQL e a response, novas escritas podem acontecer →
  usar o timestamp do **servidor** evita pular updates

### 10.4 Idempotência (opcional, recomendado)

Cliente pode mandar `Idempotency-Key: <uuid>` em POSTs. Backend pode
guardar em cache (Redis ou tabela) por 24h e devolver o mesmo response
em duplicatas. **Não implementado nesta versão** — o app deve garantir
no client que retries usam o mesmo body (presença é naturalmente
idempotente — re-aplicar EMBARCADO não causa efeito).

---

## 11. Auditoria TJ

Toda mutação feita pelo motorista (login, trocar-senha, logout, iniciar,
concluir, marcar presença, FCM token) entra na cadeia hash de
`tfd_audit_log` com:

- `operadorId` = `atendente.id` (do motorista)
- `operadorRole` = `'MOTORISTA_TFD'`
- `operadorMatricula` = matrícula do motorista
- `hash` = SHA-256(payload | hashAnterior)

Novos valores do enum `AcaoAuditoriaTFD`:

- `MOTORISTA_LOGIN`
- `MOTORISTA_LOGOUT`
- `MOTORISTA_TROCOU_SENHA`
- `FCM_TOKEN_REGISTRADO`
- `FCM_TOKEN_REVOGADO`

Ações reaproveitadas dos use cases do gestor (mesma cadeia):

- `VIAGEM_INICIADA` (iniciar)
- `VIAGEM_CONCLUIDA` (concluir)
- `PRESENCA_MARCADA` (marcar presença)

A verificação da cadeia (`verificarCadeiaTfd` em
`TfdAuditLogger.ts`) continua válida — os novos registros estão na mesma
estrutura hash-encadeada.

---

## 12. Apêndice — diferenças vs. spec original

A spec do app (`UNISISM-motorista/BACKEND_REQUIREMENTS.md`) foi escrita
assumindo um modelo `Usuario`. O backend já tinha `Atendente` (semanticamente
equivalente), e a implementação adaptou:

| Spec original | Implementação real |
|---|---|
| `Usuario` | `Atendente` (mesmo papel) |
| `usuarioId` no MotoristaTFD | `atendenteId` no MotoristaTFD |
| `Role.MOTORISTA_TFD` | `RoleAtendente.MOTORISTA_TFD` |
| Migration versionada (Prisma migrate) | SQL idempotente em `prisma/sql/` (projeto usa db push) |
| Endpoint `POST /v1/tfd/motoristas` cria Usuario | Implementado — `MotoristasTfdUseCases.criar` agora cria Atendente vinculado E devolve `{matricula, senhaProvisoria}` UMA vez |
| Idempotency-Key header | Não implementado — recomendado para v0.10 |
| Push FCM real | Não implementado — `fcmToken` armazenado, dispatcher pendente |
| Rate limit em `/auth/login` | Não implementado — recomendado via Caddy/nginx em prod |
| `Ubs.bairro` no DTO | Backend devolve `municipio` (schema atual não tem bairro) |
| `Paciente.observacoesMobilidade` | Sempre null (schema não tem) |
| `coordOrigem`/`coordDestino` da viagem | Sempre null (schema não tem lat/lng) |
| Viagem com `protocolo` | Sempre null (ViagemFrota não tem; só SolicitacaoTFD/AjudaCusto/Abastecimento têm) |

Para o app, todas essas diferenças são **forward-compatible** —
o tipo Dart já marca campos opcionais/nulos. Quando o backend ganhar
`bairro` / `lat/lng` / etc., as respostas começam a vir preenchidas
sem precisar tocar no app.
