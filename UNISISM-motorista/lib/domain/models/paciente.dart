import 'package:meta/meta.dart';

import '_json.dart';
import 'ubs.dart';

/// Resumo do paciente — só o que o motorista precisa pra identificar o
/// passageiro no embarque. Não traz prontuário, dados clínicos, etc.
@immutable
class PacienteResumo {
  const PacienteResumo({
    required this.id,
    required this.nome,
    required this.cpf,
    required this.dataNascimento,
    this.telefone,
    this.fotoUrl,
    this.ubs,
    this.observacoesMobilidade,
  });

  final String id;
  final String nome;
  final String cpf;
  final DateTime dataNascimento;
  final String? telefone;
  final String? fotoUrl;
  final UbsResumo? ubs;

  /// Observações relevantes pra acessibilidade no embarque (cadeirante,
  /// muletas, baixa visão, etc.). Texto livre, alimentado pelo gestor TFD.
  final String? observacoesMobilidade;

  int get idade {
    final hoje = DateTime.now();
    var anos = hoje.year - dataNascimento.year;
    if (hoje.month < dataNascimento.month ||
        (hoje.month == dataNascimento.month &&
            hoje.day < dataNascimento.day)) {
      anos--;
    }
    return anos;
  }

  factory PacienteResumo.fromJson(Map<String, dynamic> json) => PacienteResumo(
    id: json['id'] as String,
    nome: json['nome'] as String,
    cpf: json['cpf'] as String,
    dataNascimento: parseDateTime(json['dataNascimento']),
    telefone: json['telefone'] as String?,
    fotoUrl: json['fotoUrl'] as String?,
    ubs: json['ubs'] == null
        ? null
        : UbsResumo.fromJson(json['ubs'] as Map<String, dynamic>),
    observacoesMobilidade: json['observacoesMobilidade'] as String?,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'nome': nome,
    'cpf': cpf,
    'dataNascimento': dataNascimento.toIso8601String(),
    if (telefone != null) 'telefone': telefone,
    if (fotoUrl != null) 'fotoUrl': fotoUrl,
    if (ubs != null) 'ubs': ubs!.toJson(),
    if (observacoesMobilidade != null)
      'observacoesMobilidade': observacoesMobilidade,
  };
}
