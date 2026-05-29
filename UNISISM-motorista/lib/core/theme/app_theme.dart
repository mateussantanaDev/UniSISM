import 'package:flutter/material.dart';

import '../page_transitions.dart';
import 'tokens.dart';
import 'typography.dart';

/// Tema global B2G brutalista.
///
/// Princípios aplicados (ver DESIGN_SYSTEM.md):
/// - P3: cantos retos (border-radius: 0 em tudo)
/// - P4: bordas finas no lugar de sombras difusas
/// - P5: cores sóbrias — slate-* e blue-900 são a base
/// - P6: monoespaçada (JetBrains Mono) para dados; sans (Inter) para textos
class AppTheme {
  AppTheme._();

  // Aliases mantidos para compatibilidade com SplashScreen (F0)
  static const Color slate50 = Tokens.slate50;
  static const Color slate100 = Tokens.slate100;
  static const Color slate200 = Tokens.slate200;
  static const Color slate500 = Tokens.slate500;
  static const Color slate700 = Tokens.slate700;
  static const Color slate900 = Tokens.slate900;
  static const Color blue900 = Tokens.blue900;

  static const _zero = RoundedRectangleBorder(borderRadius: BorderRadius.zero);

  static ThemeData light() {
    final base = ThemeData.light(useMaterial3: true);
    final interTextTheme = base.textTheme
        .apply(
          fontFamily: AppTypography.sansFamily,
          bodyColor: Tokens.textPrimary,
          displayColor: Tokens.textPrimary,
        )
        .copyWith(
          bodySmall: AppTypography.bodyXs,
          bodyMedium: AppTypography.bodySm,
          labelSmall: AppTypography.label,
          labelMedium: AppTypography.label,
          titleSmall: AppTypography.panelTitle,
          titleMedium: AppTypography.pageTitle,
          headlineSmall: AppTypography.metricValue,
        );

    return base.copyWith(
      scaffoldBackgroundColor: Tokens.pageBackground,
      canvasColor: Tokens.pageBackground,
      dividerColor: Tokens.divider,

      colorScheme: base.colorScheme.copyWith(
        primary: Tokens.blue900,
        onPrimary: Colors.white,
        secondary: Tokens.slate700,
        surface: Colors.white,
        onSurface: Tokens.slate900,
        error: Tokens.red700,
        onError: Colors.white,
      ),

      textTheme: interTextTheme,
      primaryTextTheme: interTextTheme,

      // Cantos retos por padrão em TUDO.
      cardTheme: const CardThemeData(
        shape: _zero,
        color: Tokens.panelBackground,
        margin: EdgeInsets.zero,
        elevation: 0,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          shape: _zero,
          backgroundColor: Tokens.blue900,
          foregroundColor: Colors.white,
          elevation: 0,
          textStyle: AppTypography.button,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          shape: _zero,
          side: const BorderSide(color: Tokens.slate300, width: 1),
          foregroundColor: Tokens.slate900,
          textStyle: AppTypography.button,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          shape: _zero,
          foregroundColor: Tokens.blue900,
          textStyle: AppTypography.button,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 12,
        ),
        hintStyle: AppTypography.input.copyWith(color: Tokens.textPlaceholder),
        labelStyle: AppTypography.label,
        floatingLabelStyle: AppTypography.label,
        border: const OutlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: Tokens.slate300, width: 1),
        ),
        enabledBorder: const OutlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: Tokens.slate300, width: 1),
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: Tokens.blue900, width: 1.5),
        ),
        errorBorder: const OutlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: Tokens.red700, width: 1),
        ),
        focusedErrorBorder: const OutlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: Tokens.red700, width: 1.5),
        ),
      ),
      dialogTheme: const DialogThemeData(
        shape: _zero,
        backgroundColor: Colors.white,
        elevation: 0,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        shape: _zero,
        backgroundColor: Colors.white,
        elevation: 0,
      ),
      snackBarTheme: const SnackBarThemeData(
        shape: _zero,
        backgroundColor: Tokens.slate900,
        contentTextStyle: TextStyle(
          fontFamily: AppTypography.sansFamily,
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: Colors.white,
        ),
        behavior: SnackBarBehavior.floating,
      ),
      iconTheme: const IconThemeData(color: Tokens.slate700, size: 18),
      primaryIconTheme: const IconThemeData(color: Colors.white, size: 18),

      visualDensity: VisualDensity.compact,
      splashFactory: InkRipple.splashFactory,
      highlightColor: Tokens.slate100.withValues(alpha: 0.6),
      splashColor: Tokens.blue900.withValues(alpha: 0.06),
      hoverColor: Tokens.slate100,

      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.iOS: AppPageTransitionsTheme(),
          TargetPlatform.android: AppPageTransitionsTheme(),
          TargetPlatform.macOS: AppPageTransitionsTheme(),
          TargetPlatform.windows: AppPageTransitionsTheme(),
          TargetPlatform.linux: AppPageTransitionsTheme(),
          TargetPlatform.fuchsia: AppPageTransitionsTheme(),
        },
      ),
    );
  }
}
