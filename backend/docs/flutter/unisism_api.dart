// UNISISM · App do Paciente — Cliente Dart (dio)
// ─────────────────────────────────────────────────────
// Cobre 100% dos endpoints de `/paciente-app/*`.
// Token bearer persistido em `flutter_secure_storage` (recomendado)
// ou `shared_preferences` (simples).
//
// pubspec.yaml:
//   dependencies:
//     dio: ^5.4.0
//     flutter_secure_storage: ^9.0.0   # ou shared_preferences

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'unisism_types.dart';

/// Storage de tokens (access + refresh) — substitua por qualquer impl
/// que implemente esta interface. Por padrão usa flutter_secure_storage.
abstract class TokenStorage {
  Future<String?> read();
  Future<void> write(String? token);

  /// Refresh token (v0.18.0+). Default no-op para compat com impls antigas.
  Future<String?> readRefresh() async => null;
  Future<void> writeRefresh(String? token) async {}
}

/// Impl padrão com flutter_secure_storage (criptografado no device).
class SecureTokenStorage implements TokenStorage {
  static const _key = 'unisism_paciente_token';
  static const _refreshKey = 'unisism_paciente_refresh';
  final _storage = const FlutterSecureStorage();

  @override
  Future<String?> read() => _storage.read(key: _key);

  @override
  Future<void> write(String? token) => token == null
      ? _storage.delete(key: _key)
      : _storage.write(key: _key, value: token);

  @override
  Future<String?> readRefresh() => _storage.read(key: _refreshKey);

  @override
  Future<void> writeRefresh(String? token) => token == null
      ? _storage.delete(key: _refreshKey)
      : _storage.write(key: _refreshKey, value: token);
}

/// Cliente da API.
///
/// Uso:
/// ```dart
/// final api = UnisismApi(
///   baseUrl: 'http://10.0.2.2:3333/v1',  // Android emulator
///   // 'http://localhost:3333/v1'        // iOS simulator
///   // 'https://api.unisism.aguasbelas.pe.gov.br/v1'  // produção
/// );
/// await api.login(cpf: '123.456.789-00', senha: '12345678');
/// final notifs = await api.listarNotificacoes();
/// ```
class UnisismApi {
  final Dio _dio;
  final TokenStorage _tokens;

  /// `baseUrl` SEM trailing slash e INCLUINDO o `/v1`.
  UnisismApi({
    required String baseUrl,
    TokenStorage? tokenStorage,
    Duration connectTimeout = const Duration(seconds: 15),
    Duration receiveTimeout = const Duration(seconds: 30),
  })  : _tokens = tokenStorage ?? SecureTokenStorage(),
        _dio = Dio(BaseOptions(
          baseUrl: baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl,
          connectTimeout: connectTimeout,
          receiveTimeout: receiveTimeout,
          // Aceita 2xx; todo resto vai para o catch.
          validateStatus: (s) => s != null && s < 300,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        )) {
    // Interceptor: injeta Authorization em toda request (exceto auth/login)
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        if (!_isPublic(options.path)) {
          final token = await _tokens.read();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
        }
        handler.next(options);
      },
      onError: (err, handler) {
        final status = err.response?.statusCode ?? 0;
        final body = err.response?.data;
        if (body is Map<String, dynamic>) {
          handler.reject(DioException(
            requestOptions: err.requestOptions,
            response: err.response,
            error: UnisismApiError.fromResponse(status, body),
            type: err.type,
          ));
        } else {
          handler.next(err);
        }
      },
    ));
  }

  bool _isPublic(String path) =>
      path.startsWith('/paciente-app/auth/login') ||
      path.startsWith('/paciente-app/auth/refresh') ||
      path.startsWith('/paciente-app/auth/ativar-conta') ||
      path.startsWith('/paciente-app/auth/esqueci-senha') ||
      path.startsWith('/paciente-app/auth/redefinir-senha');

  // ==========================================================
  // Auth
  // ==========================================================

  /// Login do paciente. Persiste access + refresh tokens automaticamente.
  ///
  /// v0.18.0+ — agora persiste TAMBÉM o `refreshToken`. App pode usar
  /// `refresh()` quando o access expirar (30 min) em vez de re-pedir senha.
  Future<LoginPacienteResposta> login({
    required String cpf,
    required String senha,
  }) async {
    final r = await _dio.post(
      '/paciente-app/auth/login',
      data: {'cpf': cpf, 'senha': senha},
    );
    final out = LoginPacienteResposta.fromJson(r.data as Map<String, dynamic>);
    await _tokens.write(out.token);
    if (out.refreshToken != null) {
      await _tokens.writeRefresh(out.refreshToken);
    }
    return out;
  }

  /// Rotaciona o par access+refresh (v0.18.0+).
  ///
  /// Comportamento:
  ///   - Lê o refresh atual do storage.
  ///   - Chama `POST /auth/refresh` com ele.
  ///   - Em sucesso: substitui AMBOS os tokens no storage e retorna.
  ///   - Em erro (REUSE_DETECTED, EXPIRADO, REVOGADO, INVALIDO, CONTA_DESATIVADA):
  ///     limpa storage local e rethrow (app deve ir pra /login).
  ///
  /// Recomendado uso em interceptor Dio quando recebe 401:
  /// ```dart
  /// onError: (err, handler) async {
  ///   if (err.response?.statusCode == 401 && !_isAuthEndpoint(err.requestOptions.path)) {
  ///     try {
  ///       await api.refresh();
  ///       final retried = await api._dio.fetch(err.requestOptions);
  ///       return handler.resolve(retried);
  ///     } catch (_) { /* refresh falhou — segue pro login */ }
  ///   }
  ///   return handler.next(err);
  /// }
  /// ```
  Future<LoginPacienteResposta> refresh() async {
    final current = await _tokens.readRefresh();
    if (current == null) {
      throw const UnisismApiError(
        status: 401,
        code: 'REFRESH_TOKEN_INVALIDO',
        message: 'Sem refresh token salvo',
      );
    }
    try {
      final r = await _dio.post(
        '/paciente-app/auth/refresh',
        data: {'refreshToken': current},
      );
      final out = LoginPacienteResposta.fromJson(r.data as Map<String, dynamic>);
      // CRITICAL: substituir AMBOS imediatamente
      await _tokens.write(out.token);
      if (out.refreshToken != null) {
        await _tokens.writeRefresh(out.refreshToken);
      }
      return out;
    } catch (e) {
      // Qualquer erro → limpar storage (forçar login). Especialmente importante
      // em REFRESH_REUSE_DETECTED — alguém pode ter clonado nosso storage.
      await _tokens.write(null);
      await _tokens.writeRefresh(null);
      rethrow;
    }
  }

  /// Ativa a conta no primeiro acesso.
  /// Confirmação: CPF + data de nascimento + senha nova.
  Future<void> ativarConta({
    required String cpf,
    required String dataNascimento, // YYYY-MM-DD
    required String senha,
    String? nome,
  }) async {
    await _dio.post(
      '/paciente-app/auth/ativar-conta',
      data: {
        'cpf': cpf,
        'dataNascimento': dataNascimento,
        'senha': senha,
        if (nome != null) 'nome': nome,
      },
    );
  }

  /// Logout (revoga sessão + TODOS os refresh tokens no backend + limpa storage).
  ///
  /// v0.18.0+: o backend agora revoga TODOS os refresh tokens vivos da conta
  /// (não só a sessão atual). Logout = "sair de vez".
  Future<void> logout() async {
    try {
      await _dio.post('/paciente-app/auth/logout');
    } catch (_) {
      // ignora — sempre limpa storage local
    } finally {
      await _tokens.write(null);
      await _tokens.writeRefresh(null);
    }
  }

  /// Retorna true se há token persistido (não valida expiração).
  Future<bool> isAuthenticated() async => (await _tokens.read()) != null;

  // ==========================================================
  // Dados do paciente
  // ==========================================================

  Future<PacienteMe> me() async {
    final r = await _dio.get('/paciente-app/me');
    return PacienteMe.fromJson(r.data as Map<String, dynamic>);
  }

  Future<List<Encaminhamento>> meusEncaminhamentos() async {
    final r = await _dio.get('/paciente-app/meus-encaminhamentos');
    return (r.data as List)
        .map((e) => Encaminhamento.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ==========================================================
  // Notificações (timeline estilo Amazon/Shopee)
  // ==========================================================

  Future<List<NotificacaoPaciente>> listarNotificacoes({bool apenasNaoLidas = false}) async {
    final r = await _dio.get(
      '/paciente-app/notificacoes',
      queryParameters: apenasNaoLidas ? {'apenasNaoLidas': 'true'} : null,
    );
    return (r.data as List)
        .map((e) => NotificacaoPaciente.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Número de notificações não lidas (pra badge no ícone).
  Future<int> contadorNaoLidas() async {
    final r = await _dio.get('/paciente-app/notificacoes/count');
    return (r.data as Map<String, dynamic>)['naoLidas'] as int;
  }

  Future<void> marcarLida(String notificacaoId) async {
    await _dio.post('/paciente-app/notificacoes/$notificacaoId/lida');
  }

  Future<int> marcarTodasLidas() async {
    final r = await _dio.post('/paciente-app/notificacoes/marcar-todas-lidas');
    return (r.data as Map<String, dynamic>)['atualizadas'] as int;
  }

  // ==========================================================
  // Download de anexo (ex.: resposta SUS)
  // ==========================================================

  /// Baixa um anexo do encaminhamento do paciente. Só libera se
  /// `scanStatus == 'LIMPO'` e o anexo pertence ao CPF autenticado.
  ///
  /// Retorna os bytes + o nome sugerido (Content-Disposition).
  Future<AnexoDownload> baixarAnexo(String anexoId) async {
    final r = await _dio.get(
      '/paciente-app/anexos/$anexoId/download',
      options: Options(responseType: ResponseType.bytes),
    );
    final cd = (r.headers.value('content-disposition') ?? '');
    final match = RegExp(r'filename="?([^"]+)"?').firstMatch(cd);
    return AnexoDownload(
      bytes: r.data as List<int>,
      filename: match?.group(1) ?? 'documento.pdf',
      contentType: r.headers.value('content-type') ?? 'application/octet-stream',
    );
  }

  /// Salva o anexo no device e (opcionalmente) compartilha.
  /// Use junto com os pacotes `path_provider` + `open_filex` ou `share_plus`.
  ///
  /// Exemplo:
  /// ```dart
  /// final dl = await api.baixarAnexo(anexo.id);
  /// final dir = await getTemporaryDirectory();
  /// final file = File('${dir.path}/${dl.filename}');
  /// await file.writeAsBytes(dl.bytes);
  /// await OpenFilex.open(file.path);
  /// // ou: await Share.shareXFiles([XFile(file.path)]);
  /// ```
}

class AnexoDownload {
  final List<int> bytes;
  final String filename;
  final String contentType;
  const AnexoDownload({
    required this.bytes,
    required this.filename,
    required this.contentType,
  });
}
