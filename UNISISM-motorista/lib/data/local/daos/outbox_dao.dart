import 'dart:convert';

import 'package:drift/drift.dart';

import '../database.dart';
import '../tables/outbox_table.dart';

part 'outbox_dao.g.dart';

/// Status possíveis de uma mutação na outbox.
class OutboxStatus {
  static const pending = 'PENDING';
  static const retrying = 'RETRYING';
  static const done = 'DONE';
  static const failed = 'FAILED';
  static const conflict = 'CONFLICT';
}

@DriftAccessor(tables: [Outbox])
class OutboxDao extends DatabaseAccessor<AppDatabase>
    with _$OutboxDaoMixin {
  OutboxDao(super.db);

  Future<int> enqueue({
    required String op,
    required String path,
    Map<String, dynamic>? body,
    String? entityKind,
    String? entityId,
  }) {
    return into(outbox).insert(
      OutboxCompanion.insert(
        op: op,
        path: path,
        bodyJson: Value(body == null ? '' : jsonEncode(body)),
        entityKind: Value(entityKind),
        entityId: Value(entityId),
        createdAt: DateTime.now(),
      ),
    );
  }

  Future<List<OutboxRow>> pending({int limit = 50}) {
    return (select(outbox)
          ..where(
            (o) => o.status.isIn([OutboxStatus.pending, OutboxStatus.retrying]),
          )
          ..orderBy([(o) => OrderingTerm.asc(o.id)])
          ..limit(limit))
        .get();
  }

  Future<int> pendingCount() async {
    final count = outbox.id.count();
    final query = selectOnly(outbox)
      ..addColumns([count])
      ..where(
        outbox.status.isIn([OutboxStatus.pending, OutboxStatus.retrying]),
      );
    final row = await query.getSingle();
    return row.read(count) ?? 0;
  }

  Stream<int> watchPendingCount() {
    final count = outbox.id.count();
    final query = selectOnly(outbox)
      ..addColumns([count])
      ..where(
        outbox.status.isIn([OutboxStatus.pending, OutboxStatus.retrying]),
      );
    return query.watchSingle().map((row) => row.read(count) ?? 0);
  }

  Future<void> markDone(int id) {
    return (update(outbox)..where((o) => o.id.equals(id))).write(
      OutboxCompanion(
        status: const Value(OutboxStatus.done),
        lastAttemptAt: Value(DateTime.now()),
        lastError: const Value(null),
      ),
    );
  }

  Future<void> markFailed(int id, String error, {bool conflict = false}) {
    return (update(outbox)..where((o) => o.id.equals(id))).write(
      OutboxCompanion(
        status: Value(
          conflict ? OutboxStatus.conflict : OutboxStatus.failed,
        ),
        lastAttemptAt: Value(DateTime.now()),
        lastError: Value(error),
      ),
    );
  }

  Future<void> markRetrying(int id) async {
    final attempts = await _attemptsOf(id);
    await (update(outbox)..where((o) => o.id.equals(id))).write(
      OutboxCompanion(
        status: const Value(OutboxStatus.retrying),
        attempts: Value(attempts + 1),
        lastAttemptAt: Value(DateTime.now()),
      ),
    );
  }

  Future<int> _attemptsOf(int id) async {
    final row = await (select(outbox)..where((o) => o.id.equals(id)))
        .getSingleOrNull();
    return row?.attempts ?? 0;
  }

  /// Limpa entradas `DONE` antigas. Mantém `FAILED`/`CONFLICT` para
  /// inspeção manual no perfil do motorista.
  Future<int> gcDone({Duration olderThan = const Duration(days: 7)}) {
    final cutoff = DateTime.now().subtract(olderThan);
    return (delete(outbox)
          ..where(
            (o) =>
                o.status.equals(OutboxStatus.done) &
                o.lastAttemptAt.isSmallerThanValue(cutoff),
          ))
        .go();
  }

  Future<void> clear() => delete(outbox).go();
}
