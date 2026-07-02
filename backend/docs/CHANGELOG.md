# UNISISM · Backend — CHANGELOG da API

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Foco no que o **frontend** precisa saber. Infraestrutura interna só aparece se afetar contrato.

> 🔁 Arquivos do pacote de integração (`types.ts` + `api-client.ts` + `API.md`) são atualizados na mesma release.

---

## [0.18.3] — 2026-06-03 · Perfil completo do paciente em `/me`

Expande o payload canônico de `paciente` (usado em `login`, `refresh` e `me`)
de 11 → **27 campos**. O app paciente renderiza tela de perfil completa sem
chamar outros endpoints.

### Adicionado em `/v1/paciente-app/me`

| Categoria | Campos novos |
|---|---|
| **Identificação** | `nomeSocial`, `sexo` (M/F/OUTRO) |
| **Filiação** | `nomeMae`, `nomePai` |
| **Perfil sócio** | `estadoCivil`, `escolaridade`, `profissao`, `racaCor`, `grupoSanguineo` |
| **Contato** | `telefoneSecundario` (telefone fixo da casa) |
| **Endereço** | `endereco`, `bairro`, `municipio`, `uf`, `cep` |
| **Atenção primária** | `agenteComunitario` (ACS), `microarea`, `equipeSaudeFamilia` |

Todos os campos `null` quando não preenchidos (conta nova sem PEC, ou UBS
ainda não cadastrou). App trata com fallback. **Zero breaking change** — apps
v0.18.2 ignoram campos novos.

### Mudanças

- Use case `buildPacientePayload` carrega `PacienteConta` + `Paciente` (PEC)
  em paralelo (`Promise.all`) — mesmo tempo de resposta do payload anterior.
- `grupoSanguineo` normaliza `NAO_INFORMADO` → `null` (frontend não precisa
  conhecer o sentinela interno).

---

## [0.18.2] — 2026-06-03 · Detalhe do dossiê médico (Face 3)

Endpoints granulares pra abrir 1 atendimento, vacina ou exame em tela própria
no app paciente — sem depender do cache da lista. App Flutter atualiza
`AtendimentoDetailPage` / `VacinacaoDetailPage` / `ExameDetailPage` pra usar
direto.

### Adicionado

- **`GET /v1/paciente-app/dossie/atendimentos/:id`** — retorna 1 `AtendimentoDto`.
- **`GET /v1/paciente-app/dossie/vacinacoes/:id`** — retorna 1 `VacinacaoDto`.
- **`GET /v1/paciente-app/dossie/exames/:id`** — retorna 1 `ExameDto`.

Todos usam o **mesmo shape** dos itens das listas (`/dossie/atendimentos|vacinacoes|exames`) —
zero diff de model no Flutter.

### Hardening LGPD/CFM

- **Anti-enumeration** — recurso de outro paciente retorna `404` (`ATENDIMENTO_NAO_ENCONTRADO` /
  `VACINACAO_NAO_ENCONTRADA` / `EXAME_NAO_ENCONTRADO`), sem vazar existência.
- **Audit dual** em TODA leitura:
  - LGPD (5 anos): `DOSSIE_*_DETALHE_LIDO` em `auditoria_logs`.
  - CFM (20 anos, imutável via trigger SQL): `LEITURA_DOSSIE` em `paciente_prontuario_audit`
    com `autorPapel: "PACIENTE · App"`, IP, UA.
- **Tentativas cross-paciente** geram audit `DOSSIE_*_DETALHE_FORA_DO_ESCOPO` (LGPD crítico).
- **Sanitização** anti-XSS em todos os campos free-form (HTML strip + control chars +
  zero-width Unicode + cap 4000 chars).
- **Rate limit** compartilhado com o resto do dossiê: 120 req/15min/conta + 600 req/1h/conta +
  1000 req/15min/IP.

### Códigos de erro novos

| HTTP | code |
|---|---|
| 404 | `ATENDIMENTO_NAO_ENCONTRADO` |
| 404 | `VACINACAO_NAO_ENCONTRADA` |
| 404 | `EXAME_NAO_ENCONTRADO` |

---

## [0.18.0] — 2026-05-28 · Etapa 9 · Refresh token rotativo paciente (Face 3)

Fecha o **último gap** entre o que o `UNISISM-Paciente/BACKEND_API.md` espera e o
que o backend entrega. App agora pode persistir sessão por **30 dias** sem
re-pedir senha, com refresh rotativo + detecção de reuse.

### Adicionado

#### Schema (Prisma)
- **Nova tabela `paciente_refresh_tokens`** com cadeia rotativa:
  - `tokenHash` (sha256 — plaintext NUNCA persiste)
  - `expiraEm` (TTL 30 dias)
  - `usadoEm` + `substituidoPorId` (link da cadeia)
  - `revogadoEm` + `motivoRevogacao` (`LOGOUT | REUSE_DETECTED | CONTA_INATIVA | CHAIN_COMPROMISED`)
  - `ip`, `userAgent` (auditoria)
- **`sessoes_paciente`** ganhou `refreshTokenId` (1:1) — facilita rotação encadeada.
- **`PacienteConta`** ganhou relação `refreshTokensPaciente`.

#### Endpoint
- **`POST /v1/paciente-app/auth/refresh`** — público, body `{ refreshToken }`.
  - Response 200: `{ token, refreshToken, expiresIn: 1800, refreshExpiresIn: 2592000, paciente }`.
  - Detecção de reuse → 401 `REFRESH_REUSE_DETECTED` + revoga toda cadeia da conta.

#### UseCase
- **`RefreshTokenPacienteUseCase`** — rotação atômica em transação Prisma:
  - Validações: existe, não revogado, não expirado, não usado, conta ativa.
  - Reuse detectado → revoga TODA a cadeia + sessões da conta + audit.
  - Sucesso → cria novo par, marca antigo `usadoEm` + link `substituidoPorId`.

#### Audit
- `REFRESH_TOKEN_ROTACIONADO` — sucesso (audit não-bloqueante após transação).
- `REFRESH_REUSE_DETECTED` — incidente de segurança (alerta op).

#### Novos códigos de erro
- `401 REFRESH_TOKEN_INVALIDO`
- `401 REFRESH_TOKEN_EXPIRADO`
- `401 REFRESH_TOKEN_REVOGADO`
- `401 REFRESH_REUSE_DETECTED` (mais grave — exige re-login + alerta UX)

### Mudado (BREAKING para apps v0.17.x)

- **`POST /auth/login` response**:
  - `expiresIn` mudou de `86400` (24h) → **`1800`** (30 min).
  - Novos campos: `refreshToken: string`, `refreshExpiresIn: number` (2592000 = 30 dias).
  - Apps antigos continuam funcionando (ignoram novos campos), mas agora o token
    de acesso vence a cada 30 min — **fortemente recomendado implementar refresh**.

- **`POST /auth/logout`**: agora revoga TODOS os refresh tokens vivos da conta
  (não só a sessão atual). Logout = "sair de vez".

### Smoke test
- **`scripts/smoke-test-etapa9.ts`** · 33/33 asserts cobrindo:
  - Cenário 1 — Login emite par
  - Cenário 2 — Rotação OK + cadeia consistente
  - Cenário 3 — Reuse detection revoga toda cadeia + sessões
  - Cenário 4 — Refresh expirado
  - Cenário 5 — Refresh revogado
  - Cenário 6 — Refresh inválido (não existe)
  - Cenário 7 — Conta desativada (token também revogado)
  - Cenário 8 — Logout revoga refresh tokens
  - Cenário 9 — Audit gravado
  - Cenário 10 — 5 rotações sequenciais

### Documentação atualizada
- `docs/PACIENTE_APP_API.md` — §1.1 política TTL + §4.2 novo endpoint
- `docs/types.ts` — `PacienteLoginResponse`, `PacienteRefreshRequest/Response`
- `docs/api-client.ts` — `PacienteAppApi.refresh()` + storage do refresh
- `docs/flutter/unisism_api.dart` — `UnisismApi.refresh()` + `TokenStorage.readRefresh/writeRefresh`
- `docs/flutter/unisism_types.dart` — `LoginPacienteResposta` com novos campos

### Migração para o app
1. **Atualizar storage** — persistir `refreshToken` separado do `accessToken`.
2. **Reduzir TTL esperado** — não confiar que o token dura 24h (agora 30 min).
3. **Implementar refresh transparente** — Dio interceptor que captura 401 em
   endpoints protegidos, chama `refresh()`, e re-tenta a request original.
4. **Tratar `REFRESH_REUSE_DETECTED`** — apagar tokens locais + alerta de segurança.

---

## [0.17.1] — 2026-05-28 · Patches adversariais Etapa 8 (race + assento duplicado)

Auditoria adversarial pós-Etapa 8 identificou **2 brechas residuais reais**.
Ambas fechadas com smoke estendido.

### Corrigido

- **Brecha 1: Race em aprovação concorrente** (severidade média)
  - Antes: `count()` dentro de `$transaction` sem lock pessimista. 2 gestores aprovando
    solicitações DIFERENTES na MESMA viagem com 1 vaga liam ambos `count=0` e ambos
    commitavam → overbook.
  - Fix: `SELECT id FROM tfd_viagens WHERE id = $1 FOR UPDATE` no início da transação.
    PostgreSQL serializa aprovações da mesma viagem. Verificado: 2 `Promise.allSettled`
    em paralelo retornam exatamente 1 OK + 1 `TFD_VIAGEM_SEM_VAGAS`.
- **Brecha 2: `numeroAssento` duplicado** (severidade média)
  - Antes: admin podia passar `numeroAssento: 'A1'` mesmo se já houver outro paciente
    com 'A1' aprovado na viagem.
  - Fix: validação dentro da transação:
    - Admin explícito + assento ocupado → `Conflict('TFD_ASSENTO_OCUPADO')`
    - Auto-gerado → tenta próximo até 20 tentativas (cobre gaps por cancelamentos)
    - Não achou em 20 tentativas → `Conflict('TFD_ASSENTO_INDISPONIVEL')`

### Validação

- Smoke E2E Etapa 8 estendido: **34/34 asserts** (30 originais + 4 novos)
- Regressões preservadas: Etapas 1-7 todas passando

---

## [0.17.0] — 2026-05-28 · Etapa 8 · TFD integrado Face 3 ↔ Face 4 + Hash Chain

Fecha §10 do `BACKEND_PENDENTES.md` 100%. **Última etapa do roadmap original.**
Integração completa entre app paciente (Face 3) e gestão TFD (Face 4) com cadeia
hash SHA-256 (TJ-compliant) em todas as transições.

### Adicionado

- **6 use cases Face 4 admin** (`src/modules/tfd/application/tfd-paciente-solicitacoes.ts`):
  - `ListarTfdPacienteSolicAdminUseCase` — ordenado por prioridade (URGENTE→PRIORITARIA→NORMAL) + FIFO
  - `ObterTfdPacienteSolicAdminUseCase` — detalhe com paciente + viagem + operadorNome
  - `AprovarTfdPacienteSolicUseCase` — valida vagas atômicas + hash chain + push automático
  - `RecusarTfdPacienteSolicUseCase` — exige motivo (≥5 chars) + push REJEITADO
  - `MarcarEmbarqueTfdPacUseCase` — APROVADA → EMBARCADA
  - `MarcarConclusaoTfdPacUseCase` — EMBARCADA → CONCLUIDA
- **6 endpoints Face 4 admin** (`/v1/tfd/solicitacoes-paciente/*`):
  - `GET /` — lista com filtros `?status=&viagemId=&prioridade=`
  - `GET /:id` — detalhe
  - `POST /:id/aprovar` — body opcional `{numeroAssento?}`
  - `POST /:id/recusar` — body obrigatório `{motivo}` (≥5 chars)
  - `POST /:id/embarque`
  - `POST /:id/concluir`
- **Hash chain SHA-256** em TODAS as transições — 7 novos valores no enum `AcaoAuditoriaTFD`:
  - `TFD_PAC_SOLIC_CRIADA` (paciente criou via app)
  - `TFD_PAC_SOLIC_APROVADA` (gestor aprovou)
  - `TFD_PAC_SOLIC_RECUSADA` (gestor recusou)
  - `TFD_PAC_SOLIC_CANCELADA_PELO_PACIENTE` (paciente cancelou)
  - `TFD_PAC_SOLIC_REABERTA` (paciente refez após recusa)
  - `TFD_PAC_EMBARCADA` (gestor confirmou embarque)
  - `TFD_PAC_CONCLUIDA` (viagem terminou)
- **Push automático** ao paciente via `NotificacaoPacienteService` (integração Etapa 7):
  - Aprovação → `AGENDADO` (prioridade 4)
  - Recusa → `REJEITADO` (prioridade 4)
- **Schema delta** `TfdPacienteSolicitacao`:
  - Novos campos: `operadorId`, `operadorNome`, `operadorMatricula` (snapshot de quem aprovou/recusou)
  - `tentativasReabertura` (Int @default(0)) — anti-spam de reabertura
  - Índice `[status, prioridade, criadaEm]` para listagem ordenada
- **Validação atômica de vagas** (anti race-condition):
  - `$transaction` envolve `count(ViagemPassageiro) + count(TfdPacienteSolicitacao APROVADA/EMBARCADA)`
  - Se ≥ `vagasTotais` → `Conflict('TFD_VIAGEM_SEM_VAGAS')`
- **Limite de reabertura**: paciente pode recriar solicitação após CANCELADA/RECUSADA até **3 vezes**.
  4ª tentativa → `Conflict('TFD_LIMITE_REABERTURAS')`.
- **Audit no cancelar pelo paciente**: `CancelarSolicitacaoTfdPacienteUseCase` agora recebe `ITfdAuditLogger` e grava `TFD_PAC_SOLIC_CANCELADA_PELO_PACIENTE` com `operadorRole=PACIENTE`.

### Mudado

- **`CriarSolicitacaoTfdPacienteUseCase`** incrementa `tentativasReabertura` em reabertura + bloqueia após limite.
- **Reset de campos de aprovação** ao reabrir: `operadorId`, `operadorNome`, `operadorMatricula` voltam a `null`.
- **`TfdController`** ganhou 6 handlers + helper `_operadorCtx(req)` (busca nome/matrícula do DB).
- **`AccessScope` escopo PREFEITURA**: gestor não vê/aprova solicitações de outra prefeitura. `Forbidden('FORA_DO_ESCOPO')` em tentativa cross-prefeitura.

### Validação

- `npm run typecheck` — 0 erros
- `npm run build` — 0 erros
- `npm run check` (frontend) — 0/0/0 em 621 files
- `flutter analyze` — 0 erros
- **Smoke E2E Etapa 8** — **30/30 asserts** cobrindo 15 brechas:
  - Paciente cria + cross-prefeitura bloqueado
  - Lista ordenada URGENTE→NORMAL com FIFO
  - Escopo PREFEITURA isola
  - APROVAR: status, operadorNome, numeroAssento, hash chain (hashAnterior bate), push AGENDADO
  - Vagas atômicas: 1 vaga + 2 solicitações → segunda recusada
  - RECUSAR sem motivo bloqueado + com motivo grava + push REJEITADO
  - Cancelar pelo paciente: hash chain com operadorRole=PACIENTE
  - Limite 3 reaberturas + 4ª bloqueada
  - Fluxo APROVADA → EMBARCADA → CONCLUIDA
  - Aprovação cross-prefeitura bloqueada
  - DTO mostra paciente + operador
- **Regressões preservadas**: Etapas 1-7 — todos os smokes passam

### Contratos atualizados

- `backend/docs/types.ts` — `TfdPacienteSolicAdminDto`, `AprovarTfdInput`, `RecusarTfdInput` (TODO: copiar para frontend conforme demanda da UI Face 4)

---

## [0.16.0] — 2026-05-28 · Etapa 7 · Push notifications (SEM Firebase — ntfy.sh self-hosted)

Fecha §5 do `BACKEND_PENDENTES.md` 100%. **Decisão**: SMS Águas Belas não usará Firebase.
Implementação 100% open-source com **ntfy.sh self-hosted** (MIT, sem vendor lock-in).

### Adicionado

- **Provider-agnostic push system**:
  - `IPushProvider` interface (`infrastructure/push/IPushProvider.ts`)
  - `NtfyPushProvider` — HTTP POST para ntfy.sh self-hosted (default)
  - `NoopPushProvider` — DEV/fallback (loga e retorna OK)
  - `buildPushProvider()` factory por env `PUSH_PROVIDER`
- **Schema agnóstico** `PacienteDispositivo`:
  - Coluna `fcmToken` renomeada para **`endpoint`** (semântica por provider)
  - Nova enum `PushProvider` (NTFY | FCM | WEB_PUSH) com default `NTFY`
  - Novos campos: `ultimoSucessoEm`, `falhasConsecutivas` (auto-remoção após 3 falhas)
- **`StatusPushNotificacao` enum** em `NotificacaoPaciente`:
  - `PENDENTE | ENVIADO | FALHOU | EXCEDIDO | SEM_DEVICE`
  - + campos `pushTentativas`, `pushUltimaTentativaEm`, `pushEnviadoEm`, `pushErro`
- **`PushDispatcherWorker`** — polling loop (15s default, env `PUSH_DISPATCHER_INTERVAL_MS`):
  - Processa batches de 50 notificações `PENDENTE`
  - Retry exponencial: 0min, 1min, 5min, 30min (4 tentativas max)
  - Devices com 3 falhas permanentes consecutivas → removidos automaticamente
  - Stop graceful (aguarda batch corrente)
- **`PushTokenCleanupCron`** — node-cron mensal:
  - Remove devices com `ultimaAtividade < (now - 90d)` (env `PUSH_DEVICE_TTL_DIAS`)
  - Audit `PUSH_DEVICE_CLEANUP` com contagem
- **Email fallback** no dispatcher:
  - Para tipos urgentes (`APROVADO`, `REJEITADO`, `AGENDADO`, `PENDENCIA_REGISTRADA`, `RESPOSTA_SUS_DISPONIVEL`)
  - Quando `SEM_DEVICE`, `FALHOU` ou `EXCEDIDO` → envia email via `IEmailService` (já existente)
  - Audit `PUSH_FALLBACK_EMAIL_OK` / `PUSH_FALLBACK_EMAIL_FALHOU`
- **Audit log granular** em todas as operações push:
  - `PUSH_DEVICE_REGISTRADO`, `PUSH_DEVICE_ATUALIZADO`, `PUSH_DEVICE_TRANSFERIDO`, `PUSH_DEVICE_REVOGADO`
  - `PUSH_DEVICE_REMOVIDO_FALHA_PERMANENTE`, `PUSH_DEVICE_CLEANUP`
  - `PUSH_ENVIADO_OK`, `PUSH_TENTATIVA_FALHOU`, `PUSH_EXCEDIDO`, `PUSH_FALHOU_PERMANENTE`
  - `PUSH_FALLBACK_EMAIL_OK`, `PUSH_FALLBACK_EMAIL_FALHOU`
- **Endpoints HTTP**:
  - `POST /v1/paciente-app/me/push-token` (novo, genérico) — devolve `{endpoint, provider, subscribeUrl}`
  - `DELETE /v1/paciente-app/me/push-token` (novo)
  - `POST /v1/paciente-app/me/fcm-token` (mantido por retrocompat — adapter delega ao novo)
  - `DELETE /v1/paciente-app/me/fcm-token` (mantido)

### Mudado

- **`FcmDispositivoUseCases.ts`** é agora um **re-export** de `PushDispositivoUseCases.ts`.
  Use cases `RegistrarFcmPacienteUseCase` + `RevogarFcmPacienteUseCase` viraram
  adapters que forçam `provider: FCM` (legado).
- **Validação por provider**:
  - NTFY: topic regex `^[a-zA-Z0-9_-]{4,64}$` (alfanum + `_-`, 4-64 chars)
  - FCM: token ≥ 20 chars
  - WEB_PUSH: JSON `{endpoint, keys}` com endpoint https://
- **Flutter** (`UNISISM-Paciente`):
  - Removido `firebase_core`, `firebase_messaging` do `pubspec.yaml`
  - Adicionado `web_socket_channel ^3.0.1` (subscribe ntfy)
  - `PushService` reescrito: WebSocket persistente com auto-reconnect (backoff 5-30s),
    persistência local do endpoint em `SharedPreferences`, renderização via
    `flutter_local_notifications` quando WS recebe mensagem
- **server.ts**: inicializa `pushDispatcher` (env `PUSH_DISPATCHER_ENABLED`, default true)
  e `pushCleanupCron`. Graceful shutdown aguarda batch corrente.

### Validação

- `npm run typecheck` — 0 erros
- `npm run build` — 0 erros
- `npm run check` (frontend) — 0/0/0 em 621 files
- `flutter analyze` — 0 erros
- **Smoke E2E Etapa 7** — **38/38 asserts** cobrindo 15 brechas:
  - Validação endpoint por provider (NTFY topic regex, FCM len, WEB_PUSH JSON)
  - Topic auto-gerado: `unisism-` + UUIDv4 hex (40 chars)
  - `subscribeUrl` wss:// gerada
  - Device transferido entre contas → audit `PUSH_DEVICE_TRANSFERIDO`
  - Worker batch: 1 notificação → `ENVIADO` com `pushEnviadoEm`, `pushTentativas=1`
  - Payload deepLink derivado de `encaminhamentoId` (`unisism://encaminhamento/{id}`)
  - Prioridade ntfy 4 para `APROVADO`, 5 para `AGENDADO`/`PENDENCIA`
  - Retry exponencial: 4 tentativas com backoff respeitado → `EXCEDIDO` + audit
  - Email fallback para `AGENDADO` falhando: paciente recebe email
  - `SEM_DEVICE` quando paciente sem dispositivos
  - Cleanup TTL: device 100d inativo → deletado; ativo preservado
  - NoopPushProvider sempre OK
  - NtfyPushProvider sem baseUrl → not ready
  - NtfyPushProvider topic inválido → `NTFY_TOPIC_INVALIDO`
- **Regressões preservadas**: Etapas 1-6 — todos os smokes passam

### Variáveis de ambiente novas

- `PUSH_PROVIDER` (default `noop` em dev / `ntfy` em prod)
- `NTFY_BASE_URL` (ex: `https://ntfy.aguasbelas.pe.gov.br`)
- `NTFY_AUTH_TOKEN` (opcional — Bearer token de write ACL)
- `NTFY_TIMEOUT_MS` (default 5000)
- `PUSH_DISPATCHER_ENABLED` (default `true`)
- `PUSH_DISPATCHER_INTERVAL_MS` (default 15000)
- `PUSH_DEVICE_CLEANUP_CRON` (default `30 3 1 * *` — 1º dia 03:30 UTC)
- `PUSH_DEVICE_TTL_DIAS` (default 90)

### Como subir o ntfy.sh self-hosted

```yaml
# docker-compose.prod.yml (add service)
ntfy:
  image: binwiederhier/ntfy
  command: serve
  environment:
    - NTFY_BASE_URL=https://ntfy.aguasbelas.pe.gov.br
    - NTFY_AUTH_FILE=/var/lib/ntfy/user.db
    - NTFY_AUTH_DEFAULT_ACCESS=deny-all
  volumes:
    - ./ntfy-data:/var/lib/ntfy
  ports:
    - "8080:80"
```

Configurar Caddy proxy reverso + ACL `read,write` para token do backend.

### Contratos atualizados

- `backend/docs/types.ts` — `PushProvider` enum, `RegistrarPushRequest`, `RegistrarPushResponse`
- (Flutter: `lib/data/repositories/auth_repository.dart` registra via `/me/push-token` — TODO próxima release)

---

## [0.15.0] — 2026-05-28 · Etapa 6 · Banners SMS + CMS admin (5 endpoints)

Fecha §11 do `BACKEND_PENDENTES.md` 100%. Auditoria adversarial identificou
**15 brechas** — todas fechadas. Adiciona CMS completo para gestores curarem
o carrossel "Avisos da Secretaria" do app paciente.

### Adicionado (Backend)

- **5 endpoints admin** `/v1/admin/sms-banners`:
  - `GET /` — lista com filtros `?ativo=&expirados=` (escopo automático)
  - `GET /:id` — detalhe com `totalVisualizacoes`
  - `POST /` — criar
  - `PATCH /:id` — editar
  - `DELETE /:id` — excluir (RBAC: DEV/ADMIN apenas)
- **RBAC granular**:
  - DEV (GLOBAL): pode criar/editar/excluir banners de qualquer prefeitura E banners globais (`prefeituraId: null`)
  - ADMIN/REGULADOR_SMS: limitado à própria prefeitura; **bloqueado** de criar banners globais
- **Audit log** em todas as mutações:
  - `CRIAR_BANNER` (payload: titulo, tone, prefeituraId, datas, prioridade)
  - `EDITAR_BANNER` (snapshot antes/depois + `camposAlterados`)
  - `DELETAR_BANNER` (snapshot completo)
- **`shared/bannerValidators.ts`** — `validarUrlHttps` (HTTPS-only + URL parseável + ≤500 chars), `validarExpiraEm` (> publicadoEm), `validarTamanho` + `LIMITES_BANNER`
- **`BannersRateLimiter`** — 240 req/15min/conta + 1200/1h/conta + 2000/15min/IP
- **Middleware** `buildBannersRateLimitMiddleware` aplicado nos 3 endpoints públicos do paciente

### Mudado

- **`BannersUseCases` público** — sanitização anti-XSS aplicada também na resposta (defesa em profundidade pra banners legados pré-v0.15)
- **Endpoints públicos do paciente** (`GET /banners`, `GET /banners/:id`, `POST /banners/:id/visto`) agora rate-limited

### Validação

- `npm run typecheck` — 0 erros
- `npm run build` — 0 erros
- `npm run check` (frontend) — 0/0/0 em 621 files (+2 novos: route + tab)
- `flutter analyze` — 0 erros
- **Smoke E2E Etapa 6** — **35/35 asserts** cobrindo 15 brechas:
  - Max chars (titulo 80, corpo 400)
  - HTTPS-only (http://, URL malformada rejeitados)
  - CTA label+url devem vir juntos
  - expiraEm > publicadoEm
  - prioridadeOrdem em [-100, 1000]
  - prefeituraId existente
  - Sanitização `<script>` removido em titulo + corpo
  - Audit CREATE/UPDATE com snapshot/`camposAlterados`/DELETE com snapshot
  - Escopo: ADMIN bloqueado de criar global + ler/editar de outra prefeitura
  - LIST filtra por escopo (PREFEITURA não vê banners globais nem alheios)
  - `totalVisualizacoes` exposto
  - Rate limit estoura exatamente na 241ª req
- **Regressões preservadas**: Etapas 1, 2, 3, 4, 5 — todos os smokes passam

### Adicionado (Frontend SvelteKit)

- **Aba "Banners"** em `/sms/rede/` (SubNav: UBSs · Usuários · Recomendações · Banners)
- **`/sms/rede/banners/+page.svelte`** — CMS completo:
  - Formulário create/edit com 11 campos (título, corpo, tom, datas, imagem HTTPS, CTA label+url, prioridade, ativo)
  - Filtros: status (ativos/inativos/todos) + validade (não expirados/expirados/todos)
  - Lista visual com badges de tom (URGENTE/CAMPANHA/INFO/ATENÇÃO) + GLOBAL + INATIVO + EXPIRADO
  - Contador de visualizações inline
  - Validação client espelha backend (HTTPS, 3-80 chars, expiraEm > pub, etc.)
  - Botão "Banner GLOBAL" só visível para DEV
  - Confirmação de exclusão menciona perda de telemetria

### Contratos atualizados

- `backend/docs/types.ts` — `BannerTone`, `AdminBanner`, `CriarBannerRequest`, `AtualizarBannerRequest`
- `frontend/src/lib/api/types.ts` — mesmo delta
- `frontend/src/lib/api/client.ts` — 5 métodos novos no `AdminApi`: `listBanners`, `getBanner`, `createBanner`, `updateBanner`, `deleteBanner`

---

## [0.14.0] — 2026-05-28 · Etapa 5 · Dossiê médico (HARDENING LGPD/CFM)

Fecha §6 do `BACKEND_PENDENTES.md` 100%. Auditoria adversarial identificou
**15 brechas** no fluxo anterior. Foco em conformidade legal (CFM Res. 1.821/2007
art. 8º — rastreabilidade do prontuário por 20 anos) + UX rica (todos os campos
clínicos expostos).

### Adicionado

- **Enum `AcaoProntuario.LEITURA_DOSSIE`** — novo valor para audit CFM 20 anos
  quando paciente consulta seu prontuário
- **`shared/sanitizeText.ts`** — helper anti-XSS para texto free-form:
  - Strip de HTML tags brutos
  - Strip de control chars (preserva `\n`, `\t`)
  - Strip de zero-width Unicode (anti-smuggle)
  - Normaliza CRLF → LF + trim + cap 4000 chars
- **`DossieRateLimiter`** (`src/modules/paciente-app/infrastructure/`):
  - 120 req/15min/conta + 600 req/1h/conta + 1000 req/15min/IP
- **Middleware** `buildDossieRateLimitMiddleware` aplicado em todos os 4 endpoints
- **Audit dual em TODOS os endpoints** do Dossiê:
  - `auditoria_logs` (LGPD 5 anos): `DOSSIE_RESUMO_LIDO`, `DOSSIE_ATENDIMENTOS_LIDOS`,
    `DOSSIE_VACINAS_LIDAS`, `DOSSIE_EXAMES_LIDOS`
  - `paciente_prontuario_audit` (CFM 20 anos, imutável via trigger SQL):
    `LEITURA_DOSSIE` com `autorPapel: "PACIENTE · App"`
  - Audit é executado mesmo se paciente não tem PEC (rastreio de tentativas)
- **Paginação cursor** em atendimentos/vacinas/exames:
  - Query params `?cursor=<id>&limit=<N>` (default 50, max 100)
  - Response: `{ items, nextCursor }` (nextCursor null no fim da lista)
- **Campos clínicos completos** no payload:
  - `Atendimento`: 7 tipos enum (CONSULTA_MEDICA, ENFERMAGEM, VACINACAO, CURATIVO, ODONTOLOGICO, PROCEDIMENTO, ACOLHIMENTO) — não mais 5 do app
  - `VacinacaoDto.via` (INTRAMUSCULAR/ORAL/SUBCUTANEA/...) + `aplicadorNome`
  - `ExameDto.categoria` (LABORATORIAL/IMAGEM/FUNCIONAL/OUTROS) + `unidadeExecutora` + `resultadoStatus`
- **`DossieResumoDto.totalExames`** — antes contava só atendimentos/vacinas

### Mudado

- **`DossieResumoUseCase`** + **`DossieAtendimentosUseCase`** + **`DossieVacinacoesUseCase`** + **`DossieExamesUseCase`**:
  - Recebem `IAuditLogger` via DI
  - Aceitam `DossieAuditContext` (`{ contaId, cpfDigits, ip?, userAgent? }`)
  - `exec()` retorna `{ items, nextCursor }` para os 3 endpoints paginados
- **Enum mapping `_mapTipoAtendimento`** agora preserva os 7 valores do PEC (1:1).
  Fallback semântico para enum desconhecido (migração futura) — loga warn.
- **Sanitização aplicada em**: `queixaPrincipal`, `condutaResumida`, `localNome`,
  `profissionalNome`, `especialidade`, `alergias`, `condicoesCronicas`, `medicamentos`,
  `vacina/dose/lote/aplicador`, `exame.nome/solicitante/unidadeExecutora/observacao`
- **`_formatarMedicamento()`** trata `dosagem`/`frequencia` vazias (sem `undefined undefined`)
- **Flutter** `dossie_repository.dart` extrai `items` do wrapper (ou aceita List direto por compat)
- **Flutter** `dossie.dart` model atualizado: `Atendimento.tipoLabel` mapeia 7 enums →
  PT-BR. `Vacinacao` ganha `via` + `aplicadorNome`. `Exame` ganha `categoria` +
  `unidadeExecutora` + `resultadoStatus`. `DossieResumo` ganha `totalExames`.

### Validação

- `npm run typecheck` — 0 erros
- `npm run build` — 0 erros
- `npm run check` (frontend) — 0/0/0 em 619 files
- `flutter analyze` (Flutter app) — 0 erros
- **Smoke E2E Etapa 5** — **51/51 asserts** cobrindo:
  - Sanitização unit (8 casos: tags, control chars, zero-width, CRLF, null, trim)
  - Audit dual (LGPD + CFM) com payload rico (cpfMasked, totals, endpoint)
  - 7 tipos enum preservados sem perda semântica
  - Sanitização no payload real (`<script>` removido em queixa)
  - Paginação cursor (3 páginas: 3+3+1 = 7 itens, nextCursor null no fim)
  - Campos clínicos novos expostos (via, aplicadorNome, categoria, unidadeExecutora, resultadoStatus)
  - Medicamentos sem `undefined undefined`
  - `NAO_INFORMADO` → null tipoSanguineo
  - Rate limit estoura na 121ª req (cap 120/15min)
  - Sem PEC: audit LGPD ainda registra `encontrouPaciente: false`
- **Regressões preservadas**: Etapas 1, 2, 3, 4 — todos os smokes passam

### Contratos atualizados

- `backend/docs/types.ts` — `AtendimentoTipoApp` (7 valores), `PaginadoResult<T>`,
  `VacinacaoDto.via/aplicadorNome`, `ExameDto.categoria/unidadeExecutora/resultadoStatus`,
  `DossieResumoDto.totalExames`
- Flutter `lib/data/models/dossie.dart` — modelos sincronizados

---

## [0.13.0] — 2026-05-28 · Etapa 4 · UBS vinculada (schema completo + auto-bond + admin UI)

Fecha §7 do `BACKEND_PENDENTES.md` 100%. Auditoria adversarial identificou
**12 brechas** no fluxo anterior. Foco em UX rica para o paciente (campos de
contato/geo/horários reais) + LGPD/admin auditável.

### Adicionado

- **Schema `Ubs`** com 9 campos novos:
  - `bairro` (VarChar 120)
  - `cep` (VarChar 9, formato `00000-000`)
  - `telefone`, `whatsapp` (VarChar 20, dígitos puros)
  - `email` (VarChar 180, institucional)
  - `latitude`, `longitude` (Decimal(9,6) — precisão ~10cm)
  - `horarios` (Json estruturado: `{ segunda: { abre, fecha } | null, ... }`)
  - `observacoes` (Text, ≤500 chars)
- **`shared/ubsValidators.ts`** — helpers de validação:
  - `validarCep`, `normalizarCep`, `validarTelefoneBr`, `normalizarTelefone`
  - `validarEmail`, `validarLatitude`, `validarLongitude`, `validarHorarios`
  - `valOrThrow` (throw 422 padronizado)
- **`shared/scope` integration**: `CreateUbsUseCase` + `UpdateUbsUseCase` agora
  recebem `IAuditLogger` via DI + `AuditContext` no `exec()`
- **Audit log com snapshot antes/depois** em `EDITAR_UBS`:
  - `payload.antes` + `payload.depois` (todos os 16 campos)
  - `payload.camposAlterados` (lista de chaves alteradas, computável p/ delta)
- **Resumo automático de horários** em `ObterMinhaUbsUseCase`:
  - Detecta padrão "segunda-sexta com horário igual" → `"Segunda a Sexta · 07:00 às 17:00"`
  - Caso geral: lista dia a dia
- **Auto-bond `PacienteConta.ubsVinculadaId`** no `NotificacaoPacienteService`:
  - Quando paciente recebe a primeira notificação (criação de encaminhamento),
    `ubsVinculadaId` é populado automaticamente a partir de `Encaminhamento.ubsId`
  - Idempotente: se conta já tem vínculo, preserva (transferências informais)
  - Funciona tanto em `notificar()` quanto `notificarNaTransacao()`
- **Fallback persistido** em `ObterMinhaUbsUseCase`:
  - Se conta não tem `ubsVinculadaId`, descobre via último encaminhamento e
    **persiste** (best-effort, não bloqueia se falhar)

### Mudado

- **`CreateUbsUseCase`** aceita os 9 campos novos + valida cada um + catch P2002 → `UBS_DUPLICADA`
- **`UpdateUbsUseCase`** aceita PATCH com qualquer subset dos 16 campos + `null` para limpar
- **Zod schemas** `criarUbsSchema` e `atualizarUbsSchema` incluem todos os campos com limites:
  - Strings: max 9 (CEP) / 20 (telefone) / 120 (bairro) / 180 (email/nome) / 300 (endereço) / 500 (observações)
  - Números: lat/lng com range Zod min/max
  - Horários: `horariosFuncionamentoSchema` strict (apenas dias válidos + HH:MM regex)
- **`ObterMinhaUbsUseCase`** retorna campos reais persistidos (não mais hardcoded):
  - `bairro`, `cep`, `telefone`, `whatsapp`, `email`, `latitude`, `longitude`, `horarios`, `observacoes`
  - `horarios` estruturado (`Record<string, DiaHorario | null>`) + `horarioFuncionamento` texto resumido
- **Frontend admin** `EditarUbs.svelte` totalmente reescrito:
  - 6 seções: Identificação · Endereço · Contato · Geolocalização · Horários · Observações
  - Inputs com máscara client-side (CEP `00000-000`, telefone `(DD) DDDDD-DDDD`)
  - Validação client espelha backend (CEP 8 dígitos, lat/lng range, email regex, horário abre<fecha)
  - Editor de horários com checkboxes por dia + `<input type="time">` para abre/fecha
  - Detector de diff (só envia campos alterados) + contador "N campo(s) pendente(s)"

### Validação

- `npm run typecheck` — 0 erros
- `npm run build` — 0 erros
- `npm run check` (frontend) — 0/0/0 em 619 files
- `flutter analyze` (Flutter app) — 0 erros (regressão preservada)
- **Smoke E2E Etapa 4** — **57/57 asserts** cobrindo:
  - Validators unit (28 asserts: CEP, telefone, email, lat/lng, horários edge cases)
  - CREATE com todos os 9 campos novos + normalização (CEP, telefone, email lowercase)
  - Audit CRIAR_UBS gravado com `camposPreenchidos`
  - Latitude > 90 rejeitada com `VALIDATION_ERROR`
  - CEP curto rejeitado com `VALIDATION_ERROR`
  - UPDATE com snapshot antes/depois (telefone "7532010000" → "7532019999")
  - Race CREATE com CNES duplicado → P2002 capturado → `UBS_DUPLICADA`
  - Auto-bond: `NotificacaoPacienteService` popula `ubsVinculadaId` automaticamente
  - `ObterMinhaUbsUseCase` retorna campos reais (não hardcoded)
  - Resumo de horários gerado para horários não-uniformes
- **Regressões preservadas**: Etapas 1, 2, 3 — todos os smokes anteriores passam

### Contratos atualizados

- `backend/docs/types.ts` — interfaces `DiaHorario`, `HorariosFuncionamento`,
  `Ubs` com 9 campos novos, `CriarUbsRequest`, `AtualizarUbsRequest`
- `frontend/src/lib/api/types.ts` — mesmo delta (cópia versionada)

### Variáveis de ambiente

Nenhuma nova.

---

## [0.12.1] — 2026-05-28 · Patches adversariais (Etapas 1, 2, 3 → 100% perfeitas)

Auditoria adversarial pós-Etapa 3 identificou **4 brechas residuais**. Esta release
fecha todas, com smokes estendidos cobrindo cada uma.

### Corrigido — Etapa 2 (Race no token consumption)

`RedefinirSenhaPacienteUseCase` tinha race condition: `findUnique` fora da transação
permitia que 2 requests simultâneos com o mesmo token ambos passassem os checks de
`usadoEm`/`expiraEm`, e ambos chegavam no `$transaction`. Resultado: senha trocada
2x (hashes diferentes, último vence), audit `_OK` gravado 2x.

**Fix**: `update` do token agora usa `WHERE { id, usadoEm: null }` (check-and-set atômico).
Se outro request consumiu, o `updateMany` retorna `count: 0` → throw interno `_TokenRaceError`
→ resposta `TOKEN_JA_USADO` + audit `REDEFINIR_SENHA_TOKEN_RACE_DETECTADA`.

### Corrigido — Etapa 1 (Race no CREATE de recomendação)

`CriarRecomendacaoUseCase` e `AtualizarRecomendacaoUseCase` faziam `findUnique → create/update`
sem proteção contra race. UNIQUE constraint pegava o segundo com erro `P2002`, mas o
handler middleware traduzia pra erro genérico.

**Fix**: catch específico de `Prisma.PrismaClientKnownRequestError` com `code === 'P2002'`
→ throw `Conflict('ESPECIALIDADE_DUPLICADA')`. Usuário vê mensagem amigável.

### Adicionado — Etapa 3 (Audit CFM 20 anos em paciente_prontuario_audit)

Download de anexo médico só ia em `auditoria_logs` (LGPD 5 anos). CFM Res. 1.821/2007
art. 8º exige rastreabilidade de acesso ao prontuário por **20 anos**.

**Fix**: `DownloadAnexoPacienteUseCase._auditCfm()` adiciona dual-write em
`paciente_prontuario_audit` para downloads bem-sucedidos:
- `acao: DOWNLOAD_ANEXO` (novo valor no enum `AcaoProntuario`)
- `pacienteId` (do encaminhamento, FK), `autorId` (contaId do paciente)
- `autorPapel: "PACIENTE · App"`
- `dados`: `{ anexoNome, mimeType, size, sha256, cpfMasked }`
- Append-only protegido por trigger SQL (UPDATE/DELETE bloqueados — verificado no smoke)
- Falha no audit CFM **não** quebra o download (`try/catch` + log de erro)

### Adicionado — Etapa 2 (CSP defesa em profundidade nas telas web)

Telas SvelteKit `/redefinir` e `/recuperar-senha-paciente` confiavam apenas em CSP
do Caddy em prod. Em DEV (sem proxy reverso) ficava sem CSP.

**Fix**: meta tag `<meta http-equiv="content-security-policy">` em ambas as telas:
- `default-src 'self'` + `script-src 'self'` (bloqueia inline/eval externo)
- `connect-src 'self' http://localhost:3333 https://*.aguasbelas.pe.gov.br`
- `form-action 'self'` + `frame-ancestors 'none'` + `object-src 'none'`
- `<meta name="referrer" content="no-referrer">` para não vazar URL com token via Referer

### Mudado

- `enum AcaoProntuario` ganhou valor `DOWNLOAD_ANEXO` (`prisma/schema.prisma`)
- `db push` aplicado (sem migration versionada — mesmo padrão das releases anteriores)
- `_TokenRaceError` (sentinela interna, não exportada) adicionada em `RedefinirSenhaPacienteUseCase`
- `_isUniqueViolation(err)` helper exportado em `RecomendacoesEspecialidadeUseCases.ts`

### Validação

- `npm run typecheck` — 0 erros
- `npm run build` — 0 erros
- `npm run check` (frontend) — 0/0/0 em 619 files
- **Smoke E2E Etapa 1** — 18 asserts originais + 2 novos (race CREATE) = **20/20**
- **Smoke E2E Etapa 2** — 36 asserts originais + 4 novos (race token) = **40/40**
- **Smoke E2E Etapa 3** — 31 asserts originais + 9 novos (CFM dual + trigger) = **40/40**
- Todas as regressões preservadas

---

## [0.12.0] — 2026-05-28 · Etapa 3 · Download de anexos (HARDENING LGPD)

Fecha §8 do `BACKEND_PENDENTES.md` 100%. Auditoria adversarial identificou
**15 brechas** no fluxo anterior. Foco em conformidade LGPD/CFM + segurança:
**audit imutável de cada acesso a dado médico, path traversal guard, headers
seguros, rate limit, sanitização RFC 5987/6266**.

### Adicionado (Backend)

- **`DownloadAnexoPacienteUseCase`** (`src/modules/paciente-app/application/use-cases/`)
  - Isola I/O do controller (Clean Arch) + injeta `IAuditLogger`
  - Path traversal guard: `path.relative(uploadDir, candidato)` + checa `..`/abs
  - Stat async via `fs.promises.stat` (não bloqueia event loop)
  - Retorna descritor (`absolutePath`, `filename`, `mimeType`, `size`, `sha256`)
- **`DownloadAnexoRateLimiter`** (`src/modules/paciente-app/infrastructure/`)
  - 60 req/15min/conta + 200 req/1h/conta + 300 req/15min/IP (Redis sliding)
- **Middleware** `buildDownloadAnexoRateLimitMiddleware` (autenticado, lê `req.pacienteAuth!.contaId`)
- **`shared/contentDisposition.ts`** — `buildContentDisposition(filename)`:
  - ASCII-safe fallback (`filename="..."`) + RFC 5987 (`filename*=UTF-8''...`)
  - Strip de CR/LF (anti header injection), aspas, controle, non-ASCII
  - Limite 200 chars preservando extensão
- **Audit log LGPD** para AnexoDocumento em TODOS os caminhos:
  - `DOWNLOAD_ANEXO_PACIENTE_OK | _NAO_EXISTE | _FORA_DO_ESCOPO |`
  - `_NAO_LIBERADO | _PATH_TRAVERSAL | _ARQUIVO_SUMIU | _NAO_E_ARQUIVO`
  - Todos com `contaId`, `cpfMasked` (4 dígitos), IP, UA, `encId` quando aplicável

### Adicionado (Flutter app paciente)

- **`AnexoDownloadService`** (`lib/core/services/anexo_download_service.dart`)
  - Pede permissão Android (`WRITE_EXTERNAL_STORAGE` só em SDK ≤ 28, scoped storage em A10+)
  - Pede `POST_NOTIFICATIONS` (Android 13+)
  - HTTP GET com `responseType: stream` + `onReceiveProgress` (progress bar real)
  - `CancelToken` para cancelamento pelo usuário
  - Extrai filename do `Content-Disposition` (`filename*=UTF-8''` ou `filename="..."`)
  - Atomic move: `.part` → filename final (sanitizado pra path local)
  - Mapeia `DioException` → `ApiException` tipada (404, 409, 429, timeout, cancel, etc.)
  - Salva em `getApplicationDocumentsDirectory()/anexos/<filename>`
- **`DownloadProgress`** + **`AnexoBaixado`** value objects
- **`EncaminhamentoAnexosPage`** refatorado:
  - Dialog modal com `LinearProgressIndicator` real (do `Content-Length`) + botão cancelar
  - Error handling rico (mensagens humanas para cada code)
  - `OpenFilex.open(path, type: mimeType)` + fallback "Compartilhar" quando sem app
- **`pubspec.yaml`**: `permission_handler ^11.3.1` + `device_info_plus ^11.2.0`
- **`AndroidManifest.xml`**: declara `INTERNET`, `ACCESS_NETWORK_STATE`,
  `POST_NOTIFICATIONS`, `WRITE_EXTERNAL_STORAGE` (maxSdkVersion=28),
  `usesCleartextTraffic="false"`

### Mudado

- **`getDownloadAnexo`** controller agora:
  - Delega ao `DownloadAnexoPacienteUseCase` (no use case toda lógica de escopo+audit+guard)
  - Emite headers seguros:
    - `Content-Type` do anexo
    - `Content-Length` (progress no cliente)
    - `Content-Disposition` via `buildContentDisposition` (RFC 5987 + ASCII fallback)
    - `Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0`
    - `Pragma: no-cache` + `Expires: 0`
    - `X-Content-Type-Options: nosniff`
    - `X-Robots-Tag: noindex, nofollow`
    - `ETag: "sha256-<hash>"` quando disponível
  - Stream error handling: `stream.on('error')` → resposta JSON se headers não foram
  - Cleanup em `req.aborted` (cliente desconectou) + `res.on('close')`
- **`EncaminhamentoRepository.baixarAnexo`** assinatura mudou:
  - Antes: `Future<String>` (só path)
  - Agora: `Future<AnexoBaixado>` (path + filename real + mime + tamanho)
  - Aceita `onProgress` + `cancelToken`

### Validação

- `npm run typecheck` (backend) — 0 erros
- `tsc -p tsconfig.json` (build) — 0 erros
- `npm run check` (frontend SvelteKit) — 0/0/0 em 619 files
- `flutter analyze` (Flutter app) — 0 erros (24 infos pré-existentes em outros arquivos)
- `scripts/smoke-test-etapa3.ts` — **31/31 asserts** cobrindo:
  - Brecha 1: rate limit conta estoura na 61ª req + IP na 301ª (exatos)
  - Brecha 2: audit em 7 caminhos (OK + 6 falhas — todos com contaId, cpfMasked, IP, UA)
  - Brecha 6: path traversal (`../../../etc/passwd`) bloqueado + audit `_PATH_TRAVERSAL` crítico
  - Brecha 7: Content-Disposition RFC 5987 (`Relatório clínico (2026) ção.pdf` codificado certo);
    sanitização CR/LF, aspas, e RFC 5987 escapa `'()` corretamente
  - ClamAV gate: PENDENTE bloqueia + audit
  - Arquivo sumiu (DB ≠ disco) → audit + 404
  - Escopo: anexo de OUTRO paciente → 404 anti-enum + audit `_FORA_DO_ESCOPO`

### Variáveis de ambiente

Nenhuma nova (`UPLOAD_DIR` já existia).

---

## [0.11.0] — 2026-05-27 · Etapa 2 · Recuperação de senha (HARDENING COMPLETO)

Fecha §3 do `BACKEND_PENDENTES.md` 100%, com auditoria adversarial e fechamento
de **10 brechas** identificadas no fluxo anterior. Foco em produção:
**anti DDoS, anti brute force, anti enumeration, anti timing-attack, conformidade LGPD**.

### Adicionado

- **`PasswordRecoveryRateLimiter`** — `src/modules/paciente-app/infrastructure/`
  - 3 camadas de defesa por Redis (com fallback in-memory):
    - `esqueci-senha`: 5 req/15min/IP + 100 req/1h/IP + 3 req/1h/CPF
    - `redefinir-senha`: 10 req/15min/IP + 30 req/1h/IP
    - genérico Face 3 (login, ativar): 30 req/15min/IP
  - Estoura → `429 RATE_LIMIT_EXCEDIDO` com mensagem pt-BR
- **Middleware Express** `buildFace3RateLimitMiddlewares` — aplicado nas rotas
  públicas da Face 3 (`/auth/login`, `/auth/ativar-conta`, `/auth/esqueci-senha`,
  `/auth/redefinir-senha`). Defesa em profundidade + use case ainda checa.
- **`RecoveryTokenPurgeCron`** — `node-cron` rodando a cada 6h (env `RECOVERY_PURGE_CRON`)
  + catch-up no boot. Deleta tokens expirados/usados há mais de 24h (grace).
  Audit log `PURGE_RECOVERY_TOKENS` em cada execução com deletados.
- **`shared/cpf.ts`** — `isCpfValido()` com checksum mod-11 + bloqueio de CPFs triviais.
- **`shared/senhaForte.ts`** — `validarSenhaForte()` bloqueia: < 8 chars, numérica pura,
  sequências comuns (12345678, password etc.), CPF como senha, caractere repetido.
- **Audit log granular** em TODOS os caminhos do fluxo de recuperação:
  - Esqueci: `_OK | _CPF_INVALIDO | _CPF_NAO_EXISTE | _CONTA_INATIVA | _SEM_EMAIL | _THROTTLED | _THROTTLED_DB`
  - Redefinir: `_OK | _TOKEN_NAO_EXISTE | _TOKEN_JA_USADO | _TOKEN_EXPIRADO | _TOKEN_MALFORMADO | _SENHA_FRACA | _SENHA_IGUAL_ATUAL`
  - Todos com `cpfMasked` (4 dígitos), `ip`, `userAgent`, `contaId` se descoberto
- **Tela web `/redefinir`** (SvelteKit) — paciente clica no link do email e cai aqui.
  Validação client-side espelha o backend (`validarSenhaForte`), mostra senha, confirma.
- **Tela web `/recuperar-senha-paciente`** — paciente solicita reset por CPF do browser.
- **Cliente HTTP**: `api.pacienteApp.esqueciSenhaPaciente()` + `redefinirSenhaPaciente()`
  no `frontend/src/lib/api/client.ts` e cópia em `backend/docs/api-client.ts`.

### Mudado

- **`EsqueciSenhaPacienteUseCase`**:
  - Aceita `AuditContext` (ip, userAgent) + `IAuditLogger` + `PasswordRecoveryRateLimiter` via DI.
  - **Timing-constant** — `MIN_MS = 120ms` mínimo de processamento, e `bcrypt.compare` dummy
    quando conta não existe (anti timing-attack).
  - Validação CPF via checksum antes de qualquer query.
  - Token: 32 bytes hex (256 bits) via `crypto.randomBytes(32)`.
- **`RedefinirSenhaPacienteUseCase`**:
  - Aceita `AuditContext` + `IAuditLogger` + `PasswordRecoveryRateLimiter` via DI.
  - **Invalida TODOS os outros recovery tokens ativos** da conta ao redefinir (anti dual-use).
  - Aplica `validarSenhaForte` (substituindo `len >= 8` simples).
  - Sanity check de token (32-128 hex chars) antes de query (anti malformed).
- **Schema Zod do `/redefinir-senha`** — token aceita só `[a-f0-9]{32,128}` (regex).
- **Rotas Face 3** — `buildPacienteAppRoutes` agora recebe `PasswordRecoveryRateLimiter` e
  monta middlewares de rate limit em todos os endpoints públicos.

### Validação

- `npm run typecheck` (backend) — 0 erros
- `tsc -p tsconfig.json` (build) — 0 erros
- `npm run check` (frontend) — 0/0/0 em 619 files (4 novos: 2 rotas + 2 contratos)
- `scripts/smoke-test-etapa2.ts` — **36/36 asserts** cobrindo as 10 brechas:
  - Brecha 1: rate limit IP estoura na 6ª tentativa (esperado)
  - Brecha 2: audit em CPF_INVALIDO, CHECKSUM, OK, THROTTLED, TOKEN_JA_USADO, TOKEN_EXPIRADO
  - Brecha 3: purge cron deleta 1 expirado + 1 usado, preserva token recente
  - Brecha 5: CPF "11111111111" + "12345678900" rejeitados; válido aceito
  - Brecha 6: "12345678", "password", "abc", CPF, "aaaaaaaa" todos rejeitados
  - Brecha 7: timing >= 120ms para CPF inexistente
  - Brecha 8: redefinir invalida 2 outros tokens ativos (audit registra `outrosTokensInvalidados=2`)
  - Brecha 9: genérico Face 3 estoura na 31ª (30 max)
  - Brecha 10: redefinir-senha rate limit estoura na 11ª (10 max)

### Contratos atualizados

- `backend/docs/api-client.ts` + `frontend/src/lib/api/client.ts` — 2 métodos novos:
  `esqueciSenhaPaciente(cpf)` + `redefinirSenhaPaciente(token, novaSenha)`
- `backend/docs/types.ts` — não houve mudança (endpoints já existiam, só hardening)

### Variáveis de ambiente novas

- `RECOVERY_PURGE_CRON` (default `0 */6 * * *`) — cron expr de purga
- `RECOVERY_PURGE_CRON_TZ` (default `UTC`)
- `APP_RESET_SENHA_URL` (default `https://app.unisism.aguasbelas.pe.gov.br/redefinir`)

---

## [0.10.2] — 2026-05-27 · Etapa 1 · Fechamento de 3 brechas conscientes

Patch da v0.10.1 que elimina as **3 brechas conscientes** identificadas em auditoria
adversarial: heurística de cidade, normalização de acento, e audit log do admin.
**Etapa 1 = 100% perfeita, sem trade-offs documentados.**

### Adicionado

- **`cidadeAgendamento` + `ufAgendamento`** em `Encaminhamento` (campos persistidos)
  - Schema: 2 colunas novas no `encaminhamento` (`String?` e `Char(2)?`)
  - `AprovarRequest` aceita os 2 campos (validação UF: 2 chars maiúsculos → 422 `UF_INVALIDA`)
  - Form `AprovarEncaminhamento.svelte` ganha 2 inputs (cidade + UF lado a lado)
  - Tela de detalhe (`/sms/encaminhamento/[id]`) exibe "Cidade · Nome/UF" no bloco verde
- **Audit log em CRUD admin** de `EspecialidadeRecomendacao`:
  - `CRIAR_RECOMENDACAO_ESPECIALIDADE` — payload: especialidade, qtd, recomendacoes
  - `ATUALIZAR_RECOMENDACAO_ESPECIALIDADE` — payload: snapshot antes/depois + camposAlterados
  - `DELETAR_RECOMENDACAO_ESPECIALIDADE` — payload: especialidade + recomendacoes deletadas
  - Todos com `atendenteId`, `ip`, `userAgent` rastreáveis

### Mudado

- `podeSolicitarTfd` agora compara **`cidadeAgendamento` EXPLÍCITA** (campo persistido) com `Ubs.municipio` — não mais heurística de substring sobre `localAgendamento`. Comparação canônica (lowercase + sem acento via NFD). Sem `cidadeAgendamento`: fallback `true` (UI mostra CTA).
- `_buscarRecomendacoes()` agora **normaliza acento** via `String.normalize('NFD').replace(/[U+0300-U+036F]/g, '')`. "Cardiología" agora bate em "Cardiologia". Estratégia: 1 query `WHERE ativo=true` + dedupe canônico no app (universo pequeno ≤ 50 itens).
- `CriarRecomendacaoUseCase`/`AtualizarRecomendacaoUseCase`/`DeletarRecomendacaoUseCase` recebem `IAuditLogger` via construtor + aceitam `AuditContext` (`atendenteId`, `ip?`, `userAgent?`) no `exec()`.
- `RecomendacoesController` extrai `_auditCtx(req)` de `req.auth.sub`/`req.ip`/`req.header('user-agent')`.
- `container.ts` injeta `audit` (PrismaAuditLogger) nos 3 use cases CRUD.

### Validação

- `npm run typecheck` (backend) — 0 erros
- `tsc -p tsconfig.json` (build) — 0 erros
- `npm run check` (frontend) — 0/0/0 em 615 files
- `scripts/smoke-test-etapa1.ts` — **18/18 asserts** (11 anteriores + 7 novos cobrindo as 3 brechas):
  - Brecha 1: `cidadeAgendamento=Recife/PE` round-trip + comparação canônica "ÁGUAS belas" ≡ "Águas Belas"
  - Brecha 2: especialidade "Cardiología" (com acento) bate em "Cardiologia" do seed
  - Brecha 3: 3 audit logs gravados (CRIAR/UPDATE/DELETE) com atendenteId, IP e snapshot antes/depois no UPDATE

### Contratos atualizados

- `backend/docs/types.ts` — `Encaminhamento.cidadeAgendamento?` + `ufAgendamento?` + `AprovarRequest.cidadeAgendamento?` + `ufAgendamento?`
- `frontend/src/lib/api/types.ts` — mesmo delta (cópia versionada)

---

## [0.10.1] — 2026-05-27 · Etapa 1 (Campos Encaminhamento — FECHADA 100%)

Primeira etapa do roadmap pós-0.10.0. **Fecha 100% os 6 campos novos no
Encaminhamento que o app paciente espera**.

### Implementado

#### Backend

- `AprovarEncaminhamentoUseCase` aceita `localAgendamento` (≤300 chars) +
  `profissionalAgendado` (≤200 chars), persistidos no model. Aprovação limpa
  `motivoRejeicao` residual.
- `RejeitarEncaminhamentoUseCase` persiste `motivoRejeicao` flat (espelha timeline).
- `ListarMeusEncaminhamentosUseCase` (paciente-app) com 3 derivações reais:
  - `pendenciasAbertas`: conta `PENDENCIA_REGISTRADA` abertas/fechadas na timeline
  - `podeSolicitarTfd`: status=APROVADO + agendamento futuro + cidade ≠ UBS
  - `recomendacoes`: JOIN case-insensitive com `EspecialidadeRecomendacao`
- Novo model `EspecialidadeRecomendacao` + 15 especialidades seedadas
  (`npm run db:seed-recomendacoes`)
- 5 endpoints CRUD admin: `/v1/admin/recomendacoes-especialidade/*` (DEV/ADMIN/REGULADOR_SMS)

#### Frontend SvelteKit (Face 2)

- `AprovarEncaminhamento.svelte` ganha 2 inputs (local + profissional)
- Detail page mostra "Sua consulta" rico + "Motivo da rejeição"
- Nova rota `/sms/rede/recomendacoes` — CRUD completo
- Tipos + cliente HTTP atualizados

#### App Flutter

- Sem mudança no código — campos chegam preenchidos via adapter já existente

### Validações executadas

- `npm run typecheck` (backend): **0 erros**
- `npm run check` (frontend SvelteKit, 615 arquivos): **0 erros · 0 warnings**
- `flutter analyze` (app paciente): **0 erros** (20 infos de estilo, irrelevantes)
- `scripts/smoke-test-etapa1.ts`: **11/11 asserts passaram**
  - 4 cenários (APROVADO+detalhes / REJEITADO+motivo / PENDENCIA / APROVADO mesma cidade)
- HTTP fim-a-fim contra backend rodando: 4/4 encaminhamentos retornam shape esperado

### Schema delta

- `encaminhamentos.localAgendamento` (text nullable)
- `encaminhamentos.profissionalAgendado` (text nullable)
- `encaminhamentos.motivoRejeicao` (text nullable)
- `encaminhamentos.recomendacoes` (jsonb nullable — reservado pra override por enc)
- Novo `especialidade_recomendacoes` (id, especialidade UNIQUE, recomendacoes jsonb, ativo, criadoPorId, timestamps)

### Como rodar

```bash
cd backend
npx prisma db push
npm run db:seed-recomendacoes
npm run dev
# Smoke test: npx ts-node-dev --transpile-only scripts/smoke-test-etapa1.ts
```

---

## [0.10.0] — 2026-05-27 · Face 3 · App do Paciente — 12 endpoints novos

### 🎯 O que mudou

Implementou **todos os pendentes** do `UNISISM-Paciente/BACKEND_PENDENTES.md`
exceto refresh token (pulado propositalmente). O app paciente Flutter agora
fala 100% com backend real — todas as telas funcionam contra `/v1/paciente-app/*`.

Spec autoritativa: [`docs/PACIENTE_APP_API.md`](PACIENTE_APP_API.md).

### Adicionado · 12 endpoints novos sob `/v1/paciente-app/*`

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/esqueci-senha` | Envia link de reset por email (TTL 30min, rate limit 3/h) |
| POST | `/auth/redefinir-senha` | Conclui reset com token + nova senha |
| POST | `/me/fcm-token` | Registra token FCM (UPSERT por token) |
| DELETE | `/me/fcm-token` | Revoga (logout) |
| GET | `/ubs/minha` | UBS vinculada (com fallback via último encaminhamento) |
| GET | `/dossie/resumo` | Resumo clínico (lê do PEC) |
| GET | `/dossie/atendimentos` | Histórico de atendimentos |
| GET | `/dossie/vacinacoes` | Carteira de vacinação |
| GET | `/dossie/exames` | Histórico de exames |
| GET | `/banners` | Lista banners ativos da SMS |
| GET | `/banners/:id` | Detalhe |
| POST | `/banners/:id/visto` | Telemetria |
| GET | `/tfd/viagens` | Viagens TFD disponíveis (filtro por prefeitura) |
| GET | `/tfd/viagens/:id` | Detalhe |
| GET | `/tfd/solicitacoes` | Minhas solicitações |
| GET | `/tfd/solicitacoes/:id` | Detalhe |
| POST | `/tfd/solicitacoes` | Solicitar vaga (prioridade derivada no servidor) |
| DELETE | `/tfd/solicitacoes/:id` | Cancelar (só status=AGUARDANDO) |

### Alterado · `GET /meus-encaminhamentos`

Cada item agora inclui:
- `localAgendamento` (string?) — local da consulta
- `profissionalAgendado` (string?) — médico + CRM
- `motivoRejeicao` (string?) — motivo flat (espelha timeline REJEITADO)
- `recomendacoes` (string[]) — "o que levar no dia"
- `pendenciasAbertas` (int, derivado) — `1` se status=PENDENCIA_DOCUMENTO
- `podeSolicitarTfd` (bool, derivado) — `true` se APROVADO com agendamento futuro

### Adicionado · schema (Prisma)

- `Encaminhamento.{localAgendamento, profissionalAgendado, motivoRejeicao, recomendacoes}`
- `PacienteConta.ubsVinculadaId` (FK opcional para `Ubs`)
- Novo model `PacienteRecoveryToken` (token reset + TTL 30min)
- Novo model `PacienteDispositivo` (FCM token, plataforma, UNIQUE por token)
- Novo enum `PlataformaPush` (ANDROID | IOS)
- Novo model `SmsBanner` (titulo, corpo, tone, expira, prefeituraId opcional)
- Novo model `SmsBannerView` (telemetria 1 view/banner/paciente)
- Novo enum `BannerTone` (URGENTE | CAMPANHA | INFO | ATENCAO)
- Novo model `TfdPacienteSolicitacao` (pedidos de vaga via app)
- Novo enum `TfdPacienteStatus` (AGUARDANDO | APROVADA | RECUSADA | CANCELADA | EMBARCADA | CONCLUIDA)
- Novo enum `TfdPacientePrioridade` (NORMAL | PRIORITARIA | URGENTE)

### App Flutter

- `EncaminhamentoRepository.baixarAnexo()` → método novo + UI `OpenFilex` + `Share`
- Todos os `*RepositoryHttp` removeram `NOT_IMPLEMENTED` e chamam endpoints reais
- `AuthRepositoryHttp.registrarDispositivo` agora faz POST real (silencioso em falha)
- `AuthRepositoryHttp.esqueciSenha` / `redefinirSenha` chamam backend real

### Não implementado (decisão explícita)

- **Refresh token rotativo** (§9): pulado propositalmente. Sessão de 24h sem refresh
  é aceitável — cidadão re-loga em segundos quando vence. Implementar requer refactor
  significativo + risco de token-replay attacks.
- **Worker FCM dispatcher** (firebase-admin): backend persiste tokens mas não despacha
  push real ainda. App segue funcionando via polling/refresh manual.
- **CMS admin de banners**: criação via SQL/Prisma Studio até a UI ser construída.

---

## [0.9.1] — 2026-05-26 · Face 4 · Role ATENDENTE_TFD (terminal rodoviário)

### 🎯 O que mudou

Novo role `ATENDENTE_TFD` para operar o "terminal rodoviário" — cadastrar
solicitações de viagem TFD em nome dos pacientes. Modelo dos 3 níveis TFD
agora completo:

| Role | Escopo | Responsabilidade |
|---|---|---|
| `GESTOR_TFD` | Prefeitura | tudo (frota, motoristas, aprovar, viagens, abastecimento, ajudas) |
| **`ATENDENTE_TFD`** (novo) | Prefeitura | apenas cadastra solicitações de viagem + anexa comprovantes |
| `MOTORISTA_TFD` | App mobile próprio | vê suas viagens + chamada de passageiros |

### Adicionado

- `RoleAtendente.ATENDENTE_TFD` (enum value, idempotente em
  `prisma/sql/motorista-app-backfill.sql`)
- `shared/scope.ts` — `ATENDENTE_TFD` resolve como escopo `PREFEITURA`
- `CreateUsuarioUseCase` — switch agora cobre os 3 roles TFD:
  - `GESTOR_TFD` e `ATENDENTE_TFD` → exigem `prefeituraId`
  - `MOTORISTA_TFD` → bloqueado com `422 ROTA_INCORRETA_MOTORISTA`
    (usar `POST /v1/tfd/motoristas` que cria operador + senha provisória atomicamente)

### Alterado · permissões de rota

- `tfd.routes.ts` · `rwSolic` agora inclui `ATENDENTE_TFD`:
  - `GET /v1/tfd/solicitacoes`
  - `POST /v1/tfd/solicitacoes`
  - `GET /v1/tfd/solicitacoes/:id`
  - `POST /v1/tfd/solicitacoes/:id/anexos`
  - `GET /v1/tfd/anexos/:id/download`
- `GET /v1/admin/ubs` agora aceita também `GESTOR_TFD` e `ATENDENTE_TFD`
  (popular select de UBSs no form de solicitação)
- Todas as outras rotas `/v1/tfd/*` (viagens, motoristas, abastecimento, saldo,
  ajudas, auditoria, aprovar/negar solicitação) continuam `rwGestor`/`rwAdmin`

### Documentação

- Novo: [`docs/TFD_ATENDENTE_API.md`](TFD_ATENDENTE_API.md) — guia de bolso
  pro frontend "Terminal Rodoviário" (rotas permitidas, fluxo de cadastro,
  erros comuns, sugestões de UI)
- [`docs/TFD_API.md`](TFD_API.md) `§3 RBAC` precisa ser atualizado pra incluir
  ATENDENTE_TFD (TODO no doc principal — referenciar TFD_ATENDENTE_API.md)

### Para o frontend admin

UI de "Criar Usuário" pode oferecer agora 7 opções de role:
`DESENVOLVEDOR | ADMIN | REGULADOR_SMS | GESTOR_TFD | ATENDENTE_TFD |
COORDENADOR_UBS | ATENDENTE_UBS`. MOTORISTA_TFD é criado via `POST /v1/tfd/motoristas`.

### Para o frontend Terminal Rodoviário

Novo projeto sugerido: `/tfd-terminal/*` — UI minimalista de 4 telas
(dashboard / nova solicitação / lista / detalhe). Ver
[`docs/TFD_ATENDENTE_API.md`](TFD_ATENDENTE_API.md) §"Frontend sugerido".

---

## [0.9.0] — 2026-05-26 · Face 4 mobile · App do Motorista

### 🎯 O que mudou

Novo módulo **`motorista-app`** análogo ao `paciente-app`: o app Flutter
[`UNISISM-motorista`](https://github.com/...) agora tem 12 endpoints sob
`/v1/motorista-app/*` para o motorista TFD operar viagens direto do celular
(offline-first com sync incremental + push FCM).

Spec completa: [`docs/MOTORISTA_APP_API.md`](MOTORISTA_APP_API.md).

### Adicionado · novos endpoints (`/v1/motorista-app/*`)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/login` | matrícula + senha → JWT 30d |
| POST | `/auth/trocar-senha` | forçado no 1º login |
| POST | `/auth/logout` | limpa fcmToken + audit |
| GET | `/auth/me` | perfil completo do motorista |
| GET | `/minhas-viagens?desde=&status=&limit=` | sync incremental |
| GET | `/viagens/:id` | detalhe (filtro automático motoristaId) |
| POST | `/viagens/:id/iniciar` | hodômetro inicial + validações (CNH/veículo/status) |
| POST | `/viagens/:id/concluir` | hodômetro final + atualiza totals |
| POST | `/viagens/:id/passageiros/:pid/presenca` | chamada digital |
| GET | `/ajudas-custo` | read-only (filtro: viagens do motorista) |
| POST | `/me/fcm-token` | registra token push |
| DELETE | `/me/fcm-token` | revoga (no logout) |

### Adicionado · schema (Prisma)

- `RoleAtendente.MOTORISTA_TFD` (novo valor de enum)
- `MotoristaTFD.atendenteId` (1:1 com `Atendente`, UNIQUE)
- `MotoristaTFD.primeiroLogin` (Boolean default true)
- `MotoristaTFD.fcmToken` (String?)
- `ViagemFrota.atualizadoEm` (DateTime @updatedAt — cursor sync incremental)
- `ViagemFrota` ganha `@@index([motoristaId, atualizadoEm])`
- `Atendente` ganha relação inversa `motoristaTfd MotoristaTFD?`
- 5 novos valores em `AcaoAuditoriaTFD`: `MOTORISTA_LOGIN`, `MOTORISTA_LOGOUT`,
  `MOTORISTA_TROCOU_SENHA`, `FCM_TOKEN_REGISTRADO`, `FCM_TOKEN_REVOGADO`
- `AccessTokenPayload` (JWT) ganha campos opcionais `motoristaId` e `primeiroLogin`

### Adicionado · infra

- Middleware global `serverTime` adiciona header `X-Server-Time: <ISO>` em
  toda resposta GET (cursor do sync incremental)
- Middleware `authenticateMotorista` valida JWT + role + status do motorista
  + Atendente vinculado (snapshot autoritativo a cada request)
- Middleware `bloquearPrimeiroLogin` retorna `403 PRIMEIRO_LOGIN_PENDENTE`
  em rotas protegidas quando `motorista.primeiroLogin=true`
- `JwtTokenService.assinarAccess` aceita `ttlSecondsOverride` para emitir
  tokens de 30 dias específicos do app mobile

### Alterado · `POST /v1/tfd/motoristas` (gestor)

Agora **cria automaticamente** o `Atendente` vinculado (role=MOTORISTA_TFD)
com senha provisória = últimos 8 dígitos do CPF. O response ganha 2 novos
campos:

```json
{
  "...campos existentes...": "...",
  "matricula": "MOT-345678",        // NOVO
  "senhaProvisoria": "12345678"     // NOVO — devolvida UMA vez; gestor entrega pessoalmente
}
```

> ⚠️ **Frontend gestor** (`/tfd/motoristas/nova`): mostrar essa senha numa
> tela de "credenciais provisórias" com botão de copiar e aviso "anote agora,
> não será mostrada de novo". Não persistir no localStorage.

### Adicionado · script + SQL de backfill

Para motoristas pré-existentes (criados antes da v0.9.0):

```bash
npm run db:backfill-motoristas
```

O script `scripts/backfill-motoristas.ts`:
1. Aplica `prisma/sql/motorista-app-backfill.sql` (idempotente — ALTER TABLEs
   + INSERT esqueleto Atendente)
2. Faz bcrypt(últimos 8 dígitos do CPF) pra cada Atendente novo
3. Imprime tabela `{matricula, senhaProvisoria, motorista}` pra entrega física

### Códigos de erro novos

`MATRICULA_OU_SENHA_INVALIDA`, `PRIMEIRO_LOGIN_PENDENTE`, `MOTORISTA_INATIVO`,
`CNH_VENCIDA`, `VEICULO_INDISPONIVEL`, `MOTORISTA_INDISPONIVEL`,
`HODOMETRO_INVALIDO`, `OBSERVACAO_OBRIGATORIA`, `STATUS_INVALIDO`,
`SENHA_FRACA`, `SENHA_IGUAL`, `SENHA_ATUAL_INVALIDA`, `ROLE_NAO_PERMITIDO`,
`VIAGEM_NAO_ENCONTRADA`, `PASSAGEIRO_NAO_ENCONTRADO`, `PAYLOAD_INVALIDO`.

### Auditoria

Toda mutação do motorista entra na **mesma cadeia hash TFD**
(`tfd_audit_log`) com `operadorRole='MOTORISTA_TFD'` e `operadorId=atendenteId`
do motorista. A verificação da cadeia (`verificarCadeiaTfd`) continua íntegra.

### Não implementado nesta versão (roadmap)

- Envio real de push FCM (`firebase-admin-sdk`) — o token é salvo mas
  o dispatcher ainda não dispara notifications. App segue funcionando via
  `syncEngine` (timer 5min + connectivity).
- `Idempotency-Key` header (Stripe pattern) — recomendado pra v0.10.
- Rate limit em `/auth/login` (sugestão: via Caddy/nginx em prod).
- `coordOrigem`/`coordDestino` na viagem (schema não tem lat/lng).
- `Paciente.observacoesMobilidade` (schema não tem).

### Para o frontend gestor

Atualizar a UI de "Criar Motorista" (`/tfd/motoristas/nova`):

```ts
const r = await api.tfd.motoristas.criar({ nome, cpf, cnh, ... });
// r ganha 2 campos novos:
mostrarTelaDeCredenciais({
  matricula: r.matricula,           // "MOT-345678"
  senhaProvisoria: r.senhaProvisoria, // "12345678"
});
```

### Para o frontend Flutter (app motorista)

Substituir `TfdApiMock` pelo `TfdApiHttp` apontando para `/v1/motorista-app/*`.
Todos os DTOs já estão alinhados (ver §8 da [`MOTORISTA_APP_API.md`](MOTORISTA_APP_API.md)).

---

## [0.6.0] — 2026-04-24 · CRUD administrativo completo

### 🎯 Destaques

ADMIN e DESENVOLVEDOR agora podem **editar e excluir** praticamente tudo no sistema, respeitando o escopo de cada um. Todas as operações auditadas.

### Novos endpoints

**Prefeituras** (`/admin/prefeituras/:id`):
- `PATCH` — DEV (qualquer) ou ADMIN (da própria) · campos: `nome`, `municipio`, `uf`, `cnpj`, `ativa`
- `DELETE` — **apenas DEV** · bloqueia se houver UBSs/usuários ativos (→ `409 PREFEITURA_COM_DEPENDENCIAS`)

**UBSs** (`/admin/ubs/:id`):
- `PATCH` — DEV/ADMIN no escopo · `nome`, `municipio`, `uf`, `endereco`, `cnes`, `ativa`
- `DELETE` — DEV/ADMIN · bloqueia se houver atendentes ativos ou encaminhamentos pendentes (→ `409 UBS_COM_DEPENDENCIAS`)

**Pacientes** (`/pacientes/:id`):
- `PATCH` — DEV (qualquer) · ADMIN (prefeitura) · COORDENADOR_UBS (sua UBS) · 23 campos editáveis
- `DELETE` — mesmas roles · bloqueia se houver encaminhamentos ativos (→ `409 PACIENTE_COM_ENCAMINHAMENTOS_ATIVOS`)
- NÃO altera CPF nem ubsId

**Encaminhamentos** (`/encaminhamentos/:id`):
- `PATCH` **ampliado**: ADMIN/DEV podem editar em qualquer status (correção administrativa) · gera evento `EDITADO` na timeline. ATENDENTE/COORDENADOR continuam restritos a `AGUARDANDO_REGULACAO`.
- `DELETE` (novo) — ADMIN/DEV · soft delete · exige `motivo` no body (≥ 10 caracteres) · gera evento `OBSERVACAO` preservando trilha

### Schema

`deletadoEm: DateTime?` adicionado em `Prefeitura`, `Ubs`, `Paciente` e `Encaminhamento`. Listagens filtram automaticamente via `scopeWhere` (zero mudança no contrato HTTP).

### Novos códigos de erro

- `PREFEITURA_COM_DEPENDENCIAS` (409) · com `details.ubsAtivas` e `details.atendentesAtivos`
- `UBS_COM_DEPENDENCIAS` (409) · com `details.atendentesAtivos` e `details.encsAtivos`
- `PACIENTE_COM_ENCAMINHAMENTOS_ATIVOS` (409) · com `details.encsAtivos`
- `PACIENTE_DUPLICADO` (409) · PATCH com CSUS já usado em outro paciente
- `MOTIVO_OBRIGATORIO` (400) · DELETE de enc sem motivo ≥ 10 chars

### Para o frontend

Novos métodos no cliente:

```ts
await api.admin.updatePrefeitura(id, { nome: '...', ativa: false });
await api.admin.deletePrefeitura(id);   // só DEV

await api.admin.updateUbs(id, { endereco: '...', cnes: '...' });
await api.admin.deleteUbs(id);

await api.pacientes.update(id, { profissao: '...', telefone: '...' });
await api.pacientes.delete(id);

await api.encaminhamentos.update(id, { prioridade: 'URGENTE' });  // ADMIN/DEV em qualquer status
await api.encaminhamentos.delete(id, { motivo: 'Duplicidade com outro protocolo' });
```

### Auditoria

8 novas ações registradas em `auditoria_logs` (retenção ilimitada):
`EDITAR_PREFEITURA`, `EXCLUIR_PREFEITURA`, `EDITAR_UBS`, `EXCLUIR_UBS`, `EDITAR_PACIENTE`, `EXCLUIR_PACIENTE`, `EDITAR_ENCAMINHAMENTO`, `EXCLUIR_ENCAMINHAMENTO`.

---

## [0.5.0] — 2026-04-24 · Módulo de Relatórios LGPD-first (completo)

### 🎯 O que mudou

O stub antigo (que gerava arquivo dummy) foi substituído pelo **módulo completo** conforme [`docs/RELATORIOS.md`](RELATORIOS.md) — **zero mudança no contrato HTTP**, mas implementação 100% reescrita.

Os 3 endpoints (`GET /relatorios`, `POST /relatorios`, `GET /relatorios/:id/download`) mantêm o mesmo shape — o frontend **não precisa mudar nada**. Tudo que mudou é interno.

### Adicionado

- **Pipeline assíncrono em 3 camadas** (API → Worker → Download)
- **Dados reais** por tipo (7 tipos documentados em §5):
  - `FILA_REGULACAO` (operacional sem PII)
  - `ENCAMINHAMENTOS_POR_ESPECIALIDADE` (agregado, zero PII)
  - `PENDENCIAS_RESOLVIDAS`
  - `TFD_CUSTOS`
  - `VACINACAO_UBS`
  - `BUSCA_ATIVA` (com modo nominal opt-in + justificativa obrigatória)
  - `PRODUCAO_INDIVIDUAL`
- **3 renderers** funcionais:
  - **CSV** com BOM UTF-8, header LGPD comentado (`#`), streaming via fast-csv
  - **XLSX** via exceljs WorkbookWriter com 2 abas (Dados + Metadados)
  - **PDF** via pdfkit com cabeçalho, rodapé, marca d'água "CONFIDENCIAL" em tipos sensíveis
- **SHA-256 de cada arquivo** (não-repúdio — campo `hashSha256` em `relatorio_job`)
- **Audit log imutável** (`relatorio_audit`) com 5 ações: CRIADO, DOWNLOAD, FALHA, EXPIRADO, EXCLUIDO
- **Rate limit** via Redis (10/h/usuário · 30/d · 3 simultâneas/prefeitura)
- **Cron diário de expiração** (TTL 7 dias — apaga arquivo do storage, marca EXPIRADO)
- **Guards LGPD**:
  - Só o dono, ADMIN da mesma prefeitura ou DESENVOLVEDOR acessam download
  - Recurso fora do escopo → `404` (não `403`, pra não vazar existência)
  - `RELATORIO_EXPIRADO` → HTTP 410
- **Minimização LGPD**: cada tipo tem **lista explícita de colunas** no código (`TipoRelatorioMeta`). Zero `SELECT *`.
- **Mascaramento de PII** em `dataSources`: CPF, cartão SUS e telefone só saem mascarados em modo nominal.

### Schema mudou (Prisma)

- `Relatorio` (`relatorio_job`) ganhou: `prefeituraId`, `ubsId`, `storageKey`, `contentType`, `tamanhoBytes`, `hashSha256`, `finalizadoEm`, `downloads`, `ultimoDownload`, `erroTraceId`.
- Nova tabela `RelatorioAudit` (`relatorio_audit`) com enum `AcaoAuditRelatorio`.
- Relações adicionadas em `Prefeitura` e `Ubs`.

### Novos códigos de erro

- `TIPO_RELATORIO_INVALIDO` (400)
- `PERIODO_INVALIDO` (400) — fora de ordem, futura ou > 12 meses
- `FORMATO_INVALIDO` (400)
- `NOMINAL_NAO_PERMITIDO` (422) — tipo não suporta nominal
- `JUSTIFICATIVA_OBRIGATORIA` (422) — nominal sem justificativa de ≥30 chars
- `PREFEITURA_OBRIGATORIA` (422) — DEV gerando sem `filtros.prefeituraId`
- `RATE_LIMIT_EXCEDIDO` (429)
- `RELATORIO_NAO_DISPONIVEL` (409)
- `RELATORIO_EXPIRADO` (410)
- `ARQUIVO_NAO_ENCONTRADO` (404) — job DISPONIVEL mas arquivo sumiu do storage

### Para o frontend

**Nada muda**. O shape `Relatorio` já estava correto. O frontend continua:
1. Chamar `POST /relatorios` (recebe `status: PROCESSANDO`)
2. Fazer polling em `GET /relatorios` a cada 2s
3. Quando `status: DISPONIVEL` → `GET /relatorios/:id/download`

A diferença é que agora você recebe **dados reais** do banco, em arquivos **completos com cabeçalho LGPD e hash**, com tratamento de erros rico (410 expirado, 429 rate, 409 fora de ordem).

### Validado em runtime

- ✅ CSV gerado (708 bytes, header LGPD completo, BOM UTF-8)
- ✅ XLSX gerado (7707 bytes, formato válido Microsoft Excel 2007+)
- ✅ PDF gerado (4 páginas, 4235 bytes, `application/pdf`)
- ✅ Hash SHA-256 gravado em todos
- ✅ Downloads incrementando + audit log populado (3 downloads = 4 linhas de audit)
- ✅ Isolamento: ATENDENTE de outra UBS → `404 RELATORIO_NAO_ENCONTRADO`
- ✅ Rate limit disparando em 429 após estourar janela

### Arquivos novos

```
src/modules/relatorios/
├── domain/
│   └── TipoRelatorioMeta.ts          (single source of truth · LGPD)
├── application/
│   ├── CriarRelatorioUseCase.ts      (validação + RBAC + rate limit + audit)
│   ├── ListarRelatoriosUseCase.ts
│   ├── BaixarRelatorioUseCase.ts     (guard LGPD + audit + incremento)
│   ├── RelatorioWorker.ts            (coordenador de render + storage + hash)
│   ├── ExpiracaoCron.ts              (TTL 7d · apaga storage)
│   └── dataSources.ts                (queries com minimização de colunas)
├── infrastructure/
│   ├── RateLimiter.ts                (Redis + fallback in-memory)
│   ├── RelatorioAuditLogger.ts       (retenção 5 anos)
│   └── renderers/
│       ├── types.ts                  (interface Renderer)
│       ├── CsvRenderer.ts
│       ├── XlsxRenderer.ts
│       └── PdfRenderer.ts
└── presentation/
    └── RelatoriosController.ts       (3 endpoints)
```

### Removido

- `src/application/relatorios/` (antigo stub)
- `src/infrastructure/database/PrismaRelatorioRepository.ts`
- `src/domain/repositories/IRelatorioRepository.ts`
- `src/presentation/controllers/RelatorioController.ts`

---

## [0.4.0] — 2026-04-23 · Compressão de PDF + CRUD completo + App do Paciente (Face 3)

### 🎯 Destaques

- **PDF compression**: Ghostscript (com fallback pdf-lib). No teste real, **200 KB → 1 KB (0.5% do original)**.
- **CRUD completo de usuários** via `/admin/usuarios/:id` (PATCH, DELETE, ativo, reset-senha).
- **Edição de encaminhamentos** via `PATCH /encaminhamentos/:id` (apenas em `AGUARDANDO_REGULACAO`, gera evento `EDITADO`).
- **Face 3 — App do Paciente** com auth por CPF + timeline de trânsito (estilo Amazon/Shopee).
- **Notificações automáticas** ao paciente em toda transição: criado → pendência → aprovado → agendado → rejeitado → resposta SUS.

### Adicionado · endpoints

**Admin (CRUD extendido):**
- `PATCH /admin/usuarios/:id` — edita nome, email, telefone, cargo, função, vínculo UBS/prefeitura
- `DELETE /admin/usuarios/:id` — soft delete (revoga sessões e marca `deletadoEm`)
- `POST /admin/usuarios/:id/ativo` — `{ ativo: boolean }` ativa/desativa
- `POST /admin/usuarios/:id/reset-senha` — admin redefine (usuário deve trocar no próximo login)

**Encaminhamentos:**
- `PATCH /encaminhamentos/:id` — edita dados do paciente/solicitação (gate: `AGUARDANDO_REGULACAO`)

**App do Paciente (`/paciente-app/*`):**
- `POST /auth/login` — CPF + senha
- `POST /auth/ativar-conta` — CPF + data de nascimento + senha inicial
- `POST /auth/logout` — revoga sessão
- `GET  /me` — dados da conta
- `GET  /meus-encaminhamentos` — lista pelo CPF
- `GET  /notificacoes` · `?apenasNaoLidas=true` — timeline do paciente
- `GET  /notificacoes/count` — badge de não-lidas
- `POST /notificacoes/:id/lida`
- `POST /notificacoes/marcar-todas-lidas`
- `GET  /anexos/:id/download` — download com auth do paciente (só se `scanStatus=LIMPO` + anexo do próprio CPF)

### Adicionado · schema DTO

- `AnexoDocumento.scanStatus` (já existia desde 0.3.0, mencionado aqui pois agora é ativamente preenchido no fluxo resposta-sus)
- Enum `TipoEventoTimeline` ganhou `EDITADO`
- Enum `TipoNotificacaoPaciente`: 7 tipos correspondentes às transições
- Novos shapes: `NotificacaoPacienteDTO`, `PacienteLoginResponse`, `ContadorNotificacoes`, etc.

### Adicionado · códigos de erro

- `AUTO_EXCLUSAO_PROIBIDA`, `AUTO_DESATIVACAO_PROIBIDA` — admin tentando excluir/desativar a própria conta
- `EDICAO_NAO_PERMITIDA` — PATCH encaminhamento fora de AGUARDANDO_REGULACAO
- `NENHUMA_ALTERACAO`, `JUSTIFICATIVA_VAZIA` — validações do PATCH
- `CONTA_NAO_ATIVADA`, `CONTA_JA_ATIVADA`, `CONTA_NAO_ENCONTRADA`, `CONTA_INATIVA` — app paciente
- `CONFIRMACAO_INVALIDA` — ativar-conta com data de nascimento errada
- `ANEXO_NAO_ENCONTRADO`, `ANEXO_NAO_LIBERADO` — download paciente
- `NOTIFICACAO_NAO_ENCONTRADA`

### Compressão de PDF

Todo PDF (solicitação médica + resposta SUS) é automaticamente comprimido ao salvar:

- **1º preferência**: Ghostscript com preset `/screen` (dpi 72, compressão massiva)
- **Fallback**: `pdf-lib` re-save com metadata stripping
- Escolhe sempre o menor resultado entre original, gs e pdf-lib — nunca devolve maior que o original.
- Economia real observada em dev: **99.5%** em PDFs nativos com padding; em PDFs reais escaneados, espera-se 60-80%.

Nada muda no contrato HTTP — só economia de disco/S3. O frontend recebe o `tamanhoKb` pós-compressão em `AnexoDocumento`.

### Notificações do paciente (Face 3)

Toda transição de encaminhamento gera **automaticamente** uma linha na timeline do paciente:

| Evento backend | Notificação pro app |
|---|---|
| `POST /encaminhamentos` (UBS consolida) | `ENCAMINHAMENTO_CRIADO` — "📩 Encaminhamento solicitado" |
| `POST /:id/registrar-pendencia` | `PENDENCIA_REGISTRADA` — "⚠️ Documentação pendente" |
| `POST /:id/resolve-pendencia` (UBS responde) | `PENDENCIA_RESOLVIDA` — "🔁 Documentação complementada" |
| `POST /:id/aprovar` | `APROVADO` — "✅ Encaminhamento aprovado" |
| `POST /:id/aprovar` com `agendamentoPrevisto` | + `AGENDADO` — "📅 Atendimento agendado para {data}" |
| `POST /:id/rejeitar` | `REJEITADO` — "❌ Encaminhamento não aprovado" + motivo |
| `POST /:id/resposta-sus` | `RESPOSTA_SUS_DISPONIVEL` — "📎 Resposta do SUS disponível" |

Se o paciente ainda não tiver conta criada no app, uma conta **pendente** é criada automaticamente (ativo=false, senhaHash='!pending!'). Quando o paciente ativar via `/paciente-app/auth/ativar-conta`, todas as notificações retroativas ficam disponíveis.

### Seed atualizado

Conta do app para teste:
```
CPF:   123.456.789-00  (MARIA APARECIDA)
Senha: 12345678
```
Com encaminhamentos já criados pra testar a timeline.

### Migração (o que fazer no frontend)

1. Recopiar `docs/types.ts` e `docs/api-client.ts`.
2. Usar `api.admin.updateUsuario(id, ...)`, `api.admin.deleteUsuario(id)`, etc.
3. Usar `api.encaminhamentos.update(id, ...)` para editar.
4. Para o app do paciente (novo projeto/rota): `api.pacienteApp.login(...)`, `api.pacienteApp.notificacoes()` etc. Usa token separado e não conflita com a Face 1/2.

---

## [0.3.0] — 2026-04-23 · Stack de produção + scanStatus nos anexos

### Adicionado · contrato HTTP

- **`AnexoDocumento.scanStatus`** — novo campo obrigatório em toda resposta que inclui anexos (`Encaminhamento`, detalhes, lista). Enum: `PENDENTE | LIMPO | INFECTADO | FALHOU`.
  - Antes o download de anexo era assumido sempre seguro. Agora o frontend deve olhar o status e **bloquear download quando ≠ LIMPO**.
  - Em dev local (sem ClamAV), vira `LIMPO` em ~1s. Em produção, pode levar segundos/minutos durante o scan.

### Adicionado · infra (transparente pro frontend)

- **Cache Redis** no `GET /encaminhamentos/arvore` (TTL 60s). Invalidação automática nas transições de encaminhamento. Sem Redis funciona igual — só mais lento.
- **Audit log persistente** de `LOGIN_SUCESSO`, `LOGIN_FALHA`, `CRIAR_USUARIO`, transições de status. CPF/Cartão SUS mascarados.
- **Métricas Prometheus** em `GET /metrics` (sem `/v1`, sem auth). **Uso interno** — frontend não consome.
- **Outbox pattern** — eventos de domínio (`encaminhamento.aprovado` etc.) ficam em `outbox_events` e são publicados pelo worker. Hoje só loga; em produção plugará em webhook/fila.
- **Storage S3-compatible** — toggle via `STORAGE_PROVIDER=s3`. Dev usa MinIO local (console em `:9001`).
- **ClamAV opcional** — ativa com `CLAMAV_HOST=...`. Todo upload passa por scan antes de liberar download.

### Migração (o que fazer no frontend)

1. Copiar novamente `docs/types.ts` → `frontend/src/lib/api/types.ts` (ganhou `StatusScanAnexo` e o campo `scanStatus` em `AnexoDocumento`).
2. Onde desenha a lista de anexos (tab "Anexos" no detalhe do encaminhamento), ler `scanStatus`:
   ```svelte
   {#if anexo.scanStatus === 'PENDENTE'}
     <button disabled title="Analisando segurança…">Aguardando</button>
   {:else if anexo.scanStatus === 'LIMPO'}
     <button on:click={() => baixar(anexo.id)}>Baixar</button>
   {:else if anexo.scanStatus === 'INFECTADO'}
     <span class="text-red-600">⚠️ Bloqueado — arquivo recusado por segurança</span>
   {:else}
     <span class="text-amber-600">Scan falhou — peça ao admin</span>
   {/if}
   ```
3. Nenhum endpoint foi removido ou renomeado. Nada mais quebra.

---

## [0.2.0] — 2026-04-22 · Face 2 completa (Regulação SMS)

### Adicionado · novos endpoints

- `POST /encaminhamentos/:id/aprovar` — transição `AGUARDANDO_REGULACAO` → `APROVADO` (nota + agendamento opcionais)
- `POST /encaminhamentos/:id/registrar-pendencia` — transição → `PENDENCIA_DOCUMENTO` (observação obrigatória)
- `POST /encaminhamentos/:id/rejeitar` — transição → `REJEITADO` (motivo obrigatório, terminal)
- `POST /encaminhamentos/:id/resposta-sus` — enrichment pós-APROVADO, anexa PDF oficial do SUS Federal
- `GET  /encaminhamentos/arvore` — agregação hierárquica (UBS → Ano → Mês → Dia) pro file-manager da SMS

### Adicionado · schema do DTO

- `Encaminhamento.respostaSUS?: { anexoId, observacao, registradoEm, registradoPor }` — preenchido só após `POST /:id/resposta-sus`
- `TipoAnexo` ganhou `RESPOSTA_SUS`
- `TipoEventoTimeline` ganhou `RESPOSTA_SUS_RECEBIDA`

### Adicionado · novos códigos de erro

- `ENCAMINHAMENTO_NAO_AGUARDANDO_REGULACAO` (409)
- `OBSERVACAO_OBRIGATORIA` (422)
- `MOTIVO_OBRIGATORIO` (422)
- `AGENDAMENTO_INVALIDO` / `AGENDAMENTO_NO_PASSADO` (422)
- `ENCAMINHAMENTO_NAO_APROVADO` (409)
- `RESPOSTA_SUS_JA_REGISTRADA` (409)
- `PDF_RESPOSTA_OBRIGATORIO` (422)
- `PARAMS_INCOMPATIVEIS` (400)
- `UBS_NAO_ENCONTRADA` (404)

### Mudanças do seed

- Novo usuário: `SMS-099101` / senha `12345678` · role `REGULADOR_SMS` · escopo Prefeitura Águas Belas

---

## [0.1.0] — 2026-04-22 · MVP Face 1 (UBS) + Admin

### Entregue

- **Auth completo**: login (matrícula OU email), logout, forgot→verify→reset, me, troca de senha autenticada, encerrar outras sessões
- **Perfil do atendente** com produção, segurança e atividade recente
- **Dashboard**: `GET /dashboard/metrics` com escopo automático
- **Encaminhamentos Face 1**: extract-pdf (OCR), create, list, byId, resolve-pendencia
- **Pacientes (PEC)**: list e byId completos (alergias, crônicas, medicamentos, atendimentos, TFD, exames, vacinas, médicos)
- **Relatórios**: list, create (assíncrono), download
- **Admin**: criar/listar prefeituras, UBSs e usuários com RBAC por escopo
- **Isolamento total entre prefeituras**: 404 (não 403) para recursos fora do escopo
- **5 roles**: `DESENVOLVEDOR | ADMIN | COORDENADOR_UBS | ATENDENTE_UBS | REGULADOR_SMS`

### Seed inicial

- `DEV-001` · DESENVOLVEDOR · acesso global
- `ADM-001` · ADMIN · Prefeitura Águas Belas
- `SMS-047291` · ATENDENTE_UBS · UBS CENTRAL
- 1 paciente (MARIA APARECIDA) + 1 encaminhamento em PENDENCIA_DOCUMENTO (`UBS-2026-100137`)

Todas as senhas: `12345678`.
