import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

import 'daos/motoristas_dao.dart';
import 'daos/outbox_dao.dart';
import 'daos/sync_meta_dao.dart';
import 'daos/viagens_dao.dart';
import 'tables/motoristas_table.dart';
import 'tables/outbox_table.dart';
import 'tables/passageiros_table.dart';
import 'tables/sync_meta_table.dart';
import 'tables/viagens_table.dart';

part 'database.g.dart';

@DriftDatabase(
  tables: [Viagens, Passageiros, Outbox, SyncMeta, Motoristas],
  daos: [ViagensDao, OutboxDao, SyncMetaDao, MotoristasDao],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase([QueryExecutor? executor])
    : super(executor ?? driftDatabase(name: 'unisism_motorista_v1'));

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) async {
      await m.createAll();
      // Índices auxiliares para queries quentes.
      await customStatement(
        'CREATE INDEX idx_viagens_data ON viagens (data)',
      );
      await customStatement(
        'CREATE INDEX idx_viagens_status ON viagens (status)',
      );
      await customStatement(
        'CREATE INDEX idx_passageiros_viagem ON passageiros (viagem_id)',
      );
      await customStatement(
        'CREATE INDEX idx_outbox_status ON outbox (status)',
      );
    },
  );

  // Limpa tudo (usado no logout — F6).
  Future<void> wipe() async {
    await batch((b) {
      b.deleteWhere(viagens, (_) => const Constant(true));
      b.deleteWhere(passageiros, (_) => const Constant(true));
      b.deleteWhere(outbox, (_) => const Constant(true));
      b.deleteWhere(syncMeta, (_) => const Constant(true));
      b.deleteWhere(motoristas, (_) => const Constant(true));
    });
  }
}
