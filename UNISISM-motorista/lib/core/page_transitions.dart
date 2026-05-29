import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Duração padrão das transições de rota — coerente entre push, pop e
/// também o `pageTransitionsTheme` do Material.
const Duration kPageTransitionDuration = Duration(milliseconds: 280);
const Duration kPageTransitionReverseDuration = Duration(milliseconds: 220);

/// Curva natural — chega rápido, desacelera no fim. Evita o "teleporte"
/// linear do default e a sensação de overshoot do Cupertino.
const Curve _kCurve = Curves.easeOutCubic;
const Curve _kCurveReverse = Curves.easeInCubic;

enum AppPageTransition {
  /// Slide horizontal (entra da direita, volta pela direita). Usar em
  /// navegação dentro do fluxo principal (lista → detalhe → modal full).
  slide,

  /// Fade puro. Usar em troca de contexto (splash → login → home), onde
  /// não há "voltar".
  fade,
}

/// Helper pra montar uma `Page` do go_router com transição consistente
/// nos dois sentidos (push e pop).
Page<T> appPage<T>({
  required GoRouterState state,
  required Widget child,
  AppPageTransition transition = AppPageTransition.slide,
}) {
  return CustomTransitionPage<T>(
    key: state.pageKey,
    transitionDuration: kPageTransitionDuration,
    reverseTransitionDuration: kPageTransitionReverseDuration,
    child: child,
    transitionsBuilder: (context, animation, secondaryAnimation, page) {
      switch (transition) {
        case AppPageTransition.slide:
          // Entrando: slide da direita + fade
          // Saindo (push de outra rota por cima): leve slide pra esquerda
          // + dim de fade — dá profundidade sem teleporte.
          final enterSlide = Tween<Offset>(
            begin: const Offset(1, 0),
            end: Offset.zero,
          ).chain(CurveTween(curve: _kCurve)).animate(animation);
          final exitSlide = Tween<Offset>(
            begin: Offset.zero,
            end: const Offset(-0.18, 0),
          ).chain(CurveTween(curve: _kCurve)).animate(secondaryAnimation);
          final fade = Tween<double>(begin: 0, end: 1)
              .chain(CurveTween(curve: _kCurve))
              .animate(animation);
          return SlideTransition(
            position: enterSlide,
            child: SlideTransition(
              position: exitSlide,
              child: FadeTransition(opacity: fade, child: page),
            ),
          );
        case AppPageTransition.fade:
          final fade = CurvedAnimation(
            parent: animation,
            curve: _kCurve,
            reverseCurve: _kCurveReverse,
          );
          return FadeTransition(opacity: fade, child: page);
      }
    },
  );
}

/// Aplica a mesma curva/duração quando o app cair em `Navigator.push`
/// fora do go_router (modais full-screen, push imperativo). Mantém o
/// mesmo "feel" do go_router.
class AppPageTransitionsTheme extends PageTransitionsBuilder {
  const AppPageTransitionsTheme();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final enter = Tween<Offset>(
      begin: const Offset(1, 0),
      end: Offset.zero,
    ).chain(CurveTween(curve: _kCurve)).animate(animation);
    final exit = Tween<Offset>(
      begin: Offset.zero,
      end: const Offset(-0.18, 0),
    ).chain(CurveTween(curve: _kCurve)).animate(secondaryAnimation);
    final fade = Tween<double>(begin: 0, end: 1)
        .chain(CurveTween(curve: _kCurve))
        .animate(animation);
    return SlideTransition(
      position: enter,
      child: SlideTransition(
        position: exit,
        child: FadeTransition(opacity: fade, child: child),
      ),
    );
  }
}
