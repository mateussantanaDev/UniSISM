# UNISISM · Guia de Engenharia do Backend

Instruções normativas para construir um backend **robusto, completo e eficiente** que sirva o ecossistema UNISISM (Face 1 · UBS, Face 2 · SMS, e Faces futuras).

> **Fonte da verdade de contrato**: [BACKEND_API.md](BACKEND_API.md). Este guia é a ponte entre o contrato e o **como** (arquitetura, infraestrutura, qualidade).

---

## Índice

1. [Missão e princípios](#1-missão-e-princípios)
2. [Stack recomendada](#2-stack-recomendada)
3. [Arquitetura hexagonal (Clean)](#3-arquitetura-hexagonal-clean)
4. [Estrutura de projeto](#4-estrutura-de-projeto)
5. [Linguagem de domínio (DDD light)](#5-linguagem-de-domínio-ddd-light)
6. [Banco de dados · modelagem](#6-banco-de-dados--modelagem)
7. [Autenticação e autorização (JWT + RBAC)](#7-autenticação-e-autorização-jwt--rbac)
8. [Multi-tenancy e isolation](#8-multi-tenancy-e-isolation)
9. [Convenções de API](#9-convenções-de-api)
10. [Máquina de estados e regras de negócio](#10-máquina-de-estados-e-regras-de-negócio)
11. [Uploads, storage e OCR](#11-uploads-storage-e-ocr)
12. [Processamento assíncrono](#12-processamento-assíncrono)
13. [Observabilidade](#13-observabilidade)
14. [Estratégia de testes](#14-estratégia-de-testes)
15. [Segurança (OWASP + LGPD)](#15-segurança-owasp--lgpd)
16. [Performance alvo + cache](#16-performance-alvo--cache)
17. [Deployment e configuração](#17-deployment-e-configuração)
18. [Qualidade de código e review](#18-qualidade-de-código-e-review)
19. [Endpoints obrigatórios do MVP](#19-endpoints-obrigatórios-do-mvp)
20. [Roadmap técnico](#20-roadmap-técnico)

---

## 1. Missão e princípios

O backend do UNISISM é **infraestrutura pública crítica**. Suas decisões afetam o SUS municipal. Cinco princípios não-negociáveis:

1. **Correção acima de performance** — transações clínicas nunca podem corromper dados. Prefira lentidão a inconsistência.
2. **Defesa em profundidade** — toda regra de negócio validada pelo backend, mesmo que o frontend já valide. **Nunca confie no cliente**.
3. **Isolation absoluta por prefeitura** — vazar dados de um município para outro é falha crítica, equiparável a uma quebra de LGPD.
4. **Auditabilidade total** — qualquer mutação registra quem, quando, o quê, de onde. É um sistema público; respondemos a controladoria.
5. **Integridade do estado** — máquina de estados explícita (sem status "invalido" implícito). Transações atômicas. Outbox pattern em eventos.

### Convenções obrigatórias

- **Idioma interno do código**: português de negócio (nomes de entidades, DTOs, mensagens) + inglês para termos técnicos universais (repository, service, controller, middleware).
- **Mensagens de erro ao cliente**: sempre em pt-BR, com `code` em SCREAMING_SNAKE_CASE estável.
- **Datas**: ISO 8601 UTC em todas as responses. Nunca serializar timestamp como epoch ou local time.
- **IDs**: UUID v4 ou ULID. Nunca auto-increment exposto em rota pública.

---

## 2. Stack recomendada

Qualquer uma das três abaixo cobre os requisitos. **Escolha uma e seja consistente** — não misture na mesma base.

### Opção A · **TypeScript · Fastify · Prisma · PostgreSQL** (recomendada)

Alinha com o frontend (tipos compartilhados). Maturidade alta na equipe.

| Camada | Ferramenta |
|---|---|
| Runtime | Node.js 22 LTS |
| Framework HTTP | Fastify 4+ (performático, schema-first) |
| Validação | Zod ou TypeBox |
| ORM | Prisma 5+ |
| Banco | PostgreSQL 16+ |
| Cache | Redis 7+ |
| Fila | BullMQ (Redis) ou RabbitMQ |
| Storage | S3-compatible (MinIO em dev, AWS S3/Wasabi em prod) |
| Antivírus | ClamAV via fila |
| OCR | Tesseract ou AWS Textract |
| Auth | `jsonwebtoken` + `argon2` |
| Testes | Vitest + Supertest |
| Observabilidade | Pino (logs) + OpenTelemetry |

### Opção B · **Go · Chi · sqlc · PostgreSQL**

Mais performance bruta, melhor para equipes com maturidade Go.

### Opção C · **Elixir · Phoenix · Ecto · PostgreSQL**

Excelente para real-time + tolerância a falhas (OTP). Curva de aprendizado maior.

> A partir daqui o guia assume **Opção A**. Os princípios arquiteturais valem para as três.

---

## 3. Arquitetura hexagonal (Clean)

Espelha a arquitetura do frontend (`domain/` · `application/` · `infrastructure/` · `presentation/`). Isola domínio de detalhes técnicos.

```
┌────────────────────────────────────────────────────────┐
│  HTTP / Fila / Scheduler  (entrada)                    │
│  └─ src/http/ · src/jobs/ · src/crons/                 │
├────────────────────────────────────────────────────────┤
│  Application (casos de uso · orquestração)             │
│  └─ src/application/use-cases/                          │
├────────────────────────────────────────────────────────┤
│  Domain (entidades · regras · value objects · events)  │
│  └─ src/domain/                                         │
├────────────────────────────────────────────────────────┤
│  Infrastructure (DB · storage · fila · OCR · email)    │
│  └─ src/infrastructure/                                 │
└────────────────────────────────────────────────────────┘
```

### Regras

- **Domain nunca importa Infra ou HTTP**. Nem mesmo tipos.
- **Use case** recebe ports (interfaces) e orquestra.
- **Infrastructure** implementa os ports (adapters).
- **HTTP** é só casca: valida input, chama use case, serializa output, mapeia erros.

### Exemplo de caso de uso

```ts
// src/application/use-cases/aprovar-encaminhamento.ts
export class AprovarEncaminhamentoUseCase {
  constructor(
    private readonly encaminhamentos: EncaminhamentoRepository,
    private readonly audit: AuditLogger,
    private readonly bus: EventBus,
  ) {}

  async execute(input: {
    encaminhamentoId: string;
    regulador: AutenticadoContext;
    nota?: string;
    agendamentoPrevisto?: string;
  }): Promise<Encaminhamento> {
    const enc = await this.encaminhamentos.findById(input.encaminhamentoId);
    if (!enc) throw new NaoEncontradoError('ENCAMINHAMENTO_NAO_ENCONTRADO');

    // Isolation por prefeitura — o repo JÁ filtrou, mas defesa em profundidade:
    if (enc.prefeituraId !== input.regulador.prefeituraId) {
      throw new NaoEncontradoError('ENCAMINHAMENTO_NAO_ENCONTRADO'); // 404, não 403
    }

    // Máquina de estados (no Domain, não aqui)
    enc.aprovar({ autor: input.regulador, nota: input.nota, agendamentoPrevisto: input.agendamentoPrevisto });

    await this.encaminhamentos.save(enc);
    await this.audit.registrar({
      action: 'APROVAR_ENCAMINHAMENTO',
      atendenteId: input.regulador.id,
      recursoId: enc.id,
      statusAntes: 'AGUARDANDO_REGULACAO',
      statusDepois: 'APROVADO',
    });
    await this.bus.publish('encaminhamento.aprovado', { id: enc.id, prefeituraId: enc.prefeituraId });

    return enc.toSnapshot();
  }
}
```

---

## 4. Estrutura de projeto

```
backend/
├── src/
│   ├── domain/
│   │   ├── entities/          ← Encaminhamento, Paciente, UBS, Usuario, Prefeitura...
│   │   ├── value-objects/     ← Cpf, CartaoSus, Cid10, Protocolo, Email...
│   │   ├── events/            ← EncaminhamentoAprovadoEvent, PendenciaRegistrada...
│   │   └── errors/            ← DomainError, ValidacaoError, NaoEncontradoError
│   ├── application/
│   │   ├── use-cases/         ← um arquivo por UseCase (verbo+entidade)
│   │   ├── ports/             ← interfaces: Repository, Storage, OCR, Bus, Mailer
│   │   └── dto/               ← entrada/saída dos use cases
│   ├── infrastructure/
│   │   ├── database/
│   │   │   ├── prisma/        ← schema.prisma + migrations
│   │   │   └── repositories/  ← implementações Prisma dos repos
│   │   ├── storage/           ← S3Storage implementa StoragePort
│   │   ├── ocr/               ← TesseractOcr implementa OcrPort
│   │   ├── queue/             ← BullMQAdapter
│   │   ├── email/             ← SendgridMailer, DevMailer
│   │   └── audit/             ← PrismaAuditLogger
│   ├── http/
│   │   ├── server.ts
│   │   ├── middlewares/       ← auth, tenant, requestId, errorHandler, rateLimit
│   │   ├── routes/            ← agrupamentos: authRoutes, encaminhamentoRoutes...
│   │   ├── schemas/           ← Zod/TypeBox schemas de request/response
│   │   └── mappers/           ← domain → DTO de resposta
│   ├── jobs/                  ← workers BullMQ: ocr, notificacao, relatorio, av-scan
│   ├── crons/                 ← tarefas agendadas: limpa tokens, renova relatórios
│   ├── config/                ← env.ts (Zod), logger.ts, tracing.ts
│   └── main.ts                ← bootstrap
├── prisma/
│   └── schema.prisma
├── tests/
│   ├── unit/                  ← domain + use-cases com mocks
│   ├── integration/           ← repos + DB real (testcontainers)
│   └── e2e/                   ← fluxos completos via HTTP
├── .env.example
├── docker-compose.yml         ← postgres, redis, minio, clamav
├── package.json
└── tsconfig.json
```

---

## 5. Linguagem de domínio (DDD light)

Use o **mesmo vocabulário** do domínio de saúde pública brasileiro. Não invente termos.

### Entidades primárias

| Entidade | Descrição | Identidade |
|---|---|---|
| `Prefeitura` | Cliente institucional (tenant) | UUID + CNPJ |
| `Ubs` | Unidade Básica de Saúde de uma prefeitura | UUID + CNES |
| `Usuario` | Servidor público com acesso ao sistema | UUID + matrícula + email |
| `Paciente` | Cidadão cadastrado no município | UUID + Cartão SUS + CPF |
| `Encaminhamento` | Solicitação clínica para especialidade (agregado raiz) | UUID + Protocolo (`UBS-AAAA-NNNNNN`) |
| `AnexoDocumento` | Arquivo vinculado a um encaminhamento | UUID |
| `EventoTimeline` | Evento na linha do tempo do encaminhamento | UUID |
| `Atendimento` | Registro de consulta/procedimento na UBS | UUID |
| `ViagemTFD` | Viagem custeada (Tratamento Fora do Domicílio) | UUID + Protocolo TFD |
| `ExameRealizado` | Exame do paciente | UUID |
| `VacinaAplicada` | Dose administrada | UUID |
| `Relatorio` | Relatório gerado sob demanda | UUID |
| `AuditLog` | Registro imutável de ação administrativa | UUID (append-only) |

### Value Objects obrigatórios

Sempre encapsulados em classes com validação no construtor — nunca `string` solto.

- `Cpf` — valida dígito verificador, formata `123.456.789-00`
- `CartaoSus` — valida 15 dígitos com prefixo
- `Cid10` — valida formato `[A-Z]\d{2}(\.\d)?` e opcionalmente contra tabela oficial
- `Protocolo` — formato `UBS-AAAA-NNNNNN` gerado pelo backend (idempotente)
- `Email`
- `Telefone`
- `DataNascimento`
- `PrioridadeClinica` (enum com ordenação)
- `StatusEncaminhamento` (enum com regras de transição)

### Events (Event-Driven interno)

Cada ação de domínio emite um evento. Eventos são consumidos por handlers (notificação, audit, indexação).

- `EncaminhamentoCriado`
- `EncaminhamentoEnviadoRegulacao`
- `EncaminhamentoAprovado`
- `EncaminhamentoPendenciaRegistrada`
- `EncaminhamentoRejeitado`
- `EncaminhamentoPendenciaResolvida`
- `RespostaSusRegistrada`
- `UsuarioCriado`, `UsuarioSenhaAlterada`, `UsuarioBloqueado`
- `UbsCriada`, `UbsDesativada`

Implementar via **outbox pattern**: salva evento + commit na mesma transação; worker separado envia pro bus externo (fila) de forma atômica e idempotente.

---

## 6. Banco de dados · modelagem

### Princípios

1. **Toda tabela transacional tem**: `id` UUID, `prefeitura_id` UUID, `criado_em`, `atualizado_em`, `versao` (optimistic locking).
2. **Toda tabela tem soft-delete**: coluna `deletado_em` timestamp nullable. Filtrar `WHERE deletado_em IS NULL` por padrão.
3. **Nunca delete de verdade** dados clínicos (retenção LGPD/SUS = 20 anos).
4. **Constraints ativas**: FKs com `ON DELETE RESTRICT` + `CHECK` para enums + `UNIQUE` em chaves naturais.

### Tabelas principais

```sql
-- Tenants
CREATE TABLE prefeituras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  municipio TEXT NOT NULL,
  uf CHAR(2) NOT NULL,
  cnpj VARCHAR(18) UNIQUE,
  ativa BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prefeitura_id UUID NOT NULL REFERENCES prefeituras(id),
  nome TEXT NOT NULL,
  municipio TEXT NOT NULL,
  uf CHAR(2) NOT NULL,
  endereco TEXT,
  cnes VARCHAR(10) UNIQUE,
  ativa BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  deletado_em TIMESTAMPTZ
);
CREATE INDEX idx_ubs_prefeitura ON ubs(prefeitura_id) WHERE deletado_em IS NULL;

CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prefeitura_id UUID REFERENCES prefeituras(id),  -- NULL para DESENVOLVEDOR
  ubs_id UUID REFERENCES ubs(id),                 -- NULL para ADMIN/REGULADOR/DEV
  nome TEXT NOT NULL,
  email CITEXT UNIQUE NOT NULL,
  matricula TEXT UNIQUE NOT NULL,
  cpf VARCHAR(14) UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,        -- argon2id
  role TEXT NOT NULL CHECK (role IN ('DESENVOLVEDOR','ADMIN','COORDENADOR_UBS','ATENDENTE_UBS','REGULADOR_SMS')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  bloqueado_ate TIMESTAMPTZ,
  senha_alterada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  two_fa_ativo BOOLEAN NOT NULL DEFAULT FALSE,
  two_fa_secret TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  deletado_em TIMESTAMPTZ,
  CHECK (
    (role IN ('ADMIN','REGULADOR_SMS') AND prefeitura_id IS NOT NULL AND ubs_id IS NULL) OR
    (role IN ('ATENDENTE_UBS','COORDENADOR_UBS') AND ubs_id IS NOT NULL) OR
    (role = 'DESENVOLVEDOR')
  )
);
CREATE INDEX idx_usuarios_prefeitura ON usuarios(prefeitura_id) WHERE deletado_em IS NULL AND ativo;

-- Core: encaminhamentos
CREATE TABLE encaminhamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prefeitura_id UUID NOT NULL REFERENCES prefeituras(id),
  ubs_id UUID NOT NULL REFERENCES ubs(id),
  paciente_id UUID NOT NULL REFERENCES pacientes(id),
  atendente_id UUID NOT NULL REFERENCES usuarios(id),
  protocolo VARCHAR(20) UNIQUE NOT NULL,  -- UBS-AAAA-NNNNNN
  status TEXT NOT NULL CHECK (status IN (
    'RASCUNHO','AGUARDANDO_REGULACAO','PENDENCIA_DOCUMENTO','APROVADO','REJEITADO'
  )),
  especialidade_solicitada TEXT NOT NULL,
  cid10 VARCHAR(10) NOT NULL,
  cid_descricao TEXT NOT NULL,
  prioridade TEXT NOT NULL CHECK (prioridade IN ('ELETIVA','PRIORITARIA','URGENTE','EMERGENCIA')),
  medico_solicitante TEXT NOT NULL,
  crm VARCHAR(20) NOT NULL,
  data_solicitacao DATE NOT NULL,
  justificativa_clinica TEXT NOT NULL,
  observacoes_regulacao TEXT,
  agendamento_previsto TIMESTAMPTZ,
  -- Resposta SUS (one-to-one opcional, pós-aprovação)
  resposta_sus_anexo_id UUID REFERENCES anexos(id),
  resposta_sus_observacao TEXT,
  resposta_sus_registrado_em TIMESTAMPTZ,
  resposta_sus_registrado_por UUID REFERENCES usuarios(id),
  -- Audit
  versao INT NOT NULL DEFAULT 1,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices críticos para performance
CREATE INDEX idx_enc_prefeitura_status ON encaminhamentos(prefeitura_id, status);
CREATE INDEX idx_enc_prefeitura_criado ON encaminhamentos(prefeitura_id, criado_em DESC);
CREATE INDEX idx_enc_ubs_criado ON encaminhamentos(ubs_id, criado_em DESC);
CREATE INDEX idx_enc_paciente ON encaminhamentos(paciente_id);
CREATE INDEX idx_enc_protocolo ON encaminhamentos(protocolo);
-- Índice para o file-manager (árvore) — extrai ano/mês do criado_em
CREATE INDEX idx_enc_arvore ON encaminhamentos(
  prefeitura_id,
  ubs_id,
  (EXTRACT(YEAR FROM criado_em)),
  (EXTRACT(MONTH FROM criado_em)),
  (EXTRACT(DAY FROM criado_em))
);

-- Anexos
CREATE TABLE anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encaminhamento_id UUID NOT NULL REFERENCES encaminhamentos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('SOLICITACAO','RG','CPF','CARTAO_SUS','EXAME','LAUDO','RESPOSTA_SUS','OUTRO')),
  tamanho_kb INT NOT NULL,
  mime_type TEXT NOT NULL,
  storage_key TEXT NOT NULL,          -- S3 key
  sha256 CHAR(64) NOT NULL,           -- integrity
  scan_status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (scan_status IN ('PENDENTE','LIMPO','INFECTADO','FALHOU')),
  upload_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  upload_por UUID NOT NULL REFERENCES usuarios(id)
);
CREATE INDEX idx_anexos_encaminhamento ON anexos(encaminhamento_id);

-- Timeline
CREATE TABLE eventos_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encaminhamento_id UUID NOT NULL REFERENCES encaminhamentos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'CRIADO','DOCUMENTO_ANEXADO','ENVIADO_REGULACAO','PENDENCIA_REGISTRADA',
    'APROVADO','REJEITADO','AGENDADO','OBSERVACAO','RESPOSTA_SUS_RECEBIDA'
  )),
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  autor_id UUID REFERENCES usuarios(id),  -- NULL quando autor = "SISTEMA"
  autor_nome TEXT NOT NULL,               -- snapshot (pra não quebrar se usuário deletar)
  autor_papel TEXT NOT NULL,              -- "Atendente · UBS Central" / "Regulação · SMS"
  em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_eventos_encaminhamento_em ON eventos_timeline(encaminhamento_id, em DESC);

-- Audit log (imutável, append-only)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prefeitura_id UUID REFERENCES prefeituras(id),
  atendente_id UUID REFERENCES usuarios(id),
  atendente_matricula TEXT,
  action TEXT NOT NULL,              -- APROVAR_ENCAMINHAMENTO, CRIAR_UBS, LOGIN, ...
  recurso_tipo TEXT,                 -- "Encaminhamento", "Ubs", ...
  recurso_id UUID,
  status_antes TEXT,
  status_depois TEXT,
  payload JSONB,                     -- request body (com PII mascarada se aplicável)
  ip INET,
  user_agent TEXT,
  request_id TEXT NOT NULL,
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_prefeitura_em ON audit_log(prefeitura_id, registrado_em DESC);
CREATE INDEX idx_audit_atendente_em ON audit_log(atendente_id, registrado_em DESC);
CREATE INDEX idx_audit_recurso ON audit_log(recurso_tipo, recurso_id);

-- Sessões (JWT blacklist / refresh tokens)
CREATE TABLE sessoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  refresh_token_hash TEXT NOT NULL,     -- SHA-256 do refresh token
  ip INET,
  user_agent TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_uso_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ NOT NULL,
  revogada_em TIMESTAMPTZ
);
CREATE INDEX idx_sessoes_usuario ON sessoes(usuario_id) WHERE revogada_em IS NULL;

-- Outbox (event sourcing leve)
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  publicado_em TIMESTAMPTZ
);
CREATE INDEX idx_outbox_pendentes ON outbox_events(criado_em) WHERE publicado_em IS NULL;
```

### Regras de integridade

- `encaminhamentos.ubs_id` e `encaminhamentos.paciente_id` devem pertencer à **mesma** `prefeitura_id` do encaminhamento. Validar em trigger ou no use case.
- `anexos.encaminhamento_id` herda `prefeitura_id` (usar em queries de autorização).
- Nunca mutar `eventos_timeline` nem `audit_log` — apenas INSERT.

---

## 7. Autenticação e autorização (JWT + RBAC)

### JWT

**Access token** (TTL 30 min, stateless):

```json
{
  "sub": "<usuarioId>",
  "nome": "MATEUS SANTANA",
  "role": "REGULADOR_SMS",
  "prefeituraId": "<uuid>",       // null para DEV
  "ubsId": "<uuid>",               // null para ADMIN/REGULADOR/DEV
  "sid": "<sessaoId>",             // para revogação
  "iat": 1700000000,
  "exp": 1700001800
}
```

Algoritmo: **RS256** (chave pública publicada para gateways validarem sem consultar o auth service).

**Refresh token** (TTL 7 dias padrão · 30 dias com "lembrar"):
- Opaco (não JWT). Hash SHA-256 salvo em `sessoes.refresh_token_hash`.
- Renovação: verifica hash, gera novo access token, **roda** o refresh token (rotação).

### Fluxo de login

1. Recebe `login` (matrícula OR email) + senha.
2. Busca usuário case-insensitive (CITEXT no email).
3. Verifica `ativo`, `bloqueado_ate`.
4. Valida senha com `argon2id` (parâmetros: m=64MB, t=3, p=4).
5. Gera access + refresh, cria `sessao`.
6. Registra no audit log: action=LOGIN_SUCESSO.
7. Em caso de falha: incrementa contador (Redis com TTL 15 min); se ≥ 5, bloqueia 30 min (`USUARIO_BLOQUEADO`).

### Middleware de auth

```ts
// src/http/middlewares/auth.ts
export async function authMiddleware(req, reply) {
  const token = extractBearer(req.headers.authorization);
  if (!token) return reply.code(401).send(erro('TOKEN_AUSENTE', 'Token ausente.'));
  try {
    const payload = verify(token, PUBLIC_KEY);
    // Verifica se sessão não foi revogada
    if (!(await sessaoAtiva(payload.sid))) {
      return reply.code(401).send(erro('TOKEN_INVALIDO', 'Sessão revogada.'));
    }
    req.auth = payload;  // disponível pras rotas
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return reply.code(401).send(erro('TOKEN_EXPIRADO', 'Token expirado.'));
    }
    return reply.code(401).send(erro('TOKEN_INVALIDO', 'Token inválido.'));
  }
}
```

### Autorização por rota

Usar **decorators** ou **route guards** explícitos — nunca `if (role === ...)` espalhado nos controllers.

```ts
// src/http/middlewares/rbac.ts
export function requireRole(...roles: Role[]) {
  return async (req, reply) => {
    if (!roles.includes(req.auth.role)) {
      return reply.code(403).send(erro('PERMISSAO_INSUFICIENTE', 'Permissão insuficiente.'));
    }
  };
}

// src/http/routes/encaminhamentos.ts
fastify.post('/:id/aprovar', {
  preHandler: [authMiddleware, requireRole('REGULADOR_SMS', 'DESENVOLVEDOR')],
  schema: { body: AprovarSchema, params: IdSchema },
}, aprovarHandler);
```

### Política de senhas

- Mínimo 8 caracteres (plano).
- Hash `argon2id` (nunca bcrypt com custo baixo, nunca SHA plain).
- Histórico bloqueado: últimas 5 senhas (comparar hashes).
- Validade: 180 dias (flag `senha_alterada_em` + comparação no login → retorna `SENHA_EXPIRADA`).

---

## 8. Multi-tenancy e isolation

**A regra mais crítica do sistema.**

### Estratégia: **Discriminator column** (`prefeitura_id` em toda tabela transacional)

Mais simples que schemas separados, performance suficiente com índices compostos começando com `prefeitura_id`.

### Implementação

1. **Middleware `tenantScope`**: extrai `prefeituraId` do JWT, injeta no request context.
2. **Repository base**: todo query faz `WHERE prefeitura_id = :tenantId` automaticamente.
3. **Exceção**: `DESENVOLVEDOR` tem `prefeituraId: null`; repository trata como "sem filtro".

```ts
// src/infrastructure/database/repositories/base-repository.ts
abstract class TenantScopedRepository<T> {
  constructor(
    protected readonly prisma: PrismaClient,
    protected readonly tenant: TenantContext,
  ) {}

  protected get tenantFilter() {
    return this.tenant.prefeituraId
      ? { prefeituraId: this.tenant.prefeituraId }
      : {}; // DEV · sem filtro
  }
}
```

### Validação cruzada (anti-bypass)

Mesmo com filtro do repo, **todo use case** valida explicitamente:

```ts
if (recurso.prefeituraId !== ctx.prefeituraId && ctx.role !== 'DESENVOLVEDOR') {
  throw new NaoEncontradoError('ENCAMINHAMENTO_NAO_ENCONTRADO'); // 404, nunca 403
}
```

**Nunca 403** para recurso fora do tenant — retornar **404** evita que um atacante descubra a existência de IDs em outras prefeituras.

### Testes obrigatórios

Cada endpoint tem teste que:
1. Cria recurso na prefeitura A.
2. Autentica usuário da prefeitura B.
3. Tenta acessar o recurso da A.
4. **Espera 404**.

Sem esse teste, o endpoint não entra em produção.

---

## 9. Convenções de API

### REST pragmático

- **Substantivos no plural** para coleções: `/encaminhamentos`, `/pacientes`.
- **Verbos HTTP padrão** + ações como sub-recursos quando apropriado: `POST /encaminhamentos/:id/aprovar`.
- **Query params** para filtros, **path params** para identidade.

### Shape de resposta de sucesso

Objeto direto (sem envelope), exceto em listagens paginadas.

```json
// GET /encaminhamentos/:id
{
  "id": "...",
  "protocolo": "UBS-2026-100137",
  "status": "APROVADO",
  ...
}
```

Para listagens paginadas (roadmap):

```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "pageSize": 50,
    "total": 214,
    "hasMore": true
  }
}
```

### Shape de erro · **invariante**

```json
{
  "error": {
    "code": "ENCAMINHAMENTO_NAO_EM_PENDENCIA",
    "message": "Encaminhamento não está em pendência.",
    "details": {
      "statusAtual": "APROVADO"
    },
    "requestId": "req_abc123"
  }
}
```

Cada erro mapeia 1:1 para um `code` **estável**. Frontend mapeia code → mensagem pt-BR; `message` do backend é fallback humano.

### Validação de input

Zod ou TypeBox na rota. Rejeita em `400 PAYLOAD_INVALIDO` com detalhes.

```ts
const AprovarSchema = z.object({
  nota: z.string().max(2000).optional(),
  agendamentoPrevisto: z.string().date().optional(),
});
```

### Rate limiting

Redis-backed, por IP + por usuário:

| Endpoint | Limite |
|---|---|
| `POST /auth/login` | 10/min/IP |
| `POST /auth/forgot-password` | 1/min/login |
| `POST /encaminhamentos/extract-pdf` | 30/min/usuário |
| `POST /encaminhamentos/:id/(aprovar|registrar-pendencia|rejeitar|resposta-sus)` | 30/min/usuário |
| `GET /*` | 600/min/usuário |

---

## 10. Máquina de estados e regras de negócio

### Encaminhamento · transições válidas

```
                    [POST /encaminhamentos]
                            │
                            ▼
                  AGUARDANDO_REGULACAO ─────[aprovar]───▶ APROVADO ────[resposta-sus]──▶ (enrichment, não transição)
                      │ │ │
                      │ │ └───[rejeitar]────▶ REJEITADO (terminal)
                      │ │
                      │ └───[registrar-pendencia]─▶ PENDENCIA_DOCUMENTO
                      │                                 │
                      │                                 │ [resolve-pendencia]
                      │                                 ▼
                      └◀── (volta) ────── AGUARDANDO_REGULACAO
```

### Implementação no Domain

A entidade `Encaminhamento` **é** a máquina de estados — nunca delegar isso pro service.

```ts
// src/domain/entities/encaminhamento.ts
export class Encaminhamento {
  aprovar(input: { autor: Autor; nota?: string; agendamentoPrevisto?: Date }) {
    if (this.status !== 'AGUARDANDO_REGULACAO') {
      throw new RegraDeNegocioError('ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO');
    }
    // Adiciona eventos timeline (em ordem)
    if (input.nota) this.timeline.push(Evento.observacao(input.autor, input.nota));
    this.timeline.push(Evento.aprovado(input.autor));
    if (input.agendamentoPrevisto) {
      this.agendamentoPrevisto = input.agendamentoPrevisto;
      this.timeline.push(Evento.agendado(input.autor, input.agendamentoPrevisto));
    }
    this.status = 'APROVADO';
    this.atualizadoEm = new Date();
    this.domainEvents.push(new EncaminhamentoAprovadoEvent(this.id, this.prefeituraId));
  }

  registrarRespostaSUS(input: { autor: Autor; anexo: Anexo; observacao: string }) {
    if (this.status !== 'APROVADO') {
      throw new RegraDeNegocioError('ENCAMINHAMENTO_NAO_APROVADO');
    }
    if (this.respostaSUS) {
      throw new RegraDeNegocioError('RESPOSTA_SUS_JA_REGISTRADA');
    }
    this.respostaSUS = {
      anexoId: input.anexo.id,
      observacao: input.observacao,
      registradoEm: new Date(),
      registradoPor: { id: input.autor.id, nome: input.autor.nome, matricula: input.autor.matricula },
    };
    this.anexos.push(input.anexo);
    this.timeline.push(Evento.respostaSus(input.autor, input.observacao));
    this.atualizadoEm = new Date();
    this.domainEvents.push(new RespostaSusRegistradaEvent(this.id));
  }

  // aprovar / rejeitar / registrarPendencia / resolverPendencia seguem mesmo padrão
}
```

### Transações atômicas

Cada use case roda em **uma transação DB única**. Se falhar qualquer passo, rollback total.

```ts
await prisma.$transaction(async (tx) => {
  // save encaminhamento
  // insert eventos timeline
  // insert anexos novos
  // insert outbox event
  // insert audit log
});
```

---

## 11. Uploads, storage e OCR

### Regras

- Limite **por arquivo**: 10 MB.
- Limite **por requisição**: 30 MB.
- MIMEs aceitos: `application/pdf`, `image/jpeg`, `image/png`.
- Validar magic bytes além do `Content-Type` (arquivo pode mentir).

### Fluxo de upload

1. Cliente envia `multipart/form-data`.
2. Middleware valida tamanho + MIME.
3. Calcula SHA-256 em streaming.
4. Sobe para S3 com chave `{prefeituraId}/{encaminhamentoId}/{uuid}-{nome}`.
5. Cria registro `anexos` com `scan_status: 'PENDENTE'`.
6. Enfileira job `av-scan` com o `anexo.id`.
7. Worker roda ClamAV; atualiza `scan_status: 'LIMPO' | 'INFECTADO'`.
8. Download só é permitido se `scan_status === 'LIMPO'`.

### OCR do PDF da solicitação

- Endpoint `POST /encaminhamentos/extract-pdf` **não persiste**. Recebe, extrai, retorna JSON.
- Fluxo:
  1. Tenta extração de texto nativo (`pdf-parse`, `pdf.js`).
  2. Se < 100 caracteres → fallback OCR (Tesseract local ou AWS Textract).
  3. Aplica heurísticas regex para CPF, Cartão SUS, CID-10, CRM.
  4. Retorna campos extraídos + `confiancaExtracao: 0..1` (média ponderada).
- Timeout: 15s (OCR). Se estourar, retorna `503 SERVICO_OCR_INDISPONIVEL`.

### URLs de download

Nunca expor S3 diretamente. Endpoint `GET /anexos/:id/download`:
1. Valida auth + autorização (anexo pertence a encaminhamento no escopo).
2. Gera URL pré-assinada S3 (TTL 5 min).
3. Redireciona 302 para a URL pré-assinada.

---

## 12. Processamento assíncrono

Use **BullMQ** (Redis) para jobs. Nunca bloqueie HTTP com tarefas lentas.

### Filas obrigatórias

| Fila | O que processa | Concorrência |
|---|---|---|
| `av-scan` | ClamAV nos anexos | 2 workers |
| `ocr` | Extração OCR de PDF (se não cachear resultado) | 4 workers |
| `notificacao` | Webhook pra UBS + email | 8 workers |
| `relatorio` | Geração de PDF/XLSX/CSV | 4 workers |
| `outbox-publisher` | Publica eventos no bus externo | 2 workers |

### Padrões

- **Idempotência**: todo job tem `jobId` determinístico (ex.: `aprovar:${encId}:${versao}`). Executar de novo é no-op.
- **Retry com backoff exponencial**: 5 tentativas, backoff 1s → 32s.
- **Dead-letter queue**: após N falhas, move pra DLQ e dispara alerta.

### Outbox publisher

Lê `outbox_events` onde `publicado_em IS NULL`, publica no bus (RabbitMQ/Kafka/webhook), marca como publicado. Roda em loop a cada 500ms. Idempotente.

---

## 13. Observabilidade

### Logs · Pino (JSON estruturado)

Todo log obrigatoriamente tem:
```json
{ "time": "...", "level": "info", "requestId": "...", "userId": "...", "prefeituraId": "...", "msg": "..." }
```

Níveis:
- `trace/debug`: desenvolvimento apenas
- `info`: operações de negócio (login, aprovar, criar UBS)
- `warn`: degradação (OCR lento, rate limit atingido)
- `error`: exceções não esperadas
- `fatal`: erro de infra que requer restart

**PII mascarada em logs** — nunca logar CPF/senha/Cartão SUS em claro.

### Métricas · Prometheus

Expor `/metrics` (interno, não público). Métricas mínimas:

```
http_request_duration_seconds{route, method, status}
http_requests_total{route, method, status}
encaminhamentos_total{prefeitura, status}
encaminhamento_transicao_total{de, para}
ocr_extraction_duration_seconds{origem}      // histogram
ocr_extraction_confidence                     // histogram
av_scan_duration_seconds
av_scan_infectados_total
job_duration_seconds{fila}
job_retries_total{fila}
db_query_duration_seconds{operation}
auth_login_total{resultado}                  // sucesso, falha, bloqueado
```

### Tracing · OpenTelemetry

Propagar `traceparent` header; spans por camada (HTTP → UseCase → Repo → DB). Cada request tem `X-Request-Id` ecoado nas responses e logs.

### Alertas (SRE básico)

- 5xx rate > 1% em 5 min
- P95 de login > 2s
- DLQ não-vazia
- AV scan com fila > 100 itens
- Outbox com eventos pendentes há > 10 min

---

## 14. Estratégia de testes

Pirâmide de testes:

```
        ┌──────────┐
        │   e2e    │  ← poucos, críticos (happy path + regras de segurança)
        └──────────┘
     ┌────────────────┐
     │  integration   │  ← repos + services com DB real (testcontainers)
     └────────────────┘
  ┌──────────────────────┐
  │       unit           │  ← domain entities + use cases com mocks
  └──────────────────────┘
```

### Testes obrigatórios por endpoint

- ✅ Happy path
- ✅ Validação de input (400)
- ✅ Sem token (401)
- ✅ Token válido mas role errada (403)
- ✅ Recurso em outra prefeitura → 404 (isolation)
- ✅ Regra de negócio violada (409/422)
- ✅ Transação atômica (falha em meio rola tudo back)

### Coverage mínimo

- Domain: **90%+** (entidades + VOs são o coração).
- Use cases: **85%+**.
- Controllers: **70%+** (só happy + erros mapeados).
- Infra: smoke tests por integração.

### CI obrigatório

Nenhum PR passa sem:
- Lint (ESLint + Prettier)
- Typecheck (`tsc --noEmit`)
- Tests (unit + integration)
- Audit (`npm audit --production`)

---

## 15. Segurança (OWASP + LGPD)

### Checklist OWASP Top 10

- [ ] **A01 Broken Access Control**: guards em toda rota, tests de isolation por tenant.
- [ ] **A02 Cryptographic Failures**: senhas com argon2id, TLS 1.2+, secrets em KMS.
- [ ] **A03 Injection**: só Prisma parametrizado, nunca string concat em SQL.
- [ ] **A04 Insecure Design**: threat modeling inicial.
- [ ] **A05 Security Misconfiguration**: headers (`helmet`), CORS restrito, sem stack traces em prod.
- [ ] **A06 Vulnerable Components**: Dependabot + `npm audit`.
- [ ] **A07 Auth Failures**: 2FA, lockout, rotação de refresh, sessão revogável.
- [ ] **A08 SSRF / deserialização**: whitelist de hosts externos, sem `eval`.
- [ ] **A09 Logging Failures**: audit log imutável, sem PII em logs.
- [ ] **A10 SSRF**: validar URLs antes de fetch externo.

### LGPD

- **Minimização**: coletar apenas dados necessários pra prestação do SUS.
- **Finalidade**: PII só acessível por quem tem papel clínico/administrativo legítimo (RBAC).
- **Retenção**: 20 anos (prontuário), 5 anos (audit log), 90 dias (sessões).
- **Portabilidade**: endpoint `GET /me/lgpd/export` (roadmap) retorna JSON com todos os dados do titular.
- **Esquecimento**: soft-delete sempre; purga definitiva após retenção legal.
- **DPO**: email obrigatório em rodapé da plataforma.

---

## 16. Performance alvo + cache

### SLOs

| Operação | Alvo P95 |
|---|---|
| Login | ≤ 1s |
| GET detalhe (com anexos + timeline) | ≤ 500ms |
| GET listagem paginada | ≤ 800ms |
| Mutação (aprovar/rejeitar/pendenciar) | ≤ 2s |
| Extract PDF nativo | ≤ 5s |
| Extract PDF OCR (escaneado) | ≤ 15s |
| `GET /encaminhamentos/arvore` | ≤ 300ms |

### Cache (Redis)

| Chave | TTL | Invalidação |
|---|---|---|
| `auth:session:{sid}` | 30 min | logout / revogação |
| `user:me:{userId}` | 1 min | perfil alterado |
| `dashboard:metrics:{prefId}` | 30s | — (deixa expirar) |
| `arvore:{prefId}:{ubsId?}:{ano?}:{mes?}` | 5 min | evento de encaminhamento |

Padrão: **write-through** para estados críticos, **lazy-expire** para agregados.

### Banco

- Todas as queries com `EXPLAIN ANALYZE` antes do release.
- Índices compostos sempre começam com `prefeitura_id`.
- VACUUM + REINDEX semanal via pg_cron.

---

## 17. Deployment e configuração

### 12-Factor App

1. Código único, muitos deploys.
2. Dependências explícitas (`package-lock.json` commitado).
3. Config via env vars (ver `.env.example`).
4. Backing services (DB, Redis) como recursos anexáveis.
5. Build / release / run separados.
6. Processos stateless (sessões em Redis, uploads em S3).
7. Port binding (Fastify listen em `$PORT`).
8. Concorrência via processos (PM2 ou k8s replicas).
9. Disposability (graceful shutdown, idempotência).
10. Dev/prod parity (docker-compose local espelha prod).
11. Logs para stdout (captura pelo orquestrador).
12. Admin tasks via CLI separada (migrations, seed).

### `.env.example` mínimo

```ini
NODE_ENV=production
PORT=3333
LOG_LEVEL=info

DATABASE_URL=postgres://user:pass@host:5432/unisism
DATABASE_POOL_MAX=20

REDIS_URL=redis://host:6379

JWT_PRIVATE_KEY_B64=<base64>
JWT_PUBLIC_KEY_B64=<base64>
JWT_ACCESS_TTL=1800
JWT_REFRESH_TTL=604800

STORAGE_PROVIDER=s3
S3_REGION=us-east-1
S3_BUCKET=unisism-anexos
S3_ACCESS_KEY_ID=<kms>
S3_SECRET_ACCESS_KEY=<kms>

SMTP_HOST=smtp.example.com
SMTP_USER=<kms>
SMTP_PASS=<kms>

CLAMAV_HOST=clamav
CLAMAV_PORT=3310

OCR_PROVIDER=tesseract

CORS_ORIGIN=https://unisism.aguasbelas.pe.gov.br
RATE_LIMIT_PREFIX=unisism
```

### Docker Compose (dev)

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: unisism
      POSTGRES_USER: unisism
      POSTGRES_PASSWORD: unisism
    ports: ["5432:5432"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
  minio:
    image: minio/minio
    command: server /data --console-address :9001
    environment:
      MINIO_ROOT_USER: unisism
      MINIO_ROOT_PASSWORD: unisism123
    ports: ["9000:9000", "9001:9001"]
  clamav:
    image: clamav/clamav
    ports: ["3310:3310"]
```

### Migrations

Prisma Migrate. Toda mudança em produção via migration versionada. Nunca `prisma db push`.

```bash
npx prisma migrate deploy   # em produção
npx prisma migrate dev      # em dev
```

### Secrets

Nunca em env vars planos em produção. Usar:
- Vault Hashicorp, OU
- AWS Secrets Manager, OU
- Kubernetes Secrets (se o cluster for confiável).

Injetar em runtime via sidecar ou volume.

---

## 18. Qualidade de código e review

### Pré-commit

- ESLint + Prettier (opinionated, sem discussão).
- Typecheck completo (`tsc --noEmit`).
- Sem `console.log` / `TODO` sem issue vinculada.

### Pull requests

Template obrigatório:

```markdown
## O que
<resumo da mudança>

## Por quê
<contexto, issue, tíquete>

## Como testar
1. ...
2. ...

## Checklist
- [ ] Testes unit + integration
- [ ] Atualiza BACKEND_API.md se contrato mudou
- [ ] Migration incluída e reversível
- [ ] Sem breaking change OU comunicado ao frontend
```

Review exige **2 aprovadores** para:
- Mudanças em auth/RBAC
- Mudanças em migration de encaminhamentos
- Mudanças em isolation por tenant

### Commit message

Convencional (para changelog automático):

```
feat(encaminhamentos): adiciona endpoint resposta-sus
fix(auth): corrige race em refresh token rotation
refactor(repos): extrai TenantScopedRepository base
```

---

## 19. Endpoints obrigatórios do MVP

Consolidado de [BACKEND_API.md §14](BACKEND_API.md). Checklist para "pronto pra produção":

### Auth
- [ ] `POST /auth/login`
- [ ] `POST /auth/logout`
- [ ] `POST /auth/forgot-password`
- [ ] `POST /auth/verify-code`
- [ ] `POST /auth/reset-password`
- [ ] `GET  /auth/me`

### Perfil
- [ ] `GET  /me/profile`
- [ ] `POST /me/password`
- [ ] `POST /me/sessions/revoke-others`

### Dashboard
- [ ] `GET  /dashboard/metrics`

### Encaminhamentos (Face 1 · UBS)
- [ ] `POST /encaminhamentos/extract-pdf`
- [ ] `POST /encaminhamentos`
- [ ] `GET  /encaminhamentos`
- [ ] `GET  /encaminhamentos/:id`
- [ ] `POST /encaminhamentos/:id/resolve-pendencia`

### Encaminhamentos (Face 2 · SMS)
- [ ] `POST /encaminhamentos/:id/aprovar`
- [ ] `POST /encaminhamentos/:id/registrar-pendencia`
- [ ] `POST /encaminhamentos/:id/rejeitar`
- [ ] `POST /encaminhamentos/:id/resposta-sus`   ⬅ **NOVO**
- [ ] `GET  /encaminhamentos/arvore`             ⬅ **NOVO**

### Pacientes
- [ ] `GET  /pacientes`
- [ ] `GET  /pacientes/:id`

### Relatórios
- [ ] `GET  /relatorios`
- [ ] `POST /relatorios`
- [ ] `GET  /relatorios/:id/download`

### Admin
- [ ] `GET  /admin/prefeituras` · `POST /admin/prefeituras`
- [ ] `GET  /admin/ubs` · `POST /admin/ubs`
- [ ] `GET  /admin/usuarios` · `POST /admin/usuarios`

### Anexos
- [ ] `GET  /anexos/:id/download` (redirect S3 pré-assinado)

### Infra
- [ ] Armazenamento S3 + scan AV
- [ ] RBAC por UBS + Prefeitura
- [ ] Audit log imutável
- [ ] Métricas Prometheus
- [ ] Rate limiting Redis

---

## 20. Roadmap técnico

Ordem sugerida de implementação (sprints de 1-2 semanas cada):

### Sprint 1 · Fundação
- Setup do projeto (TS + Fastify + Prisma + Zod)
- Docker compose (Postgres, Redis, MinIO, ClamAV)
- Schema Prisma inicial (prefeituras, ubs, usuarios)
- Auth completo (login, logout, me, forgot/verify/reset)
- JWT RS256 + refresh rotation
- Middleware de auth + rbac + tenant

### Sprint 2 · Core Face 1
- Encaminhamentos CRUD
- Upload + AV scan (async)
- Extract-PDF (OCR Tesseract)
- Resolve-pendencia
- Audit log base
- Tests E2E do fluxo UBS

### Sprint 3 · Core Face 2
- Aprovar / registrar-pendencia / rejeitar
- `POST /encaminhamentos/:id/resposta-sus`
- `GET /encaminhamentos/arvore` com cache Redis
- Dashboard metrics agregado
- Tests de isolation por prefeitura

### Sprint 4 · Pacientes e Perfil
- Pacientes (list + byId)
- Perfil completo com produção agregada
- Relatórios (gerador + download)

### Sprint 5 · Admin
- Prefeituras (DEV only)
- UBS (DEV + ADMIN)
- Usuarios (DEV + ADMIN)
- RBAC validado ponta-a-ponta

### Sprint 6 · Observabilidade + Hardening
- Prometheus + Grafana dashboards
- OpenTelemetry tracing
- Rate limiting refinado
- Testes de carga (k6)
- Pen test interno

### Sprint 7 · Integrações oficiais
- CADSUS (SUS federal)
- e-SUS APS (PEC)
- SISREG (fila nacional)

---

## Apêndice A · Comandos básicos

```bash
# Setup
npm install
cp .env.example .env
docker compose up -d
npx prisma migrate dev
npm run seed

# Desenvolvimento
npm run dev           # Fastify com hot-reload
npm run test          # unit + integration
npm run test:e2e      # e2e

# Produção
npm run build
npx prisma migrate deploy
npm start

# Operação
npm run cli -- user:bloquear --matricula SMS-047291
npm run cli -- outbox:replay
npm run cli -- audit:export --prefeitura <id> --desde 2026-04-01
```

## Apêndice B · Referências

| Doc | Conteúdo |
|---|---|
| [BACKEND_API.md](BACKEND_API.md) | Contrato completo (request/response) de todos os endpoints |
| [FACE2_SMS.md](FACE2_SMS.md) | Visão do módulo SMS (centro de comando) |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Design system do frontend |
| [BACKEND_GUIDE.md](BACKEND_GUIDE.md) | Este documento — engenharia |

---

**Divergência entre este guia e o código-fonte → o código vence.** Este documento é vivo e deve ser atualizado a cada mudança arquitetural significativa. Abrir PR na mesma feature que altera o backend.
