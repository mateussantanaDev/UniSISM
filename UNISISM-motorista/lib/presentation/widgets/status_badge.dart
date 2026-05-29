import 'package:flutter/material.dart';

import '../../core/theme/tokens.dart';
import '../../core/theme/typography.dart';

/// Badge com borda fina para estados — versão **acessível** (S3).
///
/// Mudanças vs. brutalist original:
/// - Aceita `icon` opcional pra reforçar o significado visual.
/// - Texto em **case normal** (era uppercase + tracking 1.8).
/// - Fonte 13px (era 10).
/// - Padding maior.
class StatusBadge extends StatelessWidget {
  const StatusBadge({
    super.key,
    required this.label,
    this.tone = Tone.neutral,
    this.icon,
    this.dense = false,
  });

  final String label;
  final Tone tone;
  final IconData? icon;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final padding = dense
        ? const EdgeInsets.symmetric(horizontal: 7, vertical: 3)
        : const EdgeInsets.symmetric(horizontal: 9, vertical: 5);
    final fontSize = dense ? 11.0 : 13.0;
    final iconSize = dense ? 12.0 : 15.0;

    return Container(
      decoration: BoxDecoration(
        color: tone.fill,
        border: Border.all(color: tone.border, width: 1),
      ),
      padding: padding,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: iconSize, color: tone.text),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              fontFamily: AppTypography.sansFamily,
              fontSize: fontSize,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.2,
              color: tone.text,
              height: 1.1,
            ),
          ),
        ],
      ),
    );
  }
}
