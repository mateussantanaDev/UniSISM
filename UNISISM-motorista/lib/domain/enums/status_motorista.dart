import '../../core/theme/tokens.dart';
import 'wire.dart';

enum StatusMotorista {
  ativo('ATIVO'),
  afastado('AFASTADO'),
  inativo('INATIVO');

  const StatusMotorista(this.wire);
  final String wire;

  static StatusMotorista fromWire(String value) =>
      StatusMotorista.values.firstWhere(
        (e) => e.wire == value,
        orElse: () => throw WireException('StatusMotorista', value),
      );

  String get rotulo => switch (this) {
    StatusMotorista.ativo => 'Ativo',
    StatusMotorista.afastado => 'Afastado',
    StatusMotorista.inativo => 'Inativo',
  };

  Tone get tone => switch (this) {
    StatusMotorista.ativo => Tone.success,
    StatusMotorista.afastado => Tone.warning,
    StatusMotorista.inativo => Tone.critical,
  };
}
