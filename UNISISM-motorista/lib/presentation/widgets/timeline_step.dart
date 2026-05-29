import 'package:flutter/material.dart';

import '../../core/theme/tokens.dart';
import '../../core/theme/typography.dart';

/// Item de timeline vertical. Espelha o `<TimelineStep>` da Face UBS.
///
/// Mostra um bullet colorido por `tone` + linha vertical conectando aos
/// próximos itens. Cada step é um mini-painel branco com título +
/// descrição opcional + autor + timestamp.
class TimelineStep extends StatelessWidget {
  const TimelineStep({
    super.key,
    required this.titulo,
    required this.em,
    this.descricao,
    this.autor,
    this.tone = Tone.info,
    this.isLast = false,
  });

  final String titulo;
  final DateTime em;
  final String? descricao;
  final String? autor;
  final Tone tone;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Bullet + linha
          SizedBox(
            width: 28,
            child: Column(
              children: [
                Container(
                  width: 12,
                  height: 12,
                  margin: const EdgeInsets.only(top: 14),
                  decoration: BoxDecoration(
                    color: tone.fill,
                    border: Border.all(color: tone.border, width: 2),
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      color: Tokens.slate200,
                    ),
                  ),
              ],
            ),
          ),
          // Mini-painel
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: Tokens.panelBorder, width: 1),
                ),
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            titulo,
                            style: AppTypography.bodySm.copyWith(
                              fontWeight: FontWeight.w700,
                              color: Tokens.textPrimary,
                            ),
                          ),
                        ),
                        Text(
                          _formatarHora(em),
                          style: AppTypography.monoXs.copyWith(
                            fontSize: 10,
                            color: Tokens.textSecondary,
                          ),
                        ),
                      ],
                    ),
                    if (descricao != null) ...[
                      const SizedBox(height: 4),
                      Text(descricao!, style: AppTypography.bodyXs),
                    ],
                    if (autor != null) ...[
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          const Icon(
                            Icons.person_outline,
                            size: 10,
                            color: Tokens.slate500,
                          ),
                          const SizedBox(width: 3),
                          Text(
                            autor!,
                            style: AppTypography.label.copyWith(
                              fontSize: 9,
                              fontFamily: AppTypography.monoFamily,
                              letterSpacing: 1.5,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatarHora(DateTime d) {
    String two(int n) => n.toString().padLeft(2, '0');
    final hoje = DateTime.now();
    final mesmoDia =
        d.year == hoje.year && d.month == hoje.month && d.day == hoje.day;
    if (mesmoDia) {
      return '${two(d.hour)}:${two(d.minute)}';
    }
    return '${two(d.day)}/${two(d.month)} ${two(d.hour)}:${two(d.minute)}';
  }
}
