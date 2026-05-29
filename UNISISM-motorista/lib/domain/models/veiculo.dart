import 'package:meta/meta.dart';

import '../enums/status_veiculo.dart';
import '../enums/tipo_veiculo.dart';
import '_json.dart';

/// Resumo do veículo — usado dentro da viagem e em listas.
@immutable
class VeiculoResumo {
  const VeiculoResumo({
    required this.id,
    required this.placa,
    required this.modelo,
    required this.tipo,
    required this.capacidade,
    required this.status,
  });

  final String id;
  final String placa;
  final String modelo;
  final TipoVeiculo tipo;
  final int capacidade;
  final StatusVeiculo status;

  factory VeiculoResumo.fromJson(Map<String, dynamic> json) => VeiculoResumo(
    id: json['id'] as String,
    placa: json['placa'] as String,
    modelo: json['modelo'] as String,
    tipo: TipoVeiculo.fromWire(json['tipo'] as String),
    capacidade: parseInt(json['capacidade']),
    status: StatusVeiculo.fromWire(json['status'] as String),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'placa': placa,
    'modelo': modelo,
    'tipo': tipo.wire,
    'capacidade': capacidade,
    'status': status.wire,
  };
}
