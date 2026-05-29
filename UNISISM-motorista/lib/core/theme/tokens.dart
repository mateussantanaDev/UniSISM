import 'package:flutter/material.dart';

/// Tokens de cor — derivados do Tailwind v4 stock, alinhados com a Face UBS.
///
/// Regra de ouro do design system: **nenhum uso estético/decorativo de cor**.
/// Verde/âmbar/vermelho comunicam estado, nunca "porque é bonito".
class Tokens {
  Tokens._();

  // ── Slate (neutros) ────────────────────────────────────────────────
  static const Color slate50 = Color(0xFFF8FAFC);
  static const Color slate100 = Color(0xFFF1F5F9);
  static const Color slate200 = Color(0xFFE2E8F0);
  static const Color slate300 = Color(0xFFCBD5E1);
  static const Color slate400 = Color(0xFF94A3B8);
  static const Color slate500 = Color(0xFF64748B);
  static const Color slate600 = Color(0xFF475569);
  static const Color slate700 = Color(0xFF334155);
  static const Color slate800 = Color(0xFF1E293B);
  static const Color slate900 = Color(0xFF0F172A);
  static const Color slate950 = Color(0xFF020617);

  // ── Blue (institucional / ação) ────────────────────────────────────
  static const Color blue50 = Color(0xFFEFF6FF);
  static const Color blue700 = Color(0xFF1D4ED8);
  static const Color blue900 = Color(0xFF1E3A8A);
  static const Color blue950 = Color(0xFF172554);

  // ── Emerald (sucesso) ──────────────────────────────────────────────
  static const Color emerald50 = Color(0xFFECFDF5);
  static const Color emerald700 = Color(0xFF047857);
  static const Color emerald800 = Color(0xFF065F46);
  static const Color emerald900 = Color(0xFF064E3B);

  // ── Amber (atenção / pendência) ────────────────────────────────────
  static const Color amber50 = Color(0xFFFFFBEB);
  static const Color amber600 = Color(0xFFD97706);
  static const Color amber800 = Color(0xFF92400E);
  static const Color amber900 = Color(0xFF78350F);

  // ── Red (crítico) ──────────────────────────────────────────────────
  static const Color red50 = Color(0xFFFEF2F2);
  static const Color red700 = Color(0xFFB91C1C);
  static const Color red800 = Color(0xFF991B1B);
  static const Color red900 = Color(0xFF7F1D1D);

  // ── Aliases semânticos ─────────────────────────────────────────────
  static const Color pageBackground = slate50;
  static const Color panelBackground = Colors.white;
  static const Color panelBorder = slate200;
  static const Color divider = slate100;
  static const Color textPrimary = slate900;
  static const Color textBody = slate700;
  static const Color textSecondary = slate600;
  static const Color textLabel = slate500;
  static const Color textPlaceholder = slate400;
  static const Color action = blue900;
}

/// Tom semântico para badges, alerts e barras de acento.
enum Tone { neutral, info, success, warning, critical }

extension ToneColors on Tone {
  Color get border => switch (this) {
    Tone.neutral => Tokens.slate600,
    Tone.info => Tokens.blue700,
    Tone.success => Tokens.emerald700,
    Tone.warning => Tokens.amber600,
    Tone.critical => Tokens.red700,
  };

  Color get fill => switch (this) {
    Tone.neutral => Tokens.slate50,
    Tone.info => Tokens.blue50,
    Tone.success => Tokens.emerald50,
    Tone.warning => Tokens.amber50,
    Tone.critical => Tokens.red50,
  };

  Color get text => switch (this) {
    Tone.neutral => Tokens.slate700,
    Tone.info => Tokens.blue900,
    Tone.success => Tokens.emerald800,
    Tone.warning => Tokens.amber800,
    Tone.critical => Tokens.red800,
  };
}
