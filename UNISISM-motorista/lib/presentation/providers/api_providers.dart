import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api/auth_interceptor.dart';
import '../../data/api/tfd_api.dart';
import '../../data/api/tfd_api_remote.dart';

/// Resolve a base URL com defaults sensatos por plataforma.
///
/// O app consome **somente** o backend real (módulo `/v1/motorista-app/*` —
/// ver `unisism-ubs/backend/docs/MOTORISTA_APP_API.md`). Não há mais mock
/// no projeto.
///
/// Sobrescrever via `--dart-define=API_BASE_URL=https://api.unisism…/v1`.
String resolveApiBaseUrl() {
  const custom = String.fromEnvironment('API_BASE_URL');
  if (custom.isNotEmpty) return custom;
  return 'http://10.0.0.101:3333/v1';
}

/// Token JWT do motorista. Atualizado pelo `AuthController` no login e
/// limpo no logout. Persistido em `SecureTokenStorage` (flutter_secure_storage).
final authTokenProvider = StateProvider<String?>((_) => null);

/// Callback global de 401 — invocado pelo `AuthInterceptor` quando o
/// servidor responde com `TOKEN_INVALIDO`/`TOKEN_EXPIRADO`. O
/// `AuthController` registra um handler que faz logout silencioso.
final unauthorizedHandlerProvider = StateProvider<void Function()>(
  (_) => () {},
);

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: resolveApiBaseUrl(),
      connectTimeout: const Duration(seconds: 6),
      receiveTimeout: const Duration(seconds: 12),
      sendTimeout: const Duration(seconds: 12),
      headers: {
        'Accept': 'application/json',
        'X-API-Version': '1',
        'X-Client': 'unisism-motorista/0.1.0',
      },
    ),
  );
  dio.interceptors.add(
    AuthInterceptor(
      tokenProvider: () async => ref.read(authTokenProvider),
      onUnauthorized: () => ref.read(unauthorizedHandlerProvider)(),
    ),
  );
  return dio;
});

/// Cliente HTTP tipado contra o backend real. Sempre `TfdApiRemote`.
final tfdApiProvider = Provider<TfdApi>(
  (ref) => TfdApiRemote(ref.watch(dioProvider)),
);
