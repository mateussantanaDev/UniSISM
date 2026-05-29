import 'package:meta/meta.dart';

import '../enums/presenca_passageiro.dart';
import '_json.dart';
import 'paciente.dart';
import 'solicitacao.dart';

/// Passageiro de uma viagem TFD — paciente + solicitação + estado da
/// chamada digital.
@immutable
class Passageiro {
  const Passageiro({
    required this.id,
    required this.paciente,
    required this.solicitacao,
    required this.acompanhante,
    required this.presenca,
    this.observacao,
    this.marcadoEm,
    this.marcadoPor,
  });

  /// Chave canônica usada para identificar o passageiro nas rotas (`pid`).
  final String id;
  final PacienteResumo paciente;
  final SolicitacaoResumo solicitacao;
  final bool acompanhante;
  final PresencaPassageiro presenca;
  final String? observacao;
  final DateTime? marcadoEm;
  final String? marcadoPor;

  factory Passageiro.fromJson(Map<String, dynamic> json) => Passageiro(
    id: json['id'] as String,
    paciente: PacienteResumo.fromJson(
      json['paciente'] as Map<String, dynamic>,
    ),
    solicitacao: SolicitacaoResumo.fromJson(
      json['solicitacao'] as Map<String, dynamic>,
    ),
    acompanhante: json['acompanhante'] as bool,
    presenca: PresencaPassageiro.fromWire(json['presenca'] as String),
    observacao: json['observacao'] as String?,
    marcadoEm: parseDateTimeOrNull(json['marcadoEm']),
    marcadoPor: json['marcadoPor'] as String?,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'paciente': paciente.toJson(),
    'solicitacao': solicitacao.toJson(),
    'acompanhante': acompanhante,
    'presenca': presenca.wire,
    if (observacao != null) 'observacao': observacao,
    if (marcadoEm != null) 'marcadoEm': marcadoEm!.toIso8601String(),
    if (marcadoPor != null) 'marcadoPor': marcadoPor,
  };

  Passageiro copyWith({
    PresencaPassageiro? presenca,
    String? observacao,
    DateTime? marcadoEm,
    String? marcadoPor,
  }) => Passageiro(
    id: id,
    paciente: paciente,
    solicitacao: solicitacao,
    acompanhante: acompanhante,
    presenca: presenca ?? this.presenca,
    observacao: observacao ?? this.observacao,
    marcadoEm: marcadoEm ?? this.marcadoEm,
    marcadoPor: marcadoPor ?? this.marcadoPor,
  );
}
