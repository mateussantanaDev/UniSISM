# UNISISM · UBS — Especificação de Backend

Documento-guia para a equipe de backend construir os serviços que a **Face 1 / UBS** consumirá.
Gerado a partir da auditoria completa dos contratos já consumidos no frontend SvelteKit.

**Base do projeto frontend**: `frontend/` · SvelteKit 2 · Svelte 5 · TypeScript · Tailwind v4.
**Camadas** (Clean Architecture):

```
src/lib/
├── domain/models/          ← contratos puros (sem dependência de infra)
├── infrastructure/api/     ← hoje: mocks com setTimeout; amanhã: fetch HTTP
└── presentation/           ← componentes Svelte (consumidores dos contratos)
```

O backend deve preservar **as mesmas formas (shapes)** dos tipos do `domain/models` e dos tipos internos dos arquivos em `infrastructure/api`. A troca de mock por `fetch` real no frontend deve ser transparente.

---

## 1. Convenções gerais

### 1.1. Base URL

Proposta:

```
https://api.unisism.aguasbelas.pe.gov.br/v1
```

Configurável via `VITE_API_BASE_URL` no frontend.

### 1.2. Autenticação

- **Esquema**: Bearer JWT no header `Authorization: Bearer <token>`.
- **Token**: assinado pelo backend, com `exp` curto (ex.: 30 min) + refresh token em cookie `httpOnly`.
- **Todos os endpoints exigem autenticação**, exceto:
  - `POST /auth/login`
  - `POST /auth/forgot-password`
  - `POST /auth/verify-code`
  - `POST /auth/reset-password`

### 1.3. Formato de datas

ISO 8601 em UTC, sempre:

- Datas completas: `2026-04-22T14:32:18.000Z`
- Datas de calendário (sem hora): `2026-04-22`

Frontend converte pra horário Brasília (`UTC−03`) na apresentação.

### 1.4. Identificadores

- IDs são `string`. Recomendado UUID v4 ou ULID.
- **Protocolos institucionais** têm formato próprio e são gerados no backend (e imutáveis):
  - Encaminhamento: `UBS-AAAA-NNNNNN` (ex.: `UBS-2026-100137`)
  - TFD: `TFD-AAAA-PPPNNN` (ex.: `TFD-2026-001042`)
  - Relatório: `rel-<epoch-ms>` ou equivalente

### 1.5. Paginação (roadmap)

Os endpoints de listagem hoje retornam listas completas. Ao atingir volume, adotar:

```http
GET /recurso?page=1&pageSize=50&sort=-criadoEm
```

Resposta:

```json
{
  "data": [...],
  "meta": { "page": 1, "pageSize": 50, "total": 214, "totalPages": 5 }
}
```

O frontend atualmente consome arrays planos — manter compatibilidade até a feature ser necessária.

### 1.6. Códigos HTTP

| Código                       | Uso                                                               |
| ---------------------------- | ----------------------------------------------------------------- |
| `200 OK`                     | Sucesso em GET, PUT, PATCH                                        |
| `201 Created`                | Sucesso em POST que cria recurso                                  |
| `204 No Content`             | Sucesso sem body (ex.: logout)                                    |
| `400 Bad Request`            | Payload inválido / validação de schema                            |
| `401 Unauthorized`           | Token ausente ou expirado                                         |
| `403 Forbidden`              | Autenticado mas sem permissão                                     |
| `404 Not Found`              | Recurso não existe                                                |
| `409 Conflict`               | Conflito de estado (ex.: resolver pendência em enc. não pendente) |
| `413 Payload Too Large`      | Upload acima do limite                                            |
| `415 Unsupported Media Type` | MIME não aceito                                                   |
| `422 Unprocessable Entity`   | Regra de negócio violada                                          |
| `429 Too Many Requests`      | Rate limit                                                        |
| `500 Internal Server Error`  | Falha não tratada                                                 |

### 1.7. Formato padrão de erro

```json
{
	"error": {
		"code": "ENCAMINHAMENTO_NAO_EM_PENDENCIA",
		"message": "Encaminhamento não está em pendência e não pode ser readequado.",
		"details": {
			"statusAtual": "APROVADO"
		}
	}
}
```

- `code`: string SCREAMING_SNAKE_CASE, estável, para o frontend mapear.
- `message`: mensagem humana em pt-BR.
- `details`: opcional, contexto para debug.

### 1.8. CORS

Permitir origem do frontend de produção + staging. Métodos: `GET, POST, PUT, PATCH, DELETE, OPTIONS`. Headers: `Authorization, Content-Type, Accept`.

---

## 2. Autenticação

### 2.1. `POST /auth/login`

Autentica o atendente. Consumido em [src/routes/login/+page.svelte](src/routes/login/+page.svelte).

**Request**:

```json
{
	"login": "SMS-047291",
	"senha": "••••••••",
	"lembrar": true
}
```

- `login` (string, obrigatório): matrícula (`SMS-NNNNNN`) **OU** email corporativo (`@saude.aguasbelas.pe.gov.br`).
- `senha` (string, obrigatório).
- `lembrar` (bool, opcional): estende validade do refresh token.

**Response 200**:

```json
{
	"token": "eyJhbGciOi...",
	"refreshToken": "...",
	"expiresIn": 1800,
	"atendente": {
		"id": "atd-042",
		"nome": "MATEUS DE SANTANA NEVES",
		"matricula": "SMS-047291",
		"iniciais": "MS"
	}
}
```

**Erros**:

- `401` — `CREDENCIAIS_INVALIDAS`
- `403` — `USUARIO_INATIVO`, `USUARIO_BLOQUEADO` (após N tentativas falhas)
- `422` — `SENHA_EXPIRADA` (força fluxo de redefinição)

**Regras**:

- Registrar tentativas falhas por IP/usuário.
- Após 5 tentativas falhas em 15 min, bloqueio de 30 min.
- Registrar IP, user-agent, geolocalização aproximada — disponíveis em `/me/profile` > segurança.

### 2.2. `POST /auth/logout`

Invalida token atual e o refresh token.

**Request**: vazio (token no header).
**Response 204**.

### 2.3. `POST /auth/forgot-password`

Inicia fluxo de recuperação. Consumido em [src/routes/login/esqueci-senha/+page.svelte](src/routes/login/esqueci-senha/+page.svelte).

**Request**:

```json
{ "login": "SMS-047291 ou email@saude.aguasbelas.pe.gov.br" }
```

**Response 200**:

```json
{ "tokenEnviado": true }
```

**Regras**:

- **Sempre retornar `200` com `tokenEnviado: true`**, mesmo quando o usuário não existe (evita enumeration).
- Enviar código de 6 dígitos numéricos ao email cadastrado no RH.
- TTL do código: 10 minutos.
- Rate limit: 1 solicitação por 60s / login.

### 2.4. `POST /auth/verify-code`

Valida o código recebido por email (passo 2 de 3 do fluxo).

**Request**:

```json
{ "login": "...", "codigo": "123456" }
```

**Response 200**:

```json
{ "valido": true, "resetToken": "tkn-..." }
```

- Quando válido, retornar `resetToken` (string opaca, TTL 5 min) que será usado no próximo passo.
- Quando inválido: `{ "valido": false }` + HTTP 200 (o frontend trata pela flag).

### 2.5. `POST /auth/reset-password`

Redefine a senha com o token obtido no passo anterior.

**Request**:

```json
{
	"resetToken": "tkn-...",
	"novaSenha": "minhaNovaSenha123"
}
```

**Response 200**:

```json
{ "sucesso": true }
```

**Regras**:

- Mínimo 8 caracteres (validado também no backend).
- Invalida todos os refresh tokens do usuário (encerra demais sessões).
- Registra evento de "senha alterada" no histórico de segurança.

**Erros**:

- `400` — `SENHA_FRACA`, `TOKEN_EXPIRADO`, `TOKEN_INVALIDO`

### 2.6. `GET /auth/me`

Retorna atendente autenticado (dados mínimos para renderizar sidebar/header imediatamente após login). O perfil completo é em `/me/profile`.

**Response 200**:

```json
{
	"id": "atd-042",
	"nome": "MATEUS DE SANTANA NEVES",
	"matricula": "SMS-047291",
	"iniciais": "MS",
	"unidade": "UBS CENTRAL",
	"cargo": "ATENDENTE DE REGULAÇÃO"
}
```

---

## 3. Perfil do Atendente

Consumido em todas as sub-rotas de `/ubs/perfil/*`. Fonte mock: [src/lib/infrastructure/api/userApi.ts](src/lib/infrastructure/api/userApi.ts).

### 3.1. `GET /me/profile`

Retorna o perfil completo do atendente autenticado.

**Response 200** (shape do tipo `AtendentePerfil`):

```json
{
	"nome": "MATEUS DE SANTANA NEVES",
	"iniciais": "MS",
	"matricula": "SMS-047291",
	"email": "mateus.santana@saude.aguasbelas.pe.gov.br",
	"cpf": "123.456.789-00",
	"telefone": "(75) 99812-4421",
	"dataNascimento": "1995-08-14",
	"cargo": "ATENDENTE DE REGULAÇÃO",
	"funcao": "Operador do canal de ingestão de encaminhamentos",
	"lotacao": "UBS CENTRAL · ÁGUAS BELAS / PE",
	"unidade": "UBS CENTRAL",
	"dataAdmissao": "2023-02-15",

	"producao": {
		"hoje": 47,
		"semana": 214,
		"mes": 892,
		"ano": 7318,
		"tempoMedio": "3m 02s",
		"taxaAprovacao": 88.4,
		"ranking": 3,
		"totalAtendentes": 14,
		"metaMes": 970,
		"porDia": [
			{ "dia": "SEG", "volume": 52 },
			{ "dia": "TER", "volume": 48 },
			{ "dia": "QUA", "volume": 41 },
			{ "dia": "QUI", "volume": 39 },
			{ "dia": "SEX", "volume": 47 },
			{ "dia": "SÁB", "volume": 12 },
			{ "dia": "DOM", "volume": 0 }
		],
		"porEspecialidade": [
			{ "nome": "Cardiologia", "volume": 68 },
			{ "nome": "Ortopedia", "volume": 51 }
		]
	},

	"seguranca": {
		"senhaAlteradaEm": "2025-12-18",
		"twoFAAtivo": true,
		"metodoTwoFA": "Aplicativo autenticador (TOTP)",
		"ultimoAcesso": "22/04/2026 14:32:18",
		"ipUltimoAcesso": "177.18.44.12",
		"dispositivo": "Chrome 130 · macOS 15",
		"localUltimoAcesso": "Águas Belas / PE",
		"tentativasFalhasSemana": 0,
		"sessoesAtivas": 1,
		"sessaoInatividade": "2m 14s",
		"sessaoExpiraEm": "27m 46s"
	},

	"atividadeRecente": [
		{
			"em": "22/04/2026 14:28",
			"acao": "Consolidou encaminhamento",
			"alvo": "UBS-2026-100137"
		}
	]
}
```

**Notas**:

- `producao.porDia[].dia` é label de 3 letras da semana (aceita-se também retornar ISO weekday — ajustaremos no frontend).
- `seguranca.ultimoAcesso`, `sessaoInatividade`, `sessaoExpiraEm` são **strings já formatadas** no mock. Backend pode retornar ISO e o frontend formata; **preferível**: retornar ISO e `ttlSegundos` para campos de duração.
- `atividadeRecente[]` limitado a ~20 últimas ações. Endpoint dedicado com paginação virá depois.

### 3.2. Alterar senha autenticado

**`POST /me/password`**

**Request**:

```json
{ "senhaAtual": "...", "novaSenha": "..." }
```

**Response 204** ou:

- `400 SENHA_FRACA`
- `401 SENHA_ATUAL_INCORRETA`

Encerra todas as outras sessões do usuário após sucesso.

### 3.3. Encerrar outras sessões

**`POST /me/sessions/revoke-others`**

**Response 200**: `{ "encerradas": 2 }`

Mantém a sessão atual ativa; invalida as demais.

---

## 4. Dashboard

### 4.1. `GET /dashboard/metrics`

Consumido em [src/routes/ubs/dashboard/+page.svelte](src/routes/ubs/dashboard/+page.svelte). Retorna agregado da UBS do atendente autenticado.

**Response 200** (shape `MetricasDashboard`):

```json
{
	"encaminhamentosHoje": 47,
	"aguardandoRegulacao": 128,
	"pendenciasDocumento": 9,
	"aprovadosHoje": 31,
	"tempoMedioConsolidacaoSegundos": 182,
	"encaminhamentosSemana": 214
}
```

**Regras**:

- Escopo: **UBS vinculada ao atendente**.
- `tempoMedioConsolidacaoSegundos`: tempo médio entre upload do PDF e `POST /encaminhamentos`.
- Cacheável por 30s (lado do backend).

---

## 5. Encaminhamentos

Todos os endpoints abaixo são consumidos em `/ubs/novo-encaminhamento/*`, `/ubs/historico/*`, `/ubs/encaminhamento/:id/*` e `/ubs/dashboard/*`. Fonte mock: [src/lib/infrastructure/api/ubsApi.ts](src/lib/infrastructure/api/ubsApi.ts).

### 5.1. `POST /encaminhamentos/extract-pdf`

Faz OCR + extração estruturada do PDF da solicitação médica. **Este é o coração da Face 1**.

Consumido em [src/routes/ubs/novo-encaminhamento/+page.svelte](src/routes/ubs/novo-encaminhamento/+page.svelte) (Passo 1 · Upload).

**Request**: `multipart/form-data`

```
file: <binary>  (application/pdf, máx 10 MB)
```

**Response 200** (shape `ExtracaoPdfResultado`):

```json
{
	"paciente": {
		"nome": "MARIA APARECIDA DA SILVA SANTOS",
		"cpf": "123.456.789-00",
		"cartaoSus": "704 8052 9384 0012",
		"dataNascimento": "1968-03-14",
		"sexo": "F",
		"telefone": "(75) 99812-4421",
		"endereco": "RUA JOÃO BATISTA DE SOUZA, 245 - CENTRO - ÁGUAS BELAS/PE"
	},
	"solicitacao": {
		"medicoSolicitante": "DR. CARLOS EDUARDO MENDES",
		"crm": "CRM/BA 28.471",
		"especialidadeSolicitada": "Cardiologia",
		"cid10": "I10",
		"cidDescricao": "Hipertensão essencial (primária)",
		"justificativaClinica": "Paciente com quadro crônico refratário...",
		"prioridade": "PRIORITARIA",
		"dataSolicitacao": "2026-04-22"
	},
	"confiancaExtracao": 0.94
}
```

**Regras**:

- Aceitar PDFs nativos (texto) **e** escaneados (OCR).
- `confiancaExtracao`: float 0..1. Quando `< 0.75`, frontend pode alertar visualmente.
- Se campos críticos ausentes (CPF, nome ou especialidade): ainda retorna 200 com strings vazias nesses campos + `confiancaExtracao` baixa. O atendente corrigirá na Revisão.
- CID-10: validar contra tabela oficial; se código inválido, devolver `""` e `cidDescricao: ""`.
- **NÃO persistir** nada neste endpoint. É apenas extração.

**Erros**:

- `400 ARQUIVO_INVALIDO` — não é PDF válido
- `413 ARQUIVO_MUITO_GRANDE` — acima de 10 MB
- `415 MIME_NAO_SUPORTADO`
- `503 SERVICO_OCR_INDISPONIVEL`

**Latência esperada**: até 5s (PDF nativo) / até 15s (OCR).

### 5.2. `POST /encaminhamentos`

Consolida e envia à Regulação. Consumido em [src/routes/ubs/novo-encaminhamento/confirmacao/+page.svelte](src/routes/ubs/novo-encaminhamento/confirmacao/+page.svelte) (Passo 3).

**Request**: `multipart/form-data` (para incluir anexos binários) ou JSON com anexos previamente carregados. Recomendado multipart:

```
payload: <JSON string>
solicitacao: <file>       (PDF original)
anexo[0]:   <file>
anexo[1]:   <file>
...
tipoAnexo[0]: RG
tipoAnexo[1]: EXAME
```

Body JSON em `payload`:

```json
{
  "paciente": { ... shape Paciente ... },
  "solicitacao": { ... shape SolicitacaoMedica ... }
}
```

**Response 201**:

```json
{
	"id": "enc-uuid",
	"protocolo": "UBS-2026-100137"
}
```

**Regras**:

- Status inicial: `AGUARDANDO_REGULACAO`.
- Gerar `protocolo` único no padrão `UBS-AAAA-NNNNNN`.
- Registrar evento timeline `CRIADO`.
- Se houver anexos, registrar evento `DOCUMENTO_ANEXADO` para cada.
- Registrar evento `ENVIADO_REGULACAO` + disparar webhook / fila pra Regulação.
- Atendente e unidade derivam do JWT.

**Erros**:

- `422 DADOS_OBRIGATORIOS_AUSENTES` — CPF, nome, especialidade ou CID-10 faltando
- `422 CID_INVALIDO`

### 5.3. `GET /encaminhamentos`

Lista encaminhamentos. Consumido em:

- [src/routes/ubs/historico/+layout.svelte](src/routes/ubs/historico/+layout.svelte) (todos/por status)
- [src/routes/ubs/dashboard/+page.svelte](src/routes/ubs/dashboard/+page.svelte) (últimos 6)
- [src/routes/ubs/dashboard/fila/+page.svelte](src/routes/ubs/dashboard/fila/+page.svelte) (aguardando + pendências)

**Query params**:

| Param        | Tipo                       | Default     | Descrição                            |
| ------------ | -------------------------- | ----------- | ------------------------------------ |
| `status`     | StatusEncaminhamento\|null | todos       | Filtro por status                    |
| `pacienteId` | string                     | —           | Todos encaminhamentos de um paciente |
| `desde`      | ISO date                   | −30d        | Limite inferior do `criadoEm`        |
| `ate`        | ISO date                   | hoje        | Limite superior                      |
| `limit`      | number                     | 100         | Máximo de resultados                 |
| `sort`       | string                     | `-criadoEm` | Ordenação                            |

**Response 200**: `Encaminhamento[]` (shape completo abaixo em §9).

**Regras**:

- Escopo padrão: UBS do atendente. RBAC pode ampliar (ex.: coordenador vê todas as UBS).

### 5.4. `GET /encaminhamentos/:id`

Retorna encaminhamento completo com `anexos[]`, `timeline[]`, `observacoesRegulacao`, `agendamentoPrevisto`.

Consumido em [src/routes/ubs/encaminhamento/[id]/+layout.svelte](src/routes/ubs/encaminhamento/[id]/+layout.svelte) e suas 5 sub-tabs.

**Response 200**: `Encaminhamento` (completo).

**Erros**: `404 ENCAMINHAMENTO_NAO_ENCONTRADO`.

### 5.5. `POST /encaminhamentos/:id/resolve-pendencia`

Readequa e reenvia um encaminhamento em pendência. Consumido em [src/lib/presentation/components/ResolverPendencia.svelte](src/lib/presentation/components/ResolverPendencia.svelte).

**Request**: `multipart/form-data`

```
nota: <string>
anexo[0]:    <file>
tipoAnexo[0]: LAUDO
anexo[1]:    <file>
tipoAnexo[1]: EXAME
...
```

**Response 200**: `Encaminhamento` atualizado (com status novo + anexos + timeline estendida).

**Regras obrigatórias**:

1. Só aceita quando `status atual === PENDENCIA_DOCUMENTO`. Caso contrário `409 ENCAMINHAMENTO_NAO_EM_PENDENCIA`.
2. Adicionar eventos timeline, **nesta ordem**:
   - `OBSERVACAO` — "Pendência respondida pelo atendente" + `descricao = nota`
   - `DOCUMENTO_ANEXADO` — um por anexo enviado
   - `ENVIADO_REGULACAO` — "Reenviado à Regulação"
3. Mudar `status` para `AGUARDANDO_REGULACAO`.
4. Limpar `observacoesRegulacao` (string vazia).
5. Atualizar `atualizadoEm`.
6. Anexar os novos `AnexoDocumento` à lista existente (não substituir).
7. Disparar notificação à Regulação (fila/webhook).

**Erros**:

- `409 ENCAMINHAMENTO_NAO_EM_PENDENCIA`
- `422 NENHUMA_ACAO_FORNECIDA` — nem anexo, nem nota

### 5.6. `POST /encaminhamentos/:id/aprovar` · **Face 2 · Regulação**

Aprovação final pela Regulação SMS. Consumido em [src/lib/presentation/components/AprovarEncaminhamento.svelte](src/lib/presentation/components/AprovarEncaminhamento.svelte).

**Roles permitidos**: `REGULADOR_SMS`, `DESENVOLVEDOR`.

**Request** (JSON):

```json
{
	"nota": "Paciente inserido na fila da Cardiologia · Hospital Ana Nery.",
	"agendamentoPrevisto": "2026-05-14"
}
```

| Campo                 | Tipo                  | Obrigatório | Descrição                                                                                                                                   |
| --------------------- | --------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `nota`                | `string`              | não         | Observação do regulador. Se presente, vira evento `OBSERVACAO` na timeline.                                                                 |
| `agendamentoPrevisto` | `string` (YYYY-MM-DD) | não         | Data prevista do atendimento especializado. Se presente, vira evento `AGENDADO` e preenche o campo `agendamentoPrevisto` do encaminhamento. |

**Response 200**: `Encaminhamento` atualizado.

**Regras obrigatórias**:

1. Só aceita quando `status atual === AGUARDANDO_REGULACAO`. Caso contrário `409 ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO`.
2. Eventos timeline adicionados, nesta ordem:
   - `OBSERVACAO` (opcional, apenas se `nota` foi informada)
   - `APROVADO` — autor = regulador autenticado, papel `"Regulação · SMS"`
   - `AGENDADO` (opcional, apenas se `agendamentoPrevisto` foi informado)
3. Mudar `status` para `APROVADO`.
4. Preencher `agendamentoPrevisto` (string ISO ou `null`).
5. Atualizar `atualizadoEm`.
6. Notificar UBS de origem (fila/webhook).

**Erros**:

- `409 ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO`
- `403 PERMISSAO_INSUFICIENTE`

### 5.7. `POST /encaminhamentos/:id/registrar-pendencia` · **Face 2 · Regulação**

Solicita correção/complementação à UBS. Consumido em [src/lib/presentation/components/SolicitarCorrecao.svelte](src/lib/presentation/components/SolicitarCorrecao.svelte).

**Roles permitidos**: `REGULADOR_SMS`, `DESENVOLVEDOR`.

**Request** (JSON):

```json
{
	"observacao": "Anexar laudo médico com data inferior a 90 dias. O laudo atual está desatualizado (datado de 12/2024). Reenviar após correção."
}
```

| Campo        | Tipo     | Obrigatório | Descrição                                                                                                                      |
| ------------ | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `observacao` | `string` | **sim**     | Texto da pendência (mínimo 10 caracteres recomendado). Vira o campo `observacoesRegulacao` e fica visível ao atendente na UBS. |

**Response 200**: `Encaminhamento` atualizado.

**Regras obrigatórias**:

1. Só aceita quando `status atual === AGUARDANDO_REGULACAO`. Caso contrário `409 ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO`.
2. Preencher `observacoesRegulacao` com o texto da request.
3. Evento timeline `PENDENCIA_REGISTRADA` — autor = regulador autenticado, `descricao` = observação.
4. Mudar `status` para `PENDENCIA_DOCUMENTO`.
5. Atualizar `atualizadoEm`.
6. Notificar UBS de origem.

**Erros**:

- `409 ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO`
- `422 OBSERVACAO_OBRIGATORIA` — observação vazia ou ausente
- `403 PERMISSAO_INSUFICIENTE`

### 5.8. `POST /encaminhamentos/:id/rejeitar` · **Face 2 · Regulação**

Rejeição **definitiva** (sem possibilidade de reenvio pela UBS). Consumido em [src/lib/presentation/components/RejeitarEncaminhamento.svelte](src/lib/presentation/components/RejeitarEncaminhamento.svelte).

**Roles permitidos**: `REGULADOR_SMS`, `DESENVOLVEDOR`.

**Request** (JSON):

```json
{
	"motivo": "Paciente não atende aos critérios de protocolo para a especialidade. Indicar tratamento conservador na atenção básica."
}
```

| Campo    | Tipo     | Obrigatório | Descrição                                                                                                                           |
| -------- | -------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `motivo` | `string` | **sim**     | Justificativa clara da rejeição (mínimo 10 caracteres recomendado). Vai para o campo `descricao` do evento `REJEITADO` na timeline. |

**Response 200**: `Encaminhamento` atualizado.

**Regras obrigatórias**:

1. Só aceita quando `status atual === AGUARDANDO_REGULACAO`. Caso contrário `409 ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO`.
2. Evento timeline `REJEITADO` — autor = regulador autenticado, `descricao` = motivo.
3. Mudar `status` para `REJEITADO`.
4. Limpar `observacoesRegulacao` (string vazia).
5. Atualizar `atualizadoEm`.
6. Notificar UBS de origem.
7. Rejeição é **terminal** — nenhuma outra transição é permitida depois (UBS não pode reenviar o mesmo protocolo).

**Erros**:

- `409 ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO`
- `422 MOTIVO_OBRIGATORIO` — motivo vazio ou ausente
- `403 PERMISSAO_INSUFICIENTE`

### 5.9. `POST /encaminhamentos/:id/resposta-sus` · **Face 2 · Retorno SUS Federal**

Após aprovação pela Regulação Municipal, o caso vai para o SUS Federal que devolve um PDF oficial (agendamento, fila de espera, negativa justificada). A Secretaria anexa esse PDF aqui.

Consumido em [src/lib/presentation/components/RegistrarRespostaSUS.svelte](src/lib/presentation/components/RegistrarRespostaSUS.svelte).

**Roles permitidos**: `REGULADOR_SMS`, `DESENVOLVEDOR`.

**Request**: `multipart/form-data`

```
file: <PDF, máx 10 MB, application/pdf>
observacao: <string obrigatório — resumo curado da resposta>
```

**Response 200**: `Encaminhamento` atualizado (com `respostaSUS` preenchido + novo evento timeline + novo anexo).

**Regras obrigatórias**:

1. Só aceita quando `status atual === APROVADO`. Caso contrário `409 ENCAMINHAMENTO_NAO_APROVADO`.
2. Só aceita se `respostaSUS` **ainda não estiver presente** no encaminhamento. Caso contrário `409 RESPOSTA_SUS_JA_REGISTRADA` (evita duplicação; regras de substituição futura ficarão em endpoint PUT separado).
3. Validar `file` não vazio e MIME `application/pdf`. Senão `422 PDF_RESPOSTA_OBRIGATORIO` ou `415 MIME_NAO_SUPORTADO`.
4. Salvar o PDF como novo `AnexoDocumento` com `tipo: 'RESPOSTA_SUS'`.
5. Preencher o campo `respostaSUS` do encaminhamento:
   ```ts
   {
     anexoId: <id do anexo recém-criado>,
     observacao: <texto da request>,
     registradoEm: <agora ISO 8601>,
     registradoPor: { id, nome, matricula }  // regulador autenticado
   }
   ```
6. Adicionar evento timeline `RESPOSTA_SUS_RECEBIDA`:
   - `titulo`: `"Resposta do SUS registrada"`
   - `descricao`: observação da request
   - `autor`: regulador autenticado · `autorPapel`: `"Regulação · SMS"`
7. **Status permanece `APROVADO`** — não é uma transição de estado. É um enriquecimento do registro.
8. Atualizar `atualizadoEm`.
9. Notificar UBS de origem (webhook/fila · evento `resposta_sus.registrada`) — a UBS pode então contatar o paciente com a resposta oficial.

**Erros**:

- `409 ENCAMINHAMENTO_NAO_APROVADO`
- `409 RESPOSTA_SUS_JA_REGISTRADA`
- `413 ARQUIVO_MUITO_GRANDE`
- `415 MIME_NAO_SUPORTADO`
- `422 PDF_RESPOSTA_OBRIGATORIO`
- `403 PERMISSAO_INSUFICIENTE`

### 5.10. `GET /encaminhamentos/arvore` · **Face 2 · Árvore hierárquica**

Endpoint **agregado** que alimenta o file-manager de Ingestões da Secretaria (`/sms/ingestoes/*`). Retorna contagens por nível hierárquico (UBS → Ano → Mês → Dia) evitando trazer a lista completa de encaminhamentos ao cliente.

**Roles permitidos**: `REGULADOR_SMS`, `ADMIN`, `DESENVOLVEDOR`.

**Query params** (progressivo — quanto mais parâmetros, mais profundo):

| Params enviados             | Retorna                                         |
| --------------------------- | ----------------------------------------------- |
| nenhum                      | `ArvoreUbsNode[]` (nível 1: UBSs da prefeitura) |
| `?ubsId=...`                | `ArvoreAnoNode[]` (nível 2: anos daquela UBS)   |
| `?ubsId=...&ano=2026`       | `ArvoreMesNode[]` (nível 3: meses do ano)       |
| `?ubsId=...&ano=2026&mes=4` | `ArvoreDiaNode[]` (nível 4: dias do mês)        |

Para o **nível 5** (lista de encaminhamentos de um dia específico) → usar `GET /encaminhamentos?desde=YYYY-MM-DD&ate=YYYY-MM-DD` (endpoint já existente).

**Response 200 (nível 1)**:

```json
[
	{
		"ubsId": "ubs-central",
		"nome": "UBS CENTRAL",
		"totalEncaminhamentos": 248,
		"anoMaisRecente": 2026,
		"statusContagem": {
			"aguardando": 18,
			"pendencia": 4,
			"aprovado": 210,
			"rejeitado": 16
		}
	}
]
```

**Response 200 (nível 2 · anos)**:

```json
[
  { "ano": 2026, "totalEncaminhamentos": 47, "statusContagem": { ... } },
  { "ano": 2025, "totalEncaminhamentos": 188, "statusContagem": { ... } }
]
```

**Response 200 (nível 3 · meses)**: mesma estrutura com campo `mes` (1-12).

**Response 200 (nível 4 · dias)**: mesma estrutura com campo `dia` (1-31).

**Regras obrigatórias**:

1. Escopo automático por `prefeituraId` do JWT (regulador só vê UBSs da sua prefeitura).
2. UBSs sem nenhum encaminhamento **podem** aparecer com `totalEncaminhamentos: 0` (para o file-manager mostrar unidades recém-cadastradas).
3. Ordenação padrão:
   - UBSs: por `totalEncaminhamentos` decrescente.
   - Anos: decrescente (mais recente primeiro).
   - Meses: decrescente.
   - Dias: decrescente.
4. `statusContagem` é calculado apenas sobre os encaminhamentos filtrados pelo caminho hierárquico (UBS + ano + mês conforme os params).

**Erros**:

- `400 PARAMS_INCOMPATIVEIS` — ex.: `mes` sem `ano`.
- `404 UBS_NAO_ENCONTRADA` — `ubsId` inválido ou fora do escopo.

**Performance**: este endpoint será chamado a cada navegação entre pastas. Cachear agressivamente (Redis, TTL 30s-5min) + usar índices compostos `(prefeitura_id, ubs_id, EXTRACT(YEAR FROM criado_em), EXTRACT(MONTH FROM criado_em))` no banco.

---

## 6. Pacientes (PEC · Prontuário Eletrônico do Cidadão)

Consumido em [src/routes/ubs/pacientes/\*](src/routes/ubs/pacientes/). Fonte mock: [src/lib/infrastructure/api/pacientesApi.ts](src/lib/infrastructure/api/pacientesApi.ts).

### 6.1. `GET /pacientes`

Lista pacientes vinculados à UBS do atendente.

Consumido em [src/routes/ubs/pacientes/+page.svelte](src/routes/ubs/pacientes/+page.svelte).

**Query params**:

| Param       | Descrição                                                        |
| ----------- | ---------------------------------------------------------------- |
| `q`         | busca textual (nome, CPF, Cartão SUS, equipe ESF)                |
| `filtro`    | `COM_CRONICAS` \| `COM_ENCAMINHAMENTOS` \| `SEM_ATENDIMENTO_90D` |
| `equipeId`  | id da equipe ESF                                                 |
| `microarea` | ex. "03"                                                         |

**Response 200**: `PacienteResumo[]` (ver §9).

### 6.2. `GET /pacientes/:id`

Retorna prontuário completo do paciente, incluindo `atendimentos`, `viagensTFD`, `exames`, `vacinacoes`, `medicosAtendentes`, `encaminhamentosIds`.

Consumido em todas as sub-tabs do paciente.

**Response 200**: `PacienteCompleto` (ver §9).

**Regras**:

- Escopo: paciente deve estar vinculado à UBS do atendente (ou o atendente ter role que autorize cross-UBS).
- `encaminhamentosIds`: apenas IDs; o detalhe é obtido em `GET /encaminhamentos/:id`. O frontend cruza localmente com `GET /encaminhamentos?pacienteId=:id` na sub-tab de encaminhamentos.

**Erros**: `404 PACIENTE_NAO_ENCONTRADO`, `403 PACIENTE_FORA_DO_ESCOPO`.

### 6.3. Sub-recursos individuais (roadmap)

Quando o volume por paciente crescer, expor também:

- `GET /pacientes/:id/atendimentos?desde=&ate=`
- `GET /pacientes/:id/exames?categoria=`
- `GET /pacientes/:id/vacinas`
- `GET /pacientes/:id/tfd`

Formas iguais aos campos dentro de `PacienteCompleto`.

---

## 7. Relatórios

Consumido em [src/routes/ubs/perfil/relatorios/+page.svelte](src/routes/ubs/perfil/relatorios/+page.svelte). Fonte: [src/lib/infrastructure/api/userApi.ts](src/lib/infrastructure/api/userApi.ts).

### 7.1. `GET /relatorios`

Lista relatórios gerados pelo atendente (últimos 90 dias).

**Response 200**: `Relatorio[]` (ver §9).

### 7.2. `POST /relatorios`

Solicita geração de novo relatório. Geração pode ser **assíncrona** (recomendado para `XLSX` e relatórios grandes).

**Request**:

```json
{
	"tipo": "PRODUCAO_INDIVIDUAL",
	"dataInicial": "2026-04-01",
	"dataFinal": "2026-04-22",
	"formato": "PDF",
	"filtros": { "especialidade": "Cardiologia" }
}
```

- `tipo`: um de `TipoRelatorio` (ver §9).
- `formato`: `PDF | CSV | XLSX`.
- `filtros`: objeto específico do tipo (opcional).

**Response 202 Accepted** (assíncrono):

```json
{
	"id": "rel-...",
	"titulo": "Produção Individual · 01/04/2026 – 22/04/2026",
	"status": "PROCESSANDO"
}
```

Frontend faz polling em `GET /relatorios/:id` até `status === DISPONIVEL`. Alternativa: WebSocket/SSE `events`.

**Response 201 Created** (síncrono rápido, <3s):

```json
{
	"id": "rel-...",
	"titulo": "...",
	"tipo": "PRODUCAO_INDIVIDUAL",
	"periodo": "01/04/2026 – 22/04/2026",
	"formato": "PDF",
	"geradoEm": "2026-04-22T14:32:18.000Z",
	"tamanhoKb": 284,
	"status": "DISPONIVEL"
}
```

### 7.3. `GET /relatorios/:id/download`

Baixa o arquivo. Retorna o binário com headers:

```
Content-Type: application/pdf | text/csv | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="producao-individual-202604.pdf"
```

**Erros**: `404 RELATORIO_NAO_ENCONTRADO`, `409 RELATORIO_NAO_DISPONIVEL` (ainda processando).

### 7.4. Tipos de relatório

| `tipo`                              | Descrição                                       | Escopo                |
| ----------------------------------- | ----------------------------------------------- | --------------------- |
| `PRODUCAO_INDIVIDUAL`               | Volume do próprio atendente por dia/semana/mês. | Atendente autenticado |
| `ENCAMINHAMENTOS_POR_ESPECIALIDADE` | Ranking de especialidades.                      | UBS                   |
| `FILA_REGULACAO`                    | Aguardando + tempo médio por prioridade.        | UBS                   |
| `PENDENCIAS_RESOLVIDAS`             | Readequações feitas no período.                 | Atendente             |
| `TFD_CUSTOS`                        | Viagens custeadas + valores.                    | UBS                   |
| `VACINACAO_UBS`                     | Doses aplicadas por vacina / campanha.          | UBS                   |
| `BUSCA_ATIVA`                       | Pacientes sem atendimento >90d.                 | UBS                   |

---

## 8. Uploads e anexos

### 8.1. Limites

- Tamanho máximo por arquivo: **10 MB**.
- Tipos aceitos:
  - Solicitação médica: `application/pdf` (apenas)
  - Anexos: `application/pdf`, `image/jpeg`, `image/png`
- Tamanho máximo total da requisição: **30 MB**.

### 8.2. Armazenamento

- Recomendado S3-compatible (MinIO, Wasabi ou AWS S3). URLs pré-assinadas para leitura/escrita.
- Responder em `AnexoDocumento` apenas metadados (`id`, `nome`, `tipo`, `tamanhoKb`, `uploadEm`).
- Download do anexo: `GET /anexos/:id/download` (ou URL pré-assinada retornada no payload).

### 8.3. Antivírus

Qualquer upload deve passar por scan (ClamAV) antes de ser marcado como disponível. Durante scan, o `status` implícito é "quarentena" — pode ficar indisponível para download por alguns segundos.

---

## 9. Domain Models — TypeScript (fonte da verdade)

Definições exatas que o backend deve refletir. **Palavras em `UPPER_CASE` são enums** (strings literais).

### 9.1. Encaminhamento (`src/lib/domain/models/Encaminhamento.ts`)

```ts
type StatusEncaminhamento =
	| 'RASCUNHO'
	| 'AGUARDANDO_REGULACAO'
	| 'PENDENCIA_DOCUMENTO'
	| 'APROVADO'
	| 'REJEITADO';

type PrioridadeClinica = 'ELETIVA' | 'PRIORITARIA' | 'URGENTE' | 'EMERGENCIA';

interface Paciente {
	nome: string;
	cpf: string; // formato "123.456.789-00"
	cartaoSus: string; // formato "704 8052 9384 0012"
	dataNascimento: string; // YYYY-MM-DD
	sexo: 'M' | 'F' | 'OUTRO';
	telefone: string;
	endereco: string;
}

interface SolicitacaoMedica {
	medicoSolicitante: string;
	crm: string; // ex.: "CRM/BA 28.471"
	especialidadeSolicitada: string;
	cid10: string; // ex.: "I10"
	cidDescricao: string;
	justificativaClinica: string;
	prioridade: PrioridadeClinica;
	dataSolicitacao: string; // YYYY-MM-DD
}

interface AnexoDocumento {
	id: string;
	nome: string;
	tipo: 'SOLICITACAO' | 'RG' | 'CPF' | 'CARTAO_SUS' | 'EXAME' | 'LAUDO' | 'OUTRO';
	tamanhoKb: number;
	uploadEm: string; // ISO 8601
}

type TipoEventoTimeline =
	| 'CRIADO'
	| 'DOCUMENTO_ANEXADO'
	| 'ENVIADO_REGULACAO'
	| 'PENDENCIA_REGISTRADA'
	| 'APROVADO'
	| 'REJEITADO'
	| 'AGENDADO'
	| 'OBSERVACAO';

interface EventoTimeline {
	id: string;
	tipo: TipoEventoTimeline;
	titulo: string;
	descricao: string;
	autor: string; // ex.: "MATEUS SANTANA" ou "SISTEMA"
	autorPapel: string; // ex.: "Atendente · UBS Central"
	em: string; // ISO 8601
}

interface Encaminhamento {
	id: string;
	protocolo: string; // UBS-AAAA-NNNNNN
	paciente: Paciente;
	solicitacao: SolicitacaoMedica;
	anexos: AnexoDocumento[];
	status: StatusEncaminhamento;
	criadoEm: string; // ISO 8601
	atualizadoEm: string; // ISO 8601
	unidadeOrigem: string; // ex.: "UBS CENTRAL - ÁGUAS BELAS"
	atendenteResponsavel: string;
	timeline?: EventoTimeline[];
	observacoesRegulacao?: string;
	agendamentoPrevisto?: string | null; // ISO 8601 quando APROVADO
}

interface MetricasDashboard {
	encaminhamentosHoje: number;
	aguardandoRegulacao: number;
	pendenciasDocumento: number;
	aprovadosHoje: number;
	tempoMedioConsolidacaoSegundos: number;
	encaminhamentosSemana: number;
}

interface ExtracaoPdfResultado {
	paciente: Paciente;
	solicitacao: SolicitacaoMedica;
	confiancaExtracao: number; // 0.0 a 1.0
}
```

### 9.2. Paciente / PEC (`src/lib/domain/models/Paciente.ts`)

```ts
type Sexo = 'M' | 'F' | 'OUTRO';

type GrupoSanguineo = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'NAO_INFORMADO';

type EstadoCivil = 'SOLTEIRO' | 'CASADO' | 'DIVORCIADO' | 'VIUVO' | 'UNIAO_ESTAVEL' | 'OUTRO';

type RacaCor = 'BRANCA' | 'PRETA' | 'PARDA' | 'AMARELA' | 'INDIGENA' | 'NAO_INFORMADA';

interface Alergia {
	substancia: string;
	tipo: 'MEDICAMENTO' | 'ALIMENTO' | 'AMBIENTAL' | 'OUTRO';
	gravidade: 'LEVE' | 'MODERADA' | 'GRAVE';
	observacao?: string;
}

interface CondicaoCronica {
	cid10: string;
	descricao: string;
	desde: string; // YYYY-MM-DD
	ativo: boolean;
	observacao?: string;
}

interface MedicamentoEmUso {
	nome: string;
	dosagem: string; // ex.: "50 mg"
	frequencia: string; // ex.: "1x ao dia · manhã"
	desde: string; // YYYY-MM-DD
	prescritor: string;
	ativo: boolean;
}

type TipoAtendimento =
	| 'CONSULTA_MEDICA'
	| 'ENFERMAGEM'
	| 'VACINACAO'
	| 'CURATIVO'
	| 'ODONTOLOGICO'
	| 'PROCEDIMENTO'
	| 'ACOLHIMENTO';

interface Atendimento {
	id: string;
	data: string; // ISO 8601
	tipo: TipoAtendimento;
	profissional: string;
	registroProfissional: string; // CRM/COREN/CRO
	especialidade: string;
	unidade: string;
	queixaPrincipal: string;
	diagnostico: string;
	cid10: string;
	conduta: string;
	prescricaoResumo?: string;
}

type StatusViagemTFD = 'AGENDADA' | 'REALIZADA' | 'CANCELADA' | 'EM_ANDAMENTO';

interface ViagemTFD {
	id: string;
	protocolo: string; // TFD-AAAA-PPPNNN
	dataIda: string; // ISO 8601
	dataVolta: string; // ISO 8601
	destino: string; // ex.: "SALVADOR / BA"
	unidadeDestino: string;
	motivo: string;
	especialidade: string;
	acompanhante: boolean;
	transporte: 'VAN_SMS' | 'AMBULANCIA' | 'PASSAGEM_RODOVIARIA' | 'PASSAGEM_AEREA';
	status: StatusViagemTFD;
	custoEstimadoBRL: number;
}

type ResultadoExame = 'NORMAL' | 'ALTERADO' | 'CRITICO' | 'PENDENTE';

interface ExameRealizado {
	id: string;
	data: string; // ISO 8601
	tipo: string; // ex.: "Hemograma completo"
	categoria: 'LABORATORIAL' | 'IMAGEM' | 'FUNCIONAL' | 'OUTROS';
	solicitante: string;
	unidadeExecutora: string;
	resultado: ResultadoExame;
	observacao?: string;
}

interface VacinaAplicada {
	id: string;
	data: string; // ISO 8601
	vacina: string;
	dose: string; // ex.: "Reforço"
	lote: string;
	aplicador: string;
	unidade: string;
	via: 'INTRAMUSCULAR' | 'SUBCUTANEA' | 'ORAL' | 'INTRADERMICA';
}

interface MedicoAtendente {
	nome: string;
	registro: string;
	especialidade: string;
	unidade: string;
	ultimaConsulta: string; // ISO 8601
	totalConsultas: number;
}

interface PacienteResumo {
	id: string;
	nome: string;
	nomeSocial?: string;
	cpf: string;
	cartaoSus: string;
	dataNascimento: string; // YYYY-MM-DD
	sexo: Sexo;
	telefone: string;
	unidadeVinculada: string;
	equipeSaudeFamilia?: string; // ex.: "ESF-07 · Dr. Rafael Nunes"
	ultimoAtendimento?: string; // ISO 8601
	condicoesCronicasAtivas: number;
	encaminhamentosAtivos: number;
	cadastradoEm: string; // YYYY-MM-DD
}

interface PacienteCompleto extends PacienteResumo {
	nomeMae: string;
	nomePai?: string;
	estadoCivil: EstadoCivil;
	escolaridade: string;
	profissao?: string;
	racaCor: RacaCor;
	endereco: string;
	bairro: string;
	municipio: string;
	uf: string;
	cep: string;
	telefoneSecundario?: string;
	email?: string;

	grupoSanguineo: GrupoSanguineo;
	alergias: Alergia[];
	condicoesCronicas: CondicaoCronica[];
	medicamentosEmUso: MedicamentoEmUso[];
	historicoFamiliar: string[]; // textos livres

	agenteComunitario?: string;
	microarea?: string;

	atendimentos: Atendimento[];
	viagensTFD: ViagemTFD[];
	exames: ExameRealizado[];
	vacinacoes: VacinaAplicada[];
	medicosAtendentes: MedicoAtendente[];
	encaminhamentosIds: string[];
}
```

### 9.3. Perfil + Relatórios (`src/lib/infrastructure/api/userApi.ts`)

```ts
interface AtendentePerfil {
	nome: string;
	iniciais: string; // ex.: "MS"
	matricula: string; // SMS-NNNNNN
	email: string;
	cpf: string;
	telefone: string;
	dataNascimento: string; // YYYY-MM-DD
	cargo: string;
	funcao: string;
	lotacao: string;
	unidade: string;
	dataAdmissao: string; // YYYY-MM-DD

	producao: {
		hoje: number;
		semana: number;
		mes: number;
		ano: number;
		tempoMedio: string; // ex.: "3m 02s" (formatado)
		taxaAprovacao: number; // 0..100
		ranking: number; // 1-based
		totalAtendentes: number;
		metaMes: number;
		porDia: { dia: string; volume: number }[]; // 7 entradas
		porEspecialidade: { nome: string; volume: number }[]; // top 5
	};

	seguranca: {
		senhaAlteradaEm: string; // YYYY-MM-DD
		twoFAAtivo: boolean;
		metodoTwoFA: string;
		ultimoAcesso: string;
		ipUltimoAcesso: string;
		dispositivo: string;
		localUltimoAcesso: string;
		tentativasFalhasSemana: number;
		sessoesAtivas: number;
		sessaoInatividade: string; // ex.: "2m 14s"
		sessaoExpiraEm: string;
	};

	atividadeRecente: {
		em: string; // ex.: "22/04/2026 14:28"
		acao: string;
		alvo?: string; // protocolo ou título
	}[];
}

type TipoRelatorio =
	| 'PRODUCAO_INDIVIDUAL'
	| 'ENCAMINHAMENTOS_POR_ESPECIALIDADE'
	| 'FILA_REGULACAO'
	| 'PENDENCIAS_RESOLVIDAS'
	| 'TFD_CUSTOS'
	| 'VACINACAO_UBS'
	| 'BUSCA_ATIVA';

type FormatoRelatorio = 'PDF' | 'CSV' | 'XLSX';

interface Relatorio {
	id: string;
	titulo: string;
	tipo: TipoRelatorio;
	periodo: string; // ex.: "01/04/2026 – 22/04/2026"
	formato: FormatoRelatorio;
	geradoEm: string; // ISO 8601
	tamanhoKb: number;
	status: 'DISPONIVEL' | 'PROCESSANDO' | 'FALHA';
}

interface GerarRelatorioPayload {
	tipo: TipoRelatorio;
	dataInicial: string; // YYYY-MM-DD
	dataFinal: string; // YYYY-MM-DD
	formato: FormatoRelatorio;
}
```

---

## 10. Regras de negócio transversais

### 10.1. Máquina de estados — Encaminhamento

```
      POST /encaminhamentos  (Face 1 · UBS)
              │
              ▼
    AGUARDANDO_REGULACAO ──── POST /:id/aprovar ────► APROVADO       (terminal)
              │                                       (pode vir com AGENDADO)
              │
              ├────────────── POST /:id/rejeitar ───► REJEITADO      (terminal)
              │
              └─── POST /:id/registrar-pendencia ──► PENDENCIA_DOCUMENTO
                                                      │
                                                      │ POST /:id/resolve-pendencia
                                                      │ (Face 1 · UBS)
                                                      ▼
                                              AGUARDANDO_REGULACAO (volta pro topo)
```

**Gates de transição (validação no backend)**:

| De → Para                                      | Endpoint                        | Role exigido                                      |
| ---------------------------------------------- | ------------------------------- | ------------------------------------------------- |
| — → `AGUARDANDO_REGULACAO`                     | `POST /encaminhamentos`         | `ATENDENTE_UBS`/`COORDENADOR_UBS`/`DESENVOLVEDOR` |
| `AGUARDANDO_REGULACAO` → `APROVADO`            | `POST /:id/aprovar`             | `REGULADOR_SMS`/`DESENVOLVEDOR`                   |
| `AGUARDANDO_REGULACAO` → `PENDENCIA_DOCUMENTO` | `POST /:id/registrar-pendencia` | `REGULADOR_SMS`/`DESENVOLVEDOR`                   |
| `AGUARDANDO_REGULACAO` → `REJEITADO`           | `POST /:id/rejeitar`            | `REGULADOR_SMS`/`DESENVOLVEDOR`                   |
| `PENDENCIA_DOCUMENTO` → `AGUARDANDO_REGULACAO` | `POST /:id/resolve-pendencia`   | `ATENDENTE_UBS`/`COORDENADOR_UBS`/`DESENVOLVEDOR` |

- `APROVADO` e `REJEITADO` são **terminais em termos de status**. Nenhuma transição depois (exceto correção administrativa via DEV, se for o caso).
- **Enrichment pós-aprovação**: `POST /:id/resposta-sus` anexa o PDF oficial do SUS Federal ao encaminhamento já `APROVADO` — **não é uma transição de status**, só enriquece o registro com `respostaSUS` + evento `RESPOSTA_SUS_RECEBIDA`.
- `RASCUNHO` existe para futura funcionalidade de "salvar para depois"; **não usado ainda**.
- Eventos timeline registrados em cada transição, com `autor` = atendente UBS, regulador SMS, ou `"SISTEMA"` (eventos automáticos como `ENVIADO_REGULACAO`).

### 10.2. Prioridade clínica

Extraída do PDF (preferencialmente) ou informada pelo atendente. Afeta ordenação na fila e SLA da Regulação. Sem regra automática de escalonamento no MVP.

### 10.3. Protocolo

- Gerado **no momento do `POST /encaminhamentos`** (não durante a extração).
- Imutável pela vida do encaminhamento.
- Único globalmente.

### 10.4. Anexos após consolidação

Na readequação (`resolve-pendencia`), **acrescentam-se** novos anexos à lista. Não removem os anteriores. Os anteriores permanecem auditáveis.

### 10.5. Escopo por UBS (RBAC)

- Todo atendente tem UBS vinculada no JWT (`claim ubsId`).
- Listagens e GETs são filtrados por essa UBS.
- Roles previstas:
  - `ATENDENTE_UBS` (padrão, criado aqui)
  - `COORDENADOR_UBS` (vê toda UBS + equipes)
  - `REGULADOR_SMS` (ação externa, futura Face 2)
  - `ADMIN` (cross-UBS)

---

## 11. Latências e SLA esperados (benchmark do mock)

| Operação                                         | Mock atual | SLA alvo                              |
| ------------------------------------------------ | ---------- | ------------------------------------- |
| Login                                            | 1.2s       | ≤ 1s                                  |
| Extração OCR de PDF                              | 2.1s       | ≤ 5s (PDF nativo) / ≤ 15s (escaneado) |
| Consolidação                                     | 1.2s       | ≤ 2s                                  |
| GET listagem (dashboard / histórico / pacientes) | 0.4–0.6s   | ≤ 800ms                               |
| GET detalhe (enc / paciente)                     | 0.5s       | ≤ 500ms                               |
| Resolver pendência                               | 1.4s       | ≤ 3s                                  |
| Gerar relatório síncrono                         | 1.6s       | ≤ 3s (caso síncrono)                  |

---

## 12. Segurança

- **TLS 1.2+** obrigatório em produção. HSTS.
- **CSRF**: se adotarmos cookies de sessão, usar token CSRF em header `X-CSRF-Token`.
- **Rate limit**:
  - `POST /auth/login` — 10/min/IP
  - `POST /auth/forgot-password` — 1/min/usuário
  - `POST /encaminhamentos/extract-pdf` — 30/min/atendente
- **Audit log** persistente de todas as mutações (principalmente transições de status, alterações de senha, logout forçado).
- **LGPD**:
  - Dados sensíveis (CPF, Cartão SUS, diagnóstico, CID-10) mascarados em logs.
  - Endpoint `GET /me/lgpd/export` para exportação de dados pessoais (roadmap).
  - Retenção conforme política da SMS.

---

## 13. Observabilidade

- Exportar métricas Prometheus (`/metrics`, scrape interno):
  - `http_request_duration_seconds{route, method, status}`
  - `ocr_extraction_duration_seconds`
  - `ocr_extraction_confidence` (histogram)
  - `encaminhamentos_total{status}`
- Traces OpenTelemetry. Todo request do frontend envia `X-Request-Id` que o backend propaga.
- Log estruturado JSON.

---

## 14. Checklist mínimo do MVP

- [ ] Auth (login, logout, forgot → verify → reset, me)
- [ ] `GET /me/profile`
- [ ] `POST /me/password`
- [ ] `GET /dashboard/metrics`
- [ ] `POST /encaminhamentos/extract-pdf`
- [ ] `POST /encaminhamentos`
- [ ] `GET /encaminhamentos` (com `status`, `pacienteId`)
- [ ] `GET /encaminhamentos/:id`
- [ ] `POST /encaminhamentos/:id/resolve-pendencia`
- [ ] `POST /encaminhamentos/:id/aprovar` · **Face 2**
- [ ] `POST /encaminhamentos/:id/registrar-pendencia` · **Face 2**
- [ ] `POST /encaminhamentos/:id/rejeitar` · **Face 2**
- [ ] `POST /encaminhamentos/:id/resposta-sus` · **Face 2 · retorno SUS**
- [ ] `GET  /encaminhamentos/arvore` · **Face 2 · file-manager**
- [ ] `GET /pacientes`
- [ ] `GET /pacientes/:id`
- [ ] `GET /relatorios` + `POST /relatorios` + download
- [ ] Armazenamento S3 + scan AV
- [ ] RBAC por UBS **+ por Prefeitura (REGULADOR_SMS)**
- [ ] Métricas + audit log

---

## 15. Referências rápidas (arquivos do frontend)

| Arquivo                                                                                  | Finalidade                              |
| ---------------------------------------------------------------------------------------- | --------------------------------------- |
| [src/lib/domain/models/Encaminhamento.ts](src/lib/domain/models/Encaminhamento.ts)       | Tipos core de encaminhamento            |
| [src/lib/domain/models/Paciente.ts](src/lib/domain/models/Paciente.ts)                   | Tipos do PEC                            |
| [src/lib/infrastructure/api/ubsApi.ts](src/lib/infrastructure/api/ubsApi.ts)             | Contratos de encaminhamento + dashboard |
| [src/lib/infrastructure/api/pacientesApi.ts](src/lib/infrastructure/api/pacientesApi.ts) | Contratos de paciente                   |
| [src/lib/infrastructure/api/userApi.ts](src/lib/infrastructure/api/userApi.ts)           | Contratos de auth, perfil, relatórios   |

Qualquer divergência entre este documento e os arquivos-fonte acima — **a fonte vence**. Este documento é gerado a partir deles.
