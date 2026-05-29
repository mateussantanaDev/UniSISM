import 'package:drift/drift.dart';

/// Cache local das viagens do motorista. Espelha (parcialmente) o modelo
/// `Viagem` do domínio. Colunas críticas para consulta ficam tipadas; o
/// resto vai serializado em `rawJson` para reidratar o objeto inteiro.
@DataClassName('ViagemRow')
class Viagens extends Table {
  TextColumn get id => text()();
  TextColumn get protocolo => text().nullable()();
  DateTimeColumn get data => dateTime()();
  TextColumn get horaSaida => text()();
  TextColumn get horaPrevistaRetorno => text().nullable()();
  TextColumn get destino => text()();
  TextColumn get unidadeDestino => text().nullable()();

  TextColumn get veiculoId => text()();
  TextColumn get veiculoPlaca => text()();
  TextColumn get veiculoModelo => text()();

  TextColumn get motoristaId => text()();

  IntColumn get vagasTotais => integer()();
  IntColumn get kmInicialHodometro => integer().nullable()();
  IntColumn get kmFinalHodometro => integer().nullable()();

  /// `StatusViagem.wire` (`AGENDADA`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`).
  TextColumn get status => text()();

  DateTimeColumn get iniciadaEm => dateTime().nullable()();
  DateTimeColumn get concluidaEm => dateTime().nullable()();

  /// Timestamp informado pelo servidor (`atualizadoEm`). Usado pelo sync
  /// engine para decidir merge.
  DateTimeColumn get serverUpdatedAt => dateTime().nullable()();

  /// `true` quando a viagem tem mutação local ainda não confirmada pelo
  /// servidor (outbox pendente).
  BoolColumn get dirty => boolean().withDefault(const Constant(false))();

  /// JSON canônico de `Viagem.toJson()` SEM o array `passageiros` (esse
  /// vive na tabela `passageiros`). Usado para reidratar campos não
  /// indexados (`rotaResumo`, `observacoes`, `coordOrigem/Destino` etc.).
  TextColumn get rawJson => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}
