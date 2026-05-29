import 'dart:async';

import 'push_service.dart';

/// Implementação no-op de [PushService] — usado quando o Firebase não
/// está configurado no projeto.
///
/// Streams ficam abertos mas nunca emitem; `token()` devolve `null`;
/// `init()` retorna imediatamente. App funciona normalmente sem push.
class NullPushService implements PushService {
  final _tokenCtrl = StreamController<String>.broadcast();
  final _messageCtrl = StreamController<PushPayload>.broadcast();
  final _openedCtrl = StreamController<PushPayload>.broadcast();

  @override
  Future<void> init() async {}

  @override
  Future<String?> token() async => null;

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
