import 'package:drift/drift.dart';

import '../database.dart';
import '../tables/sync_meta_table.dart';

part 'sync_meta_dao.g.dart';

/// Chaves canônicas.
class SyncMetaKeys {
  static const lastSyncAt = 'lastSyncAt';
  static const motoristaId = 'motoristaId';
}

@DriftAccessor(tables: [SyncMeta])
class SyncMetaDao extends DatabaseAccessor<AppDatabase>
    with _$SyncMetaDaoMixin {
  SyncMetaDao(super.db);

  Future<String?> get(String key) async {
    final row = await (select(syncMeta)..where((m) => m.key.equals(key)))
        .getSingleOrNull();
    return row?.value;
  }

  Future<void> set(String key, String value) async {
    await into(syncMeta).insertOnConflictUpdate(
      SyncMetaCompanion.insert(key: key, value: value),
    );
  }

  Future<DateTime?> getLastSyncAt() async {
    final v = await get(SyncMetaKeys.lastSyncAt);
    return v == null ? null : DateTime.parse(v);
  }

  Future<void> setLastSyncAt(DateTime t) =>
      set(SyncMetaKeys.lastSyncAt, t.toUtc().toIso8601String());

  Future<String?> getMotoristaId() => get(SyncMetaKeys.motoristaId);
  Future<void> setMotoristaId(String id) =>
      set(SyncMetaKeys.motoristaId, id);
}
