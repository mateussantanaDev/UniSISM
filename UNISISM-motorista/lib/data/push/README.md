# Push Notifications (F15)

A interface [`PushService`](push_service.dart) é abstrata. Por default o app
usa [`NullPushService`](null_push_service.dart) — no-op que mantém o app
funcionando sem Firebase.

## Por que não vem com Firebase ativo

Ativar Firebase Cloud Messaging exige configuração externa que o usuário
precisa fazer:

1. Criar projeto no [Firebase Console](https://console.firebase.google.com).
2. Adicionar app Android com package `br.gov.aguasbelas.unisism.unisism_motorista`
   → baixar `google-services.json` e colocar em `android/app/`.
3. Adicionar app iOS com bundle ID idêntico → baixar `GoogleService-Info.plist`
   e adicionar via Xcode em `ios/Runner/`. Configurar certificado APNs
   no console.
4. Rodar `flutterfire configure` (do CLI `flutterfire_cli`) → gera
   `lib/firebase_options.dart`.

Além disso, o **backend** (`unisism-ubs/backend`) precisa expor:
- `POST /motorista-app/me/fcm-token { fcmToken }`
- `DELETE /motorista-app/me/fcm-token` (no logout)
- Lógica de despacho de push quando: nova viagem alocada, passageiro
  adicionado/removido, viagem cancelada.

Tudo já está documentado em [`BACKEND_REQUIREMENTS.md`](../../../BACKEND_REQUIREMENTS.md) §2.5.

## Como ativar quando estiver pronto

1. Descomentar `firebase_core` e `firebase_messaging` no `pubspec.yaml`.
2. `flutter pub get`.
3. Criar arquivo `firebase_push_service.dart` aqui ao lado, implementando
   `PushService`:

```dart
import 'package:firebase_messaging/firebase_messaging.dart';
import 'push_service.dart';

class FirebasePushService implements PushService {
  final _fcm = FirebaseMessaging.instance;
  late final _tokenCtrl = StreamController<String>.broadcast();
  late final _messageCtrl = StreamController<PushPayload>.broadcast();
  late final _openedCtrl = StreamController<PushPayload>.broadcast();

  @override
  Future<void> init() async {
    await _fcm.requestPermission();
    _fcm.onTokenRefresh.listen(_tokenCtrl.add);
    FirebaseMessaging.onMessage.listen(
      (m) => _messageCtrl.add(_toPayload(m)),
    );
    FirebaseMessaging.onMessageOpenedApp.listen(
      (m) => _openedCtrl.add(_toPayload(m)),
    );
  }

  @override
  Future<String?> token() => _fcm.getToken();

  PushPayload _toPayload(RemoteMessage m) => PushPayload(
        titulo: m.notification?.title ?? '',
        corpo: m.notification?.body ?? '',
        viagemId: m.data['viagemId'] as String?,
        tipo: m.data['tipo'] as String?,
      );

  @override
  Stream<String> get onTokenRefresh => _tokenCtrl.stream;
  @override
  Stream<PushPayload> get onMessage => _messageCtrl.stream;
  @override
  Stream<PushPayload> get onOpened => _openedCtrl.stream;
  @override
  Future<void> dispose() async {
    await _tokenCtrl.close();
    await _messageCtrl.close();
    await _openedCtrl.close();
  }
}
```

4. Em `main.dart`, antes do `runApp`:

```dart
await Firebase.initializeApp(
  options: DefaultFirebaseOptions.currentPlatform,
);
```

5. Em `push_providers.dart`, substituir `NullPushService()` por
   `FirebasePushService()`.

## Hooks já integrados

O `AuthController` (F6) já chama `pushService.init()` após login bem-sucedido
e `pushService.dispose()` no logout. Quando o `FirebasePushService` for
plugado, ele entra no fluxo sem mudanças adicionais.
