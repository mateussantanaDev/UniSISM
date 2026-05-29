import 'package:meta/meta.dart';

import 'geo.dart';

/// Subset de UBS exposto pro app do motorista — apenas o que ele precisa
/// pra reconhecer o ponto de coleta do paciente.
@immutable
class UbsResumo {
  const UbsResumo({
    required this.id,
    required this.nome,
    required this.bairro,
    this.coord,
    this.endereco,
  });

  final String id;
  final String nome;
  final String bairro;
  final GeoCoord? coord;
  final String? endereco;

  factory UbsResumo.fromJson(Map<String, dynamic> json) => UbsResumo(
    id: json['id'] as String,
    nome: json['nome'] as String,
    bairro: json['bairro'] as String,
    coord: json['coord'] == null
        ? null
        : GeoCoord.fromJson(json['coord'] as Map<String, dynamic>),
    endereco: json['endereco'] as String?,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'nome': nome,
    'bairro': bairro,
    if (coord != null) 'coord': coord!.toJson(),
    if (endereco != null) 'endereco': endereco,
  };
}
