# 09 · Face 3 — App do Paciente

> App Flutter (em `UNISISM-Paciente/`) consumido pelo cidadão atendido pela
> rede pública municipal. CPF + senha. Notificações push. Download de PDF
> oficial do SUS quando a Regulação aprova e devolve.

---

## Ator

- **Cidadão** (Paciente) — sem role do enum `RoleAtendente`. Auth via `PacienteConta`.

## Stack

- Flutter 3.24+ · Dart 3.5+
- HTTP: `dio` (interceptor de refresh)
- Storage: `flutter_secure_storage` (token + refresh) + `shared_preferences` (preferências não-sensíveis)
- Push: `firebase_messaging` (FCM)
- State: provider / riverpod (varia por feature)

## Auth — modelo

| Aspecto | Valor |
|---|---|
| Esquema | Token **opaco** Base64URL (não JWT) |
| Access TTL | 30 min |
| Refresh TTL | 30 dias (rotativo, v0.18.0+) |
| Persistência | `sessoes_paciente` + `paciente_refresh_tokens` (hash) |
| Revogação | Delete linha de sessão (instantâneo) |

### Auto-criação de conta

Quando uma UBS consolida o **primeiro encaminhamento** de um CPF que ainda
não tem conta:

```
cpf              = só dígitos (11)
cpfFormatado     = "123.456.789-09"
nome             = do paciente do encaminhamento
senhaHash        = bcrypt(CPF dígitos)
ativo            = true
senhaProvisoria  = true   ← obriga app a forçar troca após 1º login
```

### Senha provisória bloqueante

Após login com senha=CPF, `paciente.senhaProvisoria=true`. App **DEVE forçar**
tela de troca de senha bloqueante antes de qualquer navegação. Após
`POST /auth/trocar-senha`, `senhaProvisoria=false` e home libera.

### Refresh rotativo (v0.18.0+)

Toda chamada a `POST /v1/paciente-app/auth/refresh`:

1. Consome o refresh atual (`usadoEm = now`).
2. Emite par novo (access + refresh).
3. Linka cadeia (`substituidoPorId` → novo).

**Detecção de reuse** — se app (ou atacante) usar um refresh já consumido:

- Backend revoga **toda a cadeia** + todas as sessões da conta.
- Retorna `401 REFRESH_REUSE_DETECTED`.
- App **deve**: apagar storage local + mostrar tela "sua sessão foi encerrada por segurança" + redirect para login.

## URLs

| Ambiente | Base URL |
|---|---|
| Dev (Mac / iOS Simulator) | `http://localhost:3333/v1` |
| Android emulator | `http://10.0.2.2:3333/v1` |
| Device físico mesma Wi-Fi | `http://<ip-mac>:3333/v1` |
| Produção (por tenant) | `https://<dominio-cliente>/v1` |

**Prefixo de todas as rotas: `/v1/paciente-app/*`**

## Endpoints (23 — referência completa em `backend/docs/PACIENTE_APP_API.md`)

### Auth (5)

```
POST /auth/login              { cpf, senha } → { token, refreshToken, paciente }
POST /auth/refresh            { refreshToken } → { token, refreshToken, paciente }
POST /auth/logout             revoga sessão + refresh
POST /auth/trocar-senha       { senhaAtual, novaSenha }
POST /auth/esqueci-senha      { cpf, telefone? } → 200 (anti-enumeration)
POST /auth/redefinir-senha    { resetToken, novaSenha }
```

### Perfil (1)

```
GET /me                       { cpf, nome, telefone, ubs: {...} }
```

### Encaminhamentos (1)

```
GET /meus-encaminhamentos     [ { protocolo, status, criadoEm, ... } ]
```

### Notificações (4)

```
GET  /notificacoes            ?apenasNaoLidas=true
GET  /notificacoes/count      { naoLidas: number }
POST /notificacoes/:id/lida
POST /notificacoes/marcar-todas-lidas
```

### Dossiê médico (4) — v0.10.0+

```
GET /me/dossie                resumo
GET /me/dossie/alergias
GET /me/dossie/condicoes-cronicas
GET /me/dossie/medicamentos
```

### Banners SMS (1) — cards no home

```
GET /banners                  cards informativos do tenant
```

### TFD do paciente (6) — v0.10.0+

```
GET /tfd/solicitacoes
GET /tfd/solicitacoes/:id
GET /tfd/viagens
GET /tfd/viagens/:id
GET /tfd/ajudas-custo
GET /tfd/ajudas-custo/:id
```

### Anexos / Downloads (1)

```
GET /anexos/:id/download      stream (após scan LIMPO, pertence ao próprio CPF)
```

### FCM (2)

```
POST   /me/fcm-token          { fcmToken }
DELETE /me/fcm-token
```

## Fluxos macro

### F1. Onboarding (auto-criação)

```
1. UBS consolida 1º encaminhamento do CPF 12345678900.
2. Backend cria PacienteConta automaticamente.
3. Paciente baixa o app, abre.
4. Login: CPF + senha (= CPF dígitos).
5. Backend retorna { paciente.senhaProvisoria: true }.
6. App força tela "Crie uma senha forte" (bloqueante).
7. POST /auth/trocar-senha com novaSenha.
8. App carrega home + busca:
   ├── GET /me
   ├── GET /meus-encaminhamentos
   ├── GET /notificacoes
   ├── GET /banners
   └── POST /me/fcm-token (se notificação permitida)
```

### F2. Notificação push chega

```
1. Backend (via outbox worker) detecta evento → push.
2. FCM entrega notificação.
3. App em foreground: snackbar + atualiza badge.
4. App em background: notification tray.
5. Tap → deep link para tela do encaminhamento.
```

### F3. Baixar resposta SUS

```
1. Notificação push: "Sua resposta SUS está disponível!"
2. Tela do encaminhamento mostra anexo tipo RESPOSTA_SUS.
3. Tap → GET /anexos/:id/download → MIME application/pdf.
4. App abre PDF nativamente OR salva no storage.
```

### F4. Recuperar senha (esqueci)

```
1. /login → "Esqueci senha".
2. POST /auth/esqueci-senha { cpf } → 200 (sempre).
3. Backend: gera código 6 dígitos + envia email/SMS para contato cadastrado.
4. Tela do app: input do código.
5. POST /auth/verify-code { cpf, codigo } → { resetToken }.
6. Tela "nova senha".
7. POST /auth/redefinir-senha { resetToken, novaSenha }.
8. Volta para /login.
```

## Telas — guidelines (UX)

| Tela | Conteúdo |
|---|---|
| Login | CPF (formatador local) + senha. "Esqueci senha". |
| Troca de senha provisória | Bloqueante após 1º login. Regras de força (>=8 chars, letras + números). |
| Home | Saudação + banners (carrossel) + lista de encaminhamentos por status + atalhos (Notificações, Minha UBS, Dossiê médico, TFD). |
| Encaminhamento detalhe | Timeline + anexos baixáveis + botão "Como chegar à UBS" (mapa). |
| Notificações | Lista cronológica + filtro "Não lidas" + ação "Marcar todas lidas". |
| Minha UBS | Card com nome + foto + endereço + WhatsApp + telefone + horários + mapa. |
| Dossiê médico | Tabs: Alergias, Crônicas, Medicamentos em uso. Read-only. |
| TFD | Solicitações + Viagens + Ajudas de custo. Status visual claro. |
| Perfil | Dados básicos + "Sair" + "Alterar senha". |

## Convenções importantes

### CPF normalizado

Backend aceita formatado (`123.456.789-09`) ou só dígitos (`12345678909`).
**Recomendado app enviar dígitos** (evita logs sujos). Backend devolve sempre
ambos.

### Anti-enumeration

Qualquer recurso de OUTRO paciente → 404. App trata como "não encontrado".
Nunca confunde com "você não tem permissão".

### Sync de notificações

- App abre → `GET /notificacoes/count` (badge).
- Pull-to-refresh em /notificacoes → `GET /notificacoes`.
- Marcar lida individual ou bulk.
- Push do FCM já vem com `naoLidas` atual no data payload para atualizar badge sem GET extra.

### Storage

- **Token + refresh**: `FlutterSecureStorage` (Keychain iOS / EncryptedSharedPreferences Android).
- **Preferências**: `SharedPreferences` (theme, lang, "lembrar de mim").
- **Cache de notificações** offline: SQLite local (opcional, roadmap).
- **NUNCA persistir senha em plaintext.**

### Erro UX

| Code | UX |
|---|---|
| `CREDENCIAIS_INVALIDAS` | "CPF ou senha incorretos" |
| `USUARIO_INATIVO` | "Sua conta foi desativada. Procure a UBS." |
| `TOKEN_EXPIRADO` | Tenta refresh transparente |
| `REFRESH_REUSE_DETECTED` | Tela "Sessão encerrada por segurança" + apaga tokens |
| `SENHA_FRACA` | Mostra regras + destaca campo |
| `RATE_LIMIT` | "Tente novamente em alguns minutos" |

## Documentação autoritativa

- `backend/docs/PACIENTE_APP_API.md` — spec completa do backend.
- `backend/docs/FLUXO_PACIENTE.md` — onboarding + notificações.
- `backend/docs/flutter/README.md` — kit Dart pronto.
- `backend/docs/flutter/unisism_api.dart` — `UnisismApi` (Dio configurado).
- `backend/docs/flutter/unisism_types.dart` — DTOs.

> **Importante**: `UNISISM-Paciente/BACKEND_API_PACIENTE.md` é uma spec
> antiga que descreve 31 endpoints; alguns NÃO existem no backend.
> **Sempre preferir `backend/docs/PACIENTE_APP_API.md` (autoritativa).**
