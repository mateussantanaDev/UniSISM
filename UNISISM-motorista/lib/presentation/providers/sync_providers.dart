import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/connectivity/connectivity.dart';
import '../../data/local/database.dart';
import '../../data/repositories/viagens_repository.dart';
import '../../sync/sync_engine.dart';
import '../widgets/sync_indicator.dart';
import 'api_providers.dart';

final databaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});

final viagensRepositoryProvider = Provider<ViagensRepository>((ref) {
  final db = ref.watch(databaseProvider);
  return ViagensRepository(
    api: ref.watch(tfdApiProvider),
    viagensDao: db.viagensDao,
    outboxDao: db.outboxDao,
  );
});

final syncEngineProvider = Provider<SyncEngine>((ref) {
  final db = ref.watch(databaseProvider);
  final engine = SyncEngine(
    api: ref.watch(tfdApiProvider),
    viagensDao: db.viagensDao,
    outboxDao: db.outboxDao,
    syncMetaDao: db.syncMetaDao,
    motoristasDao: db.motoristasDao,
  );
  ref.onDispose(engine.dispose);
  // Liga a connectivity ao engine.
  ref.listen<bool>(isOnlineProvider, (prev, next) {
    engine.setOnline(next);
  }, fireImmediately: true);
  return engine;
});

/// Snapshot reativo consumido pelo `SyncIndicator`.
final syncSnapshotProvider = StreamProvider<SyncSnapshot>((ref) {
  final engine = ref.watch(syncEngineProvider);
  return engine.snapshots;
});

/// Status mapeado pro widget — facilita o consumo direto na UI.
final syncStatusProvider = Provider<({SyncStatus status, int pending})>((ref) {
  final snap = ref.watch(syncSnapshotProvider).valueOrNull;
  if (snap == null) {
    return (status: SyncStatus.syncing, pending: 0);
  }
  final s = snap;
  if (s.state == SyncRunState.error) {
    return (status: SyncStatus.error, pending: s.pendingCount);
  }
  if (!s.online) {
    return (status: SyncStatus.offlinePending, pending: s.pendingCount);
  }
  if (s.state == SyncRunState.syncing) {
    return (status: SyncStatus.syncing, pending: s.pendingCount);
  }
  if (s.pendingCount > 0) {
    return (status: SyncStatus.offlinePending, pending: s.pendingCount);
  }
  return (status: SyncStatus.synced, pending: 0);
});
