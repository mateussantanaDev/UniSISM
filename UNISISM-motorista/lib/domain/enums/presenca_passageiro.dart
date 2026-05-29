import 'package:flutter/material.dart';

import '../../core/theme/tokens.dart';
import 'wire.dart';

enum PresencaPassageiro {
  aguardando('AGUARDANDO'),
  confirmado('CONFIRMADO'),
  embarcado('EMBARCADO'),
  ausente('AUSENTE'),
  desistiu('DESISTIU');

  const PresencaPassageiro(this.wire);
  final String wire;

  static PresencaPassageiro fromWire(String value) =>
      PresencaPassageiro.values.firstWhere(
        (e) => e.wire == value,
        orElse: () => throw WireException('PresencaPassageiro', value),
      );

  /// Rótulo curto pra badge (palavra única, fácil de entender).
  String get rotulo => switch (this) {
    PresencaPassageiro.aguardando => 'Aguardando',
    PresencaPassageiro.confirmado => 'Confirmou',
    PresencaPassageiro.embarcado => 'Embarcou',
    PresencaPassageiro.ausente => 'Faltou',
    PresencaPassageiro.desistiu => 'Desistiu',
  };

  /// Frase pra confirmar ação ("Marcar como embarcou").
  String get acao => switch (this) {
    PresencaPassageiro.aguardando => 'Voltar pra aguardando',
    PresencaPassageiro.confirmado => 'Marcar como confirmou',
    PresencaPassageiro.embarcado => 'Embarcou',
    PresencaPassageiro.ausente => 'Faltou',
    PresencaPassageiro.desistiu => 'Desistiu',
  };

  Tone get tone => switch (this) {
    PresencaPassageiro.aguardando => Tone.neutral,
    PresencaPassageiro.confirmado => Tone.info,
    PresencaPassageiro.embarcado => Tone.success,
    PresencaPassageiro.ausente => Tone.critical,
    PresencaPassageiro.desistiu => Tone.warning,
  };

  IconData get icone => switch (this) {
    PresencaPassageiro.aguardando => Icons.schedule,
    PresencaPassageiro.confirmado => Icons.thumb_up,
    PresencaPassageiro.embarcado => Icons.check_circle,
    PresencaPassageiro.ausente => Icons.cancel,
    PresencaPassageiro.desistiu => Icons.block,
  };
}
