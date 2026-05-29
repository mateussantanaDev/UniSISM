# UNISISM · App do Paciente (Flutter) — guia de integração

Este diretório contém tudo que o app Flutter precisa para consumir a API `/paciente-app/*`.

| Arquivo | Para quê |
|---|---|
| [`unisism_types.dart`](unisism_types.dart) | Tipos Dart (Encaminhamento, Notificação, Paciente, erros) com `fromJson` |
| [`unisism_api.dart`](unisism_api.dart) | Cliente HTTP tipado com `dio` — cobre 100% de `/paciente-app/*` |
| [`README.md`](README.md) | Este guia |

---

## 🚀 Setup em 5 passos

### 1. Copiar os arquivos

```bash
mkdir -p frontend_mobile/lib/api
cp backend/docs/flutter/unisism_types.dart  frontend_mobile/lib/api/
cp backend/docs/flutter/unisism_api.dart    frontend_mobile/lib/api/
```

### 2. `pubspec.yaml`

```yaml
dependencies:
  flutter:
    sdk: flutter
  dio: ^5.4.0
  flutter_secure_storage: ^9.0.0    # persiste o token cifrado no device
  meta: ^1.11.0                     # @immutable

  # Opcionais (para download/compartilhamento de PDF):
  path_provider: ^2.1.0
  open_filex: ^4.4.0                # abrir PDF no visualizador nativo
  share_plus: ^7.2.0                # compartilhar (WhatsApp, Email...)

  # Opcional (push notifications — ver §5):
  firebase_core: ^2.24.0
  firebase_messaging: ^14.7.0
```

### 3. Descobrir a URL certa para o emulator/device

| Cenário | Base URL |
|---|---|
| **Android emulator** (AVD) | `http://10.0.2.2:3333/v1` |
| **iOS Simulator** | `http://localhost:3333/v1` |
| **Dispositivo físico (mesma Wi-Fi)** | `http://<IP-da-sua-máquina>:3333/v1` (ex.: `http://192.168.0.12:3333/v1`) |
| **Produção** | `https://api.unisism.aguasbelas.pe.gov.br/v1` |

> 💡 Para dispositivo físico Android, pode ser necessário permitir cleartext HTTP em dev. No `android/app/src/main/AndroidManifest.xml`:
> ```xml
> <application ... android:usesCleartextTraffic="true">
> ```

### 4. Instanciar o client uma vez (singleton)

`lib/api/api.dart`:

```dart
import 'package:flutter/foundation.dart';
import 'unisism_api.dart';

String _resolveBaseUrl() {
  // Use --dart-define=API_BASE_URL=... em produção
  const custom = String.fromEnvironment('API_BASE_URL');
  if (custom.isNotEmpty) return custom;
  // Default dev:
  if (defaultTargetPlatform == TargetPlatform.android) {
    return 'http://10.0.2.2:3333/v1';
  }
  return 'http://localhost:3333/v1';
}

final api = UnisismApi(baseUrl: _resolveBaseUrl());
```

Rodar com URL customizada:
```bash
flutter run --dart-define=API_BASE_URL=https://api.unisism.aguasbelas.pe.gov.br/v1
```

### 5. Usar nos widgets

```dart
import 'api/api.dart';
import 'api/unisism_types.dart';

// Login
Future<void> entrar(String cpf, String senha) async {
  try {
    await api.login(cpf: cpf, senha: senha);
    // navegue pra home
  } on DioException catch (e) {
    final err = e.error;
    if (err is UnisismApiError) {
      if (err.code == 'CREDENCIAIS_INVALIDAS') {
        mostrarErro('CPF ou senha inválidos');
      } else if (err.code == 'CONTA_NAO_ATIVADA') {
        // redirecione para a tela de ativação
      }
    }
  }
}

// Home: timeline de notificações
FutureBuilder<List<NotificacaoPaciente>>(
  future: api.listarNotificacoes(),
  builder: (_, snap) {
    if (!snap.hasData) return const CircularProgressIndicator();
    return ListView(
      children: snap.data!
          .map((n) => ListTile(
                leading: Text(n.titulo.substring(0, 2)), // emoji
                title: Text(n.titulo),
                subtitle: Text(n.corpo),
                trailing: n.lida ? null : const Icon(Icons.circle, size: 10, color: Colors.blue),
                onTap: () async {
                  await api.marcarLida(n.id);
                  if (n.encaminhamentoId != null) {
                    // navega pro detalhe
                  }
                },
              ))
          .toList(),
    );
  },
);

// Download do PDF de resposta SUS
Future<void> baixarRespostaSUS(Encaminhamento enc) async {
  final anexo = enc.anexoRespostaSUS;
  if (anexo == null) return;
  if (!anexo.liberadoParaDownload) {
    // scanStatus != LIMPO — mostrar aviso
    return;
  }
  final dl = await api.baixarAnexo(anexo.id);
  final dir = await getTemporaryDirectory();
  final file = File('${dir.path}/${dl.filename}');
  await file.writeAsBytes(dl.bytes);
  // Abrir:
  await OpenFilex.open(file.path);
  // Ou compartilhar:
  // await Share.shareXFiles([XFile(file.path)]);
}
```

---

## 🎨 Ícones sugeridos por tipo de notificação

O backend já envia emoji no início do `titulo`. Mas se quiser mapear pra Material Icons:

```dart
IconData iconeDaNotificacao(String tipo) {
  switch (tipo) {
    case TipoNotificacao.encaminhamentoCriado:   return Icons.send_outlined;
    case TipoNotificacao.pendenciaRegistrada:    return Icons.warning_amber;
    case TipoNotificacao.pendenciaResolvida:     return Icons.check_circle_outline;
    case TipoNotificacao.aprovado:               return Icons.verified_outlined;
    case TipoNotificacao.agendado:               return Icons.event;
    case TipoNotificacao.rejeitado:              return Icons.cancel_outlined;
    case TipoNotificacao.respostaSusDisponivel:  return Icons.picture_as_pdf;
    default:                                     return Icons.notifications_outlined;
  }
}

Color corDaNotificacao(String tipo) {
  switch (tipo) {
    case TipoNotificacao.aprovado:
    case TipoNotificacao.pendenciaResolvida:
      return Colors.green;
    case TipoNotificacao.pendenciaRegistrada:
      return Colors.orange;
    case TipoNotificacao.rejeitado:
      return Colors.red;
    case TipoNotificacao.respostaSusDisponivel:
      return Colors.blue;
    default:
      return Colors.grey;
  }
}
```

---

## 🔁 Polling vs Push (roadmap)

**Hoje**: o app precisa chamar `api.listarNotificacoes()` e `api.contadorNaoLidas()` periodicamente.

**Abordagens recomendadas:**

| Tela | Estratégia |
|---|---|
| Home (badge de notificações) | Polling a cada 30-60s quando app em foreground |
| Tela de notificações aberta | Refresh ao abrir + pull-to-refresh manual |
| Background | Worker `workmanager` a cada 15min (opcional) |

Exemplo simples com `Timer`:

```dart
class BadgeNotificacoes extends StatefulWidget {
  @override State<BadgeNotificacoes> createState() => _State();
}
class _State extends State<BadgeNotificacoes> with WidgetsBindingObserver {
  int _count = 0;
  Timer? _timer;

  @override void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
    _timer = Timer.periodic(const Duration(seconds: 45), (_) => _refresh());
  }

  Future<void> _refresh() async {
    try {
      final n = await api.contadorNaoLidas();
      if (mounted) setState(() => _count = n);
    } catch (_) { /* ignora */ }
  }

  @override Widget build(BuildContext c) => Badge(label: Text('$_count'), child: const Icon(Icons.notifications));
}
```

### Roadmap: **FCM (push notifications real-time)**

Quando plugarmos Firebase no backend (via outbox → webhook → FCM), o app só precisará:

1. Adicionar `firebase_messaging` e registrar o token do device na primeira ativação:
   ```dart
   final fcmToken = await FirebaseMessaging.instance.getToken();
   await api.registrarDeviceToken(fcmToken); // endpoint roadmap
   ```
2. Handler em foreground + background — receber `{ notificacaoId, encaminhamentoId }` e atualizar a UI.

O backend já tem o outbox pattern publicando eventos `notificacao.*` — plugar num worker FCM é a próxima iteração.

---

## 🛡️ Tratamento de erros — tabela rápida

Todo erro da API vem como `UnisismApiError` com `code` estável. Mapeie para mensagens amigáveis:

```dart
String mensagemAmigavel(UnisismApiError err) {
  switch (err.code) {
    case 'CREDENCIAIS_INVALIDAS':      return 'CPF ou senha incorretos.';
    case 'CONTA_NAO_ATIVADA':          return 'Ative sua conta no primeiro acesso.';
    case 'CONTA_JA_ATIVADA':           return 'Esta conta já foi ativada. Use o login normal.';
    case 'CONFIRMACAO_INVALIDA':       return 'CPF ou data de nascimento não conferem.';
    case 'SENHA_FRACA':                return 'A senha precisa ter ao menos 8 caracteres.';
    case 'TOKEN_EXPIRADO':             return 'Sua sessão expirou. Faça login novamente.';
    case 'ANEXO_NAO_LIBERADO':         return 'Arquivo em análise de segurança. Tente em alguns segundos.';
    case 'ANEXO_NAO_ENCONTRADO':       return 'Documento não encontrado.';
    case 'NOTIFICACAO_NAO_ENCONTRADA': return 'Notificação não encontrada.';
    default:                           return err.message;
  }
}
```

---

## 👤 Conta de teste (seed do backend)

Após `npm run db:seed`:

```
CPF:   123.456.789-00
Senha: 12345678
Nome:  MARIA APARECIDA DA SILVA SANTOS
```

Login no app já retorna encaminhamentos + timeline preenchidos pra testar visualmente.

---

## 🗺️ Mapa rápido: rota API → método do cliente Dart

| Método HTTP | Rota | `api.xxx()` |
|---|---|---|
| POST | `/paciente-app/auth/login` | `api.login(cpf, senha)` |
| POST | `/paciente-app/auth/ativar-conta` | `api.ativarConta(...)` |
| POST | `/paciente-app/auth/logout` | `api.logout()` |
| GET | `/paciente-app/me` | `api.me()` |
| GET | `/paciente-app/meus-encaminhamentos` | `api.meusEncaminhamentos()` |
| GET | `/paciente-app/notificacoes` | `api.listarNotificacoes()` |
| GET | `/paciente-app/notificacoes/count` | `api.contadorNaoLidas()` |
| POST | `/paciente-app/notificacoes/:id/lida` | `api.marcarLida(id)` |
| POST | `/paciente-app/notificacoes/marcar-todas-lidas` | `api.marcarTodasLidas()` |
| GET | `/paciente-app/anexos/:id/download` | `api.baixarAnexo(id)` |

Tudo o que for além disso (ex.: endpoints da Face 1/2) está fora do escopo do app do paciente — são consumidos pelas webapps de UBS e SMS.

---

## 📦 Estrutura sugerida do app

```
lib/
├── api/
│   ├── unisism_types.dart    (copiado daqui)
│   ├── unisism_api.dart      (copiado daqui)
│   └── api.dart              (singleton UnisismApi)
├── screens/
│   ├── login.dart
│   ├── ativar_conta.dart
│   ├── home.dart             (timeline de notificações)
│   ├── encaminhamento_detalhe.dart
│   └── perfil.dart
├── widgets/
│   ├── card_notificacao.dart
│   └── status_badge.dart
└── main.dart
```

Qualquer dúvida sobre contrato HTTP → `docs/API.md`. Sobre o que mudou → `docs/CHANGELOG.md`.
