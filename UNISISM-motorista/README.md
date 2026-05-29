# UNISISM Motorista

App mobile (Flutter) da **Face Motorista** do ecossistema UNISISM. Atende motoristas do transporte sanitário TFD (Tratamento Fora do Domicílio) da SMS — ver escala do dia, fazer chamada digital dos pacientes, registrar hodômetro, solicitar abastecimento e ajuda de custo. **Offline-first** com sincronização automática.

> Faces irmãs deste ecossistema:
> - **Face UBS** — `unisism-ubs/frontend` (SvelteKit)
> - **Face SMS / Regulação** — a construir (Face 2)
> - **Face Paciente** — outro app Flutter em `unisism-ubs/backend/docs/flutter/`
> - **Face Motorista** — este projeto

Identidade visual segue rigorosamente o **[Design System B2G Brutalista](../unisism-ubs/frontend/DESIGN_SYSTEM.md)** da Face UBS.

---

## Stack

- **Flutter** ≥ 3.41 · Dart ≥ 3.11
- **State**: `flutter_riverpod` 2.x (sem code-gen)
- **Navegação**: `go_router` 14
- **HTTP**: `dio` + interceptor de auth + `flutter_secure_storage`
- **Persistência local**: `drift` (SQLite tipado) — espelha entidades do backend + tabela `outbox` de mutações pendentes
- **Sync**: pull por timestamp + outbox processor + `connectivity_plus`
- **Mapa offline**: `flutter_map` + OpenStreetMap via `flutter_map_tile_caching` (pre-download da região da prefeitura)
- **Mídia**: `image_picker` + `permission_handler` (foto do comprovante de abastecimento)
- **Push** (F15): Firebase Cloud Messaging
- **Tipografia**: Inter + JetBrains Mono empacotadas localmente (LGPD/air-gap)

---

## Como rodar

```bash
# 1. Pré-requisitos: Flutter SDK estável, Xcode (iOS) e/ou Android Studio.
flutter --version   # 3.41+ esperado

# 2. Dependências
flutter pub get

# 3. Rodar contra o backend (consome /v1/motorista-app/*)
#    Backend documentado em unisism-ubs/backend/docs/MOTORISTA_APP_API.md
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3333/v1
```

> O app **não tem mais mock**. Consome só o backend real. Sem internet
> e sem backend, o app mostra a tela de "Sem internet" do sync indicator
> e cai no cache local (Drift SQLite) se houver dados sincronizados de
> sessões anteriores.

### URLs por ambiente

| Cenário | `API_BASE_URL` |
|---|---|
| Android emulator (default dev) | `http://10.0.2.2:3333/v1` |
| iOS Simulator | `http://localhost:3333/v1` |
| Device físico (mesma Wi-Fi) | `http://<IP-DO-PC>:3333/v1` |
| Produção | `https://api.unisism.aguasbelas.pe.gov.br/v1` |

### Flags úteis

| Flag | Efeito |
|---|---|
| `--dart-define=API_BASE_URL=<url>` | Sobrescreve a base URL. Sem isto, default é `http://10.0.2.2:3333/v1` (Android) ou `http://localhost:3333/v1` (iOS). |

---

## Estrutura

```
lib/
├── main.dart                      ProviderScope + bootstrap
├── app.dart                       MaterialApp.router + theme
├── core/
│   ├── theme/                     tokens, tipografia, theme global brutalista
│   ├── connectivity/              provider online/offline
│   ├── errors/                    ApiException, OfflineException
│   └── utils/                     formatadores (CPF, placa, hodômetro)
├── domain/
│   ├── models/                    Motorista, Viagem, Passageiro, Veiculo… (fromJson/toJson)
│   └── enums/                     StatusViagem, Presenca, Combustivel
├── data/
│   ├── api/                       TfdApi (abstract) + Remote + Mock
│   ├── local/                     Drift DB, tabelas, DAOs
│   └── repositories/              coordenação local + remoto + outbox
├── sync/                          SyncEngine, OutboxProcessor, PullStrategies
└── presentation/
    ├── widgets/                   design system
    ├── providers/                 Riverpod providers
    └── screens/                   telas
```

---

## Status do projeto

Construído em 16 fases. Estado atual:

- [x] **F0** — Bootstrap (este commit)
- [ ] F1 — Design System (theme + 8 widgets base)
- [ ] F2 — Modelos de domínio
- [ ] F3 — Persistência local Drift + outbox
- [ ] F4 — Camada de API (TfdApi + Mock + Remote)
- [ ] F5 — Sync engine
- [ ] F6 — Auth (matrícula + senha)
- [ ] F7 — Lista de viagens
- [ ] F8 — Detalhe da viagem
- [ ] F9 — Chamada digital
- [ ] F10 — Iniciar/Concluir viagem
- [ ] F11 — Mapa offline (OSM)
- [ ] F12 — Abastecimento + foto comprovante
- [ ] F13 — Ajuda de custo
- [ ] F14 — Perfil
- [ ] F15 — Push FCM
- [ ] F16 — QA

---

## Backend

O backend `unisism-ubs/backend` já tem o módulo `/v1/motorista-app/*`
**implementado** (v0.9.0, 2026-05-26). Contrato canônico documentado em
[`MOTORISTA_APP_API.md`](../unisism-ubs/backend/docs/MOTORISTA_APP_API.md).
Spec original do lado do app: [`BACKEND_REQUIREMENTS.md`](BACKEND_REQUIREMENTS.md)
e [`BACKEND_REQUIREMENTS.html`](BACKEND_REQUIREMENTS.html).

**Como entrar no backend (matrícula provisória):**
1. Gestor TFD cadastra motorista via `POST /v1/tfd/motoristas` → response inclui
   `{ matricula: "MOT-345678", senhaProvisoria: "12345678" }` UMA vez.
2. Gestor entrega pessoalmente ao motorista.
3. Motorista abre o app, faz login com essas credenciais.
4. App detecta `primeiroLogin: true` e força a tela de trocar senha
   (≥ 8 chars, com letras E números).

**Backend obrigatório.** O app consome só dados reais — não há mock.
O cache local (Drift SQLite) persiste o que foi sincronizado, permitindo
operação offline depois da primeira conexão.

---

## Conformidade

- **LGPD**: fontes (Inter, JetBrains Mono) empacotadas localmente, não via Google Fonts CDN.
- **Air-gap**: nenhuma dependência runtime de CDN externo após instalação.
- **Auditoria TJ**: as ações que entram na cadeia hash (iniciar viagem, marcar presença, concluir) são feitas via endpoints já cobertos pela `tfd_audit_log` no backend — o app é apenas o cliente.
