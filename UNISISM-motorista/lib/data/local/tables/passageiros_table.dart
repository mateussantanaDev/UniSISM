import 'package:drift/drift.dart';

import 'viagens_table.dart';

/// Passageiros das viagens. Tabela separada para permitir consultar/contar
/// presenças sem reidratar JSON da viagem inteira (custo da chamada digital
/// = O(1) leitura por linha).
@DataClassName('PassageiroRow')
class Passageiros extends Table {
  TextColumn get id => text()();
  TextColumn get viagemId =>
      text().references(Viagens, #id, onDelete: KeyAction.cascade)();

  TextColumn get pacienteId => text()();
  TextColumn get pacienteNome => text()();
  TextColumn get pacienteCpf => text()();
  TextColumn get solicitacaoProtocolo => text()();
  TextColumn get solicitacaoPrioridade => text()();
  BoolColumn get acompanhante => boolean().withDefault(const Constant(false))();

  /// `PresencaPassageiro.wire`.
  TextColumn get presenca => text()();
  TextColumn get observacao => text().nullable()();
  DateTimeColumn get marcadoEm => dateTime().nullable()();
  TextColumn get marcadoPor => text().nullable()();

  BoolColumn get dirty => boolean().withDefault(const Constant(false))();

  /// JSON canônico de `Passageiro.toJson()` — usado pra reidratar foto,
  /// dataNascimento, observacoesMobilidade, etc.
  TextColumn get rawJson => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}
