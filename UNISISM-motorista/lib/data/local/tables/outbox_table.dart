import 'package:drift/drift.dart';

/// Fila de mutações pendentes para envio ao backend.
///
/// Quando o motorista marca um passageiro como AUSENTE offline, gravamos
/// imediatamente o estado em `passageiros.presenca` (UI reflete) **e**
/// enfileiramos aqui o request para envio quando voltar online.
@DataClassName('OutboxRow')
class Outbox extends Table {
  IntColumn get id => integer().autoIncrement()();

  /// `POST` | `PATCH` | `DELETE` (sem `GET`).
  TextColumn get op => text()();

  /// Caminho relativo já resolvido (sem `:id` — substituído pelo valor real).
  /// Ex.: `/motorista-app/viagens/abc-123/passageiros/def-456/presenca`.
  TextColumn get path => text()();

  /// Body JSON serializado (ou string vazia em DELETE/PUT sem corpo).
  TextColumn get bodyJson => text().withDefault(const Constant(''))();

  /// Tipo da entidade afetada — apenas para inspeção/debug e UI ("4
  /// presenças pendentes"). Não muda lógica de envio.
  TextColumn get entityKind => text().nullable()();
  TextColumn get entityId => text().nullable()();

  IntColumn get attempts => integer().withDefault(const Constant(0))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get lastAttemptAt => dateTime().nullable()();
  TextColumn get lastError => text().nullable()();

  /// `PENDING` | `RETRYING` | `DONE` | `FAILED` | `CONFLICT`.
  TextColumn get status =>
      text().withDefault(const Constant('PENDING'))();
}
