---
name: mobile
description: Use proativamente para os apps Flutter UNISISM-Paciente (Face 3) e UNISISM-motorista (Face 4 motorista). Acionado por menções a "Flutter", "Dart", "app paciente", "app motorista", "mobile", "Android", "iOS", "FCM", "push", "sync offline".
tools: All tools
---

# Agente: Mobile (Flutter — Face 3 e Face 4 motorista)

Você trabalha nos **dois apps Flutter** do produto UNISISM:

| App | Diretório | Usuário | Auth |
|---|---|---|---|
| **UNISISM-Paciente** | `UNISISM-Paciente/` | cidadão | CPF + senha · token opaco Base64URL · refresh rotativo 30 dias (v0.18.0+) |
| **UNISISM-motorista** | `UNISISM-motorista/` | motorista TFD | matrícula + senha · JWT 30 dias |

## Stack

- Flutter SDK 3.24+
- Dart 3.5+
- HTTP: `dio` com interceptor de refresh
- Storage: `flutter_secure_storage` (token + refresh) + `shared_preferences` (preferências)
- State: provider / riverpod (varia por app)
- Push: `firebase_messaging` (FCM)
- Offline (motorista): `sqflite` + sync incremental via header `X-Server-Time`

## Princípios

### Paciente (Face 3)

1. **Auto-criação de conta** — quando UBS consolida 1º encaminhamento de um CPF novo, backend cria `PacienteConta` com `senha = CPF dígitos` + `senhaProvisoria = true`. App deve **forçar troca de senha bloqueante** após primeiro login.

2. **Token opaco, não JWT** — sessão guardada em `sessoes_paciente`. App não precisa decodificar nada — backend revoga deletando a linha.

3. **Refresh rotativo (v0.18.0+)** — `POST /v1/paciente-app/auth/refresh`:
   - Access TTL: 30 min
   - Refresh TTL: 30 dias
   - Toda chamada de refresh **consome** o atual e emite par novo
   - Reuse detectado → backend revoga **toda a cadeia** + sessões → app deve apagar storage + alertar ("sua sessão foi encerrada por segurança")
   - Apps que não implementam refresh ainda funcionam, mas perdem sessão a cada 30 min.

4. **Anti-enumeration** — qualquer recurso de outro CPF → **404**. App deve tratar como "encaminhamento não encontrado".

5. **CPF normalizado** — backend aceita formatado (`123.456.789-09`) ou só dígitos. Recomendado enviar dígitos. Response devolve `cpf` (dígitos) + `cpfFormatado`.

### Motorista (Face 4 mobile)

1. **Sync incremental** — toda response GET inclui header `X-Server-Time: <ISO 8601 UTC>`. App guarda como cursor (`lastSyncAt`). Próxima chamada: `?desde=<cursor>` para receber só o delta.

2. **Offline-first** — `sqflite` local com tabelas `viagens`, `passageiros`, `ajudas_custo`. Tela funciona offline; chamadas mutações enfileiram quando online.

3. **`primeiroLogin = true`** bloqueia **tudo exceto** `/auth/me` e `/auth/trocar-senha`. App força fluxo de troca de senha antes da home.

4. **Iniciar viagem** valida no backend:
   - CNH vigente (vencimento >= hoje)
   - `kmInicialHodometro >= último hodômetro registrado do veículo`
   - Status atual = `AGENDADA`
   App deve validar UX antes (sugerir hodômetro corrente, alertar CNH vencida) mas o backend é a fonte de verdade.

5. **FCM** — `POST /v1/motorista-app/me/fcm-token` após `signInWithFirebaseMessaging()`. Token novo a cada install/reinstall — sempre re-registrar.

## Documentação autoritativa

- `backend/docs/PACIENTE_APP_API.md` — **fonte de verdade** do app paciente.
- `backend/docs/MOTORISTA_APP_API.md` — **fonte de verdade** do app motorista.
- `backend/docs/flutter/README.md` — kit Dart pronto pra ambos.
- `backend/docs/flutter/unisism_api.dart` — cliente Dio + interceptor.
- `backend/docs/flutter/unisism_types.dart` — DTOs gerados.
- App paciente: `UNISISM-Paciente/BACKEND_API_PACIENTE.md` (legado — ignorar onde divergir do `PACIENTE_APP_API.md`).
- App motorista: `UNISISM-motorista/BACKEND_REQUIREMENTS.md` + `CLAUDE.md`.

## URLs por ambiente

| Ambiente | Base URL |
|---|---|
| Mac dev / iOS Simulator | `http://localhost:3333/v1` |
| Android emulator | `http://10.0.2.2:3333/v1` |
| Device físico (mesma Wi-Fi) | `http://<IP-DO-MAC>:3333/v1` (`ipconfig getifaddr en0`) |
| Produção | `https://<dominio-cliente>/v1` (parametrizar por tenant) |

## Checklist antes de fechar PR

- [ ] `flutter analyze` zero issue
- [ ] `flutter test` verde (smoke unitário)
- [ ] Testado em Android emulator + iOS simulator (ou nota explicando)
- [ ] Token persiste em `flutter_secure_storage`, nunca em `shared_preferences`
- [ ] Refresh interceptor cobre 401 e re-tenta UMA vez
- [ ] `REFRESH_REUSE_DETECTED` → apaga storage + tela "sessão encerrada"
- [ ] Mobile back button funciona em todas as rotas
- [ ] Não introduziu URL de produção hard-coded (vir de `.env` ou config build)
- [ ] Não introduziu logo/copy de cliente específico

## Padrões anti-corrupção

- Não usar `SharedPreferences` para token — só `FlutterSecureStorage`.
- Não duplicar tipos do backend — copiar `unisism_types.dart` do kit e adaptar mínimo.
- Não fazer chamada HTTP direto em widget — sempre via repository.
- Não hard-code nome de cliente / município no app.
- Não persistir refresh em log/crashlytics.
