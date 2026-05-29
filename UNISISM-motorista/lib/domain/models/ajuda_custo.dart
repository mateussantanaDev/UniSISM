import 'package:meta/meta.dart';

import '../enums/status_ajuda_custo.dart';
import '_json.dart';

@immutable
class AjudaCustoItem {
  const AjudaCustoItem({
    required this.categoria,
    required this.descricao,
    required this.valorBrl,
  });

  /// Categoria livre conforme `/tfd/ajudas-custo` (ALIMENTACAO,
  /// DESLOCAMENTO_LOCAL, HOSPEDAGEM, etc.).
  final String categoria;
  final String descricao;
  final double valorBrl;

  factory AjudaCustoItem.fromJson(Map<String, dynamic> json) => AjudaCustoItem(
    categoria: json['categoria'] as String,
    descricao: json['descricao'] as String,
    valorBrl: parseDouble(json['valorBRL']),
  );

  Map<String, dynamic> toJson() => {
    'categoria': categoria,
    'descricao': descricao,
    'valorBRL': valorBrl,
  };
}

@immutable
class AjudaCusto {
  const AjudaCusto({
    required this.id,
    required this.viagemId,
    required this.pacienteId,
    required this.pacienteNome,
    required this.itens,
    required this.valorTotalBrl,
    required this.status,
    required this.criadaEm,
    this.protocolo,
    this.metodoPagamento,
    this.motivoNegacao,
    this.autorizadaEm,
    this.pagaEm,
  });

  final String id;
  final String? protocolo; // AJC-AAAA-NNNNNN
  final String viagemId;
  final String pacienteId;
  final String pacienteNome;
  final List<AjudaCustoItem> itens;
  final double valorTotalBrl;
  final StatusAjudaCusto status;
  final String? metodoPagamento; // PIX | TRANSFERENCIA | DINHEIRO_RH
  final String? motivoNegacao;
  final DateTime criadaEm;
  final DateTime? autorizadaEm;
  final DateTime? pagaEm;

  factory AjudaCusto.fromJson(Map<String, dynamic> json) => AjudaCusto(
    id: json['id'] as String,
    protocolo: json['protocolo'] as String?,
    viagemId: json['viagemId'] as String,
    pacienteId: json['pacienteId'] as String,
    pacienteNome: json['pacienteNome'] as String,
    itens: (json['itens'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(AjudaCustoItem.fromJson)
        .toList(growable: false),
    valorTotalBrl: parseDouble(json['valorTotalBRL']),
    status: StatusAjudaCusto.fromWire(json['status'] as String),
    metodoPagamento: json['metodoPagamento'] as String?,
    motivoNegacao: json['motivoNegacao'] as String?,
    criadaEm: parseDateTime(json['criadaEm']),
    autorizadaEm: parseDateTimeOrNull(json['autorizadaEm']),
    pagaEm: parseDateTimeOrNull(json['pagaEm']),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    if (protocolo != null) 'protocolo': protocolo,
    'viagemId': viagemId,
    'pacienteId': pacienteId,
    'pacienteNome': pacienteNome,
    'itens': itens.map((i) => i.toJson()).toList(growable: false),
    'valorTotalBRL': valorTotalBrl,
    'status': status.wire,
    if (metodoPagamento != null) 'metodoPagamento': metodoPagamento,
    if (motivoNegacao != null) 'motivoNegacao': motivoNegacao,
    'criadaEm': criadaEm.toIso8601String(),
    if (autorizadaEm != null) 'autorizadaEm': autorizadaEm!.toIso8601String(),
    if (pagaEm != null) 'pagaEm': pagaEm!.toIso8601String(),
  };
}
