import 'package:dio/dio.dart';

import '../../core/errors/api_exception.dart';
import '../../domain/enums/presenca_passageiro.dart';
import '../../domain/models/ajuda_custo.dart';
import '../../domain/models/auth_session.dart';
import '../../domain/models/motorista.dart';
import '../../domain/models/passageiro.dart';
import '../../domain/models/viagem.dart';
import 'tfd_api.dart';

/// Implementação real do `TfdApi` usando Dio.
///
/// Backend documentado em
/// `unisism-ubs/backend/docs/MOTORISTA_APP_API.md` (v0.9.0, 2026-05-26).
/// Spec original (do lado do app) em `BACKEND_REQUIREMENTS.md`.
///
/// Pra apontar pro backend:
/// ```
/// flutter run \
///   --dart-define=USE_MOCK=false \
///   --dart-define=API_BASE_URL=http://10.0.2.2:3333/v1
/// ```
class TfdApiRemote implements TfdApi {
  TfdApiRemote(this._dio);

  final Dio _dio;

  // ── Auth ──────────────────────────────────────────────────────

  @override
  Future<AuthSession> login({
    required String matricula,
    required String senha,
  }) => _wrap(() async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/motorista-app/auth/login',
      data: {'matricula': matricula, 'senha': senha},
    );
    return AuthSession.fromJson(res.data!);
  });

  @override
  Future<void> trocarSenha({
    required String senhaAtual,
    required String novaSenha,
  }) => _wrap(() async {
    await _dio.post<void>(
      '/motorista-app/auth/trocar-senha',
      data: {'senhaAtual': senhaAtual, 'novaSenha': novaSenha},
    );
  });

  @override
  Future<void> logout() => _wrap(() async {
    await _dio.post<void>('/motorista-app/auth/logout');
  });

  @override
  Future<Motorista> me() => _wrap(() async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/motorista-app/auth/me',
    );
    return Motorista.fromJson(res.data!);
  });

  // ── Viagens ───────────────────────────────────────────────────

  @override
  Future<PullResult<List<Viagem>>> minhasViagens({DateTime? desde}) =>
      _wrap(() async {
        final res = await _dio.get<List<dynamic>>(
          '/motorista-app/minhas-viagens',
          queryParameters: {
            if (desde != null) 'desde': desde.toUtc().toIso8601String(),
          },
        );
        final data = res.data!
            .cast<Map<String, dynamic>>()
            .map(Viagem.fromJson)
            .toList(growable: false);
        final serverTime = _serverTime(res);
        return PullResult(data: data, serverTime: serverTime);
      });

  @override
  Future<Viagem> viagemPorId(String id) => _wrap(() async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/motorista-app/viagens/$id',
    );
    return Viagem.fromJson(res.data!);
  });

  @override
  Future<Viagem> iniciarViagem({
    required String viagemId,
    required int kmInicialHodometro,
  }) => _wrap(() async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/motorista-app/viagens/$viagemId/iniciar',
      data: {'kmInicialHodometro': kmInicialHodometro},
    );
    return Viagem.fromJson(res.data!);
  });

  @override
  Future<Viagem> concluirViagem({
    required String viagemId,
    required int kmFinalHodometro,
  }) => _wrap(() async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/motorista-app/viagens/$viagemId/concluir',
      data: {'kmFinalHodometro': kmFinalHodometro},
    );
    return Viagem.fromJson(res.data!);
  });

  @override
  Future<Passageiro> marcarPresenca({
    required String viagemId,
    required String passageiroId,
    required PresencaPassageiro presenca,
    String? observacao,
  }) => _wrap(() async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/motorista-app/viagens/$viagemId/passageiros/$passageiroId/presenca',
      data: {
        'presenca': presenca.wire,
        'observacao': ?observacao,
      },
    );
    return Passageiro.fromJson(res.data!);
  });

  // ── Ajudas de custo ───────────────────────────────────────────

  @override
  Future<List<AjudaCusto>> minhasAjudasCusto() => _wrap(() async {
    final res = await _dio.get<List<dynamic>>(
      '/motorista-app/ajudas-custo',
    );
    return res.data!
        .cast<Map<String, dynamic>>()
        .map(AjudaCusto.fromJson)
        .toList(growable: false);
  });

  // ── Push ──────────────────────────────────────────────────────

  @override
  Future<void> registrarFcmToken(String token) => _wrap(() async {
    await _dio.post<void>(
      '/motorista-app/me/fcm-token',
      data: {'fcmToken': token},
    );
  });

  @override
  Future<void> revogarFcmToken() => _wrap(() async {
    await _dio.delete<void>('/motorista-app/me/fcm-token');
  });

  // ── Helpers ───────────────────────────────────────────────────

  Future<T> _wrap<T>(Future<T> Function() body) async {
    try {
      return await body();
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  ApiException _translate(DioException e) {
    final type = e.type;
    final isNetwork =
        type == DioExceptionType.connectionError ||
        type == DioExceptionType.connectionTimeout ||
        type == DioExceptionType.sendTimeout ||
        type == DioExceptionType.receiveTimeout;
    if (isNetwork) {
      return ApiException.offline(e.message ?? 'Sem conexão');
    }
    final body = e.response?.data;
    if (body is Map<String, dynamic>) {
      return ApiException.fromBackend(body, e.response?.statusCode);
    }
    return ApiException(
      code: 'UNKNOWN',
      message: e.message ?? 'Erro desconhecido',
      status: e.response?.statusCode,
    );
  }

  DateTime _serverTime(Response<dynamic> res) {
    final raw = res.headers.value('x-server-time');
    if (raw != null) {
      try {
        return DateTime.parse(raw);
      } catch (_) {/* fallback abaixo */}
    }
    return DateTime.now().toUtc();
  }
}
