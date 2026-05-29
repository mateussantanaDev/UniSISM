import 'package:dio/dio.dart';

/// Interceptor Dio que injeta `Authorization: Bearer <token>` em toda
/// requisição. O token vem de um getter assíncrono (geralmente lendo do
/// `flutter_secure_storage` — F6).
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this.tokenProvider,
    required this.onUnauthorized,
  });

  final Future<String?> Function() tokenProvider;
  final void Function() onUnauthorized;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await tokenProvider();
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.response?.statusCode == 401) {
      onUnauthorized();
    }
    handler.next(err);
  }
}
