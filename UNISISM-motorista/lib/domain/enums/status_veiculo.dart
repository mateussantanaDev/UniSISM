import '../../core/theme/tokens.dart';
import 'wire.dart';

enum StatusVeiculo {
  ativo('ATIVO'),
  emManutencao('EM_MANUTENCAO'),
  inativo('INATIVO');

  const StatusVeiculo(this.wire);
  final String wire;

  static StatusVeiculo fromWire(String value) =>
      StatusVeiculo.values.firstWhere(
        (e) => e.wire == value,
        orElse: () => throw WireException('StatusVeiculo', value),
      );

  String get rotulo => switch (this) {
    StatusVeiculo.ativo => 'Ativo',
    StatusVeiculo.emManutencao => 'Em manutenção',
    StatusVeiculo.inativo => 'Inativo',
  };

  Tone get tone => switch (this) {
    StatusVeiculo.ativo => Tone.success,
    StatusVeiculo.emManutencao => Tone.warning,
    StatusVeiculo.inativo => Tone.critical,
  };
}
