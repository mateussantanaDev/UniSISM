import 'package:flutter/material.dart';

import '../../core/theme/tokens.dart';
import 'wire.dart';

enum StatusViagem {
  agendada('AGENDADA'),
  emAndamento('EM_ANDAMENTO'),
  concluida('CONCLUIDA'),
  cancelada('CANCELADA');

  const StatusViagem(this.wire);
  final String wire;

  static StatusViagem fromWire(String value) => StatusViagem.values.firstWhere(
    (e) => e.wire == value,
    orElse: () => throw WireException('StatusViagem', value),
  );

  String get rotulo => switch (this) {
    StatusViagem.agendada => 'Agendada',
    StatusViagem.emAndamento => 'Em andamento',
    StatusViagem.concluida => 'Concluída',
    StatusViagem.cancelada => 'Cancelada',
  };

  Tone get tone => switch (this) {
    StatusViagem.agendada => Tone.info,
    StatusViagem.emAndamento => Tone.warning,
    StatusViagem.concluida => Tone.success,
    StatusViagem.cancelada => Tone.critical,
  };

  IconData get icone => switch (this) {
    StatusViagem.agendada => Icons.event,
    StatusViagem.emAndamento => Icons.play_arrow,
    StatusViagem.concluida => Icons.check_circle,
    StatusViagem.cancelada => Icons.cancel,
  };

  bool get terminal =>
      this == StatusViagem.concluida || this == StatusViagem.cancelada;
}
