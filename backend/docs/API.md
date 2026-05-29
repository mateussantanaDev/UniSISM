# UNISISM · UBS — Documentação da API (consumo pelo frontend)

> **Base URL local:** `http://localhost:3333/v1`
> **Base URL produção (proposta):** `https://api.unisism.aguasbelas.pe.gov.br/v1`

Todas as datas são **ISO 8601 UTC** (`2026-04-22T14:32:18.000Z`) ou **YYYY-MM-DD** (`2026-04-22`).
Todos os IDs são strings (UUIDv4 ou IDs estáveis do seed como `ubs-central`).

---

## Índice

1. [Autenticação e tokens](#1-autenticação-e-tokens)
2. [Hierarquia e escopo (RBAC)](#2-hierarquia-e-escopo-rbac)
3. [Padrão de erro](#3-padrão-de-erro)
4. [Auth · `/auth/*`](#4-auth--auth)
5. [Perfil · `/me/*`](#5-perfil--me)
6. [Dashboard · `/dashboard/*`](#6-dashboard--dashboard)
7. [Encaminhamentos · `/encaminhamentos/*`](#7-encaminhamentos--encaminhamentos)
8. [Pacientes · `/pacientes/*`](#8-pacientes--pacientes)
9. [Relatórios · `/relatorios/*`](#9-relatórios--relatorios)
10. [Admin · `/admin/*`](#10-admin--admin) (criação/edição de prefeituras, UBSs e usuários)
11. [Face 2 · Regulação SMS](#11-face-2--regulação-sms)
12. [Face 3 · App do Paciente](#12-face-3--app-do-paciente)
13. [Notificações automáticas ao paciente](#13-notificações-automáticas-ao-paciente)
14. [Códigos de erro catalogados](#14-códigos-de-erro-catalogados)
15. [Usuários do seed](#15-usuários-do-seed)
16. [Infra de produção (o que o frontend precisa saber)](#16-infra-de-produção-o-que-o-frontend-precisa-saber)

---

## 1. Autenticação e tokens

- Esquema: `Authorization: Bearer <accessToken>`.
- O **accessToken** vem em todo response de `POST /auth/login` (TTL 30 min).
- O **refreshToken** vem no mesmo response — guardar em cookie `httpOnly` ou storage seguro. Hoje o backend não tem rota de rotação automática (roadmap); para "lembrar-me", basta o frontend reusar o `accessToken` enquanto válido.
- O JWT contém: `sub` (atendenteId), `role`, `ubsId?`, `prefeituraId?`, `sid` (sessão), `iat`, `exp`.
- Endpoints públicos (não exigem token):
  - `POST /auth/login`
  - `POST /auth/forgot-password`
  - `POST /auth/verify-code`
  - `POST /auth/reset-password`
  - `GET  /health`

---

## 2. Hierarquia e escopo (RBAC)

```
Prefeitura (cidade)                    ← criada por DESENVOLVEDOR
  ├── UBS (posto de saúde)             ← criada por DESENVOLVEDOR ou ADMIN da prefeitura
  │     ├── ATENDENTE_UBS              ← criado por DESENVOLVEDOR ou ADMIN
  │     └── COORDENADOR_UBS
  ├── ADMIN (admin da prefeitura)      ← criado por DESENVOLVEDOR
  └── REGULADOR_SMS                    ← criado por DESENVOLVEDOR ou ADMIN
DESENVOLVEDOR                          ← acesso global, criado por outro DESENVOLVEDOR
```

### Matriz de permissão

| Role            | Escopo de leitura     | Pode criar usuários | Pode criar UBSs | Pode criar Prefeituras | Pode consolidar encaminhamento |
|-----------------|-----------------------|---------------------|-----------------|------------------------|--------------------------------|
| `DESENVOLVEDOR` | **GLOBAL** (tudo)     | ✅ qualquer role    | ✅ qualquer pref| ✅                     | ✅ (técnico)                   |
| `ADMIN`         | sua **prefeitura**    | ✅ exceto DEV       | ✅ própria pref | ❌                     | ❌                             |
| `COORDENADOR_UBS` | sua **UBS**         | ❌                  | ❌              | ❌                     | ✅                             |
| `ATENDENTE_UBS` | sua **UBS**           | ❌                  | ❌              | ❌                     | ✅                             |
| `REGULADOR_SMS` | sua **prefeitura**    | ❌                  | ❌              | ❌                     | ❌                             |

**Isolamento garantido pelo backend:**

- ATENDENTE de UBS-X **não vê** dados de UBS-Y (mesma prefeitura ou outra).
- ADMIN da Prefeitura A **não vê** UBS, usuários, encaminhamentos ou pacientes da Prefeitura B.
- Toda listagem/GET aplica filtro automático com base no token. Tentativa de GET por ID retorna `404` (não `403`) para não vazar a existência do recurso.
- Mutações com `prefeituraId`/`ubsId` no payload são validadas com `403 FORA_DO_ESCOPO`.

---

## 3. Padrão de erro

Toda resposta de erro segue este shape:

```json
{
  "error": {
    "code": "CODIGO_SCREAMING_SNAKE",
    "message": "mensagem em pt-BR",
    "details": { "...": "opcional" }
  }
}
```

| HTTP | Quando |
|------|--------|
| 400 | Payload inválido (zod) ou regra de body |
| 401 | Token ausente / expirado / inválido |
| 403 | Autenticado mas sem permissão (escopo ou role) |
| 404 | Recurso não existe ou está fora do escopo |
| 409 | Conflito (ex.: pendência em status errado, CNPJ duplicado) |
| 413 | Upload acima de 10 MB |
| 415 | MIME não suportado |
| 422 | Regra de negócio violada (campos faltando, senha fraca…) |
| 429 | Rate limit |
| 500 | Erro não tratado (sempre logado com `requestId`) |

Lista completa em [§11](#11-códigos-de-erro-catalogados).

---

## 4. Auth · `/auth/*`

### `POST /auth/login`

Autentica um usuário (qualquer role).

**Request:**
```json
{ "login": "SMS-047291", "senha": "12345678", "lembrar": false }
```

- `login` aceita **matrícula** (`SMS-047291`, `ADM-001`, `DEV-001`) **OU email** (`mateus.santana@saude.aguasbelas.pe.gov.br`).

**Response 200:**
```json
{
  "token": "eyJhbGciOi...",
  "refreshToken": "UudovZeb...",
  "expiresIn": 1800,
  "atendente": {
    "id": "uuid",
    "nome": "MATEUS DE SANTANA NEVES",
    "matricula": "SMS-047291",
    "iniciais": "MN"
  }
}
```

**Erros:**
- `401 CREDENCIAIS_INVALIDAS` · `403 USUARIO_INATIVO` · `403 USUARIO_BLOQUEADO` (5 falhas em 15 min) · `422 SENHA_EXPIRADA`

### `POST /auth/logout`

Revoga a sessão atual. Header obrigatório: `Authorization: Bearer ...`.
Body opcional: `{ "refreshToken": "..." }` para revogar também o refresh.
**Response 204** (sem body).

### `POST /auth/forgot-password`

Inicia o fluxo de recuperação. **Sempre retorna 200 com `tokenEnviado: true`** (anti-enumeration).
Internamente: gera código numérico de 6 dígitos com TTL 10 min e dispara email (em dev, vai pro log).

```json
{ "login": "SMS-047291" }      // request
{ "tokenEnviado": true }       // response 200
```

### `POST /auth/verify-code`

```json
{ "login": "SMS-047291", "codigo": "123456" }
```

**Response 200:**
- válido: `{ "valido": true, "resetToken": "tkn-..." }` (TTL 5 min)
- inválido: `{ "valido": false }`

### `POST /auth/reset-password`

```json
{ "resetToken": "tkn-...", "novaSenha": "novaSenhaSegura123" }
```

**Response 200:** `{ "sucesso": true }` · invalida todas as sessões do usuário.
**Erros:** `400 SENHA_FRACA`, `400 TOKEN_INVALIDO`, `400 TOKEN_EXPIRADO`.

### `GET /auth/me`

Retorna resumo do atendente autenticado. **Útil logo após login** para popular sidebar/header.

**Response 200:**
```json
{
  "id": "uuid",
  "nome": "MATEUS DE SANTANA NEVES",
  "matricula": "SMS-047291",
  "iniciais": "MN",
  "role": "ATENDENTE_UBS",
  "unidade": "UBS CENTRAL",
  "prefeitura": "Prefeitura Municipal de Águas Belas",
  "cargo": "ATENDENTE DE REGULAÇÃO",
  "escopo": "UBS"
}
```

`escopo` ∈ `"GLOBAL" | "PREFEITURA" | "UBS"` — o frontend usa para esconder/mostrar menus.

---

## 5. Perfil · `/me/*`

### `GET /me/profile`

Perfil completo + produção + segurança + atividade. Shape exato consumido em `/ubs/perfil/*`.

**Response 200** (resumido — campos importantes):
```json
{
  "nome": "MATEUS DE SANTANA NEVES",
  "iniciais": "MN",
  "matricula": "SMS-047291",
  "email": "mateus.santana@saude.aguasbelas.pe.gov.br",
  "cpf": "123.456.789-00",
  "telefone": "(75) 99812-4421",
  "dataNascimento": "1995-08-14",
  "cargo": "ATENDENTE DE REGULAÇÃO",
  "funcao": "Operador do canal de ingestão de encaminhamentos",
  "lotacao": "UBS CENTRAL · Águas Belas / PE",
  "unidade": "UBS CENTRAL",
  "dataAdmissao": "2023-02-15",
  "producao": {
    "hoje": 0, "semana": 1, "mes": 1, "ano": 1,
    "tempoMedio": "3m 02s", "taxaAprovacao": 0,
    "ranking": 1, "totalAtendentes": 1, "metaMes": 970,
    "porDia": [{"dia":"DOM","volume":0}, ...],
    "porEspecialidade": [{"nome":"Cardiologia","volume":1}]
  },
  "seguranca": {
    "senhaAlteradaEm": "2026-04-22",
    "twoFAAtivo": true,
    "metodoTwoFA": "Aplicativo autenticador (TOTP)",
    "ultimoAcesso": "22/04/2026 19:30:00",
    "ipUltimoAcesso": "::1",
    "dispositivo": "...",
    "localUltimoAcesso": "—",
    "tentativasFalhasSemana": 0,
    "sessoesAtivas": 1,
    "sessaoInatividade": "0s",
    "sessaoExpiraEm": "29m"
  },
  "atividadeRecente": [
    { "em": "22/04/2026 19:30", "acao": "Login efetuado" }
  ]
}
```

### `POST /me/password`

```json
{ "senhaAtual": "12345678", "novaSenha": "novaSenhaForte123" }
```

**Response 204.** Encerra **todas** as outras sessões.
**Erros:** `400 SENHA_FRACA` · `401 SENHA_ATUAL_INCORRETA`.

### `POST /me/sessions/revoke-others`

Encerra todas as sessões exceto a atual.
**Response 200:** `{ "encerradas": 2 }`

---

## 6. Dashboard · `/dashboard/*`

### `GET /dashboard/metrics`

Métricas agregadas **respeitando o escopo do usuário**:
- DESENVOLVEDOR: tudo
- ADMIN: prefeitura
- ATENDENTE/COORDENADOR: UBS

```json
{
  "encaminhamentosHoje": 1,
  "aguardandoRegulacao": 0,
  "pendenciasDocumento": 1,
  "aprovadosHoje": 0,
  "tempoMedioConsolidacaoSegundos": 180,
  "encaminhamentosSemana": 1
}
```

Header de resposta: `Cache-Control: public, max-age=30`.

---

## 7. Encaminhamentos · `/encaminhamentos/*`

### `POST /encaminhamentos/extract-pdf`

OCR + extração estruturada do PDF da solicitação médica. **Não persiste nada.**

**Request:** `multipart/form-data` com `file: <PDF, máx 10 MB>`

**Response 200:**
```json
{
  "paciente": {
    "nome": "MARIA APARECIDA DA SILVA SANTOS",
    "cpf": "123.456.789-00",
    "cartaoSus": "704 8052 9384 0012",
    "dataNascimento": "1968-03-14",
    "sexo": "F",
    "telefone": "(75) 99812-4421",
    "endereco": "RUA JOÃO BATISTA DE SOUZA, 245 - CENTRO"
  },
  "solicitacao": {
    "medicoSolicitante": "DR. CARLOS EDUARDO MENDES",
    "crm": "CRM/BA 28.471",
    "especialidadeSolicitada": "Cardiologia",
    "cid10": "I10",
    "cidDescricao": "Hipertensão essencial (primária)",
    "justificativaClinica": "...",
    "prioridade": "PRIORITARIA",
    "dataSolicitacao": "2026-04-22"
  },
  "confiancaExtracao": 0.94
}
```

**Erros:** `400 ARQUIVO_INVALIDO`, `413 ARQUIVO_MUITO_GRANDE`, `415 MIME_NAO_SUPORTADO`.

### `POST /encaminhamentos`

**Roles permitidos:** `ATENDENTE_UBS`, `COORDENADOR_UBS`, `DESENVOLVEDOR`.

Consolida e cria o encaminhamento. **Multipart** com:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `payload` | string JSON | `{ paciente, solicitacao }` (shapes acima) |
| `solicitacao` | file | PDF original (1) |
| `anexo[]` | file[] | Anexos opcionais (até 10) |
| `tipoAnexo[]` | string[] | Tipo de cada anexo (`RG`, `EXAME`, `LAUDO`, ...) na mesma ordem |

**Response 201:**
```json
{ "id": "uuid", "protocolo": "UBS-2026-100138" }
```

**Erros:** `403 USUARIO_SEM_UBS` (DEV/ADMIN tentou consolidar sem UBS), `422 DADOS_OBRIGATORIOS_AUSENTES`.

### `GET /encaminhamentos`

Lista. **Filtro automático por escopo do usuário.**

| Query | Tipo | Default |
|-------|------|---------|
| `status` | `RASCUNHO\|AGUARDANDO_REGULACAO\|PENDENCIA_DOCUMENTO\|APROVADO\|REJEITADO` | todos |
| `pacienteId` | string | — |
| `desde` | ISO date | — |
| `ate` | ISO date | — |
| `limit` | int (1-500) | 100 |

**Response 200:** `Encaminhamento[]` (shape em [§7.4](#74-shape-encaminhamento)).

### `GET /encaminhamentos/:id`

Retorna encaminhamento completo (com `anexos`, `timeline`, `observacoesRegulacao`, `agendamentoPrevisto`).

**Erros:** `404 ENCAMINHAMENTO_NAO_ENCONTRADO` (inclui o caso "fora do escopo").

### `PATCH /encaminhamentos/:id`

**Roles permitidos:** `ATENDENTE_UBS`, `COORDENADOR_UBS`, `DESENVOLVEDOR`.

Editar dados do encaminhamento **antes** da análise da Regulação. Só aceita quando `status === AGUARDANDO_REGULACAO` — depois disso, edições tornam-se auditoriais via Regulação.

**Request:**
```json
{
  "pacienteNome": "MARIA APARECIDA DA SILVA SANTOS",
  "pacienteTelefone": "(75) 99999-8888",
  "pacienteEndereco": "RUA NOVA, 200 - CENTRO",
  "justificativaClinica": "Paciente com quadro refratário...",
  "prioridade": "URGENTE",
  "cidDescricao": "Hipertensão essencial (primária)",
  "especialidadeSolicitada": "Cardiologia",
  "cid10": "I10"
}
```

Todos os campos são opcionais. Envie apenas o que for mudar.

**Response 200:** `Encaminhamento` atualizado com evento timeline `EDITADO` listando os campos alterados.

**Erros:**
- `409 EDICAO_NAO_PERMITIDA` com `details.statusAtual` — já passou da Regulação
- `422 NENHUMA_ALTERACAO` — payload sem mudanças
- `422 JUSTIFICATIVA_VAZIA`
- `404 ENCAMINHAMENTO_NAO_ENCONTRADO`

### `POST /encaminhamentos/:id/resolve-pendencia`

**Roles permitidos:** `ATENDENTE_UBS`, `COORDENADOR_UBS`, `DESENVOLVEDOR`.

**Multipart:**
- `nota` (string) — observação respondendo a pendência
- `anexo[]` (files) — novos documentos anexados
- `tipoAnexo[]` — tipo de cada anexo

**Comportamento:**
1. Exige `status === PENDENCIA_DOCUMENTO`. Senão → `409 ENCAMINHAMENTO_NAO_EM_PENDENCIA`.
2. Adiciona timeline `OBSERVACAO`, depois `DOCUMENTO_ANEXADO` por anexo, depois `ENVIADO_REGULACAO`.
3. Muda status para `AGUARDANDO_REGULACAO`, limpa `observacoesRegulacao`.
4. Mantém anexos antigos (apenas adiciona novos).

**Response 200:** `Encaminhamento` atualizado.
**Erros:** `409 ENCAMINHAMENTO_NAO_EM_PENDENCIA`, `422 NENHUMA_ACAO_FORNECIDA`.

### 7.4. Shape `Encaminhamento`

```ts
interface Encaminhamento {
  id: string;
  protocolo: string;             // "UBS-2026-100137"
  status: "RASCUNHO" | "AGUARDANDO_REGULACAO" | "PENDENCIA_DOCUMENTO" | "APROVADO" | "REJEITADO";
  paciente: {
    nome: string; cpf: string; cartaoSus: string;
    dataNascimento: string;     // YYYY-MM-DD
    sexo: "M" | "F" | "OUTRO";
    telefone: string; endereco: string;
  };
  solicitacao: {
    medicoSolicitante: string; crm: string;
    especialidadeSolicitada: string;
    cid10: string; cidDescricao: string;
    justificativaClinica: string;
    prioridade: "ELETIVA" | "PRIORITARIA" | "URGENTE" | "EMERGENCIA";
    dataSolicitacao: string;    // YYYY-MM-DD
  };
  anexos: Array<{
    id: string; nome: string;
    tipo: "SOLICITACAO" | "RG" | "CPF" | "CARTAO_SUS" | "EXAME" | "LAUDO" | "RESPOSTA_SUS" | "OUTRO";
    tamanhoKb: number; uploadEm: string;
    scanStatus: "PENDENTE" | "LIMPO" | "INFECTADO" | "FALHOU";
  }>;
  timeline: Array<{
    id: string;
    tipo: "CRIADO" | "DOCUMENTO_ANEXADO" | "ENVIADO_REGULACAO" | "PENDENCIA_REGISTRADA" | "APROVADO" | "REJEITADO" | "AGENDADO" | "OBSERVACAO";
    titulo: string; descricao: string;
    autor: string; autorPapel: string;
    em: string;                 // ISO 8601
  }>;
  unidadeOrigem: string;
  atendenteResponsavel: string;
  observacoesRegulacao?: string;
  agendamentoPrevisto?: string | null;
  criadoEm: string; atualizadoEm: string;
}
```

---

## 8. Pacientes · `/pacientes/*`

### `GET /pacientes`

Lista. **Escopo automático.**

| Query | Descrição |
|-------|-----------|
| `q` | busca por nome, CPF, Cartão SUS, equipe ESF |
| `filtro` | `COM_CRONICAS` \| `COM_ENCAMINHAMENTOS` \| `SEM_ATENDIMENTO_90D` |
| `equipeId` | nome da equipe ESF |
| `microarea` | ex.: `"03"` |

**Response 200:** `PacienteResumo[]`:

```ts
interface PacienteResumo {
  id: string; nome: string; nomeSocial?: string;
  cpf: string; cartaoSus: string;
  dataNascimento: string; sexo: "M"|"F"|"OUTRO";
  telefone: string; unidadeVinculada: string;
  equipeSaudeFamilia?: string;
  ultimoAtendimento?: string;
  condicoesCronicasAtivas: number;
  encaminhamentosAtivos: number;
  cadastradoEm: string;
}
```

### `GET /pacientes/:id`

Retorna `PacienteCompleto` — `PacienteResumo` + endereço completo, alergias, condições crônicas, medicamentos em uso, atendimentos, viagens TFD, exames, vacinações, médicos atendentes, `encaminhamentosIds[]`.

Para shape completo veja [`src/lib/domain/models/Paciente.ts`](../../frontend/src/lib/domain/models/Paciente.ts) no frontend ou `src/domain/entities/Paciente.ts` no backend.

**Erros:** `404 PACIENTE_NAO_ENCONTRADO`.

### `GET /pacientes/por-cpf/:cpf`

**Endpoint de apoio ao fluxo de consolidação do encaminhamento.**

Dado o CPF extraído do OCR (ou digitado), devolve os dados já cadastrados + quais campos ainda estão faltando. O frontend usa isso pra:

1. Pré-preencher o formulário com o que já existe
2. Renderizar **apenas os campos faltantes** como obrigatórios no form complementar
3. Esconder o form complementar inteiro quando `completo: true`

`cpf` na URL aceita formatado ou só dígitos (`53474131826` ou `534.741.318-26`). CPF inválido (menos de 11 dígitos) retorna shape "não existe" (200) — não 400.

**Scope-aware**: paciente de outra UBS/prefeitura retorna `existe: false` (não vaza existência).

**Response 200:**
```ts
{
  "existe": true,
  "paciente": {
    "id": "uuid",
    "nome": "MARIA APARECIDA",
    "nomeSocial": null,
    "cpf": "53474131826",
    "cpfFormatado": "534.741.318-26",
    "cartaoSus": null,
    "dataNascimento": "1968-03-14",   // null se placeholder (1970-01-01)
    "sexo": "F",
    "telefone": "(75) 99812-4421",
    "telefoneSecundario": null,
    "email": null,
    "nomeMae": null,                   // campo faltante
    "nomePai": null,
    "estadoCivil": "OUTRO",
    "escolaridade": null,
    "profissao": null,
    "racaCor": "NAO_INFORMADA",
    "endereco": "Rua das Flores, 100",
    "bairro": null,                    // campo faltante
    "municipio": null,                 // campo faltante
    "uf": null,
    "cep": null,
    "grupoSanguineo": "NAO_INFORMADO",
    "ubsId": "ubs-central"
  },
  "camposFaltantes": ["nomeMae", "bairro", "municipio", "uf", "cep"],
  "completo": false
}
```

Quando não existe:
```json
{ "existe": false, "paciente": null, "camposFaltantes": ["nome","dataNascimento","sexo","telefone","nomeMae","endereco","bairro","municipio","uf","cep"], "completo": false }
```

#### Como o backend preenche os campos complementares

No submit do encaminhamento (`POST /encaminhamentos`), você pode adicionar no `paciente` do payload qualquer um desses campos complementares:

`nomeSocial`, `telefoneSecundario`, `email`, `nomeMae`, `nomePai`, `estadoCivil`, `escolaridade`, `profissao`, `racaCor`, `bairro`, `municipio`, `uf`, `cep`.

O backend aplica a regra **"preencher apenas se vazio"**: se o paciente já existe e já tem `endereco`, por exemplo, ele **não é sobrescrito** — só são gravados os campos que estão NULL/vazios no banco. Isso impede que o OCR de um novo PDF apague dados que o atendente tinha preenchido manualmente antes.

---

## 9. Relatórios · `/relatorios/*`

### `GET /relatorios`

Lista os relatórios gerados pelo atendente nos últimos 90 dias.

```ts
interface Relatorio {
  id: string; titulo: string;
  tipo: "PRODUCAO_INDIVIDUAL" | "ENCAMINHAMENTOS_POR_ESPECIALIDADE" | "FILA_REGULACAO"
      | "PENDENCIAS_RESOLVIDAS" | "TFD_CUSTOS" | "VACINACAO_UBS" | "BUSCA_ATIVA";
  periodo: string;            // "01/04/2026 – 22/04/2026"
  formato: "PDF" | "CSV" | "XLSX";
  geradoEm: string;
  tamanhoKb: number;
  status: "DISPONIVEL" | "PROCESSANDO" | "FALHA";
}
```

### `POST /relatorios`

Solicita geração assíncrona.

```json
{
  "tipo": "PRODUCAO_INDIVIDUAL",
  "dataInicial": "2026-04-01",
  "dataFinal": "2026-04-22",
  "formato": "PDF",
  "filtros": {}
}
```

**Response 202** (assíncrono): `{ id, titulo, tipo, periodo, formato, geradoEm, tamanhoKb: 0, status: "PROCESSANDO" }`.
Frontend faz polling de `GET /relatorios` até `status === "DISPONIVEL"`.

### `GET /relatorios/:id/download`

Stream do arquivo. Headers:
```
Content-Type: application/pdf | text/csv | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="..."
```

**Erros:** `404 RELATORIO_NAO_ENCONTRADO`, `409 RELATORIO_NAO_DISPONIVEL`.

---

## 10. Admin · `/admin/*`

Endpoints administrativos. **Todos exigem token.**

### Prefeituras

#### `POST /admin/prefeituras`
**Role:** `DESENVOLVEDOR`.

```json
{
  "nome": "Prefeitura Municipal de Salvador",
  "municipio": "Salvador",
  "uf": "BA",
  "cnpj": "13.927.801/0001-49"
}
```

**Response 201:** objeto `Prefeitura`.
**Erros:** `409 PREFEITURA_DUPLICADA` (CNPJ já existe).

#### `GET /admin/prefeituras`
**Roles:** `DESENVOLVEDOR` (todas), `ADMIN` (apenas a própria).

**Response 200:** `Prefeitura[]`.

### UBSs

#### `POST /admin/ubs`
**Roles:** `DESENVOLVEDOR` (qualquer prefeitura), `ADMIN` (própria prefeitura).

```json
{
  "nome": "UBS BARRA",
  "municipio": "Salvador",
  "uf": "BA",
  "prefeituraId": "uuid-prefeitura",
  "endereco": "Rua X, 100",
  "cnes": "9999999"
}
```

**Response 201:** objeto `Ubs`.
**Erros:** `404 PREFEITURA_NAO_ENCONTRADA`, `403 FORA_DO_ESCOPO`, `409 UBS_DUPLICADA` (CNES).

#### `GET /admin/ubs`
**Roles:** `DESENVOLVEDOR`, `ADMIN`, `COORDENADOR_UBS`.

| Query | Descrição |
|-------|-----------|
| `prefeituraId` | filtra por prefeitura específica |

**Response 200:** `(Ubs & { prefeitura: Prefeitura })[]`. **Filtro automático por escopo.**

### Usuários (atendentes)

#### `POST /admin/usuarios`
**Roles:** `DESENVOLVEDOR` (qualquer), `ADMIN` (própria prefeitura, exceto criar `DESENVOLVEDOR`).

```json
{
  "nome": "JOAO ATENDENTE",
  "email": "joao@aguasbelas.pe.gov.br",
  "matricula": "SMS-099001",
  "cpf": "111.222.333-44",
  "senha": "trocarDepois123",
  "role": "ATENDENTE_UBS",
  "ubsId": "ubs-central",
  "telefone": "(75) 99000-0000",
  "cargo": "Atendente de Regulação"
}
```

**Regras de escopo conforme `role`:**

| Role criado     | Campos exigidos | Validação extra |
|-----------------|-----------------|-----------------|
| `DESENVOLVEDOR` | nenhum (não tem prefeitura/UBS) | só DESENVOLVEDOR pode criar |
| `ADMIN`         | `prefeituraId`  | criador deve ter acesso à prefeitura |
| `REGULADOR_SMS` | `prefeituraId`  | criador deve ter acesso à prefeitura |
| `ATENDENTE_UBS` | `ubsId`         | criador deve ter acesso à UBS |
| `COORDENADOR_UBS` | `ubsId`       | criador deve ter acesso à UBS |

**Response 201:**
```json
{
  "id": "uuid", "nome": "...", "matricula": "...", "email": "...",
  "role": "ATENDENTE_UBS",
  "ubs": { "id": "...", "nome": "..." },
  "prefeitura": { "id": "...", "nome": "..." }
}
```

**Erros:** `403 PERMISSAO_INSUFICIENTE`, `403 FORA_DO_ESCOPO`, `404 PREFEITURA_NAO_ENCONTRADA` / `UBS_NAO_ENCONTRADA`, `409 USUARIO_DUPLICADO`, `422 SENHA_FRACA` / `PREFEITURA_OBRIGATORIA` / `UBS_OBRIGATORIA`.

#### `PATCH /admin/usuarios/:id`
**Roles:** `DESENVOLVEDOR`, `ADMIN` (mesmo escopo do alvo).

Edita dados não-sensíveis. Para trocar senha, use o endpoint de reset.

```json
{
  "nome": "NOVO NOME",
  "email": "novo@aguasbelas.pe.gov.br",
  "telefone": "(75) 99999-0000",
  "cargo": "Coordenador",
  "funcao": "...",
  "ubsId": "uuid-nova-ubs",
  "prefeituraId": null
}
```

**Response 200:** Usuário atualizado (mesmo shape de `POST /admin/usuarios`).

**Erros:** `404 ATENDENTE_NAO_ENCONTRADO`, `403 PERMISSAO_INSUFICIENTE`, `403 FORA_DO_ESCOPO`, `404 UBS_NAO_ENCONTRADA`/`PREFEITURA_NAO_ENCONTRADA`, `409 USUARIO_DUPLICADO` (novo email).

#### `DELETE /admin/usuarios/:id`
**Roles:** `DESENVOLVEDOR`, `ADMIN` (mesmo escopo).

**Soft delete** — marca `ativo=false` + `deletadoEm` + revoga todas as sessões. Nunca apaga fisicamente (retenção LGPD).

**Response 204.**

**Erros:** `409 AUTO_EXCLUSAO_PROIBIDA` (admin tentando excluir a si mesmo), `404 ATENDENTE_NAO_ENCONTRADO`, `403 PERMISSAO_INSUFICIENTE`.

#### `POST /admin/usuarios/:id/ativo`
**Roles:** `DESENVOLVEDOR`, `ADMIN`.

Ativa/desativa. Desativar também revoga sessões.

```json
{ "ativo": false }
```

**Response 200:** `{ "id": "uuid", "ativo": false }`.

**Erros:** `409 AUTO_DESATIVACAO_PROIBIDA`, demais iguais ao DELETE.

#### `POST /admin/usuarios/:id/reset-senha`
**Roles:** `DESENVOLVEDOR`, `ADMIN`.

Admin redefine senha. Revoga todas as sessões. Força o usuário a trocar a senha no próximo login (flag `senhaAlteradaEm` retroage pra disparar `SENHA_EXPIRADA`).

```json
{ "novaSenha": "provisoriaSegura123" }
```

**Response 204.**

**Erros:** `422 SENHA_FRACA`, `404 ATENDENTE_NAO_ENCONTRADO`, `403 PERMISSAO_INSUFICIENTE`.

#### `GET /admin/usuarios`
**Roles:** `DESENVOLVEDOR`, `ADMIN`, `COORDENADOR_UBS`.

| Query | Descrição |
|-------|-----------|
| `q` | busca por nome, matrícula, email |
| `role` | filtra por role |
| `ubsId` | filtra por UBS |
| `prefeituraId` | filtra por prefeitura |
| `ativo` | `true` \| `false` |

**Response 200:** lista com `id`, `nome`, `matricula`, `email`, `cpf`, `role`, `ativo`, `criadoEm`, `ubs: { id, nome, prefeitura: { id, nome } } | null`, `prefeitura: { id, nome } | null`.

**Filtro automático por escopo do solicitante.**

---

## 11. Face 2 · Regulação SMS

Endpoints adicionais consumidos pelo módulo `/sms/*` do frontend. Implementados em `src/modules/gestao/`.

**Roles permitidos:**
- Decisão (aprovar/pendenciar/rejeitar/resposta-sus): `REGULADOR_SMS`, `DESENVOLVEDOR`
- Leitura agregada (árvore): `REGULADOR_SMS`, `ADMIN`, `DESENVOLVEDOR`
- Atendentes/coordenadores UBS → `403 PERMISSAO_INSUFICIENTE`

**Isolamento por prefeitura:** garantido em todas as rotas. Encaminhamento de outra prefeitura → `404 ENCAMINHAMENTO_NAO_ENCONTRADO` (não 403, pra não vazar existência).

### 11.1. `POST /encaminhamentos/:id/aprovar`

Aprova o encaminhamento. Pré-condição: `status === AGUARDANDO_REGULACAO`.

**Request:**
```json
{
  "nota": "Paciente inserido na fila do Hospital Geral.",
  "agendamentoPrevisto": "2026-05-14"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `nota` | string | não | Vira evento `OBSERVACAO` na timeline |
| `agendamentoPrevisto` | string `YYYY-MM-DD` | não | Data prevista do atendimento (futura). Vira evento `AGENDADO` + preenche o campo |

**Response 200:** `Encaminhamento` atualizado (status=APROVADO, timeline com 1-3 novos eventos na ordem `OBSERVACAO?` → `APROVADO` → `AGENDADO?`).

**Erros:**
- `409 ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO` (com `details.statusAtual`)
- `422 AGENDAMENTO_INVALIDO` / `AGENDAMENTO_NO_PASSADO`
- `404 ENCAMINHAMENTO_NAO_ENCONTRADO`
- `403 PERMISSAO_INSUFICIENTE`

### 11.2. `POST /encaminhamentos/:id/registrar-pendencia`

Solicita correção à UBS. Pré-condição: `status === AGUARDANDO_REGULACAO`.

**Request:**
```json
{ "observacao": "Anexar laudo médico com data inferior a 90 dias." }
```

`observacao` é obrigatória (após `trim()`, mínimo 1 caractere).

**Response 200:** `Encaminhamento` (status=PENDENCIA_DOCUMENTO, `observacoesRegulacao` preenchido, evento `PENDENCIA_REGISTRADA`).

**Erros:**
- `422 OBSERVACAO_OBRIGATORIA`
- `409 ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO`
- `404 ENCAMINHAMENTO_NAO_ENCONTRADO`
- `403 PERMISSAO_INSUFICIENTE`

### 11.3. `POST /encaminhamentos/:id/rejeitar`

Rejeição definitiva (terminal — UBS não pode reenviar o mesmo protocolo).

**Request:**
```json
{ "motivo": "Paciente não atende aos critérios de protocolo." }
```

**Response 200:** `Encaminhamento` (status=REJEITADO, `observacoesRegulacao` limpo, evento `REJEITADO`).

**Erros:**
- `422 MOTIVO_OBRIGATORIO`
- `409 ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO`
- `404 ENCAMINHAMENTO_NAO_ENCONTRADO`
- `403 PERMISSAO_INSUFICIENTE`

### 11.4. `POST /encaminhamentos/:id/resposta-sus`

Anexa o PDF oficial do SUS Federal a um encaminhamento já aprovado. **Não é transição de status** — é enrichment.

**Request:** `multipart/form-data`
| Campo | Tipo | Descrição |
|---|---|---|
| `file` | file (PDF, máx 10 MB) | PDF oficial do SUS |
| `observacao` | string | Resumo curado da resposta |

**Response 200:** `Encaminhamento` com:
- novo `AnexoDocumento` na lista, com `tipo: 'RESPOSTA_SUS'`
- novo evento `RESPOSTA_SUS_RECEBIDA` na timeline
- objeto `respostaSUS` populado:
  ```ts
  {
    anexoId: string,
    observacao: string,
    registradoEm: string,
    registradoPor: { id, nome, matricula }
  }
  ```

**Erros:**
- `409 ENCAMINHAMENTO_NAO_APROVADO`
- `409 RESPOSTA_SUS_JA_REGISTRADA`
- `422 PDF_RESPOSTA_OBRIGATORIO`
- `413 ARQUIVO_MUITO_GRANDE`
- `415 MIME_NAO_SUPORTADO`
- `403 PERMISSAO_INSUFICIENTE`

### 11.5. `GET /encaminhamentos/arvore`

Endpoint **agregado** que alimenta o file-manager de Ingestões da SMS. Retorna contagens por nível hierárquico (UBS → Ano → Mês → Dia) sem trazer a lista completa de encaminhamentos.

**Query params** (progressivo):

| Params enviados | Retorna |
|---|---|
| nenhum | `ArvoreUbsNode[]` (UBSs da prefeitura) |
| `?ubsId=...` | `ArvoreAnoNode[]` (anos daquela UBS) |
| `?ubsId=...&ano=2026` | `ArvoreMesNode[]` (meses do ano) |
| `?ubsId=...&ano=2026&mes=4` | `ArvoreDiaNode[]` (dias do mês) |

Para o **nível 5** (lista de encaminhamentos de um dia específico) → `GET /encaminhamentos?desde=YYYY-MM-DD&ate=YYYY-MM-DD`.

**Shape (nível 1 · UBSs):**
```json
[
  {
    "ubsId": "ubs-central",
    "nome": "UBS CENTRAL",
    "totalEncaminhamentos": 248,
    "anoMaisRecente": 2026,
    "statusContagem": { "aguardando": 18, "pendencia": 4, "aprovado": 210, "rejeitado": 16 }
  }
]
```

**Shape (nível 2-4):** mesma estrutura sem `ubsId`/`nome`/`anoMaisRecente`, com `ano`/`mes`/`dia` conforme o nível.

**Regras:**
- Escopo automático por `prefeituraId` do JWT
- UBSs sem encaminhamentos aparecem com `totalEncaminhamentos: 0`
- Ordenação: UBSs por total ↓; anos/meses/dias por valor ↓ (mais recente primeiro)
- `statusContagem` cobre apenas o filtro do caminho (UBS+ano+mês conforme params)

**Erros:**
- `400 PARAMS_INCOMPATIVEIS` (ex.: `mes` sem `ano`, ou `ano` sem `ubsId`)
- `404 UBS_NAO_ENCONTRADA` (id inválido ou fora do escopo)
- `403 PERMISSAO_INSUFICIENTE`

---

## 12. Face 3 · App do Paciente

Módulo destinado ao **app mobile do cidadão** (Flutter). Auth independente da Face 1/2 — usa **CPF + senha** com token opaco (não JWT) válido por 24h.

**Base URL**: `http://HOST/v1/paciente-app`

### Características

- **Sem `/v1/auth/login` da Face 1/2** — tem seu próprio `/paciente-app/auth/login`.
- **Sem CORS restritivo** — apps nativos não mandam `Origin`. CORS liberado automaticamente.
- **Conta criada automaticamente**: quando a UBS consolida um encaminhamento, o backend já cria a conta **ATIVA** com **senha = CPF digits** (`senhaProvisoria=true`). O paciente loga direto no app usando o CPF como usuário E como senha inicial. O app DEVE forçar a troca de senha no primeiro login via `POST /paciente-app/auth/trocar-senha`.
- **Isolamento**: o paciente só vê seus próprios encaminhamentos e anexos — matching por CPF do encaminhamento.
- **Download restrito**: anexos só liberam se `scanStatus === 'LIMPO'`.

### 12.1. `POST /paciente-app/auth/login`

**Request:**
```json
{ "cpf": "53474131826", "senha": "53474131826" }
```

`cpf` aceita formatado ou só dígitos. **Senha inicial = CPF digits** (o paciente é orientado a trocar no primeiro acesso).

**Response 200:**
```json
{
  "token": "opaco-base64-url",
  "expiresIn": 86400,
  "paciente": {
    "id": "uuid",
    "cpf": "53474131826",
    "cpfFormatado": "534.741.318-26",
    "nome": "MARIA APARECIDA DA SILVA SANTOS",
    "email": null,
    "telefone": "(75) 99812-4421",
    "senhaProvisoria": true
  }
}
```

> Quando `senhaProvisoria === true` o app **deve** redirecionar para tela de troca de senha (`POST /auth/trocar-senha`) antes de liberar o restante da navegação.

**Erros:**
- `401 CREDENCIAIS_INVALIDAS`
- `403 CONTA_DESATIVADA` (admin/UBS desativou a conta)

### 12.2. `POST /paciente-app/auth/trocar-senha`

Header: `Authorization: Bearer <token>`. Obrigatório no primeiro login (quando `senhaProvisoria=true`).

**Request:**
```json
{ "senhaAtual": "53474131826", "novaSenha": "minhaSenhaForte!1" }
```

**Response 204.** Após sucesso, `senhaProvisoria` vira `false`.

**Erros:**
- `401 CREDENCIAIS_INVALIDAS` (senha atual errada)
- `422 SENHA_FRACA` (nova senha < 8 chars)
- `422 SENHA_IGUAL_ATUAL`

### 12.3. `POST /paciente-app/auth/ativar-conta`

**[legado/roadmap]** Fluxo alternativo de ativação por CPF + data de nascimento. Como as contas agora nascem ativas automaticamente, este endpoint só é útil se você quiser expor um fluxo de "reset via confirmação de identidade". Em v1.0+ a estratégia padrão é o `trocar-senha` acima.

**Request:**
```json
{ "cpf": "534.741.318-26", "dataNascimento": "1968-03-14", "senha": "novaSenha123" }
```

**Response 204.** **Erros:** `404 CONTA_NAO_ENCONTRADA`, `409 CONTA_JA_ATIVADA`, `422 CONFIRMACAO_INVALIDA`, `422 SENHA_FRACA`.

### 12.4. `POST /paciente-app/auth/logout`

Header: `Authorization: Bearer <token>`. Revoga a sessão.
**Response 204.**

### 12.5. `GET /paciente-app/me`

**Response 200:**
```json
{
  "id": "uuid",
  "nome": "MARIA...",
  "cpf": "53474131826",
  "cpfFormatado": "534.741.318-26",
  "senhaProvisoria": false,
  "email": null,
  "telefone": "(75) 99812-4421"
}
```

### 12.6. `GET /paciente-app/meus-encaminhamentos`

Lista encaminhamentos do paciente autenticado.

**Response 200:** `Encaminhamento[]` (mesmo shape da Face 1/2 — ver §7.4).

Os campos úteis pra o app:
- `status` — para badge (PENDENCIA_DOCUMENTO, APROVADO, etc.)
- `solicitacao.especialidadeSolicitada` — cabeçalho do card
- `agendamentoPrevisto` — data esperada de atendimento
- `respostaSUS` — presente quando o PDF oficial está disponível
- `timeline` — linha do tempo completa

### 12.7. `GET /paciente-app/notificacoes`

Timeline de trânsito (estilo Amazon/Shopee).

**Query params:**
- `apenasNaoLidas=true` — filtra só as não-lidas

**Response 200:**
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

`tipo` ∈ ver [§13 Notificações automáticas](#13-notificações-automáticas-ao-paciente).

Ordenação: mais recente primeiro.

### 12.8. `GET /paciente-app/notificacoes/count`

Apenas o contador de não-lidas — para badge no ícone.

**Response 200:** `{ "naoLidas": 3 }`

### 12.9. `POST /paciente-app/notificacoes/:id/lida`

Marca uma notificação como lida.
**Response 204.**
**Erro:** `404 NOTIFICACAO_NAO_ENCONTRADA`.

### 12.10. `POST /paciente-app/notificacoes/marcar-todas-lidas`

**Response 200:** `{ "atualizadas": 5 }`

### 12.11. `GET /paciente-app/anexos/:id/download`

Download de um anexo do encaminhamento do próprio paciente.

**Regras de segurança:**
1. O anexo precisa pertencer a um encaminhamento com CPF do paciente autenticado (match digit-only).
2. `scanStatus === 'LIMPO'` — senão `409 ANEXO_NAO_LIBERADO` com `details.scanStatus`.

**Response 200:** binário com headers:
```
Content-Type: application/pdf (ou image/*)
Content-Disposition: attachment; filename="resposta-sus.pdf"
```

**Erros:**
- `404 ANEXO_NAO_ENCONTRADO` (inclui "anexo de outro paciente")
- `409 ANEXO_NAO_LIBERADO` (`scanStatus != LIMPO`)

> 📱 **Dica Flutter**: o pacote [`backend/docs/flutter/`](flutter/) tem um cliente Dart pronto cobrindo todos esses endpoints. Ver [`flutter/README.md`](flutter/README.md).

---

## 13. Notificações automáticas ao paciente

Toda transição de encaminhamento **gera automaticamente** uma linha na timeline do paciente. O frontend UBS/SMS não precisa fazer nada — o backend dispara tudo.

| Trigger (endpoint backend) | Tipo | Emoji + título |
|---|---|---|
| `POST /encaminhamentos` (UBS consolida) | `ENCAMINHAMENTO_CRIADO` | 📩 Encaminhamento solicitado |
| `POST /:id/registrar-pendencia` (Regulação) | `PENDENCIA_REGISTRADA` | ⚠️ Documentação pendente |
| `POST /:id/resolve-pendencia` (UBS responde) | `PENDENCIA_RESOLVIDA` | 🔁 Documentação complementada |
| `POST /:id/aprovar` (Regulação) | `APROVADO` | ✅ Encaminhamento aprovado |
| `POST /:id/aprovar` **com** `agendamentoPrevisto` | adicional `AGENDADO` | 📅 Atendimento agendado para DD/MM/YYYY |
| `POST /:id/rejeitar` (Regulação) | `REJEITADO` | ❌ Encaminhamento não aprovado |
| `POST /:id/resposta-sus` (Regulação) | `RESPOSTA_SUS_DISPONIVEL` | 📎 Resposta do SUS disponível |

**Fluxo quando o paciente ainda não tem conta no app:**
1. Backend cria uma `PacienteConta` com `ativo=false` e `senhaHash='!pending!'`.
2. Notificações ficam armazenadas no banco esperando.
3. Paciente baixa o app, chama `/auth/ativar-conta` com CPF + data de nascimento.
4. Ao autenticar pela 1ª vez, todas as notificações retroativas aparecem em `/notificacoes`.

**Em produção (roadmap):** cada notificação gera evento `notificacao.*` no outbox → worker FCM → push real-time no device do paciente. Endpoint `/paciente-app/devices` para registrar token FCM virá nessa iteração.

---

## 14. Códigos de erro catalogados

| `code` | HTTP | Significado |
|---|---|---|
| `CREDENCIAIS_INVALIDAS` | 401 | Login/senha inválidos |
| `USUARIO_INATIVO` | 403 | Atendente desativado |
| `USUARIO_BLOQUEADO` | 403 | Bloqueado por excesso de tentativas |
| `SENHA_EXPIRADA` | 422 | Política de validade da senha |
| `SENHA_FRACA` | 400/422 | < 8 caracteres |
| `SENHA_ATUAL_INCORRETA` | 401 | Em troca de senha autenticada |
| `TOKEN_AUSENTE` | 401 | Sem header `Authorization` |
| `TOKEN_EXPIRADO` | 401 | JWT vencido |
| `TOKEN_INVALIDO` | 401/400 | JWT/resetToken inválido |
| `RATE_LIMIT` | 429 | Excedeu janela permitida |
| `PERMISSAO_INSUFICIENTE` | 403 | Role não autorizado para o endpoint |
| `FORA_DO_ESCOPO` | 403 | Recurso não pertence ao escopo do usuário |
| `USUARIO_SEM_UBS` | 403 | Tentou consolidar sem UBS vinculada |
| `USUARIO_SEM_PREFEITURA` | 403 | Admin/Regulador sem prefeitura |
| `NAO_AUTENTICADO` | 403 | Faltou auth |
| `ARQUIVO_INVALIDO` | 400 | Arquivo não enviado / corrompido |
| `ARQUIVO_MUITO_GRANDE` | 413 | > 10 MB |
| `MIME_NAO_SUPORTADO` | 415 | Anexo fora dos MIMEs aceitos |
| `PAYLOAD_AUSENTE` / `PAYLOAD_INVALIDO` | 400 | JSON ausente ou inválido |
| `DADOS_OBRIGATORIOS_AUSENTES` | 422 | CPF/nome/especialidade faltando |
| `ENCAMINHAMENTO_NAO_ENCONTRADO` | 404 | Inclui "fora de escopo" |
| `ENCAMINHAMENTO_NAO_EM_PENDENCIA` | 409 | resolve-pendencia em status errado |
| `NENHUMA_ACAO_FORNECIDA` | 422 | resolve-pendencia sem nota nem anexo |
| `DATA_NASCIMENTO_INVALIDA` | 422 | `paciente.dataNascimento` não parseável (aceita `YYYY-MM-DD` ou `DD/MM/YYYY`) |
| `DATA_SOLICITACAO_INVALIDA` | 422 | `solicitacao.dataSolicitacao` não parseável (aceita `YYYY-MM-DD` ou `DD/MM/YYYY`) |
| `ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO` | 409 | aprovar/pendenciar/rejeitar fora do estado AGUARDANDO_REGULACAO |
| `OBSERVACAO_OBRIGATORIA` | 422 | registrar-pendencia com observação vazia |
| `MOTIVO_OBRIGATORIO` | 422 | rejeitar com motivo vazio |
| `AGENDAMENTO_INVALIDO` | 422 | aprovar com data fora do formato YYYY-MM-DD |
| `AGENDAMENTO_NO_PASSADO` | 422 | aprovar com data anterior a hoje |
| `ENCAMINHAMENTO_NAO_APROVADO` | 409 | resposta-sus em encaminhamento que não está APROVADO |
| `RESPOSTA_SUS_JA_REGISTRADA` | 409 | resposta-sus quando já existe uma registrada |
| `PDF_RESPOSTA_OBRIGATORIO` | 422 | resposta-sus sem PDF ou sem observação |
| `PARAMS_INCOMPATIVEIS` | 400 | árvore com `mes` sem `ano`, ou `ano` sem `ubsId` |
| `UBS_NAO_ENCONTRADA` | 404 | UBS não existe ou está fora do escopo |
| `AUTO_EXCLUSAO_PROIBIDA` | 409 | Admin tentou se auto-excluir |
| `AUTO_DESATIVACAO_PROIBIDA` | 409 | Admin tentou desativar a própria conta |
| `EDICAO_NAO_PERMITIDA` | 409 | `PATCH /encaminhamentos/:id` fora de AGUARDANDO_REGULACAO |
| `NENHUMA_ALTERACAO` | 422 | PATCH sem campos alterados |
| `JUSTIFICATIVA_VAZIA` | 422 | PATCH apagando justificativa clínica |
| `CONTA_NAO_ATIVADA` | 403 | Paciente com conta pendente tentando login |
| `CONTA_JA_ATIVADA` | 409 | `ativar-conta` em conta já ativa |
| `CONTA_NAO_ENCONTRADA` | 404 | CPF não existe no app do paciente |
| `CONTA_INATIVA` | 401 | Conta desativada durante a sessão |
| `CONFIRMACAO_INVALIDA` | 422 | Ativação sem match de CPF+data de nascimento |
| `ANEXO_NAO_ENCONTRADO` | 404 | Anexo inexistente OU fora do escopo do paciente |
| `ANEXO_NAO_LIBERADO` | 409 | Download bloqueado (`scanStatus != LIMPO`); `details.scanStatus` |
| `NOTIFICACAO_NAO_ENCONTRADA` | 404 | — |
| `PACIENTE_NAO_ENCONTRADO` | 404 | Paciente fora do escopo |
| `RELATORIO_NAO_ENCONTRADO` | 404 | — |
| `RELATORIO_NAO_DISPONIVEL` | 409 | Ainda processando |
| `PREFEITURA_OBRIGATORIA` | 422 | Criar usuário ADMIN/REGULADOR sem `prefeituraId` |
| `UBS_OBRIGATORIA` | 422 | Criar usuário ATENDENTE/COORD sem `ubsId` |
| `PREFEITURA_DUPLICADA` | 409 | CNPJ já cadastrado |
| `PREFEITURA_NAO_ENCONTRADA` | 404 | — |
| `UBS_DUPLICADA` | 409 | CNES já cadastrado |
| `UBS_NAO_ENCONTRADA` | 404 | — |
| `USUARIO_DUPLICADO` | 409 | Matrícula/email/CPF já existe |
| `ATENDENTE_NAO_ENCONTRADO` | 404 | — |
| `SESSAO_INDETERMINADA` | 401 | Token sem `sid` |
| `ERRO_INTERNO` | 500 | Logado com `requestId` |

---

## 15. Usuários do seed

Após `npm run db:seed`, três usuários ficam disponíveis (senha **`12345678`** em todos):

| Matrícula      | Role            | Escopo                                    |
|----------------|-----------------|-------------------------------------------|
| `DEV-001`      | `DESENVOLVEDOR` | GLOBAL — vê tudo, cria tudo               |
| `ADM-001`      | `ADMIN`         | Prefeitura Municipal de Águas Belas  |
| `SMS-099101`   | `REGULADOR_SMS` | Prefeitura Feira (Face 2 · decide casos)  |
| `SMS-047291`   | `ATENDENTE_UBS` | UBS CENTRAL (Águas Belas)            |

**Login alternativo por email:**
- `dev@unisism.com.br`
- `ana.admin@aguasbelas.pe.gov.br`
- `regulador@aguasbelas.pe.gov.br`
- `mateus.santana@saude.aguasbelas.pe.gov.br`

### Conta do paciente no app (Face 3)

| Campo | Valor |
|---|---|
| CPF | `123.456.789-00` (ou `12345678900`) |
| Senha | `12345678` |
| Nome | MARIA APARECIDA DA SILVA SANTOS |

A seed já cria encaminhamentos pra essa paciente, portanto o app tem timeline + notificações preenchidas desde o primeiro login.

Encaminhamento de teste em pendência: **`UBS-2026-100137`** (UBS CENTRAL).

---

## 16. Infra de produção (o que o frontend precisa saber)

O backend ganhou camadas de resiliência. **Nenhuma delas muda o contrato HTTP**, mas o frontend deve estar ciente de alguns comportamentos:

### 16.1. Scan de antivírus (assíncrono)

Todo anexo carregado passa por scan antes de ficar disponível para download. O campo `scanStatus` no DTO `AnexoDocumento` reflete o estado:

| Valor | O frontend deve... |
|---|---|
| `PENDENTE` | Exibir botão de download desabilitado + tooltip "analisando segurança" |
| `LIMPO` | Habilitar download normalmente |
| `INFECTADO` | Bloquear, mostrar ícone vermelho + "arquivo recusado por segurança" |
| `FALHOU` | Tratar como inseguro. Mostrar aviso + permitir que admin reexecute (roadmap) |

Em **dev local** (sem `CLAMAV_HOST` configurado), todo anexo fica como `LIMPO` em segundos — o comportamento visual é o mesmo, só é mais rápido.

### 16.2. Cache no `GET /encaminhamentos/arvore`

A árvore usa Redis (TTL 60s). Transições de encaminhamento no backend **invalidam** o cache da UBS afetada automaticamente, mas nada impede o frontend de bater de novo — o backend resolve. Sem Redis configurado, funciona igual só mais lento.

### 16.3. Endpoint `/metrics` (Prometheus)

Exposto em `http://HOST/metrics` (sem prefixo `/v1`, sem auth). **Não é para o frontend consumir** — é para scrape interno (Prometheus/Grafana). Mencionado aqui só pra não confundir.

### 16.4. Audit log

Toda mutação sensível (`LOGIN_SUCESSO`, `LOGIN_FALHA`, `CRIAR_USUARIO`, transições de status) é gravada em `auditoria_logs`. CPF e Cartão SUS são mascarados. O frontend não precisa fazer nada — é invisível no contrato, mas ajuda a equipe de TI/LGPD.

### 16.5. Outbox (eventos de domínio)

Transições no encaminhamento (`encaminhamento.aprovado`, `.rejeitado`, `.pendencia_registrada`, `resposta_sus.registrada`) viram eventos numa tabela `outbox_events` e são publicados assincronamente pelo worker. **Hoje só logam**; em produção plugam em webhook/fila. O frontend não consome isso diretamente — é para integração externa (notificação da UBS, e-SUS APS, SISREG).

### 16.6. Storage

Dois modos, transparentes ao frontend:
- `STORAGE_PROVIDER=disk` (default em dev) — arquivos em `./uploads/`
- `STORAGE_PROVIDER=s3` — MinIO em dev, AWS S3 em prod

A URL de download do anexo (quando houver, roadmap) será sempre `GET /anexos/:id/download` com redirect 302 para uma URL pré-assinada (TTL 5min) em modo S3.

### 16.7. Compressão de PDF

Todo PDF (solicitação médica + resposta SUS) passa por compressão antes de salvar:

1. **Ghostscript** com preset `/screen` (72dpi) — compressão agressiva em imagens
2. **Fallback pdf-lib** — re-save com metadata stripping

O menor resultado é sempre escolhido. **Economia real observada**: 99.5% em PDFs com padding; 60-80% em PDFs escaneados reais.

**Impacto no frontend**: `AnexoDocumento.tamanhoKb` reflete o tamanho **pós-compressão**. Nada mais muda no contrato.

---

## Apêndice — exemplo de fluxo do frontend

```ts
// 1. Login
const loginRes = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ login: 'SMS-047291', senha: '12345678' }),
});
const { token } = await loginRes.json();

// 2. Reusar em todas as chamadas
const headers = { 'Authorization': `Bearer ${token}` };

// 3. Carregar dashboard + me em paralelo
const [me, metrics] = await Promise.all([
  fetch(`${BASE}/auth/me`, { headers }).then(r => r.json()),
  fetch(`${BASE}/dashboard/metrics`, { headers }).then(r => r.json()),
]);

// 4. Esconder menus de acordo com escopo
if (me.escopo === 'UBS') {
  // sem botão "Criar UBS" / "Criar Prefeitura" / "Gerenciar usuários"
}
```
