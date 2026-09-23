# UNISISM · Face 3 / App do Paciente — API

> **Documento autoritativo do backend real.** Tudo aqui foi extraído do código em
> `src/modules/paciente-app/` e validado end-to-end contra o servidor rodando.
>
> Para o app Flutter conectar, basta seguir exatamente os shapes/URLs abaixo.
> Spec "ideal" antiga (`UNISISM-Paciente/BACKEND_API.md`) descreve 31 endpoints
> que **NÃO existem** no backend — ignore. Esta doc é a verdade.

**Versão**: v0.18.1 · **Última atualização**: 2026-06-03 · **Validado contra**: `unisism-ubs-backend@0.18.1+`

> **v0.18.3 (03/06/2026)** — `/me` (e `paciente` no login/refresh) agora
> retorna **27 campos**: identificação completa (nome social, sexo, foto),
> filiação (mãe/pai), perfil sócio-demográfico (estado civil, escolaridade,
> profissão, raça/cor, grupo sanguíneo), contato (email + 2 telefones),
> endereço estruturado (logradouro/bairro/município/UF/CEP) e atenção
> primária (UBS, agente comunitário, microárea, equipe Saúde da Família).
> O app renderiza perfil rico sem chamar outros endpoints.
>
> **v0.18.2 (03/06/2026)** — endpoints de **detalhe do dossiê** (atendimento,
> vacinação, exame). Audit dual + anti-enum 404 cross-paciente +
> sanitização. Permite que o app abra cada item em tela própria sem cache.
> Total atual: **30 endpoints** sob `/v1/paciente-app/*`.
>
> **v0.18.1 (03/06/2026)** — sincronização final com o app Flutter `UNISISM-Paciente`:
> Push migrado de Firebase para **ntfy.sh self-hosted** (endpoint `/me/push-token` com
> `provider: 'NTFY'`). Todos os endpoints do app rodam contra HTTP real (mocks foram
> removidos da árvore do app). Total: **27 endpoints** sob `/v1/paciente-app/*`.
>
> **v0.18.0 (28/05/2026)** — Refresh token rotativo (TTL access 30 min · refresh 30 dias)
> com detecção de reuse e revogação em cadeia. Logout revoga todos os refresh tokens da
> conta. Adapter LGPD-aware em todas as listagens.
>
> **v0.14.0 (15/05/2026)** — Dossiê com paginação cursor + audit dual (LGPD 5a + CFM 20a).
>
> **v0.13.0 (10/05/2026)** — UBS com `horarios` estruturado + auto-bond de `ubsVinculadaId`.
>
> **v0.11.0 (29/04/2026)** — `esqueci-senha` + `redefinir-senha` com hardening LGPD.
>
> **v0.10.0 (27/05/2026)** — base inicial: 23 endpoints (campos novos em Encaminhamento,
> UBS vinculada, push FCM, dossiê médico, banners, TFD, download de anexos).

---

## Índice

1. [Conceitos](#1-conceitos)
2. [URLs por ambiente](#2-urls-por-ambiente)
3. [Convenções](#3-convencoes)
4. [Auth (5 endpoints)](#4-auth)
5. [Perfil (1 endpoint)](#5-perfil)
6. [Encaminhamentos (1 endpoint)](#6-encaminhamentos)
7. [Notificações (4 endpoints)](#7-notificacoes)
8. [Anexos / Downloads (1 endpoint)](#8-anexos)
9. [DTOs (shapes completos)](#9-dtos)
10. [Códigos de erro](#10-erros)
11. [Endpoints planejados (não existem ainda)](#11-roadmap)
12. [Apêndice — fluxo completo end-to-end](#12-apendice)

---

## 1. Conceitos

### 1.1 Auth opaco (não JWT) + refresh rotativo

O app paciente usa **token opaco Base64URL** (não JWT). Diferente do app do motorista
(que usa JWT 30d). Foi escolha pra simplificar revogação — quando o admin desativa
um paciente, basta deletar a `SessaoPaciente` no banco e o próximo request retorna 401.

**Política de TTL (v0.18.0+):**

| Token | TTL | Persistência | Renovação |
|---|---|---|---|
| **Access** | **30 minutos** | `sessoes_paciente` | gerado em login OU refresh |
| **Refresh** | **30 dias** | `paciente_refresh_tokens` | rotação a cada uso |

**Rotação rotativa** — toda chamada de `POST /auth/refresh`:
1. Consome o refresh atual (`usadoEm = now`)
2. Emite **par novo** (access + refresh)
3. Linka cadeia (`substituidoPorId` → novo)

**Detecção de reuse** — se o app (ou um atacante) usar um refresh **já consumido**:
- Backend revoga **TODA A CADEIA** da conta (todos refresh tokens vivos + sessões).
- Retorna `401 REFRESH_REUSE_DETECTED`.
- Audit log registra incidente.
- Cidadão precisa logar de novo.

**Apps que não implementam refresh** continuam funcionando — só perdem a sessão a
cada 30 min em vez de 24 h. Strongly recommended implementar.

### 1.2 Auto-criação de conta

Quando a UBS consolida o **primeiro encaminhamento** de um CPF que ainda não tem
conta no app, o backend cria automaticamente uma `PacienteConta`:

```
cpf              = CPF dígitos (11 chars)
cpfFormatado     = CPF com pontuação ("123.456.789-09")
nome             = nome do paciente no encaminhamento
senhaHash        = bcrypt(CPF dígitos)   ← senha = próprio CPF
ativo            = true                   ← já nasce ativa
senhaProvisoria  = true                   ← flag pro app forçar troca
```

O paciente pode logar **imediatamente** após o atendente UBS consolidar
o primeiro encaminhamento (sem fluxo de cadastro separado).

### 1.3 Senha provisória bloqueante

Após login com senha=CPF, o response inclui `paciente.senhaProvisoria=true`.
**O app DEVE forçar tela de troca de senha bloqueante** antes de liberar qualquer
outra navegação. Após `POST /auth/trocar-senha` com sucesso, `senhaProvisoria=false`
e o app libera a home.

### 1.4 CPF normalização

Em qualquer campo de input, backend aceita CPF **formatado** (`123.456.789-09`)
ou **só dígitos** (`12345678909`). Internamente armazena só dígitos. Recomendado
o app enviar dígitos pra evitar logs sujos.

Backend devolve sempre os dois: `cpf` (dígitos) + `cpfFormatado` (com pontuação).

### 1.5 Anti-enumeration

Qualquer recurso de OUTRO paciente → **404 NOT_FOUND** (não 403). O backend
nunca confirma a existência de recursos fora do escopo do paciente autenticado.

---

## 2. URLs por ambiente

| Ambiente | Base URL |
|---|---|
| Mac dev / iOS Simulator | `http://localhost:3333/v1` |
| Android emulator (Android Studio) | `http://10.0.2.2:3333/v1` |
| Device físico mesma Wi-Fi | `http://<IP-DO-MAC>:3333/v1` (`ipconfig getifaddr en0`) |
| Produção (alvo) | `https://api.unisism.aguasbelas.pe.gov.br/v1` |

**Prefixos expostos para o app paciente:**

- Legado/compatibilidade: `/v1/paciente-app/*`
- Contrato novo de autenticação: `/v1/auth/paciente/*`
- Contrato novo de recursos: `/v1/paciente/*`

---

## 3. Convenções

### 3.1 Headers obrigatórios

| Header | Valor | Observação |
|---|---|---|
| `Content-Type` | `application/json` | em POST/PATCH |
| `Accept` | `application/json` | sempre |
| `x-api-key` | valor de `API_KEY` | obrigatório quando `API_KEY` estiver configurada no backend |
| `Authorization` | `Bearer <token-opaco>` | em todas exceto login + ativar-conta |
| `X-Client-Platform` | `flutter-mobile` | recomendado (telemetria) |
| `X-Client-Version` | `0.1.0` | recomendado |

### 3.2 Datas

| Tipo | Formato |
|---|---|
| Datetime | ISO 8601 UTC (`2026-05-27T15:32:18.000Z`) |
| Date (só dia) | `YYYY-MM-DD` |

**Nunca** receba `DD/MM/YYYY` — app converte só na UI.

### 3.3 Erros

Shape único:

```json
{
  "error": {
    "code": "CREDENCIAIS_INVALIDAS",
    "message": "CPF ou senha inválidos",
    "details": { "campo": "valor opcional" }
  }
}
```

- `code`: SCREAMING_SNAKE_CASE (inglês ou pt-BR pragmático — ver §10)
- `message`: pt-BR amigável
- `details`: opcional

**Atenção**: o cliente Flutter já tem `ApiException.fromBackendShape()` que
desempacota `body.error.{code,message,details}` automaticamente.

### 3.4 Timeouts esperados

| Endpoint | p95 alvo |
|---|---|
| `POST /auth/login` | < 800ms |
| `GET /me` | < 200ms |
| `GET /meus-encaminhamentos` | < 500ms |
| `GET /notificacoes/count` | < 100ms |
| Outros | < 1.5s |

Cliente Dio: `connectTimeout=15s`, `receiveTimeout=30s`.

---

## 4. Auth

### 4.1 `POST /v1/paciente-app/auth/login`

**Pública** (sem Authorization). Login por CPF + senha.

**Request**:
```http
POST /v1/paciente-app/auth/login
Content-Type: application/json

{
  "cpf": "12345678909",
  "senha": "12345678909"
}
```

- `cpf`: aceita formatado OU só dígitos. Backend normaliza.
- `senha`: plain text via TLS. Backend usa bcrypt.

**Response 200** (v0.18.0+ — agora inclui `refreshToken`):
```json
{
  "token": "4wEucZI0LonSb07A4fF9LlukZm6UF_3WpjpwJ_IGgytp6f6Oy61K73VNRoUWcV8s",
  "refreshToken": "OXl9bnYK_kVz3Q8XfBV-1uH7T8hpQq3w-jPjUL7Z6gBcK0xnLm4hN8z9pYrSv2dC",
  "expiresIn": 1800,
  "refreshExpiresIn": 2592000,
  "paciente": {
    "id": "94f3156f-271e-4281-9c0b-f32286bc63d2",
    "cpf": "12345678909",
    "cpfFormatado": "123.456.789-09",
    "nome": "MARIA APARECIDA SOUZA",
    "email": "maria.souza@example.com",
    "telefone": "75999998877",
    "senhaProvisoria": true
  }
}
```

- `token`: access token opaco Base64URL (TTL 30 min). Salvar em `flutter_secure_storage`.
- `refreshToken`: refresh rotativo (TTL 30 dias). **Salvar separadamente** em secure storage.
- `expiresIn`: TTL do access em segundos (sempre `1800` = 30 min).
- `refreshExpiresIn`: TTL do refresh em segundos (sempre `2592000` = 30 dias).
- `senhaProvisoria`: se `true`, app DEVE redirecionar pra tela de troca de senha bloqueante.

> **Breaking change vs v0.17.x**: `expiresIn` mudou de `86400` (24h) → `1800` (30min).
> Apps que não implementarem refresh vão precisar logar novamente a cada 30 min.

**Erros**:

| HTTP | code | Quando |
|---|---|---|
| 401 | `CREDENCIAIS_INVALIDAS` | CPF ou senha errados (mesmo response p/ ambos — anti-enum) |
| 403 | `CONTA_DESATIVADA` | admin desativou a conta (`ativo=false`) |
| 422 | `CPF_INVALIDO` | menos de 11 dígitos |

---

### 4.2 `POST /v1/paciente-app/auth/refresh` (v0.18.0+)

**Pública** (sem Authorization). Rotaciona o par access+refresh.

**Request**:
```http
POST /v1/paciente-app/auth/refresh
Content-Type: application/json

{
  "refreshToken": "OXl9bnYK_kVz3Q8XfBV-1uH7T8hpQq3w-jPjUL7Z6gBcK0xnLm4hN8z9pYrSv2dC"
}
```

**Response 200** (mesmo shape do login):
```json
{
  "token": "<NOVO access token opaco>",
  "refreshToken": "<NOVO refresh token opaco>",
  "expiresIn": 1800,
  "refreshExpiresIn": 2592000,
  "paciente": { /* mesmos campos do login */ }
}
```

**Comportamento crítico**:
- Após a chamada bem-sucedida, o refresh ANTIGO fica permanentemente marcado como
  usado (`usadoEm != null`) e **não pode mais ser usado** — qualquer tentativa
  posterior dispara reuse detection.
- O app DEVE **substituir imediatamente** os dois tokens no secure storage pelos novos.
- Recomendado refresh proativo quando faltarem ~5 min para o access expirar (4 GETs antes do limite).

**Erros**:

| HTTP | code | Quando | Ação do app |
|---|---|---|---|
| 401 | `REFRESH_TOKEN_INVALIDO` | refresh malformado ou inexistente | apagar tokens locais → `/login` |
| 401 | `REFRESH_TOKEN_EXPIRADO` | passou 30 dias sem usar | idem |
| 401 | `REFRESH_TOKEN_REVOGADO` | logout anterior ou admin revogou | idem |
| 401 | `REFRESH_REUSE_DETECTED` | **token já consumido — vazamento/clone detectado** | apagar tokens + alertar usuário + `/login` |
| 403 | `CONTA_DESATIVADA` | admin desativou a conta | apagar tokens → `/login` com mensagem |

**Rate limit**: 30 req/15 min por IP (mesmo do generico Face 3).

**Fluxo recomendado no app (Dio interceptor)**:
```dart
onError: (error, handler) async {
  if (error.response?.statusCode == 401 && !_isAuthEndpoint(error.requestOptions.path)) {
    final refreshed = await _tryRefresh();
    if (refreshed) {
      // re-tentar request original com novo token
      return handler.resolve(await _dio.fetch(error.requestOptions));
    }
    // refresh falhou → forçar login
    _onUnauthorized();
  }
  return handler.next(error);
}
```

---

### 4.3 `POST /v1/paciente-app/auth/trocar-senha`

**Autenticada**. Troca a senha do paciente logado. Obrigatória no 1º acesso.

**Request**:
```http
POST /v1/paciente-app/auth/trocar-senha
Authorization: Bearer <token>
Content-Type: application/json

{
  "senhaAtual": "12345678909",
  "novaSenha": "MinhaNovaSegura2026"
}
```

**Response**: `204 No Content` (sem body).

**Efeito colateral**: backend zera `senhaProvisoria = false`. Próximo `GET /me`
confirma a flag desligada.

**Erros**:

| HTTP | code | Quando |
|---|---|---|
| 401 | `CREDENCIAIS_INVALIDAS` | `senhaAtual` errada |
| 422 | `SENHA_FRACA` | nova senha < 8 chars |
| 422 | `SENHA_IGUAL_ATUAL` | nova senha idêntica à atual |

**Política de senha**:
- Mínimo **8 caracteres**.
- Recomendado misturar letras e números (cliente valida).
- Backend só valida tamanho mínimo.

---

### 4.3 `POST /v1/paciente-app/auth/logout`

**Autenticada**. Revoga a sessão atual no servidor.

**Request**:
```http
POST /v1/paciente-app/auth/logout
Authorization: Bearer <token>
```

**Response**: `204 No Content`.

**Efeito colateral (v0.18.0+)**: backend revoga **TODOS** os refresh tokens vivos
da conta (não só a sessão atual). Logout é "sair de vez" — qualquer refresh token
salvo em outro device também é invalidado. Para sessões multi-device sem essa
restrição, esperar pelo endpoint `/auth/logout-this-device` (roadmap futuro).

**Comportamento defensivo**: o app deve apagar o token local INDEPENDENTE do
status da resposta (try/finally). Se backend falhar 5xx, segue.

---

### 4.4 `POST /v1/paciente-app/auth/ativar-conta` (legado)

**Pública**. Fluxo legado de "ativar conta com CPF + data de nascimento".
**NÃO use no fluxo principal** — contas nascem ativas automaticamente.

Útil apenas se quiser implementar "esqueci senha por confirmação de identidade"
no futuro.

**Request**:
```json
{
  "cpf": "123.456.789-09",
  "dataNascimento": "1968-03-14",
  "senha": "novaSenha123",
  "nome": "MARIA APARECIDA"
}
```

**Response**: `204`.

**Erros**: `404 CONTA_NAO_ENCONTRADA`, `409 CONTA_JA_ATIVADA`, `422 CONFIRMACAO_INVALIDA`, `422 SENHA_FRACA`.

---

### 4.5 `GET /v1/paciente-app/me`

**Autenticada**. Perfil do paciente logado.

**Request**:
```http
GET /v1/paciente-app/me
Authorization: Bearer <token>
```

**Response 200** (v0.18.3+ — shape canônico idêntico ao de `login`/`refresh`):
```json
{
  "id": "94f3156f-271e-4281-9c0b-f32286bc63d2",
  "nome": "MARIA APARECIDA SOUZA",
  "nomeSocial": null,
  "cpf": "12345678909",
  "cpfFormatado": "123.456.789-09",
  "cartaoSus": "702 8004 5391 0023",
  "dataNascimento": "1968-03-14",
  "sexo": "F",
  "fotoUrl": null,

  "nomeMae": "ANA SOUZA",
  "nomePai": "JOÃO APARECIDO",

  "estadoCivil": "CASADO",
  "escolaridade": "FUNDAMENTAL_COMPLETO",
  "profissao": "Aposentada",
  "racaCor": "PARDA",
  "grupoSanguineo": "O_POSITIVO",

  "email": "maria.souza@example.com",
  "telefone": "75999998877",
  "telefoneSecundario": "7532010000",

  "endereco": "Rua das Flores, 100",
  "bairro": "Centro",
  "municipio": "Águas Belas",
  "uf": "PE",
  "cep": "55310-000",

  "ubsVinculadaId": "uuid",
  "ubsVinculadaNome": "UBS Águas Belas Centro",
  "agenteComunitario": "DAIANA RODRIGUES",
  "microarea": "07",
  "equipeSaudeFamilia": "ESF 03 · Equipe Verde",

  "senhaProvisoria": true
}
```

> **Campos opcionais (vêm `null` quando não preenchidos)**:
> - **Sem PEC clínico** (conta nova sem encaminhamento ainda): TODOS os campos
>   clínicos (`nomeSocial`, `cartaoSus`, `dataNascimento`, `sexo`, filiação,
>   perfil socio, endereço, agente, microárea, eSF) vêm `null`.
> - **Com PEC mas não preenchido**: cada campo pode estar `null` independente.
> - `email` / `telefone`: gerenciados pela `PacienteConta` — preenchidos no
>   onboarding ou via app paciente (futuro endpoint de update).
> - `telefoneSecundario`: vive no `Paciente` clínico (preenchido pela UBS).
> - `fotoUrl`: reservado v0.19+ (upload de foto pelo paciente).
> - `grupoSanguineo`: `null` quando schema marca `NAO_INFORMADO` (interno).
> - `ubsVinculadaId` / `ubsVinculadaNome`: só após o paciente receber a primeira
>   notificação (auto-bond v0.13.0+).

**Enums esperados**:
- `sexo`: `M` · `F` · `OUTRO`
- `estadoCivil`: `SOLTEIRO` · `CASADO` · `DIVORCIADO` · `VIUVO` · `UNIAO_ESTAVEL` · `OUTRO`
- `racaCor`: `BRANCA` · `PRETA` · `PARDA` · `AMARELA` · `INDIGENA` · `NAO_INFORMADA`
- `grupoSanguineo`: `A_POSITIVO` · `A_NEGATIVO` · `B_POSITIVO` · `B_NEGATIVO` · `AB_POSITIVO` · `AB_NEGATIVO` · `O_POSITIVO` · `O_NEGATIVO`

**Uso recomendado**: chamar no boot (splash) pra:
1. Validar que o token salvo ainda é válido (401 → vai pra login)
2. Detectar se `senhaProvisoria=true` (força troca antes de liberar home)

---

## 5. Perfil

> O `GET /me` em [§4.5](#45-get-v1paciente-appme) já cobre o perfil. Não há rotas
> adicionais de `/me/profile`, `/me/password` etc. (essas existem na Face 1/Admin,
> não no app do paciente).

Para **trocar senha autenticada**: use o `POST /auth/trocar-senha` mesmo
(§4.2). Não há fluxo "esqueci senha" ainda (roadmap).

---

## 6. Encaminhamentos

### 6.1 `GET /v1/paciente-app/meus-encaminhamentos`

**Autenticada**. Lista TODOS os encaminhamentos do paciente (ativos + histórico).

**Request**:
```http
GET /v1/paciente-app/meus-encaminhamentos
Authorization: Bearer <token>
```

**Response 200**: array (pode ser `[]`).

```json
[
  {
    "id": "uuid",
    "protocolo": "UBS-2026-100137",
    "status": "APROVADO",
    "paciente": {
      "nome": "MARIA APARECIDA",
      "cpf": "123.456.789-09",
      "cartaoSus": "702 8004 5391 0023",
      "dataNascimento": "1968-03-14",
      "sexo": "F",
      "telefone": "(75) 99876-5432",
      "endereco": "RUA DAS FLORES, 100"
    },
    "solicitacao": {
      "medicoSolicitante": "DR. CARLOS EDUARDO MENDES",
      "crm": "CRM/BA 28471",
      "especialidadeSolicitada": "Cardiologia",
      "cid10": "I10",
      "cidDescricao": "Hipertensão essencial (primária)",
      "justificativaClinica": "Paciente com HAS de longa data...",
      "prioridade": "PRIORITARIA",
      "dataSolicitacao": "2026-04-22"
    },
    "anexos": [
      {
        "id": "uuid",
        "nome": "solicitacao-medica.pdf",
        "tipo": "SOLICITACAO",
        "tamanhoKb": 142,
        "uploadEm": "2026-05-06T14:35:00.000Z",
        "scanStatus": "LIMPO"
      }
    ],
    "timeline": [
      {
        "id": "uuid",
        "tipo": "CRIADO",
        "titulo": "Encaminhamento criado",
        "descricao": "Encaminhamento aberto pela UBS Central e enviado à Regulação.",
        "autor": "Dr. Ricardo Santos",
        "autorPapel": "Médico solicitante",
        "em": "2026-05-06T14:32:18.000Z"
      }
    ],
    "unidadeOrigem": "UBS CENTRAL",
    "atendenteResponsavel": "MARIA OLIVEIRA",
    "observacoesRegulacao": "Trazer ECG recente...",
    "agendamentoPrevisto": "2026-06-08T09:00:00.000Z",
    "respostaSUS": null,
    "criadoEm": "2026-05-06T14:32:18.000Z",
    "atualizadoEm": "2026-05-24T10:15:00.000Z"
  }
]
```

**Filtro automático**: backend filtra por CPF do JWT. Encaminhamentos de outro
paciente NUNCA aparecem.

**Ordenação**: `criadoEm DESC` (mais recente primeiro). App pode reordenar/separar.

**Limite**: 100 itens. Sem paginação (pacientes típicos têm < 30 encaminhamentos).

> **Importante**: não há endpoint dedicado pra `/meus-encaminhamentos/:id`,
> `/anexos`, `/timeline` ou `/ativo`. **Tudo vem embedado** na resposta acima.
> O cliente Flutter cacheia o resultado e responde `obter(id)`/`anexos(id)`/
> `timeline(id)` a partir do cache local.

---

## 7. Notificações

Timeline tipo Amazon/Shopee. Toda transição de status no encaminhamento (UBS
consolida → Regulação aprova/pendencia/rejeita → resposta SUS chega) gera
uma notificação **automaticamente** pelo backend.

### 7.1 `GET /v1/paciente-app/notificacoes`

**Autenticada**. Lista de notificações.

**Request**:
```http
GET /v1/paciente-app/notificacoes
Authorization: Bearer <token>
```

**Query params (opcional)**:
| Nome | Tipo | Default | Descrição |
|---|---|---|---|
| `apenasNaoLidas` | bool | `false` | Se `true`, filtra só `lidaEm IS NULL` |

**Response 200**:
```json
[
  {
    "id": "uuid",
    "tipo": "APROVADO",
    "titulo": "✅ Encaminhamento aprovado",
    "corpo": "Boas notícias! O encaminhamento UBS-2026-100137 foi aprovado pela Regulação...",
    "encaminhamentoId": "uuid",
    "protocolo": "UBS-2026-100137",
    "payload": { "protocolo": "UBS-2026-100137" },
    "criadaEm": "2026-04-23T14:32:00.000Z",
    "lidaEm": null
  }
]
```

**Campos**:

| Campo | Tipo | Nullable | Notas |
|---|---|---|---|
| `id` | string UUID | ❌ | |
| `tipo` | enum string | ❌ | `ENCAMINHAMENTO_CRIADO \| PENDENCIA_REGISTRADA \| PENDENCIA_RESOLVIDA \| APROVADO \| AGENDADO \| REJEITADO \| RESPOSTA_SUS_DISPONIVEL` |
| `titulo` | string | ❌ | Curto, já com emoji ("✅ Encaminhamento aprovado") |
| `corpo` | string | ❌ | Descrição mais longa |
| `encaminhamentoId` | string UUID | ✅ | Referência opcional |
| `protocolo` | string | ✅ | Conveniência (mesmo do encaminhamento) |
| `payload` | object | ✅ | Dados estruturados livres |
| `criadaEm` | ISO 8601 | ❌ | |
| `lidaEm` | ISO 8601 | ✅ | `null` = não lida |

**Ordenação**: `criadaEm DESC`.

**Limite**: backend não impõe — espera < 200 por paciente.

---

### 7.2 `GET /v1/paciente-app/notificacoes/count`

**Autenticada**. Contagem de não-lidas (badge no bottom nav).

**Response 200**:
```json
{ "naoLidas": 3 }
```

> ⚠️ Diferente da spec ideal (que usaria `count`). Campo é `naoLidas`.

---

### 7.3 `POST /v1/paciente-app/notificacoes/:id/lida`

**Autenticada**. Marca uma notificação como lida.

**Request**:
```http
POST /v1/paciente-app/notificacoes/nt-001/lida
Authorization: Bearer <token>
```

**Response**: `204 No Content`.

**Idempotente**: marcar 2x continua 204.

**Erros**: `404 NOTIFICACAO_NAO_ENCONTRADA` se id de outro paciente.

---

### 7.4 `POST /v1/paciente-app/notificacoes/marcar-todas-lidas`

**Autenticada**.

**Response 200**:
```json
{ "atualizadas": 5 }
```

---

## 8. Anexos (v0.12.0 — HARDENING LGPD)

### 8.1 `GET /v1/paciente-app/anexos/:id/download`

**Autenticada** + **rate-limited**. Download direto (binário) de um anexo.

**Request**:
```http
GET /v1/paciente-app/anexos/anx-001/download
Authorization: Bearer <token>
```

**Response 200 (binário)**:
```
Content-Type: application/pdf  (ou image/jpeg, image/png)
Content-Length: 142336
Content-Disposition: attachment; filename="Relatorio_clinico_2026_.pdf"; filename*=UTF-8''Relat%C3%B3rio%20cl%C3%ADnico%20%282026%29.pdf
Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0
Pragma: no-cache
Expires: 0
X-Content-Type-Options: nosniff
X-Robots-Tag: noindex, nofollow
ETag: "sha256-abc123..."

<bytes do arquivo>
```

**Headers de segurança** (todos obrigatórios desde v0.12.0):

- `Content-Disposition` segue **RFC 6266 + RFC 5987**: ASCII-safe fallback +
  UTF-8 percent-encoded oficial. Filename original ("Relatório clínico (2026).pdf")
  é preservado em browsers modernos.
- `Cache-Control: private, no-store` — proibido cachear em proxies (LGPD).
- `X-Content-Type-Options: nosniff` — bloqueia MIME sniffing.
- `X-Robots-Tag: noindex, nofollow` — anti indexação acidental.
- `ETag: "sha256-..."` quando hash disponível (cache-validation).
- `Content-Length` real — cliente pode mostrar progress bar.

**Regras de segurança**:

1. **Escopo**: anexo precisa pertencer a encaminhamento do paciente autenticado
   (match por CPF dígitos). Se não, **404 ANEXO_NAO_ENCONTRADO** (anti-enum).
2. **ClamAV gate**: `scanStatus` deve ser `LIMPO`. PENDENTE/INFECTADO/FALHOU
   → **409 ANEXO_NAO_LIBERADO** com `details.scanStatus`.
3. **Path traversal guard**: caminho do anexo é resolvido contra `UPLOAD_DIR`
   absoluto via `path.relative(uploadDir, candidato)`. Se escapa (`..`/absolute)
   → **404** + audit crítico `_PATH_TRAVERSAL`.
4. **Rate limit**: 60 req/15min/conta + 200 req/1h/conta + 300 req/15min/IP
   → **429 RATE_LIMIT_EXCEDIDO**.
5. **Audit log LGPD** em TODOS os caminhos (ver §8.2).

**Erros**:

| HTTP | code | Quando |
|---|---|---|
| 401 | `NAO_AUTENTICADO` | sem token / token expirado |
| 404 | `ANEXO_NAO_ENCONTRADO` | id inválido OU anexo de outro paciente OU path traversal |
| 409 | `ANEXO_NAO_LIBERADO` | `scanStatus != LIMPO`. Body: `{error: {code, message, details: {scanStatus}}}` |
| 404 | `ARQUIVO_NAO_ENCONTRADO` | metadata existe mas arquivo físico sumiu |
| 429 | `RATE_LIMIT_EXCEDIDO` | muitos downloads |
| 500 | `FALHA_LEITURA_ARQUIVO` | erro de I/O no stream (raro) |

**URL útil pra cliente Flutter**:
```
${baseUrl}/paciente-app/anexos/${anexoId}/download
```

> **Observação importante**: o `encaminhamentoId` NÃO entra no path. O backend
> valida posse via CPF do JWT.

### 8.2 Audit log de downloads (LGPD compliance)

Toda interação com `/v1/paciente-app/anexos/:id/download` grava em `auditoria_logs`:

| Ação | Quando |
|---|---|
| `DOWNLOAD_ANEXO_PACIENTE_OK` | Download autorizado e iniciado |
| `DOWNLOAD_ANEXO_PACIENTE_NAO_EXISTE` | id não existe no DB |
| `DOWNLOAD_ANEXO_PACIENTE_FORA_DO_ESCOPO` | CPF do anexo ≠ CPF autenticado (tentativa de acesso cross-paciente) |
| `DOWNLOAD_ANEXO_PACIENTE_NAO_LIBERADO` | scanStatus PENDENTE/INFECTADO/FALHOU |
| `DOWNLOAD_ANEXO_PACIENTE_PATH_TRAVERSAL` | **CRÍTICO** — caminho contém `..` ou escapa de UPLOAD_DIR |
| `DOWNLOAD_ANEXO_PACIENTE_ARQUIVO_SUMIU` | metadata OK mas arquivo sumiu do disco |
| `DOWNLOAD_ANEXO_PACIENTE_NAO_E_ARQUIVO` | candidato é diretório/symlink dir |

Payload sempre inclui: `contaId`, `cpfMasked` (4 dígitos), IP, userAgent.
Para OK: `anexoNome`, `mimeType`, `size`, `sha256`, `encId`.

### 8.3 Cliente Flutter (recipe atual)

Use o `AnexoDownloadService` (em `lib/core/services/anexo_download_service.dart`):

```dart
final cancelToken = CancelToken();
final progressNotifier = ValueNotifier<DownloadProgress?>(null);

final r = await service.baixar(
  anexoId: 'anx-001',
  onProgress: (p) => progressNotifier.value = p,
  cancelToken: cancelToken,
);

// r.pathLocal — caminho do arquivo salvo
// r.filename — nome original (com extensão correta extraída do Content-Disposition)
// r.mimeType — tipo MIME do backend
// r.tamanhoBytes — tamanho real

// Abrir / compartilhar:
await OpenFilex.open(r.pathLocal, type: r.mimeType);
await Share.shareXFiles([XFile(r.pathLocal, mimeType: r.mimeType)]);
```

**Permissões Android**: o service pede automaticamente `WRITE_EXTERNAL_STORAGE`
(Android ≤ 9) e `POST_NOTIFICATIONS` (Android 13+). Não bloqueia se a permissão
for negada em Android 10+ (scoped storage).

---

## 9. DTOs

### 9.1 Enums canônicos

```typescript
type StatusEncaminhamento =
  | 'RASCUNHO'
  | 'AGUARDANDO_REGULACAO'
  | 'PENDENCIA_DOCUMENTO'
  | 'APROVADO'
  | 'REJEITADO';

type PrioridadeClinica =
  | 'ELETIVA'
  | 'PRIORITARIA'
  | 'URGENTE'
  | 'EMERGENCIA';

type TipoAnexo =
  | 'SOLICITACAO'
  | 'RG'
  | 'CPF'
  | 'CARTAO_SUS'
  | 'EXAME'
  | 'LAUDO'
  | 'RESPOSTA_SUS'
  | 'OUTRO';

type StatusScanAnexo =
  | 'PENDENTE'
  | 'LIMPO'
  | 'INFECTADO'
  | 'FALHOU';

type TipoEventoTimeline =
  | 'CRIADO'
  | 'DOCUMENTO_ANEXADO'
  | 'ENVIADO_REGULACAO'
  | 'PENDENCIA_REGISTRADA'
  | 'APROVADO'
  | 'REJEITADO'
  | 'AGENDADO'
  | 'OBSERVACAO'
  | 'RESPOSTA_SUS_RECEBIDA'
  | 'EDITADO';

type Sexo = 'M' | 'F' | 'OUTRO';

type TipoNotificacaoPaciente =
  | 'ENCAMINHAMENTO_CRIADO'
  | 'PENDENCIA_REGISTRADA'
  | 'PENDENCIA_RESOLVIDA'
  | 'APROVADO'
  | 'AGENDADO'
  | 'REJEITADO'
  | 'RESPOSTA_SUS_DISPONIVEL';
```

### 9.2 Auth

```typescript
interface PostLoginRequest {
  cpf: string;   // formatado ou dígitos
  senha: string;
}

interface PostLoginResponse {
  token: string;              // access opaco — TTL 30 min
  refreshToken: string;       // refresh opaco — TTL 30 dias (v0.18.0+)
  expiresIn: number;          // 1800 (30 min)
  refreshExpiresIn: number;   // 2592000 (30 dias)
  paciente: PacienteMe;
}

interface PacienteMe {
  id: string;
  nome: string;
  cpf: string;                       // sempre dígitos
  cpfFormatado: string;
  dataNascimento: string | null;     // YYYY-MM-DD; null se sem PEC clínico
  cartaoSus: string | null;
  email: string | null;
  telefone: string | null;
  fotoUrl: string | null;            // reservado v0.19+
  ubsVinculadaId: string | null;
  ubsVinculadaNome: string | null;
  senhaProvisoria: boolean;
}

interface PostTrocarSenhaRequest {
  senhaAtual: string;
  novaSenha: string;     // mínimo 8 chars
}
```

### 9.3 Encaminhamento (item de `/meus-encaminhamentos`)

```typescript
interface Encaminhamento {
  id: string;
  protocolo: string;             // "UBS-AAAA-NNNNNN"
  status: StatusEncaminhamento;
  paciente: PacienteSnapshot;    // snapshot — não é o paciente logado
  solicitacao: SolicitacaoMedica;
  anexos: AnexoDocumento[];
  timeline: EventoTimeline[];
  unidadeOrigem: string;
  atendenteResponsavel: string;
  observacoesRegulacao: string | null;
  agendamentoPrevisto: string | null;   // ISO 8601
  respostaSUS: RespostaSUS | null;
  criadoEm: string;
  atualizadoEm: string;
}

interface PacienteSnapshot {
  nome: string;
  cpf: string;                   // pode vir formatado nesse shape (snapshot)
  cartaoSus: string;
  dataNascimento: string;        // YYYY-MM-DD
  sexo: Sexo;
  telefone: string;
  endereco: string;
}

interface SolicitacaoMedica {
  medicoSolicitante: string;
  crm: string;
  especialidadeSolicitada: string;
  cid10: string;
  cidDescricao: string;
  justificativaClinica: string;
  prioridade: PrioridadeClinica;
  dataSolicitacao: string;       // YYYY-MM-DD
}

interface AnexoDocumento {
  id: string;
  nome: string;
  tipo: TipoAnexo;
  tamanhoKb: number;
  uploadEm: string;              // ISO 8601
  scanStatus: StatusScanAnexo;
}

interface EventoTimeline {
  id: string;
  tipo: TipoEventoTimeline;
  titulo: string;
  descricao: string;
  autor: string;
  autorPapel: string;
  em: string;                    // ISO 8601
}

interface RespostaSUS {
  anexoId: string;               // referência cruzada → anexos[]
  observacao: string;
  registradoEm: string;
  registradoPor: {
    id: string;
    nome: string;
    matricula: string;
  };
}
```

### 9.4 Notificação

```typescript
interface NotificacaoPaciente {
  id: string;
  tipo: TipoNotificacaoPaciente;
  titulo: string;
  corpo: string;
  encaminhamentoId: string | null;
  protocolo: string | null;
  payload: Record<string, unknown> | null;
  criadaEm: string;        // ISO 8601
  lidaEm: string | null;   // null = não lida
}

interface ContadorNaoLidas {
  naoLidas: number;
}

interface MarcarTodasLidasResponse {
  atualizadas: number;
}
```

### 9.5 Erro padrão

```typescript
interface ErroResponse {
  error: {
    code: string;      // SCREAMING_SNAKE_CASE
    message: string;   // pt-BR
    details?: Record<string, unknown>;
  };
}
```

---

## 10. Erros

### 10.1 Códigos canônicos

| HTTP | code | Significado | UX sugerida |
|---|---|---|---|
| 401 | `TOKEN_AUSENTE` | sem header Authorization | logout silencioso → /login |
| 401 | `TOKEN_INVALIDO` | sessão inválida/expirada | idem |
| 401 | `CREDENCIAIS_INVALIDAS` | login: CPF/senha errados OU trocar-senha: senha atual errada | mensagem inline |
| 401 | `CONTA_INATIVA` | conta foi desativada durante a sessão | logout + mensagem |
| 403 | `CONTA_DESATIVADA` | tentou logar com conta inativa | "Procure sua UBS para reativação" |
| 404 | `ANEXO_NAO_ENCONTRADO` | anexo inexistente OU de outro paciente (anti-enum) | "Arquivo não disponível" |
| 404 | `NOTIFICACAO_NAO_ENCONTRADA` | notificação inexistente OU de outro paciente | silencioso |
| 404 | `ARQUIVO_NAO_ENCONTRADO` | metadata existe mas arquivo físico sumiu | "Arquivo indisponível, contate sua UBS" |
| 409 | `ANEXO_NAO_LIBERADO` | scan pendente/infectado. `details.scanStatus` indica estado | "Aguarde — arquivo em análise de segurança" |
| 422 | `CPF_INVALIDO` | menos de 11 dígitos | erro inline no form |
| 422 | `SENHA_FRACA` | < 8 caracteres | erro inline |
| 422 | `SENHA_IGUAL_ATUAL` | nova == atual | erro inline |
| 422 | `CONFIRMACAO_INVALIDA` | ativar-conta: data nascimento errada | "Dados não conferem" |
| 409 | `CONTA_JA_ATIVADA` | ativar-conta em conta já ativa | "Já está ativa, faça login normal" |
| 404 | `CONTA_NAO_ENCONTRADA` | ativar-conta: CPF não existe | mensagem genérica |
| 500 | `ERRO_INTERNO` | exceção não tratada | retry button |

### 10.2 Códigos do CLIENTE (gerados localmente)

| code | Quando |
|---|---|
| `NETWORK_OFFLINE` | sem internet (Dio erro de rede) |
| `NOT_IMPLEMENTED` | recurso ainda não tem backend (Dossie, TFD, Banners, UBS) |
| `UNKNOWN_ERROR` | fallback final |

---

## 11. Endpoints implementados na v0.10.0

### 11.1 Recuperação de senha (v0.11.0 — HARDENING COMPLETO)

#### `POST /v1/paciente-app/auth/esqueci-senha` (pública)

**Request**: `{ "cpf": "12345678909" }` — formatado ou só dígitos. Validação Zod: 11-14 chars.

**Response**: **`204 No Content` SEMPRE** (anti-enumeration — não vaza se CPF existe).
Exceção: `429 RATE_LIMIT_EXCEDIDO` quando rate limit estoura (atacante PRECISA saber pra parar).

**Side effects** (quando CPF existe + checksum OK + conta ativa + email cadastrado):
- Gera token opaco 32 bytes hex (256 bits) via `crypto.randomBytes`, TTL 30min.
- Persiste só `SHA-256(token)` em `paciente_recovery_tokens`.
- Envia email com link `${APP_RESET_SENHA_URL}?t=<token>`.
- Audit log `SOLICITAR_REDEFINICAO_SENHA_OK` (com IP, UA, CPF mascarado, email mascarado).

**Hardening**:
- **Rate limit IP**: 5 req/15min/IP + 100 req/1h/IP (anti DDoS / enumeration por IP)
- **Rate limit CPF**: 3 req/1h/CPF (anti spam por cidadão)
- **CPF checksum**: rejeita "11111111111" e checksums errados (silencioso)
- **Timing-constant**: `MIN_MS=120` + `bcrypt.compare` dummy para conta inexistente
- **Audit log** em TODOS os caminhos (CPF inválido, não existe, conta inativa, sem email, throttle, sucesso)

#### `POST /v1/paciente-app/auth/redefinir-senha` (pública)

**Request**:
```json
{
  "token": "abc123...64-hex-chars-aqui...",
  "novaSenha": "MinhaNovaSenha2026"
}
```

Validação Zod:
- `token`: string, 32-128 chars, regex `^[a-f0-9]+$` (hex puro)
- `novaSenha`: string, 8-128 chars

**Response**: `204`.

**Erros**:
- `404 TOKEN_INVALIDO` — token malformado, não existe, ou formato errado
- `401 TOKEN_EXPIRADO` — TTL 30min estourado
- `409 TOKEN_JA_USADO` — link já consumido
- `422 SENHA_FRACA` — falha em `validarSenhaForte` (numérica pura, sequência comum, CPF, repetição)
- `422 SENHA_IGUAL_ATUAL` — nova senha == hash da atual
- `429 RATE_LIMIT_EXCEDIDO` — 10 req/15min/IP excedido

**Side effects** (sucesso):
- `senhaHash` trocado, `senhaProvisoria=false`
- `usadoEm=now()` no token consumido
- **TODAS as sessões ativas revogadas** (força re-login em todos os devices)
- **TODOS os outros recovery tokens ativos da conta são invalidados** (anti dual-use)
- Audit log `REDEFINIR_SENHA_OK` com `sessoesRevogadas` + `outrosTokensInvalidados`

**Hardening**:
- **Rate limit IP**: 10 req/15min/IP + 30 req/1h/IP (anti brute force de token)
- **Validação senha forte** (`shared/senhaForte.ts`): bloqueia `12345678`, `password`,
  CPF do dono, repetição massiva, < 8 chars
- **Audit log** em TODOS os caminhos (malformado, não existe, usado, expirado, fraca, igual, sucesso)

#### Tela web `/redefinir` (frontend SvelteKit)

Quando paciente clica no link do email, cai em `https://<host>/redefinir?t=<token>`.
A tela:
- Lê `?t=` da URL
- Valida formato local (regex `^[a-f0-9]{32,128}$`)
- Pede nova senha + confirmação (com toggle "mostrar/ocultar")
- Espelha `validarSenhaForte` no client
- Mostra mensagem amigável pra cada erro do backend
- Em sucesso: confirma + orienta pra abrir o app

#### Tela web `/recuperar-senha-paciente` (frontend SvelteKit)

Caso paciente perca o link. Pede CPF (com máscara), chama `esqueci-senha`,
mostra mensagem genérica "Verifique seu email" (anti-enumeration).

#### Purge cron de tokens (v0.11.0)

`node-cron` a cada 6h (env `RECOVERY_PURGE_CRON`) + catch-up no boot.
Deleta `PacienteRecoveryToken` onde `expiraEm < (now - 24h)` ou `usadoEm < (now - 24h)`.
Grace de 24h garante que audit já registrou. Audit `PURGE_RECOVERY_TOKENS` em cada run.

### 11.2 Campos novos em `Encaminhamento` (GET /meus-encaminhamentos)

Cada item da lista agora inclui:

```json
{
  "...": "...",
  "localAgendamento": "CEM · Sala 3 · Av. Getúlio Vargas, 1100",
  "profissionalAgendado": "Dra. Beatriz Lima · CRM-PE 22189",
  "cidadeAgendamento": "Recife",
  "ufAgendamento": "PE",
  "motivoRejeicao": null,
  "recomendacoes": ["Levar ECG recente", "Chegar 30min antes"],
  "pendenciasAbertas": 0,
  "podeSolicitarTfd": true
}
```

- `localAgendamento`, `profissionalAgendado`, **`cidadeAgendamento`, `ufAgendamento`**:
  persistidos no model `Encaminhamento`, preenchidos pela Regulação ao chamar `POST /aprovar`.
  Default UF: "BA" (configurável por prefeitura no futuro). UI sugere o município da UBS
  como `cidadeAgendamento` default; regulador altera quando a consulta é em outra cidade.
- `motivoRejeicao`: persistido (flat) no `POST /rejeitar`.
- `recomendacoes`: vem da tabela **`EspecialidadeRecomendacao`** (`/v1/admin/recomendacoes-especialidade/*`),
  JOIN **case-insensitive E accent-insensitive** por `especialidadeSolicitada` (normalização
  `String.normalize('NFD')` + strip de combining marks). "Cardiología" bate em "Cardiologia".
  Admin cadastra/edita via UI `/sms/rede/recomendacoes` (RBAC DEV/ADMIN/REGULADOR_SMS).
- `pendenciasAbertas`: **derivado** — varre `timeline` contando eventos
  `PENDENCIA_REGISTRADA` abertos (fecham com `DOCUMENTO_ANEXADO` ou
  `ENVIADO_REGULACAO` em data posterior). Cap em `1` quando
  `status=PENDENCIA_DOCUMENTO`. `0` em qualquer outro status.
- `podeSolicitarTfd`: **derivado** — `true` quando os 3 critérios batem:
  - `status === 'APROVADO'`
  - `agendamentoPrevisto` no futuro
  - **`cidadeAgendamento` (EXPLÍCITA) ≠ `Ubs.municipio` de origem** (comparação canônica:
    `lowercase + normalize('NFD') + strip diacríticos`). Sem `cidadeAgendamento`, fallback `true`
    (UI mostra CTA, UBS decide). **Não há mais heurística por substring** desde v0.10.2.

### 11.2.1 Audit log (admin CRUD de recomendações)

A partir da v0.10.2, toda mutação em `EspecialidadeRecomendacao` (CREATE/UPDATE/DELETE)
grava em `auditoria_logs` com:
- `acao`: `CRIAR_RECOMENDACAO_ESPECIALIDADE` | `ATUALIZAR_RECOMENDACAO_ESPECIALIDADE` | `DELETAR_RECOMENDACAO_ESPECIALIDADE`
- `recurso`: `EspecialidadeRecomendacao` · `recursoId`: id da recomendação
- `atendenteId`: vem do JWT (`req.auth.sub`)
- `ip` + `userAgent`: rastreáveis pra auditoria
- `payload`: para UPDATE inclui snapshot `antes`/`depois` + `camposAlterados`; CRIAR e DELETAR incluem o estado completo

### 11.3 UBS vinculada (v0.13.0 — schema completo + auto-bond)

#### `GET /v1/paciente-app/ubs/minha`

**Autenticada**. Retorna a UBS de vínculo do paciente com todos os campos.

**Vínculo é resolvido em ordem**:
1. `pacienteConta.ubsVinculadaId` (populado automaticamente na 1ª notificação)
2. Fallback: UBS do último encaminhamento do paciente (persistido depois — O(1) nas próximas)

**Response 200**:
```json
{
  "id": "uuid",
  "nome": "UBS Águas Belas Centro",
  "endereco": "Praça Central, 100",
  "bairro": "Centro",
  "cidade": "Águas Belas",
  "uf": "PE",
  "cep": "44001-000",
  "telefone": "7532010000",
  "whatsapp": "75999998888",
  "email": "ubs.aguasbelas@aguasbelas.pe.gov.br",
  "horarios": {
    "segunda": { "abre": "07:00", "fecha": "17:00" },
    "terca":   { "abre": "07:00", "fecha": "17:00" },
    "quarta":  { "abre": "07:00", "fecha": "17:00" },
    "quinta":  { "abre": "07:00", "fecha": "17:00" },
    "sexta":   { "abre": "07:00", "fecha": "17:00" },
    "sabado":  null,
    "domingo": null
  },
  "horarioFuncionamento": "Segunda a Sexta · 07:00 às 17:00",
  "coordenadoresNomes": ["Dra. Helena Rocha"],
  "latitude": -12.2664,
  "longitude": -38.9663,
  "observacoes": "Ponto de referência: ao lado do mercado central"
}
```

**Erro**: `404 PACIENTE_SEM_UBS` quando paciente sem vínculo nem encaminhamento.

**Campos** (v0.13.0):
- `horarios`: objeto estruturado com dias da semana. Cada dia é `null` (fechado)
  ou `{ abre: "HH:MM", fecha: "HH:MM" }`. Cliente pode renderizar tabela.
- `horarioFuncionamento`: string curta para UI sem espaço (resumo do `horarios`).
- `telefone`, `whatsapp`: dígitos puros (10/11 dígitos). Cliente formata pra exibir.
- `cep`: formato `00000-000`.
- `latitude`/`longitude`: number ou null. **Ou ambos preenchidos, ou ambos null**
  (validação cruzada no admin).

#### Cadastro pelo admin

Gestor cadastra via `PATCH /v1/admin/ubs/:id` (RBAC: DEV/ADMIN/REGULADOR_SMS).
Todos os 16 campos são opcionais; `null` limpa o valor existente.

Validações server-side:
- CEP: 8 dígitos (com ou sem hífen)
- Telefone/WhatsApp: 10 ou 11 dígitos, ou 13 dígitos E.164 começando em `55`
- Email: regex padrão + ≤180 chars
- Latitude: [-90, 90] · Longitude: [-180, 180] · ambos ou nenhum
- Horários: dias válidos (segunda..domingo), HH:MM regex, abre < fecha

**Audit `EDITAR_UBS`** grava snapshot **antes/depois** + lista de `camposAlterados`.

#### Auto-bond `ubsVinculadaId`

A partir da v0.13.0, quando o paciente recebe a **primeira notificação** (criação
de encaminhamento via Face 1), o backend popula `pacienteConta.ubsVinculadaId`
automaticamente com `Encaminhamento.ubsId`. Idempotente: se conta já tem vínculo,
preserva (transferências informais não são sobrescritas).

### 11.4 Push FCM

#### `POST /v1/paciente-app/me/fcm-token`

**Autenticada**. Registra token FCM do device.

**Request**:
```json
{
  "fcmToken": "fGz123...",
  "plataforma": "android",
  "appVersion": "0.1.0"
}
```

**Response**: `204`.

**Side effect**: UPSERT por `fcmToken` (UNIQUE global). Se token já existia pra
outra conta (cidadão trocou de conta no mesmo device), o registro é movido pra
nova conta automaticamente.

#### `DELETE /v1/paciente-app/me/fcm-token`

**Autenticada**. Revoga token do device.

**Request opcional**:
```json
{ "fcmToken": "fGz123..." }
```

Sem body → remove TODOS os devices da conta (logout total).
Com body → remove só o device específico.

**Response**: `204`.

> **Worker FCM dispatcher**: ainda não plugado (firebase-admin SDK). O
> backend persiste o token; quando o worker for ativado, basta ler
> `paciente_dispositivos` por `contaId` e despachar via FCM REST. App já está
> integrado e dispara `registrarDispositivo` no login.

### 11.5 Dossiê médico (v0.14.0 — HARDENING LGPD/CFM)

**Características gerais** (todos os 4 endpoints):

- **Autenticada** + **rate-limited** (120 req/15min/conta + 600 req/1h/conta + 1000 req/15min/IP)
- **Audit dual** em TODA leitura:
  - `auditoria_logs` (LGPD 5 anos): `DOSSIE_*_LIDO(S)` com payload (`cpfMasked`, paginação, totals)
  - `paciente_prontuario_audit` (**CFM 20 anos**, imutável via trigger SQL):
    `LEITURA_DOSSIE` com `autorPapel: "PACIENTE · App"`, IP, UA
- **Sanitização** anti-XSS em todos os campos free-form (strip HTML tags + control chars + zero-width Unicode + trim + cap 4000 chars)
- **Paginação cursor** em atendimentos/vacinas/exames: `?cursor=<id>&limit=<N>` (default 50, max 100)

#### `GET /v1/paciente-app/dossie/resumo`

**Response 200**:
```json
{
  "totalEncaminhamentos": 4,
  "totalAtendimentos": 21,
  "totalVacinas": 14,
  "totalExames": 8,
  "tipoSanguineo": "O+",
  "alergias": ["Dipirona", "Iodo"],
  "condicoesCronicas": ["Hipertensão", "DM2"],
  "medicamentosUsoContinuo": ["Losartana 50mg · 1x/dia", "Metformina 850mg · 2x/dia"]
}
```

Dados vêm do PEC (módulo `prontuario` da Face 1). Sem PEC vinculado ao CPF →
campos zerados (não 404).

#### `GET /v1/paciente-app/dossie/atendimentos`

**Response 200**: array de `Atendimento`:
```json
[
  {
    "id": "uuid",
    "data": "2026-05-19T10:30:00.000Z",
    "tipo": "CONSULTA",
    "localNome": "UBS Central",
    "profissionalNome": "Dr. Ricardo Santos",
    "profissionalEspecialidade": "Clínica geral",
    "queixaPrincipal": "...",
    "cid10": "E11.9",
    "cid10Descricao": null,
    "condutaResumida": "..."
  }
]
```

`tipo` ∈ `CONSULTA | EMERGENCIA | EXAME | VACINACAO | RETORNO` (mapeado do enum do PEC).
Limite 100 itens, ordenado `data DESC`.

#### `GET /v1/paciente-app/dossie/vacinacoes`

```json
[
  {
    "id": "uuid",
    "vacina": "Influenza tetravalente",
    "dose": "Anual",
    "aplicadaEm": "2026-04-12T14:00:00.000Z",
    "localAplicacao": "UBS Central",
    "lote": "BR224-2026",
    "fabricante": null
  }
]
```

#### `GET /v1/paciente-app/dossie/atendimentos/:id` (v0.18.2+)

**Autenticada** + **rate-limited** (mesmo limit do dossiê).

Retorna 1 atendimento com o **mesmo shape** do item da lista.

**Erros**:

| HTTP | code | Quando |
|---|---|---|
| 404 | `ATENDIMENTO_NAO_ENCONTRADO` | id inexistente OU atendimento de outro paciente (anti-enum) |

**Audit dual** (LGPD + CFM):
- LGPD: `DOSSIE_ATENDIMENTO_DETALHE_LIDO`
- CFM (imutável): `LEITURA_DOSSIE` com `endpoint: DOSSIE_ATENDIMENTO_DETALHE_LIDO`
- Tentativa cross-paciente: `DOSSIE_ATENDIMENTO_DETALHE_FORA_DO_ESCOPO` (LGPD crítico)

#### `GET /v1/paciente-app/dossie/exames`

```json
[
  {
    "id": "uuid",
    "nome": "Hemoglobina glicada",
    "realizadoEm": "2026-05-05T09:00:00.000Z",
    "solicitanteNome": "Dr. Ricardo Santos",
    "alterado": true,
    "resultadoResumo": "HbA1c = 8,4% (acima do alvo)",
    "observacoes": null
  }
]
```

`alterado = (resultado === 'ALTERADO' || 'CRITICO')` no PEC.

#### `GET /v1/paciente-app/dossie/vacinacoes/:id` (v0.18.2+)

Detalhe de 1 vacina aplicada. Mesmo shape do item da lista.

**Erros**: `404 VACINACAO_NAO_ENCONTRADA` (inexistente OU outro paciente).

**Audit**: `DOSSIE_VACINACAO_DETALHE_LIDO` (LGPD+CFM) ·
`DOSSIE_VACINACAO_DETALHE_FORA_DO_ESCOPO` em tentativa cross-paciente.

#### `GET /v1/paciente-app/dossie/exames/:id` (v0.18.2+)

Detalhe de 1 exame. Mesmo shape do item da lista.

**Erros**: `404 EXAME_NAO_ENCONTRADO` (inexistente OU outro paciente).

**Audit**: `DOSSIE_EXAME_DETALHE_LIDO` (LGPD+CFM) ·
`DOSSIE_EXAME_DETALHE_FORA_DO_ESCOPO` em tentativa cross-paciente.

### 11.6 Banners SMS

#### `GET /v1/paciente-app/banners`

**Response 200**: array de `SmsBanner` ativos não-expirados.

```json
[
  {
    "id": "uuid",
    "titulo": "Alerta: cuidado com a dengue",
    "corpo": "Casos de dengue subiram 32%...",
    "tone": "URGENTE",
    "publicadoEm": "2026-05-26T08:00:00.000Z",
    "expiraEm": "2026-07-26T00:00:00.000Z",
    "imagemUrl": null,
    "ctaLabel": "Saiba mais",
    "ctaUrl": "https://www.gov.br/saude/dengue",
    "prioridadeOrdem": 100
  }
]
```

`tone` ∈ `URGENTE | CAMPANHA | INFO | ATENCAO`.
Ordenação: `prioridadeOrdem DESC, publicadoEm DESC`.

**Escopo automático**: se banner tem `prefeituraId` setado, só pacientes
dessa prefeitura (via UBS vinculada) veem. Banners globais (sem prefeituraId)
aparecem pra todos.

#### `GET /v1/paciente-app/banners/:id`

**Response 200**: 1 banner (mesmo shape).
**Erro**: `404 BANNER_NAO_ENCONTRADO` se inativo, expirado, ou de outra prefeitura.

#### `POST /v1/paciente-app/banners/:id/visto`

Telemetria — marca banner como visto pelo paciente. UPSERT idempotente.
**Response**: `204`.

> Backend ainda não tem CMS admin pra criar banners — inserir via SQL ou
> Prisma Studio até a UI ser construída.

### 11.7 TFD do paciente

#### `GET /v1/paciente-app/tfd/viagens`

Viagens TFD futuras da prefeitura do paciente (via UBS vinculada).

**Response 200**: array de `TfdViagem`:
```json
[
  {
    "id": "uuid",
    "destinoCidade": "Salvador",
    "destinoUf": "BA",
    "destinoLocal": "Hospital Roberto Santos",
    "dataPartida": "2026-06-08T00:00:00.000Z",
    "horaPartida": "06:30",
    "localEmbarque": "Terminal Rodoviário",
    "vagasTotal": 12,
    "vagasOcupadas": 7,
    "veiculoDescricao": "Van Sprinter · 14 lugares",
    "veiculoPlaca": "JLT-2K84",
    "motoristaNome": "João Pedro Lima",
    "observacoes": null,
    "coordOrigem": null,
    "coordDestino": null
  }
]
```

Critério: `dataPartida >= hoje 00:00 UTC` AND `status=AGENDADA`.

#### `GET /v1/paciente-app/tfd/viagens/:viagemId`

Detalhe (mesmo shape).
**Erro**: `404 VIAGEM_NAO_ENCONTRADA` se de outra prefeitura ou não AGENDADA.

#### `GET /v1/paciente-app/tfd/solicitacoes`

**Response 200**: array de `TfdSolicitacao` (com `viagem` embedada):
```json
[
  {
    "id": "uuid",
    "viagemId": "uuid",
    "status": "APROVADA",
    "prioridade": "PRIORITARIA",
    "criadaEm": "2026-05-24T11:00:00.000Z",
    "viagem": { /* TfdViagem completa */ },
    "numeroAssento": "07",
    "justificativaPaciente": "...",
    "motivoRecusa": null,
    "encaminhamentoId": "uuid",
    "encaminhamentoProtocolo": "UBS-2026-100137",
    "acompanhante": null,
    "aprovadaEm": "2026-05-26T08:00:00.000Z"
  }
]
```

#### `GET /v1/paciente-app/tfd/solicitacoes/:id`

Detalhe.
**Erro**: `404 SOLICITACAO_NAO_ENCONTRADA` se de outro paciente.

#### `POST /v1/paciente-app/tfd/solicitacoes`

**Request**:
```json
{
  "viagemId": "uuid",
  "encaminhamentoId": "uuid (opcional)",
  "justificativa": "Consulta com cardiologista agendada...",
  "acompanhante": "João Souza (filho)"
}
```

**Response 201**: `TfdSolicitacao` criada (com `status=AGUARDANDO`, `numeroAssento=null`).

**Prioridade derivada no servidor** (cliente não envia):
- Sem `encaminhamentoId` → `NORMAL`
- Com encaminhamento URGENTE/EMERGENCIA → `URGENTE`
- Senão → `PRIORITARIA`

**Erros**:
| HTTP | code |
|---|---|
| 404 | `VIAGEM_NAO_ENCONTRADA` (não existe / outra prefeitura) |
| 409 | `TFD_VIAGEM_ENCERRADA` (status != AGENDADA) |
| 409 | `TFD_JA_TEM_SOLICITACAO` (já tem solicitação AGUARDANDO/APROVADA pra essa viagem) |
| 422 | `VALIDATION_ERROR` (justificativa < 10 chars OU encaminhamento de outro paciente) |

Idempotência: se já tinha solicitação CANCELADA/RECUSADA pra mesma viagem, **substitui** (reset pra AGUARDANDO com nova justificativa).

#### `DELETE /v1/paciente-app/tfd/solicitacoes/:id`

Cancela uma solicitação em `AGUARDANDO`.
**Response**: `204`.
**Erros**: `404 SOLICITACAO_NAO_ENCONTRADA`, `409 CONFLICT` (status != AGUARDANDO).

---

## 12. Apêndice — fluxo completo end-to-end

### 12.1 Como criar uma conta paciente de teste

```bash
cd /Users/mateus/Documents/Prefeitura/unisism-ubs/backend
npm run dev    # se ainda não estiver rodando

# Em outro terminal:
npx ts-node-dev --transpile-only scripts/seed-paciente-app.ts
```

Saída esperada:
```
✓ Conta criada
──────── Credenciais do app Flutter ────────
  CPF:           123.456.789-09  (ou 12345678909)
  Senha inicial: 12345678909    (= CPF dígitos)
  Nome:          MARIA APARECIDA SOUZA
  senhaProvisoria=true  →  app força troca no 1º login
```

O script é **idempotente** — reseta pra senha provisória mesmo se já existir.

### 12.2 Fluxo completo via curl (validado)

```bash
# 1. Login
curl -X POST http://localhost:3333/v1/paciente-app/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"cpf":"12345678909","senha":"12345678909"}'

# Response: { token, refreshToken, expiresIn: 1800, refreshExpiresIn: 2592000, paciente: { senhaProvisoria: true, ... } }

TOKEN="<token-da-response>"

# 2. Me (perfil)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3333/v1/paciente-app/me

# 3. Trocar senha (obrigatório porque senhaProvisoria=true)
curl -X POST http://localhost:3333/v1/paciente-app/auth/trocar-senha \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"senhaAtual":"12345678909","novaSenha":"MinhaNova2026"}'
# → 204 No Content

# 4. Me de novo — senhaProvisoria agora é false
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3333/v1/paciente-app/me
# → { senhaProvisoria: false }

# 5. Meus encaminhamentos
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3333/v1/paciente-app/meus-encaminhamentos
# → [] (paciente sem encaminhamentos ainda)

# 6. Contador de notificações
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3333/v1/paciente-app/notificacoes/count
# → { "naoLidas": 0 }

# 7. Lista de notificações
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3333/v1/paciente-app/notificacoes
# → []

# 8. Logout
curl -X POST http://localhost:3333/v1/paciente-app/auth/logout \
  -H "Authorization: Bearer $TOKEN"
# → 204
```

### 12.3 Para criar encaminhamentos visíveis no app

O backend só cria encaminhamentos via fluxo da Face 1 (atendente UBS consolida
PDF de solicitação médica). Para popular o app com dados reais:

1. Login DEV: `DEV-MATEUS` / `Aguasbelas#!`
2. Criar uma UBS via `POST /v1/admin/ubs` (já tem prefeitura seedada)
3. Criar atendente UBS via `POST /v1/admin/usuarios` (role `ATENDENTE_UBS`)
4. Login como atendente UBS
5. `POST /v1/encaminhamentos` (multipart com PDF + paciente CPF=12345678909)

O backend automaticamente:
- Cria/atualiza o paciente
- Cria o encaminhamento
- **Reusa** a `PacienteConta` existente (criada pelo seed)
- Emite notificação `ENCAMINHAMENTO_CRIADO`

Na próxima `/meus-encaminhamentos` do app, o novo encaminhamento aparece.

### 12.4 Como rodar o app Flutter

```bash
cd /Users/mateus/Documents/Prefeitura/UNISISM-Paciente

flutter pub get

# Mac dev (iOS Simulator ou Web)
flutter run --dart-define=API_BASE_URL=http://localhost:3333/v1 \
            --dart-define=NTFY_BASE_URL=http://localhost:8080

# Android emulator
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3333/v1 \
            --dart-define=NTFY_BASE_URL=http://10.0.2.2:8080
```

> **v0.18.1+**: mocks foram removidos da árvore do app — `USE_MOCK` não existe
> mais. O app sempre consome HTTP real. Para preview offline use o seed do
> backend (script `scripts/seed-paciente-app.ts`).

Login no app:
- **CPF**: `123.456.789-09` (ou `12345678909`)
- **Senha**: `12345678909` (= CPF dígitos)

O app vai detectar `senhaProvisoria=true` e forçar tela de troca de senha
bloqueante. Após a troca, a home libera.

---

## Resumo executivo — checklist pro frontend

| Ação | Endpoint | Headers |
|---|---|---|
| Login | `POST /v1/paciente-app/auth/login` | — |
| Salvar token em SecureStorage | usar `token` da response | — |
| Validar sessão no boot | `GET /v1/paciente-app/me` | `Authorization: Bearer <token>` |
| Detectar senha provisória | checar `paciente.senhaProvisoria` | — |
| Trocar senha (1º acesso ou autenticada) | `POST /v1/paciente-app/auth/trocar-senha` | Bearer |
| Listar encaminhamentos | `GET /v1/paciente-app/meus-encaminhamentos` | Bearer |
| Badge não-lidas | `GET /v1/paciente-app/notificacoes/count` | Bearer |
| Lista notificações | `GET /v1/paciente-app/notificacoes` | Bearer |
| Marcar lida | `POST /v1/paciente-app/notificacoes/:id/lida` | Bearer |
| Marcar todas lidas | `POST /v1/paciente-app/notificacoes/marcar-todas-lidas` | Bearer |
| Download de anexo | `GET /v1/paciente-app/anexos/:id/download` | Bearer (responseType: bytes) |
| Logout | `POST /v1/paciente-app/auth/logout` | Bearer |

**Total: 27 endpoints** (Face 3 v0.18.1+). Tudo sob `/v1/paciente-app/*` —
endpoints adicionais cobrem refresh, esqueci/redefinir senha, push genérico,
dossiê (4), banners (3), TFD (6), UBS vinculada e download de anexos.

---

**Manutenção desta doc**: se mudar o contrato no backend, atualizar este arquivo
+ atualizar os repos do app Flutter (`lib/data/repositories/*`). Os arquivos
`unisism_types.dart` e `unisism_api.dart` em [`docs/flutter/`](flutter/) também
servem como cliente Dart canônico.
