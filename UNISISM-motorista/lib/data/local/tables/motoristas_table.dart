import 'package:drift/drift.dart';

/// Cache do perfil do motorista logado (e, opcionalmente, outros perfis
/// recentes em multi-device). Em produção real, geralmente só 1 linha.
@DataClassName('MotoristaRow')
class Motoristas extends Table {
  TextColumn get id => text()();
  TextColumn get nome => text()();
  TextColumn get cpf => text()();
  TextColumn get matricula => text()();
  TextColumn get cnh => text()();
  TextColumn get categoriaCnh => text()();
  DateTimeColumn get validadeCnh => dateTime()();
  TextColumn get telefone => text()();
  TextColumn get status => text()();
  IntColumn get totalViagens => integer().withDefault(const Constant(0))();
  IntColumn get totalKmRodados => integer().withDefault(const Constant(0))();
  TextColumn get prefeituraNome => text()();
  TextColumn get fotoUrl => text().nullable()();

  DateTimeColumn get serverUpdatedAt => dateTime().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}
