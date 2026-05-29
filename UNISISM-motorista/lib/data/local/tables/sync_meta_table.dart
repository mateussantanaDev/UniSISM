import 'package:drift/drift.dart';

/// Tabela chave/valor para metadados do sync engine.
///
/// Chaves conhecidas:
/// - `lastSyncAt` → ISO string vinda do header `X-Server-Time` da última pull
/// - `motoristaId` → id do motorista logado (cache rápido)
/// - `pendingCount` → contagem de mutações na outbox (pode ser derivada,
///   mas armazenada aqui pra UI ler sem fazer COUNT)
@DataClassName('SyncMetaRow')
class SyncMeta extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column<Object>> get primaryKey => {key};
}
