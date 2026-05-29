import 'package:meta/meta.dart';

import '../enums/prioridade_solicitacao.dart';

/// Subset de `SolicitacaoTFD` exposto pro app do motorista. Só o que precisa
/// aparecer no card do passageiro: protocolo + prioridade.
@immutable
class SolicitacaoResumo {
  const SolicitacaoResumo({
    required this.id,
    required this.protocolo,
    required this.prioridade,
    required this.destino,
    this.unidadeDestino,
  });

  final String id;
  final String protocolo;
  final PrioridadeSolicitacao prioridade;
  final String destino;
  final String? unidadeDestino;

  factory SolicitacaoResumo.fromJson(Map<String, dynamic> json) =>
      SolicitacaoResumo(
        id: json['id'] as String,
        protocolo: json['protocolo'] as String,
        prioridade: PrioridadeSolicitacao.fromWire(
          json['prioridade'] as String,
        ),
        destino: json['destino'] as String,
        unidadeDestino: json['unidadeDestino'] as String?,
      );

  Map<String, dynamic> toJson() => {
    'id': id,
    'protocolo': protocolo,
    'prioridade': prioridade.wire,
    'destino': destino,
    if (unidadeDestino != null) 'unidadeDestino': unidadeDestino,
  };
}
