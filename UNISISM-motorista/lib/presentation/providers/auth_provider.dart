import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:meta/meta.dart';

import '../../core/errors/api_exception.dart';
import '../../data/api/tfd_api.dart';
import '../../data/auth/secure_token_storage.dart';
import '../../data/local/database.dart';
import '../../domain/models/auth_session.dart';
import '../../domain/models/motorista.dart';
import 'api_providers.dart';
import 'push_providers.dart';
import 'sync_providers.dart';

enum AuthStatus { restoring, loggedOut, needsPasswordChange, loggedIn }

@immutable
class AuthState {
  const AuthState({
    required this.status,
    this.motorista,
    this.token,
    this.matriculaCacheada,
    this.error,
  });

  final AuthStatus status;
  final MotoristaResumo? motorista;
  final String? token;
  final String? matriculaCacheada;
  final String? error;

  bool get isLoggedIn => status == AuthStatus.loggedIn;

  AuthState copyWith({
    AuthStatus? status,
    MotoristaResumo? motorista,
    String? token,
    String? matriculaCacheada,
    String? error,
    bool clearError = false,
  }) => AuthState(
    status: status ?? this.status,
    motorista: motorista ?? this.motorista,
    token: token ?? this.token,
    matriculaCacheada: matriculaCacheada ?? this.matriculaCacheada,
    error: clearError ? null : (error ?? this.error),
  );
}

class AuthController extends Notifier<AuthState> {
  late final TfdApi _api;
  late final SecureTokenStorage _storage;
  late final AppDatabase _db;

  @override
  AuthState build() {
    _api = ref.read(tfdApiProvider);
    _storage = const SecureTokenStorage();
    _db = ref.read(databaseProvider);
    // Carrega sessão salva em background.
    Future.microtask(_restore);
    return const AuthState(status: AuthStatus.restoring);
  }

  Future<void> _restore() async {
    final token = await _storage.readToken();
    final matricula = await _storage.readMatricula();
    if (token == null || token.isEmpty) {
      state = AuthState(
        status: AuthStatus.loggedOut,
        matriculaCacheada: matricula,
      );
      return;
    }

    ref.read(authTokenProvider.notifier).state = token;

    // Tenta /me — se token expirado, cai pra logout silencioso.
    try {
      final me = await _api.me();
      // Backend devolve `primeiroLogin: bool` no /me (MOTORISTA_APP_API.md §4.4).
      // Se ainda for true (motorista não trocou senha mesmo com token cached),
      // empurra direto pra tela de troca.
      final status = me.primeiroLogin
          ? AuthStatus.needsPasswordChange
          : AuthStatus.loggedIn;
      state = AuthState(
        status: status,
        token: token,
        motorista: MotoristaResumo(
          id: me.id,
          nome: me.nome,
          matricula: me.matricula,
          status: me.status,
        ),
        matriculaCacheada: matricula,
      );
      // Cache no DB local.
      await _db.motoristasDao.upsert(me);
      if (status == AuthStatus.loggedIn) {
        // Só inicia sync depois que o motorista trocou a senha.
        ref.read(syncEngineProvider).start();
        unawaited(ref.read(pushBootstrapProvider).start());
      }
    } on ApiException catch (e) {
      if (e.isUnauthorized) {
        await _storage.clear();
        state = AuthState(
          status: AuthStatus.loggedOut,
          matriculaCacheada: matricula,
        );
      } else {
        // Erro de rede: mantém logado offline com dados em cache.
        final cached =
            await _db.syncMetaDao.getMotoristaId().then(
              (id) => id == null ? null : _db.motoristasDao.getById(id),
            );
        if (cached != null) {
          state = AuthState(
            status: AuthStatus.loggedIn,
            token: token,
            motorista: MotoristaResumo(
              id: cached.id,
              nome: cached.nome,
              matricula: cached.matricula,
              status: cached.status,
            ),
            matriculaCacheada: matricula,
          );
        } else {
          state = AuthState(
            status: AuthStatus.loggedOut,
            matriculaCacheada: matricula,
            error: e.message,
          );
        }
      }
    }
  }

  Future<void> login({
    required String matricula,
    required String senha,
  }) async {
    state = state.copyWith(clearError: true);
    try {
      final session = await _api.login(matricula: matricula, senha: senha);
      await _persist(session, matricula);
    } on ApiException catch (e) {
      state = state.copyWith(error: e.message);
      rethrow;
    }
  }

  Future<void> _persist(AuthSession session, String matricula) async {
    await _storage.writeToken(session.token);
    await _storage.writeMatricula(matricula);
    ref.read(authTokenProvider.notifier).state = session.token;
    state = AuthState(
      status: session.primeiroLogin
          ? AuthStatus.needsPasswordChange
          : AuthStatus.loggedIn,
      token: session.token,
      motorista: session.motorista,
      matriculaCacheada: matricula,
    );
    if (!session.primeiroLogin) {
      ref.read(syncEngineProvider).start();
      unawaited(ref.read(pushBootstrapProvider).start());
    }
  }

  Future<void> trocarSenha({
    required String senhaAtual,
    required String novaSenha,
  }) async {
    await _api.trocarSenha(senhaAtual: senhaAtual, novaSenha: novaSenha);
    state = state.copyWith(status: AuthStatus.loggedIn);
    ref.read(syncEngineProvider).start();
    unawaited(ref.read(pushBootstrapProvider).start());
  }

  Future<void> logout() async {
    try {
      await _api.revogarFcmToken();
    } on ApiException {/* ignora */}
    try {
      await _api.logout();
    } on ApiException {
      // logout local mesmo se servidor falhar
    }
    await ref.read(pushBootstrapProvider).dispose();
    await _storage.clear();
    await _db.wipe();
    ref.read(authTokenProvider.notifier).state = null;
    state = const AuthState(status: AuthStatus.loggedOut);
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);
