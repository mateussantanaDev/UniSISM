import 'package:meta/meta.dart';

import 'motorista.dart';

/// Resposta de `POST /motorista-app/auth/login`.
///
/// O `primeiroLogin = true` força o app a abrir a tela de troca de senha
/// antes de qualquer outra rota.
@immutable
class AuthSession {
  const AuthSession({
    required this.token,
    required this.motorista,
    required this.primeiroLogin,
  });

  final String token;
  final MotoristaResumo motorista;
  final bool primeiroLogin;

  factory AuthSession.fromJson(Map<String, dynamic> json) => AuthSession(
    token: json['token'] as String,
    motorista: MotoristaResumo.fromJson(
      json['motorista'] as Map<String, dynamic>,
    ),
    primeiroLogin: json['primeiroLogin'] as bool? ?? false,
  );

  Map<String, dynamic> toJson() => {
    'token': token,
    'motorista': motorista.toJson(),
    'primeiroLogin': primeiroLogin,
  };
}
