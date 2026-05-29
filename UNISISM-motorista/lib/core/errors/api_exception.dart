import 'package:meta/meta.dart';

/// Erro de comunicação com a API (ou ausência dela).
///
/// Espelha o shape `{ error: { code, message, details? } }` documentado em
/// `MOTORISTA_APP_API.md §9`.
@immutable
class ApiException implements Exception {
  const ApiException({
    required this.code,
    required this.message,
    this.status,
    this.details,
  });

  /// Código semântico vindo do backend (ex.: `CNH_VENCIDA`,
  /// `HODOMETRO_INVALIDO`, `MOTORISTA_INATIVO`).
  /// Quando a falha é de rede, usar `OFFLINE` / `TIMEOUT` / `NO_CONNECTION`.
  final String code;
  final String message;
  final int? status;
  final Map<String, dynamic>? details;

  // ── Categorias de erro (combinam HTTP status + code) ──────────────

  bool get isOffline =>
      code == 'OFFLINE' || code == 'TIMEOUT' || code == 'NO_CONNECTION';

  bool get isUnauthorized => status == 401;
  bool get isForbidden => status == 403;
  bool get isNotFound => status == 404;
  bool get isConflict => status == 409;
  bool get isValidation => status == 422;
  bool get isServerError => (status ?? 0) >= 500;

  /// Sessão expirou ou ficou inválida — app deve fazer logout silencioso.
  bool get exigeRelogin =>
      isUnauthorized &&
      (code == 'TOKEN_AUSENTE' ||
          code == 'TOKEN_INVALIDO' ||
          code == 'TOKEN_EXPIRADO');

  /// Motorista ainda está com senha provisória — app deve forçar tela
  /// de troca de senha.
  bool get exigeTrocaSenha => code == 'PRIMEIRO_LOGIN_PENDENTE';

  /// Conta do motorista foi desativada pela gestão TFD — app deve fazer
  /// logout e mostrar mensagem.
  bool get contaInativa =>
      code == 'MOTORISTA_INATIVO' || code == 'MOTORISTA_INDISPONIVEL';

  /// Mensagem amigável pra mostrar ao motorista (sem jargão).
  /// Usa o `message` do backend (que já vem em pt-BR) e cai num default
  /// quando o code é desconhecido.
  String get mensagemAmigavel {
    if (message.isNotEmpty) return message;
    return switch (code) {
      'OFFLINE' || 'NO_CONNECTION' => 'Sem internet.',
      'TIMEOUT' => 'Demorou demais. Tente de novo.',
      'TOKEN_EXPIRADO' || 'TOKEN_INVALIDO' || 'TOKEN_AUSENTE' =>
        'Sua sessão expirou. Entre de novo.',
      'PRIMEIRO_LOGIN_PENDENTE' => 'Você precisa trocar a senha provisória.',
      'MATRICULA_OU_SENHA_INVALIDA' => 'Matrícula ou senha errada.',
      'MOTORISTA_INATIVO' => 'Sua conta está inativa. Fale com a gestão.',
      'CNH_VENCIDA' => 'Sua CNH venceu — renove antes de começar.',
      'VEICULO_INDISPONIVEL' => 'O veículo está em manutenção.',
      'HODOMETRO_INVALIDO' => 'Quilometragem inválida.',
      'STATUS_INVALIDO' => 'Não dá pra fazer isso agora.',
      'OBSERVACAO_OBRIGATORIA' => 'Diga o motivo para registrar.',
      'SENHA_FRACA' => 'A senha precisa ter letras e números.',
      'SENHA_IGUAL' => 'Escolha uma senha diferente.',
      'ERRO_INTERNO' => 'Tivemos um problema. Tente de novo.',
      _ => 'Não foi possível concluir.',
    };
  }

  // ── Factories ─────────────────────────────────────────────────────

  factory ApiException.offline([String message = 'Sem internet']) =>
      ApiException(code: 'OFFLINE', message: message);

  factory ApiException.fromBackend(Map<String, dynamic> body, int? status) {
    final err = body['error'] as Map<String, dynamic>?;
    return ApiException(
      code: err?['code'] as String? ?? 'UNKNOWN',
      message: err?['message'] as String? ?? 'Erro desconhecido',
      status: status,
      details: err?['details'] as Map<String, dynamic>?,
    );
  }

  @override
  String toString() => 'ApiException($code, status=$status): $message';
}
