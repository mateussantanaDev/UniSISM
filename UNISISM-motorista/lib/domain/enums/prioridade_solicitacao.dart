import '../../core/theme/tokens.dart';
import 'wire.dart';

enum PrioridadeSolicitacao {
  eletiva('ELETIVA'),
  prioritaria('PRIORITARIA'),
  urgente('URGENTE');

  const PrioridadeSolicitacao(this.wire);
  final String wire;

  static PrioridadeSolicitacao fromWire(String value) =>
      PrioridadeSolicitacao.values.firstWhere(
        (e) => e.wire == value,
        orElse: () => throw WireException('PrioridadeSolicitacao', value),
      );

  String get rotulo => switch (this) {
    PrioridadeSolicitacao.eletiva => 'Eletiva',
    PrioridadeSolicitacao.prioritaria => 'Prioritária',
    PrioridadeSolicitacao.urgente => 'Urgente',
  };

  Tone get tone => switch (this) {
    PrioridadeSolicitacao.eletiva => Tone.neutral,
    PrioridadeSolicitacao.prioritaria => Tone.warning,
    PrioridadeSolicitacao.urgente => Tone.critical,
  };
}
