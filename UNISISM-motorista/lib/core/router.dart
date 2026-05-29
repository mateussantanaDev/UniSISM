import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../presentation/providers/auth_provider.dart';
import '../presentation/screens/ajuda_custo/lista_ajudas_screen.dart';
import '../presentation/screens/login/login_screen.dart';
import '../presentation/screens/login/trocar_senha_screen.dart';
import '../presentation/screens/perfil/perfil_screen.dart';
import '../presentation/screens/splash/splash_screen.dart';
import '../presentation/screens/viagens/detalhe_viagem_screen.dart';
import '../presentation/screens/viagens/lista_viagens_screen.dart';
import 'page_transitions.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authControllerProvider);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: _AuthListenable(ref),
    redirect: (context, state) {
      final loc = state.uri.path;
      switch (auth.status) {
        case AuthStatus.restoring:
          return loc == '/' ? null : '/';
        case AuthStatus.loggedOut:
          return loc == '/login' ? null : '/login';
        case AuthStatus.needsPasswordChange:
          return loc == '/login/trocar-senha' ? null : '/login/trocar-senha';
        case AuthStatus.loggedIn:
          if (loc == '/' ||
              loc == '/login' ||
              loc == '/login/trocar-senha') {
            return '/home';
          }
          return null;
      }
    },
    routes: [
      GoRoute(
        path: '/',
        pageBuilder: (_, state) => appPage(
          state: state,
          child: const SplashScreen(),
          transition: AppPageTransition.fade,
        ),
      ),
      GoRoute(
        path: '/login',
        pageBuilder: (_, state) => appPage(
          state: state,
          child: const LoginScreen(),
          transition: AppPageTransition.fade,
        ),
      ),
      GoRoute(
        path: '/login/trocar-senha',
        pageBuilder: (_, state) => appPage(
          state: state,
          child: const TrocarSenhaScreen(),
        ),
      ),
      GoRoute(
        path: '/home',
        pageBuilder: (_, state) => appPage(
          state: state,
          child: const ListaViagensScreen(),
          transition: AppPageTransition.fade,
        ),
      ),
      GoRoute(
        path: '/viagens/:id',
        pageBuilder: (_, state) => appPage(
          state: state,
          child: DetalheViagemScreen(viagemId: state.pathParameters['id']!),
        ),
      ),
      GoRoute(
        path: '/ajudas-custo',
        pageBuilder: (_, state) => appPage(
          state: state,
          child: const ListaAjudasScreen(),
        ),
      ),
      GoRoute(
        path: '/perfil',
        pageBuilder: (_, state) => appPage(
          state: state,
          child: const PerfilScreen(),
          transition: AppPageTransition.fade,
        ),
      ),
    ],
  );
});

/// Ponte mínima entre `Notifier<AuthState>` e o `refreshListenable` do
/// GoRouter (que espera um `Listenable`).
class _AuthListenable extends ChangeNotifier {
  _AuthListenable(this._ref) {
    _ref.listen<AuthState>(authControllerProvider, (_, _) {
      notifyListeners();
    });
  }
  // ignore: unused_field
  final Ref _ref;
}
