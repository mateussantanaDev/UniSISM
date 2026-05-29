import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/errors/api_exception.dart';
import '../data/api/tfd_api.dart';
import '../data/local/daos/motoristas_dao.dart';
import '../data/local/daos/outbox_dao.dart';
import '../data/local/daos/sync_meta_dao.dart';
import '../data/local/daos/viagens_dao.dart';
import 'outbox_processor.dart';

enum SyncRunState { idle, syncing, error }

@immutable
class SyncSnapshot {
  const SyncSnapshot({
    required this.state,
    required this.online,
    required this.pendingCount,
    this.lastSyncAt,
    this.lastError,
  });

  final SyncRunState state;
  final bool online;
  final int pendingCount;
  final DateTime? lastSyncAt;
  final String? lastError;

  SyncSnapshot copyWith({
    SyncRunState? state,
    bool? online,
    int? pendingCount,
    DateTime? lastSyncAt,
    String? lastError,
    bool clearError = false,
  }) => SyncSnapshot(
    state: state ?? this.state,
    online: online ?? this.online,
    pendingCount: pendingCount ?? this.pendingCount,
    lastSyncAt: lastSyncAt ?? this.lastSyncAt,
    lastError: clearError ? null : (lastError ?? this.lastError),
  );

  static const initial = SyncSnapshot(
    state: SyncRunState.idle,
    online: true,
    pendingCount: 0,
  );
}

/// Orquestra pull (servidor → DB local) + push (DB local → servidor via
/// outbox). Reage a mudanças de conectividade e a um timer periódico.
///
/// O `SyncEngine` é stateful — guarda apenas um `SyncSnapshot` reativo
/// que a UI consome via `snapshots` stream.
class SyncEngine {
  SyncEngine({
    required this.api,
    required this.viagensDao,
    required this.outboxDao,
    required this.syncMetaDao,
    required this.motoristasDao,
    this.pullEvery = const Duration(minutes: 5),
  }) : _processor = OutboxProcessor(
         api: api,
         outboxDao: outboxDao,
         viagensDao: viagensDao,
       );

  final TfdApi api;
  final ViagensDao viagensDao;
  final OutboxDao outboxDao;
  final SyncMetaDao syncMetaDao;
  final MotoristasDao motoristasDao;
  final Duration pullEvery;

  final OutboxProcessor _processor;
  final _controller = StreamController<SyncSnapshot>.broadcast();
  SyncSnapshot _snapshot = SyncSnapshot.initial;
  Timer? _timer;
  StreamSubscription<int>? _pendingSub;

  Stream<SyncSnapshot> get snapshots => _controller.stream;
  SyncSnapshot get current => _snapshot;

  /// Inicia o motor. Deve ser chamado **uma vez** quando o usuário fizer
  /// login (F6). `dispose()` no logout.
  Future<void> start() async {
    _pendingSub = outboxDao.watchPendingCount().listen((count) {
      _emit(_snapshot.copyWith(pendingCount: count));
    });
    _timer = Timer.periodic(pullEvery, (_) => syncAll());
    // Carrega lastSyncAt persistido
    final lastSync = await syncMetaDao.getLastSyncAt();
    _emit(_snapshot.copyWith(lastSyncAt: lastSync));
    await syncAll();
  }

  Future<void> dispose() async {
    _timer?.cancel();
    await _pendingSub?.cancel();
    await _controller.close();
  }

  /// Atualiza connectivity vinda do provider externo. Quando volta a
  /// ficar online, dispara um sync imediato.
  void setOnline(bool online) {
    final wasOffline = !_snapshot.online;
    _emit(_snapshot.copyWith(online: online));
    if (wasOffline && online) {
      unawaited(syncAll());
    }
  }

  /// Executa pull + push completos.
  Future<void> syncAll() async {
    if (_snapshot.state == SyncRunState.syncing) return;
    _emit(_snapshot.copyWith(state: SyncRunState.syncing, clearError: true));
    try {
      await _push();
      await _pull();
      _emit(_snapshot.copyWith(state: SyncRunState.idle, clearError: true));
    } on ApiException catch (e, st) {
      // Em release não há `print`, mas `debugPrint` continua útil quando
      // o app é rodado conectado ao Xcode/Console.app.
      debugPrint('[SYNC] ApiException: ${e.code} · ${e.message}\n$st');
      _emit(_snapshot.copyWith(
        state: e.isOffline ? SyncRunState.idle : SyncRunState.error,
        online: !e.isOffline,
        lastError: '${e.code}: ${e.message}',
      ));
    } catch (e, st) {
      debugPrint('[SYNC] erro inesperado: $e\n$st');
      _emit(_snapshot.copyWith(
        state: SyncRunState.error,
        lastError: e.toString(),
      ));
    }
  }

  Future<void> _push() async {
    await _processor.drain();
  }

  Future<void> _pull() async {
    final desde = await syncMetaDao.getLastSyncAt();
    final result = await api.minhasViagens(desde: desde);
    await viagensDao.upsertAll(result.data);

    // Atualiza perfil do motorista (cache local).
    try {
      final me = await api.me();
      await motoristasDao.upsert(me);
      await syncMetaDao.setMotoristaId(me.id);
    } on ApiException {
      // Falha em me() não invalida o pull de viagens.
    }

    await syncMetaDao.setLastSyncAt(result.serverTime);
    _emit(_snapshot.copyWith(lastSyncAt: result.serverTime));
  }

  void _emit(SyncSnapshot next) {
    _snapshot = next;
    _controller.add(next);
  }
}
