import 'package:meta/meta.dart';

import '../enums/status_viagem.dart';
import '_json.dart';
import 'geo.dart';
import 'motorista.dart';
import 'passageiro.dart';
import 'veiculo.dart';

/// Viagem TFD — `tfd_viagem` no backend.
///
/// O motorista vê tudo que precisa pra operar a viagem: veículo, destino,
/// passageiros, hodômetro, hora prevista. Coordenadas opcionais alimentam
/// o mapa da F11 — se ausentes, o mapa cai em modo "lista".
@immutable
class Viagem {
  const Viagem({
    required this.id,
    required this.data,
    required this.horaSaida,
    required this.destino,
    required this.veiculo,
    required this.motorista,
    required this.vagasTotais,
    required this.status,
    required this.passageiros,
    this.protocolo,
    this.horaPrevistaRetorno,
    this.unidadeDestino,
    this.rotaResumo,
    this.kmEstimados,
    this.kmInicialHodometro,
    this.kmFinalHodometro,
    this.observacoes,
    this.iniciadaEm,
    this.concluidaEm,
    this.coordOrigem,
    this.coordDestino,
    this.atualizadoEm,
  });

  final String id;

  /// Protocolo legível — pode ser ausente em viagens recém-criadas (o backend
  /// gera no `criada_em`). O app trata `null` como "S/N" (sem número).
  final String? protocolo;

  final DateTime data;

  /// `HH:mm` — string opaca pra evitar fuso/timezone bugs.
  final String horaSaida;
  final String? horaPrevistaRetorno;

  final String destino;
  final String? unidadeDestino;
  final String? rotaResumo;

  final VeiculoResumo veiculo;
  final MotoristaResumo motorista;

  final int vagasTotais;

  final int? kmEstimados;
  final int? kmInicialHodometro;
  final int? kmFinalHodometro;

  final String? observacoes;
  final StatusViagem status;
  final DateTime? iniciadaEm;
  final DateTime? concluidaEm;

  final GeoCoord? coordOrigem;
  final GeoCoord? coordDestino;

  final List<Passageiro> passageiros;

  /// Timestamp da última atualização vinda do servidor — usado pelo sync
  /// engine para reconciliar versões locais vs. remotas.
  final DateTime? atualizadoEm;

  // ── Derivados úteis para UI ──────────────────────────────────────

  int get vagasOcupadas =>
      passageiros.where((p) => !p.acompanhante).length;

  int get vagasLivres => (vagasTotais - vagasOcupadas).clamp(0, vagasTotais);

  /// Total de passageiros (incluindo acompanhantes).
  int get totalEmbarcantes => passageiros.length;

  bool get podeIniciar => status == StatusViagem.agendada;
  bool get podeConcluir => status == StatusViagem.emAndamento;
  bool get podeFazerChamada =>
      status == StatusViagem.agendada || status == StatusViagem.emAndamento;

  // ── Serialização ────────────────────────────────────────────────

  factory Viagem.fromJson(Map<String, dynamic> json) => Viagem(
    id: json['id'] as String,
    protocolo: json['protocolo'] as String?,
    data: parseDateTime(json['data']),
    horaSaida: json['horaSaida'] as String,
    horaPrevistaRetorno: json['horaPrevistaRetorno'] as String?,
    destino: json['destino'] as String,
    unidadeDestino: json['unidadeDestino'] as String?,
    rotaResumo: json['rotaResumo'] as String?,
    veiculo: VeiculoResumo.fromJson(
      json['veiculo'] as Map<String, dynamic>,
    ),
    motorista: MotoristaResumo.fromJson(
      json['motorista'] as Map<String, dynamic>,
    ),
    vagasTotais: parseInt(json['vagasTotais']),
    kmEstimados: parseIntOrNull(json['kmEstimados']),
    kmInicialHodometro: parseIntOrNull(json['kmInicialHodometro']),
    kmFinalHodometro: parseIntOrNull(json['kmFinalHodometro']),
    observacoes: json['observacoes'] as String?,
    status: StatusViagem.fromWire(json['status'] as String),
    iniciadaEm: parseDateTimeOrNull(json['iniciadaEm']),
    concluidaEm: parseDateTimeOrNull(json['concluidaEm']),
    coordOrigem: json['coordOrigem'] == null
        ? null
        : GeoCoord.fromJson(json['coordOrigem'] as Map<String, dynamic>),
    coordDestino: json['coordDestino'] == null
        ? null
        : GeoCoord.fromJson(json['coordDestino'] as Map<String, dynamic>),
    passageiros: (json['passageiros'] as List<dynamic>? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(Passageiro.fromJson)
        .toList(growable: false),
    atualizadoEm: parseDateTimeOrNull(json['atualizadoEm']),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    if (protocolo != null) 'protocolo': protocolo,
    'data': data.toIso8601String(),
    'horaSaida': horaSaida,
    if (horaPrevistaRetorno != null)
      'horaPrevistaRetorno': horaPrevistaRetorno,
    'destino': destino,
    if (unidadeDestino != null) 'unidadeDestino': unidadeDestino,
    if (rotaResumo != null) 'rotaResumo': rotaResumo,
    'veiculo': veiculo.toJson(),
    'motorista': motorista.toJson(),
    'vagasTotais': vagasTotais,
    if (kmEstimados != null) 'kmEstimados': kmEstimados,
    if (kmInicialHodometro != null) 'kmInicialHodometro': kmInicialHodometro,
    if (kmFinalHodometro != null) 'kmFinalHodometro': kmFinalHodometro,
    if (observacoes != null) 'observacoes': observacoes,
    'status': status.wire,
    if (iniciadaEm != null) 'iniciadaEm': iniciadaEm!.toIso8601String(),
    if (concluidaEm != null) 'concluidaEm': concluidaEm!.toIso8601String(),
    if (coordOrigem != null) 'coordOrigem': coordOrigem!.toJson(),
    if (coordDestino != null) 'coordDestino': coordDestino!.toJson(),
    'passageiros': passageiros.map((p) => p.toJson()).toList(growable: false),
    if (atualizadoEm != null) 'atualizadoEm': atualizadoEm!.toIso8601String(),
  };

  Viagem copyWith({
    StatusViagem? status,
    int? kmInicialHodometro,
    int? kmFinalHodometro,
    DateTime? iniciadaEm,
    DateTime? concluidaEm,
    List<Passageiro>? passageiros,
    DateTime? atualizadoEm,
  }) => Viagem(
    id: id,
    protocolo: protocolo,
    data: data,
    horaSaida: horaSaida,
    horaPrevistaRetorno: horaPrevistaRetorno,
    destino: destino,
    unidadeDestino: unidadeDestino,
    rotaResumo: rotaResumo,
    veiculo: veiculo,
    motorista: motorista,
    vagasTotais: vagasTotais,
    kmEstimados: kmEstimados,
    kmInicialHodometro: kmInicialHodometro ?? this.kmInicialHodometro,
    kmFinalHodometro: kmFinalHodometro ?? this.kmFinalHodometro,
    observacoes: observacoes,
    status: status ?? this.status,
    iniciadaEm: iniciadaEm ?? this.iniciadaEm,
    concluidaEm: concluidaEm ?? this.concluidaEm,
    coordOrigem: coordOrigem,
    coordDestino: coordDestino,
    passageiros: passageiros ?? this.passageiros,
    atualizadoEm: atualizadoEm ?? this.atualizadoEm,
  );
}
