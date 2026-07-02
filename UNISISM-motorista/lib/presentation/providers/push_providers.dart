import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exception.dart';
import '../../core/router.dart';
import '../../data/push/ntfy_push_service.dart';
import '../../data/push/push_service.dart';
import '../../sync/outbox_kinds.dart';
import 'api_providers.dart';
import 'sync_providers.dart';

/// Provider do `PushService`. Default = `NtfyPushService` (ntfy.sh).
final pushServiceProvider = Provider<PushService>((ref) {
  final svc = NtfyPushService();
  ref.onDispose(svc.dispose);
  return svc;
});

/// Ativador do push: após login, registra o token via outbox e amarra os
/// listeners (refresh em foreground, navegação em open).
///
/// É um Provider auto-disposable que precisa ser observado pelo widget
/// raiz autenticado (ex.: `ListaViagensScreen` no `initState`).
final pushBootstrapProvider = Provider<_PushBootstrap>((ref) {
  final svc = ref.watch(pushServiceProvider);
  final bootstrap = _PushBootstrap(ref: ref, service: svc);
  ref.onDispose(bootstrap.dispose);
  return bootstrap;
});

class _PushBootstrap {
  _PushBootstrap({required this.ref, required this.service});

  final Ref ref;
  final PushService service;
  bool _started = false;
  final _subs = <StreamSubscription<Object>>[];

  Future<void> start() async {
    if (_started) return;
    _started = true;

    await service.init();

    final initialToken = await service.token();
    if (initialToken != null) {
      await _registrarToken(initialToken);
    }

    _subs.add(
      service.onTokenRefresh.listen(_registrarToken),
    );

    _subs.add(
      service.onMessage.listen((_) {
        // Foreground push → atualizar a lista de viagens.
        unawaited(ref.read(syncEngineProvider).syncAll());
      }),
    );

    _subs.add(
      service.onOpened.listen((payload) {
        if (payload.viagemId == null) return;
        // Navega usando o GoRouter exportado em core/router.
        try {
          ref.read(routerProvider).go('/viagens/${payload.viagemId}');
        } catch (_) {
          // Router pode não estar pronto se o app acabou de subir.
        }
      }),
    );
  }

  Future<void> _registrarToken(String token) async {
    final db = ref.read(databaseProvider);
    try {
      // Tenta direto. Se falhar (offline), enfileira.
      await ref.read(tfdApiProvider).registrarFcmToken(token);
    } on ApiException catch (e) {
      if (!e.isOffline) return; // ignora 4xx, não vale reenfileirar
      await db.outboxDao.enqueue(
        op: 'POST',
        path: '/motorista-app/me/fcm-token',
        body: {'fcmToken': token},
        entityKind: OutboxKinds.registrarFcm,
      );
    }
  }

  Future<void> dispose() async {
    for (final s in _subs) {
      await s.cancel();
    }
    _subs.clear();
    _started = false;
  }
}
