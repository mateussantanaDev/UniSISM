import 'package:flutter/material.dart';

import 'tokens.dart';

/// Escala tipográfica do app — versão **acessível** pensada para motoristas
/// com leitura básica, lendo em movimento.
///
/// Filosofia (revisão pós-MVP):
/// - Inter (sans) para tudo que é leitura humana — texto, botões, títulos.
/// - JetBrains Mono apenas para **dados** (CPF, protocolo, hora, KM).
/// - Sem `tracking-widest` agressivo; usar letter spacing natural.
/// - Mínimo 12px nas labels, 14px nos textos auxiliares, 16px no body.
/// - Sem `uppercase` em texto corrido — só em rótulos curtos quando
///   reforça hierarquia (data MMM, MAT, etc.).
class AppTypography {
  AppTypography._();

  static const String sansFamily = 'Inter';
  static const String monoFamily = 'JetBrainsMono';

  // ── Tamanhos ───────────────────────────────────────────────────────
  static const double sizeLabel = 12;     // antes 10
  static const double sizeAux = 13;       // texto auxiliar
  static const double sizeXs = 14;        // antes 12 (mínimo legível)
  static const double sizeSm = 16;        // antes 14 — body padrão
  static const double sizeBase = 18;      // antes 16 — títulos de painel
  static const double sizeLg = 20;        // cabeçalhos de tela
  static const double sizeXl = 24;        // hora destacada no card
  static const double size2xl = 30;
  static const double size3xl = 36;       // antes 30 — métricas grandes

  // ── Estilos canônicos ──────────────────────────────────────────────

  /// Label uppercase suave — usado pra "DADOS PESSOAIS", "MAT", etc.
  /// Não é mono; tracking moderado, não agressivo.
  static const TextStyle label = TextStyle(
    fontFamily: sansFamily,
    fontSize: sizeLabel,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.8,
    color: Tokens.textLabel,
    height: 1.2,
  );

  /// Título de painel — sans-serif, bold, sentence case. Antes era
  /// "TÍTULO DO PAINEL" mono; agora é "Título do painel" claro.
  static const TextStyle panelTitle = TextStyle(
    fontFamily: sansFamily,
    fontSize: sizeBase,
    fontWeight: FontWeight.w700,
    color: Tokens.textPrimary,
    height: 1.25,
  );

  /// Subtítulo dentro de PanelHeader — descritivo, fonte normal.
  static const TextStyle panelSubtitle = TextStyle(
    fontFamily: sansFamily,
    fontSize: sizeAux,
    fontWeight: FontWeight.w400,
    color: Tokens.textSecondary,
    height: 1.35,
  );

  /// Cabeçalho da tela — fonte grande, sans-serif, bold.
  static const TextStyle pageTitle = TextStyle(
    fontFamily: sansFamily,
    fontSize: sizeLg,
    fontWeight: FontWeight.w800,
    color: Tokens.textPrimary,
    height: 1.2,
  );

  /// Número grande em MetricCard.
  static const TextStyle metricValue = TextStyle(
    fontFamily: monoFamily,
    fontSize: size3xl,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.5,
    color: Tokens.textPrimary,
    height: 1,
  );

  /// Body padrão — texto principal das telas.
  static const TextStyle bodySm = TextStyle(
    fontFamily: sansFamily,
    fontSize: sizeSm,
    fontWeight: FontWeight.w400,
    color: Tokens.textBody,
    height: 1.45,
  );

  /// Body auxiliar — descrições, hints, subtítulos.
  static const TextStyle bodyXs = TextStyle(
    fontFamily: sansFamily,
    fontSize: sizeXs,
    fontWeight: FontWeight.w400,
    color: Tokens.textBody,
    height: 1.4,
  );

  /// Dados tabulares (CPF, protocolo, hodômetro). Mantém mono.
  static const TextStyle monoXs = TextStyle(
    fontFamily: monoFamily,
    fontSize: sizeXs,
    fontWeight: FontWeight.w500,
    color: Tokens.textPrimary,
    height: 1.4,
  );

  static const TextStyle monoSm = TextStyle(
    fontFamily: monoFamily,
    fontSize: sizeSm,
    fontWeight: FontWeight.w500,
    color: Tokens.textPrimary,
    height: 1.4,
  );

  /// Texto de botão — sans, bold, **case normal**. Antes era uppercase
  /// + tracking-widest 2.5 (técnico demais).
  static const TextStyle button = TextStyle(
    fontFamily: sansFamily,
    fontSize: sizeSm,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.2,
    height: 1.2,
  );

  /// Texto de input.
  static const TextStyle input = TextStyle(
    fontFamily: sansFamily,
    fontSize: sizeSm,
    fontWeight: FontWeight.w500,
    color: Tokens.textPrimary,
    height: 1.4,
  );

  static const TextStyle inputMono = TextStyle(
    fontFamily: monoFamily,
    fontSize: sizeSm,
    fontWeight: FontWeight.w500,
    color: Tokens.textPrimary,
    height: 1.4,
  );
}
