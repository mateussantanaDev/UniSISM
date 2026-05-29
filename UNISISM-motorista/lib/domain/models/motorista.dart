import 'package:meta/meta.dart';

import '../enums/categoria_cnh.dart';
import '../enums/status_motorista.dart';
import '_json.dart';

/// Resumo do motorista — devolvido em qualquer place onde ele aparece como
/// referência (ex.: dentro de uma viagem).
@immutable
class MotoristaResumo {
  const MotoristaResumo({
    required this.id,
    required this.nome,
    required this.matricula,
    required this.status,
  });

  final String id;
  final String nome;
  final String matricula;
  final StatusMotorista status;

  factory MotoristaResumo.fromJson(Map<String, dynamic> json) =>
      MotoristaResumo(
        id: json['id'] as String,
        nome: json['nome'] as String,
        matricula: json['matricula'] as String,
        status: StatusMotorista.fromWire(json['status'] as String),
      );

  Map<String, dynamic> toJson() => {
    'id': id,
    'nome': nome,
    'matricula': matricula,
    'status': status.wire,
  };
}

/// Perfil completo do motorista — usado em `/auth/me` e na tela de perfil.
///
/// O backend devolve `primeiroLogin: bool` (ver `MOTORISTA_APP_API.md §4.4`).
/// O app usa esse flag pra decidir se ainda precisa exibir a tela de troca
/// de senha quando restaura sessão a partir do token cached.
@immutable
class Motorista {
  const Motorista({
    required this.id,
    required this.nome,
    required this.cpf,
    required this.matricula,
    required this.cnh,
    required this.categoriaCnh,
    required this.validadeCnh,
    required this.telefone,
    required this.status,
    required this.totalViagens,
    required this.totalKmRodados,
    required this.prefeituraNome,
    this.fotoUrl,
    this.primeiroLogin = false,
  });

  final String id;
  final String nome;
  final String cpf;
  final String matricula;
  final String cnh;
  final CategoriaCnh categoriaCnh;
  final DateTime validadeCnh;
  final String telefone;
  final StatusMotorista status;
  final int totalViagens;
  final int totalKmRodados;
  final String prefeituraNome;
  final String? fotoUrl;

  /// `true` quando o motorista ainda usa a senha provisória.
  /// O app deve forçar a tela de troca de senha antes de qualquer outra rota.
  final bool primeiroLogin;

  /// `true` se a CNH vence em ≤ 30 dias ou já está vencida.
  bool get cnhAVencer {
    final agora = DateTime.now();
    final diff = validadeCnh.difference(agora).inDays;
    return diff <= 30;
  }

  bool get cnhVencida => validadeCnh.isBefore(DateTime.now());

  factory Motorista.fromJson(Map<String, dynamic> json) => Motorista(
    id: json['id'] as String,
    nome: json['nome'] as String,
    cpf: json['cpf'] as String,
    matricula: json['matricula'] as String,
    cnh: json['cnh'] as String,
    categoriaCnh: CategoriaCnh.fromWire(json['categoriaCnh'] as String),
    validadeCnh: parseDateTime(json['validadeCnh']),
    telefone: json['telefone'] as String,
    status: StatusMotorista.fromWire(json['status'] as String),
    totalViagens: parseInt(json['totalViagens']),
    totalKmRodados: parseInt(json['totalKmRodados']),
    prefeituraNome: json['prefeituraNome'] as String,
    fotoUrl: json['fotoUrl'] as String?,
    primeiroLogin: json['primeiroLogin'] as bool? ?? false,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'nome': nome,
    'cpf': cpf,
    'matricula': matricula,
    'cnh': cnh,
    'categoriaCnh': categoriaCnh.wire,
    'validadeCnh': validadeCnh.toIso8601String(),
    'telefone': telefone,
    'status': status.wire,
    'totalViagens': totalViagens,
    'totalKmRodados': totalKmRodados,
    'prefeituraNome': prefeituraNome,
    if (fotoUrl != null) 'fotoUrl': fotoUrl,
    'primeiroLogin': primeiroLogin,
  };
}
