import 'package:flutter/material.dart';

import '../../core/theme/tokens.dart';
import '../../core/theme/typography.dart';

enum TrendDirection { up, down, neutral }

/// Card numérico com barra de acento lateral. Principal elemento de
/// dashboard — espelha o `<MetricCard>` da Face UBS.
class MetricCard extends StatelessWidget {
  const MetricCard({
    super.key,
    required this.label,
    required this.value,
    this.sublabel,
    this.trend,
    this.trendDirection,
    this.accent = Tone.info,
  });

  final String label;
  final String value;
  final String? sublabel;
  final String? trend;
  final TrendDirection? trendDirection;
  final Tone accent;

  Color get _trendColor => switch (trendDirection) {
    TrendDirection.up => Tokens.emerald800,
    TrendDirection.down => Tokens.red800,
    TrendDirection.neutral || null => Tokens.slate500,
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Tokens.panelBackground,
        border: Border.all(color: Tokens.panelBorder, width: 1),
      ),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 4, color: accent.border),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(label.toUpperCase(), style: AppTypography.label),
                    const SizedBox(height: 6),
                    Text(value, style: AppTypography.metricValue),
                    if (sublabel != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        sublabel!,
                        style: AppTypography.bodyXs.copyWith(
                          color: Tokens.textSecondary,
                        ),
                      ),
                    ],
                    if (trend != null) ...[
                      const SizedBox(height: 6),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            switch (trendDirection) {
                              TrendDirection.up => Icons.arrow_upward,
                              TrendDirection.down => Icons.arrow_downward,
                              _ => Icons.remove,
                            },
                            size: 12,
                            color: _trendColor,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            trend!,
                            style: TextStyle(
                              fontFamily: AppTypography.monoFamily,
                              fontSize: AppTypography.sizeAux,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.5,
                              color: _trendColor,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
