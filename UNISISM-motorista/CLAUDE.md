# CLAUDE.md — UNISISM Motorista

Este arquivo é o **contexto de operação** do Claude Code para o projeto `UNISISM-motorista`. Leia-o **inteiro** antes de tocar em qualquer arquivo. Ele dispensa olhar transcripts antigos.

> **Documentação completa** com diagramas, tabelas, paleta visual e roadmap: [`DOCUMENTACAO.html`](DOCUMENTACAO.html). Abra no navegador.

---

## 1. O que é este projeto

App **Flutter mobile** da **Face Motorista** do ecossistema UNISISM da Prefeitura de Águas Belas. Atende motoristas do transporte sanitário TFD (Tratamento Fora do Domicílio).

**O motorista usa o app para:**
- Ver sua escala do dia (viagens alocadas pela Regulação TFD)
- Fazer chamada digital dos pacientes (embarcado / ausente / desistiu)
- Iniciar viagem (hodômetro inicial) e concluir (hodômetro final)
- Solicitar abastecimento com foto do comprovante
- Ver ajudas de custo associadas aos pacientes
- Conferir seu perfil (CNH, totais, viagens)
- Receber notificação quando a Regulação aloca nova viagem

**Diferencial crítico:** **offline-first**. Toda ação grava localmente e sincroniza quando a rede volta. O motorista frequentemente opera em BR-101 / interior / rodoviárias com sinal instável.

**Faces irmãs (mesmo ecossistema, identidade visual idêntica):**
- **UBS** → SvelteKit em `/Users/mateus/Documents/Prefeitura/unisism-ubs/frontend/` (existente, fonte da verdade do Design System)
- **SMS / Regulação** → a construir
- **Paciente** → Flutter em `/Users/mateus/Documents/Prefeitura/unisism-ubs/backend/docs/flutter/`
- **Motorista** → este projeto

---

## 2. Estado atual (atualize quando concluir uma fase)

**Fases concluídas: 16/16 (100%) — MVP completo.**

| Fase | Status | Entrega |
|---|---|---|
| F0 | ✅ | Bootstrap (estrutura, pubspec, Android/iOS, README, splash) |
| F1 | ✅ | Design System (tokens + tipografia + 11 widgets + storybook) |
| F2 | ✅ | Domínio (11 enums + 10 modelos imutáveis) |
| F3 | ✅ | Drift (5 tabelas + 4 DAOs + outbox + migrations) |
| F4 | ✅ | TfdApi (abstract + Mock com seed + Remote stub) |
| F5 | ✅ | Sync engine (pull/push + outbox processor + retry) |
| F6 | ✅ | Auth (login matrícula+senha, secure storage, primeiro acesso) |
| F7 | ✅ | Lista de viagens (HOJE/PRÓXIMAS/HISTÓRICO + MetricCards) |
| F8 | ✅ | Detalhe da viagem (header + 4 tabs + TimelineStep + PassageiroCard) |
| F9 | ✅ | Chamada digital (Dismissible swipe + modal de presença + outbox) |
| F10 | ✅ | Iniciar/Concluir viagem (hodômetro + validação + overlay de sucesso) |
| F11 | ✅ | Mapa offline (flutter_map + OSM + FMTC + cache automático) |
| ~~F12~~ | 🗑 removida | ~~Abastecimento~~ — retirado por feedback do usuário (acessibilidade; fora do caso de uso primário) |
| F13 | ✅ | Ajuda de custo (lista somente leitura com itens detalhados) |
| F14 | ✅ | Perfil (CNH com badge de vencimento + produção + logout confirmado) |
| F15 | ✅ | Push (PushService abstract + NullPushService; FirebasePushService documentado em `lib/data/push/README.md`) |
| F16 | ✅ | QA (5 widget tests + smoke checklist + audit anti-patterns) |

**Métricas atuais (pós-remoção do mock — só backend real):**
- Arquivos Dart fonte: ~49 (1 a menos depois de deletar `tfd_api_mock.dart`)
- Testes automatizados: **31 / 31 passando** (foram removidos os 8 do mock)
- `flutter analyze`: **0 issues**
- Audit anti-patterns: **limpo**
- Bottom nav: **2 abas** (Viagens · Perfil)
- Rotas: 7 (`/`, `/login`, `/login/trocar-senha`, `/home`, `/viagens/:id`, `/ajudas-custo`, `/perfil`)
- Deps removidas: `image_picker`, `permission_handler`
- Chamada digital: **botões grandes "Embarcou ✓" / "Faltou ✗" / "Mais"** (sem swipe oculto)
- Linguagem do app: coloquial ("Sair do app", "Quilometragem", "Vamos enviar quando tiver internet")
- Tipografia: sans-serif Inter por padrão; mono só pra dados (CPF, hora, KM)
- **API**: sempre `TfdApiRemote` (Dio + backend real). Sem `USE_MOCK`. Sem `SIMULATE_OFFLINE`.

---

## 3. Stack (travada — não trocar sem perguntar)

| Camada | Pacote | Versão | Por quê |
|---|---|---|---|
| Runtime | Flutter | 3.41.7 | Estável |
| Linguagem | Dart | 3.11.5 | Estável |
| State + DI | `flutter_riverpod` | 2.6.1 | **Não usar v3.** Sem code-gen (sem riverpod_generator). |
| Rotas | `go_router` | 14.8 | Com redirect baseado em AuthStatus |
| HTTP | `dio` | 5.7 | Com `AuthInterceptor` |
| SQLite | `drift` | 2.31 | Tipado, com `build_runner` |
| Storage seguro | `flutter_secure_storage` | 9.2 | JWT cifrado |
| Conectividade | `connectivity_plus` | 6.1 | Stream online/offline |
| Mapa | `flutter_map` + `flutter_map_tile_caching` | 7.0 + 9.1 | OSM offline (F11). **Não usar Google Maps.** |
| Mídia | `image_picker` + `permission_handler` | 1.1 + 11.4 | Foto comprovante (F12) |
| Tipografia | Inter + JetBrains Mono | TTFs locais em `assets/fonts/` | LGPD — **nunca** Google Fonts CDN |
| Push | `firebase_core` + `firebase_messaging` | 3.9 + 15.1 | Comentado no pubspec, descomentar em F15 |

**Decisões trancadas:**
- Sem `freezed`, sem `json_serializable`, sem `retrofit`. Modelos fazem `fromJson`/`toJson` manuais.
- Sem `riverpod_generator` — Notifiers manuais.
- Drift é o único build_runner do projeto.

---

## 4. Arquitetura (Clean — três camadas)

```
lib/
├── core/           tokens, tipografia, theme, router, connectivity, errors
├── domain/         enums + modelos imutáveis (sem deps de Flutter/Drift/Dio)
├── data/
│   ├── api/        TfdApi (abstract) + Mock + Remote + AuthInterceptor
│   ├── auth/       SecureTokenStorage
│   ├── local/      AppDatabase + 5 tabelas + 4 DAOs
│   └── repositories/  coordenam local + remote + outbox
├── sync/           SyncEngine, OutboxProcessor, OutboxKinds
└── presentation/
    ├── widgets/    Design System (10 widgets brutalistas)
    ├── providers/  api, auth, sync (Riverpod)
    └── screens/    splash, login, viagens, dev (storybook)
```

**Regras de dependência:**
- `domain/` **não importa** nada de `flutter/`, `drift/`, `dio/` — só `meta`.
- `data/` importa `domain/`.
- `presentation/` importa tudo, mas sempre via providers/repositories — **não chama API direto**, **não acessa Drift direto**.
- `sync/` orquestra `data/api/` + `data/local/`.

---

## 5. Padrões obrigatórios — DS acessível (refator pós-feedback 2026-05-25)

> **ATENÇÃO:** o app do motorista **NÃO segue mais o brutalismo B2G** estrito
> da Face UBS. O feedback do usuário foi explícito: motoristas têm leitura
> básica e o app precisa ser **acessível**, não institucional/denso.
>
> Cores e cantos retos do UNISISM continuam, mas:
> - Texto em **case natural** ("Iniciar viagem", não "INICIAR VIAGEM").
> - **Sans-serif (Inter) é o padrão**. Mono (JetBrains Mono) **só para dados** (CPF, placa, hodômetro).
> - Sem tracking-widest agressivo (>1.5).
> - Tipografia **maior**: body 16px, label 12px, métricas 36px.
> - Botões grandes (56dp+), ícones grandes (24-28).
> - Linguagem coloquial: "Sair do app", não "Encerrar sessão".
>
> A Face UBS continua brutalista — esse desvio é **só** do app do motorista.

### 5.1 Cores
- **Apenas** estes tokens (definidos em [tokens.dart](lib/core/theme/tokens.dart)): `slate-50/100/200/300/400/500/600/700/800/900/950`, `blue-50/700/900/950`, `emerald-50/700/800/900`, `amber-50/600/800/900`, `red-50/700/800/900`.
- **Nunca** paleta custom (`#3E8EDE` etc.).
- Verde/âmbar/vermelho **só** para comunicar **estado**, jamais decoração.
- `blue-900` = cor de ação (botão primário, indicador ativo).

### 5.2 Tipografia
- **Inter** = nomes, textos corridos.
- **JetBrains Mono** = dados (CPF, matrícula, hodômetro, protocolo, timestamps, labels uppercase, tabelas).
- Use sempre os estilos canônicos de [typography.dart](lib/core/theme/typography.dart): `AppTypography.label`, `panelTitle`, `pageTitle`, `bodySm`, `bodyXs`, `monoXs`, `monoSm`, `metricValue`, `button`, `input`, `inputMono`.

### 5.3 Geometria
- **Cantos retos** sempre. `BorderRadius.zero`. **Nunca** `rounded-lg`/`rounded-xl`/`rounded-full`. O theme global já força isso em Material widgets.
- **Bordas finas** (`1px slate-200`) ao invés de sombras difusas.
- **Única sombra permitida**: offset bruto do modal (`8 8 0 rgba(15,23,42,.12)`).
- **Único arredondamento permitido**: `BorderRadius.zero` (sic) — `rounded-sm` (2px) é exceção rara.

### 5.4 Componentes
- Toda tela autenticada usa `BrutalistBottomNav` (não Drawer).
- Toda tabela/sub-navegação usa `SubNav`.
- Todo botão primário usa `PrimaryButton` (3 variantes: primary/secondary/danger), **nunca** `ElevatedButton` solto.
- Todo input usa `AppFormField`, **nunca** `TextField` solto.
- Todo modal usa `showBrutalistModal` helper.
- Status sempre vai pelo `StatusBadge` com `tone` apropriado (vem do enum: `StatusViagem.tone`, `PresencaPassageiro.tone`, etc.).

### 5.5 Anti-patterns proibidos
| ❌ NÃO | ✅ SIM |
|---|---|
| `rounded-lg`, `rounded-xl`, `rounded-full` | `BorderRadius.zero` |
| `shadow-md`, `shadow-lg`, `BoxShadow(blurRadius>0)` | bordas finas |
| Gradientes coloridos | apenas `slate-50 → white` em headers |
| `#3E8EDE` ou hex custom | apenas tokens declarados |
| Verde "porque é bonito" | verde apenas para sucesso/embarcado/concluído |
| Google Fonts CDN | TTFs locais em `assets/fonts/` |
| Mocks no código de produção | sempre via `TfdApi` (mock vs remote) |
| `TextField` solto | `AppFormField` |
| Múltiplos providers de mesmo recurso | usar o singleton em `presentation/providers/` |

---

## 6. Padrões de código (Dart)

### 6.1 Enums
Sempre com `wire` (string SNAKE_CASE) + `fromWire(value)` + helper `rotulo` (pt-BR) + `tone` quando aplicável.

```dart
enum StatusViagem {
  agendada('AGENDADA'),
  emAndamento('EM_ANDAMENTO');

  const StatusViagem(this.wire);
  final String wire;

  static StatusViagem fromWire(String value) =>
      StatusViagem.values.firstWhere((e) => e.wire == value,
          orElse: () => throw WireException('StatusViagem', value));

  String get rotulo => switch (this) { ... };
  Tone get tone => switch (this) { ... };
}
```

### 6.2 Modelos
- `@immutable` + todos campos `final`.
- `fromJson(Map<String, dynamic>)` manual usando os helpers de `domain/models/_json.dart` (`parseDateTime`, `parseInt`, `parseDouble`).
- `toJson()` manual.
- `copyWith(...)` para mutações.

### 6.3 Erros
- Toda falha vira `ApiException`. **Não** lance `Exception` solto.
- Use `ApiException.offline()` para erros de rede.
- Use `ApiException.fromBackend(body, status)` para parsing do shape `{ error: { code, message, details } }`.

### 6.4 Riverpod
- Use `Provider`, `StreamProvider`, `Notifier`, `NotifierProvider`.
- **Não** use `StateProvider` para nada complexo (só flags simples).
- **Não** use `riverpod_generator`.
- Liste `ref.onDispose(...)` quando o provider mantém recurso (DB, stream).

### 6.5 Null safety
- Prefira `Type?` + null-aware operators.
- Em map literais: `{'key': ?nullableValue}` (Dart 3.x null-aware map entries) — não `if (x != null) 'key': x`.

### 6.6 Documentação
- Comentários `///` apenas quando o **porquê** não é óbvio.
- **Não** comente o **o quê** (o código fala por si).
- Não escreva docstrings de múltiplos parágrafos. Uma linha curta.

---

## 7. Workflow obrigatório

### Antes de cada fase
1. Releia a seção da fase em `DOCUMENTACAO.html` ou neste arquivo.
2. Confira que os widgets do DS atendem — se faltar, criar novo widget primeiro.
3. Confira que o modelo de domínio cobre — se faltar, adicionar em `domain/`.

### Durante a fase
1. `flutter analyze` deve continuar em **0 issues**.
2. `flutter test` deve continuar em **18+ passing** (adicione testes pra coisas críticas, não pra tudo).
3. Se mexer em `data/local/tables/` ou `daos/`: rodar `dart run build_runner build`.

### Ao terminar uma fase
1. Rodar `flutter analyze` e `flutter test`.
2. Atualizar a seção "Estado atual" deste arquivo.
3. Atualizar a tabela de fases em `DOCUMENTACAO.html` (mudar `next`/`todo` → `done`).
4. Marcar o todo da fase como `completed` via TodoWrite.
5. **Não criar commits** sem o usuário pedir.

---

## 8. Backend — IMPLEMENTADO (v0.9.0, 2026-05-26)

O backend `unisism-ubs/backend` já tem o módulo `/v1/motorista-app/*`
**implementado**. Contrato canônico em
[`unisism-ubs/backend/docs/MOTORISTA_APP_API.md`](../unisism-ubs/backend/docs/MOTORISTA_APP_API.md).

### Diferenças vs. spec original (`BACKEND_REQUIREMENTS.md`):
- `Usuario` → `Atendente` (semanticamente equivalente; só claim, não muda o app).
- `usuarioId` → `atendenteId` no MotoristaTFD (idem).
- `/auth/me` agora devolve `primeiroLogin: bool` (modelo `Motorista.primeiroLogin` no app).
- Matrícula tem formato `MOT-345678` (alfanumérico). Login screen usa `AppFieldType.text`.
- Senha exige `≥ 8 chars E letras E números`. Validação client-side em `trocar_senha_screen.dart`.
- FCM token salva no servidor mas dispatcher de push ainda não está rodando.
- Campos sempre `null` (schema ainda não tem): `Viagem.protocolo`, `Viagem.coordOrigem/Destino`,
  `Paciente.fotoUrl`, `Paciente.observacoesMobilidade`.
- `Ubs.bairro` vem com valor de `municipio` (schema atual não tem bairro).

**Não modifique a interface `TfdApi`** — todos os endpoints e DTOs estão
exatamente alinhados (campos opcionais `?` cobrem os nulls do backend atual).
O app **não tem mais mock** — `TfdApiRemote` é a única implementação.

### Cadastro inicial do motorista (fora do app):
1. Gestor TFD chama `POST /v1/tfd/motoristas` → backend cria `MotoristaTFD` +
   `Atendente` vinculado + devolve `{ matricula, senhaProvisoria }` UMA vez.
2. Gestor entrega pessoalmente ao motorista (anota em papel ou pelo CRM).
3. Motorista abre o app → login com essas credenciais → app força trocar senha.
4. Para motoristas pré-existentes (criados antes da v0.9.0 do backend), rodar
   `npm run db:backfill-motoristas` no servidor.

---

## 9. Decisões trancadas (não reabrir sem o usuário)

| # | Decisão | Por que travar |
|---|---|---|
| 1A | Frontend primeiro, backend depois | App entrega valor visível antes |
| 2B | Login = matrícula + senha (não SSO) | Padrão servidor público |
| 3 | Tudo do MVP entra **menos Google Maps** | OSM offline já decidido |
| 4A | Drift + outbox + reconciliação por timestamp | Robusto pra crash recovery |
| 5 default | Stack já listada na seção 3 | Não trocar |

Se o usuário pedir alguma coisa que conflita com isso, **pergunte primeiro** antes de implementar.

---

## 10. Como conseguir credenciais

**O app não tem mais mock.** Pra logar, precisa de uma matrícula real
(`MOT-XXXXXX`) + senha provisória. Pra criar:

```bash
# 1. Gestor TFD cria via API:
curl -X POST http://localhost:3333/v1/tfd/motoristas \
  -H "Authorization: Bearer <token-gestor>" \
  -H 'Content-Type: application/json' \
  -d '{
    "nome": "João da Silva",
    "cpf": "12345678900",
    "cnh": "99887766554",
    "categoriaCnh": "D",
    "validadeCnh": "2028-04-10",
    "telefone": "75999990000"
  }'
# → response inclui { matricula, senhaProvisoria } UMA vez

# 2. Pra motoristas pré-existentes (criados antes do v0.9.0 do backend):
cd ../unisism-ubs/backend
npm run db:backfill-motoristas
# → imprime tabela {matricula, senhaProvisoria}
```

No primeiro login com a senha provisória, o app força a troca (validação
≥ 8 chars + letras + números).

---

## 11. Como rodar (cheat sheet)

```bash
# Pré-requisitos: Flutter 3.41+, Xcode/Android Studio, backend rodando
cd /Users/mateus/Documents/Prefeitura/UNISISM-motorista

# Setup (uma vez)
flutter pub get
dart run build_runner build       # gera Drift

# Rodar (default URL = http://10.0.2.2:3333/v1 no Android, localhost no iOS)
flutter run

# Apontar pra outro backend (LAN, prod, etc.)
flutter run --dart-define=API_BASE_URL=http://192.168.0.197:3333/v1

# Sanity
flutter analyze    # 0 issues esperado
flutter test       # 31 passing esperado
```

---

## 12. Locais importantes

| Caminho | O que tem |
|---|---|
| `DOCUMENTACAO.html` | Documentação completa visual (abrir no browser) |
| `BACKEND_REQUIREMENTS.md` | Spec do módulo backend que ainda falta |
| `README.md` | Como rodar + status do projeto |
| `lib/core/theme/tokens.dart` | Paleta completa + enum Tone |
| `lib/core/theme/typography.dart` | Estilos canônicos do DS |
| `lib/presentation/widgets/` | 10 widgets brutalistas reusáveis |
| `lib/data/api/tfd_api_mock.dart` | Seed e regras de negócio do mock |
| `lib/data/local/database.dart` | Schema Drift |
| `lib/sync/sync_engine.dart` | Orquestrador pull/push |
| `../unisism-ubs/frontend/DESIGN_SYSTEM.md` | Fonte da verdade do DS (Svelte) |
| `../unisism-ubs/backend/docs/TFD_API.md` | Spec do domínio TFD no backend |
| `../unisism-ubs/backend/prisma/schema.prisma` | Schema Prisma — referência |

---

## 13. Próximos passos (pós-MVP)

O MVP de 16 fases está concluído. Os trabalhos a seguir são **fora do escopo
do plano original** e devem ser feitos como ondas separadas, conforme demanda:

### 13a. Backend `motorista-app/*` — IMPLEMENTADO (v0.9.0, 2026-05-26)
Spec canônica: [`unisism-ubs/backend/docs/MOTORISTA_APP_API.md`](../unisism-ubs/backend/docs/MOTORISTA_APP_API.md).
Roda em `http://localhost:3333/v1` (dev). Pra produção, mudar URL via
`--dart-define=API_BASE_URL=https://api.unisism.aguasbelas.pe.gov.br/v1`.

### 13b. Firebase real (push notifications)
A infraestrutura está pronta (`PushService` abstract + hooks no AuthController).
Falta:
- Criar projeto Firebase + baixar config files (`google-services.json`, `GoogleService-Info.plist`).
- Descomentar `firebase_core` + `firebase_messaging` no pubspec.
- Implementar `FirebasePushService` conforme template em [`lib/data/push/README.md`](lib/data/push/README.md).
- Trocar `NullPushService()` por `FirebasePushService()` em `push_providers.dart`.

### 13c. Self-host do tileserver OSM (recomendado para produção)
Em produção, evitar o tile.openstreetmap.org público (política de uso). A SMS
deveria rodar um `tileserver-gl` com extract do estado da Pernambuco e configurar:
```bash
flutter run --dart-define=TILE_URL_TEMPLATE=https://tiles.unisism.aguasbelas.pe.gov.br/{z}/{x}/{y}.png
```

### 13d. Pre-download de região (perfil)
Add botão "Baixar mapa da região" no perfil (F14) usando a API
`FMTCStore.download.startForeground()` da FMTC. Bbox já definido em
`MapConfig.bboxFeiraSw/Ne`. Tamanho estimado: 80-150 MB.

### 13e. Backend: endpoints específicos pendentes
- `POST /motorista-app/me/fcm-token` (F15 já enfileira via outbox)
- Header `X-Server-Time` em todos os GET (pra reconciliação de timestamp do sync)
- Auditoria `tfd_audit_log` usando `motorista.usuarioId` (ver `BACKEND_REQUIREMENTS.md` §4)

### 13f. Testes avançados (cobertura adicional)
- Drift in-memory tests do `ViagensDao` (insert/update/upsert preservando dirty).
- Unit test do `OutboxProcessor` com fakes manuais de `TfdApi` e DAOs.
- Integration test do golden path com `flutter_test` + `integration_test`.

### 13g. Build para produção
- Gerar ícones (atualmente é o ic_launcher default do Flutter — usar `flutter_launcher_icons`).
- Gerar splash nativa (`flutter_native_splash`).
- Configurar `release` no Android signing + iOS provisioning.
- Substituir `usesCleartextTraffic="true"` por `network_security_config.xml` restrito ao host de produção.

---

## 14. O que esperar do usuário

- **Usuário direto** — gosta de respostas curtas com bullet points e tabelas
- **Quer iterar visualmente** — pode pedir pra rodar e testar a cada 2-3 fases
- **Sabe Flutter razoavelmente** — pode discutir trade-offs técnicos
- **Confia no plano** — pediu pra ir até F16 sequencial, mas para a qualquer momento se quiser ajustar
- **Email**: santanamateus8979@gmail.com

---

**Última atualização:** 2026-05-25 (refator de acessibilidade — DS humanizado, linguagem coloquial, botões grandes na chamada, 39 testes passando, 0 issues).
