import 'package:flutter/material.dart';

import '../../core/theme/tokens.dart';
import '../../core/theme/typography.dart';

/// Cabeçalho padronizado de painel. Espelha o `<PanelHeader>` da Face UBS.
///
/// Quando `index` é informado, mostra um chip azul-marinho com o número
/// (ex.: `01`, `02`) à esquerda — pattern de painéis numerados.
class PanelHeader extends StatelessWidget {
  const PanelHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.index,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final String? index;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Tokens.slate50, Colors.white],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
        border: Border(
          bottom: BorderSide(color: Tokens.panelBorder, width: 1),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (index != null) ...[
            Container(
              width: 28,
              height: 28,
              alignment: Alignment.center,
              color: Tokens.blue900,
              child: Text(
                index!,
                style: const TextStyle(
                  fontFamily: AppTypography.monoFamily,
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 11,
                  letterSpacing: 1.2,
                ),
              ),
            ),
            const SizedBox(width: 10),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(title.toUpperCase(), style: AppTypography.panelTitle),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(subtitle!, style: AppTypography.panelSubtitle),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 8), trailing!],
        ],
      ),
    );
  }
}
