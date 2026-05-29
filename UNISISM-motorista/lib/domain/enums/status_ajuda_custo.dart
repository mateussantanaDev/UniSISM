import '../../core/theme/tokens.dart';
import 'wire.dart';

enum StatusAjudaCusto {
  pendente('PENDENTE'),
  autorizada('AUTORIZADA'),
  paga('PAGA'),
  negada('NEGADA'),
  cancelada('CANCELADA');

  const StatusAjudaCusto(this.wire);
  final String wire;

  static StatusAjudaCusto fromWire(String value) =>
      StatusAjudaCusto.values.firstWhere(
        (e) => e.wire == value,
        orElse: () => throw WireException('StatusAjudaCusto', value),
      );

  String get rotulo => switch (this) {
    StatusAjudaCusto.pendente => 'Pendente',
    StatusAjudaCusto.autorizada => 'Autorizada',
    StatusAjudaCusto.paga => 'Paga',
    StatusAjudaCusto.negada => 'Negada',
    StatusAjudaCusto.cancelada => 'Cancelada',
  };

  Tone get tone => switch (this) {
    StatusAjudaCusto.pendente => Tone.warning,
    StatusAjudaCusto.autorizada => Tone.info,
    StatusAjudaCusto.paga => Tone.success,
    StatusAjudaCusto.negada => Tone.critical,
    StatusAjudaCusto.cancelada => Tone.neutral,
  };
}
