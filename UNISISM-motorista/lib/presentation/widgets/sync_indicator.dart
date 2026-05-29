import 'package:flutter/material.dart';

import '../../core/theme/tokens.dart';
import '../../core/theme/typography.dart';

/// Estado do sync engine (F5).
enum SyncStatus { synced, syncing, offlinePending, error }

/// Chip de status do sync — versão **acessível** (S4).
///
/// Linguagem natural ("Tudo salvo", "Sem internet") no lugar de jargão
/// técnico ("SINCRONIZADO", "OFFLINE · 4 PENDENTES").
///
/// `compact: true` esconde o texto e mostra só ícone (e badge com
/// pendingCount se houver) — usado no AppBar pra não estourar em telas
/// estreitas. Tap mostra o tooltip com o texto completo.
class SyncIndicator extends StatelessWidget {
  const SyncIndicator({
    super.key,
    required this.status,
    this.pendingCount = 0,
    this.onRetry,
    this.compact = false,
  });

  final SyncStatus status;
  final int pendingCount;
  final VoidCallback? onRetry;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final tone = _tone();
    final label = _label();
    final showSpinner = status == SyncStatus.syncing;

    if (compact) {
      return Tooltip(
        message: label,
        child: Container(
          decoration: BoxDecoration(
            color: tone.fill,
            border: Border.all(color: tone.border, width: 1),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (showSpinner)
                SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation(tone.text),
                  ),
                )
              else
                Icon(_icone(), size: 18, color: tone.text),
              if (pendingCount > 0) ...[
                const SizedBox(width: 6),
                Text(
                  '$pendingCount',
                  style: TextStyle(
                    fontFamily: AppTypography.sansFamily,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: tone.text,
                    height: 1,
                  ),
                ),
              ],
            ],
          ),
        ),
      );
    }

    final canRetry = status == SyncStatus.error && onRetry != null;

    return Container(
      decoration: BoxDecoration(
        color: tone.fill,
        border: Border.all(color: tone.border, width: 1),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (showSpinner) ...[
            SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation(tone.text),
              ),
            ),
            const SizedBox(width: 8),
          ] else ...[
            Icon(_icone(), size: 14, color: tone.text),
            const SizedBox(width: 6),
          ],
          Flexible(
            child: Text(
              label,
              style: TextStyle(
                fontFamily: AppTypography.sansFamily,
                fontSize: 12,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.2,
                color: tone.text,
                height: 1.1,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (canRetry) ...[
            const SizedBox(width: 8),
            GestureDetector(
              onTap: onRetry,
              child: Text(
                'Tentar de novo',
                style: TextStyle(
                  fontFamily: AppTypography.sansFamily,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: tone.text,
                  decoration: TextDecoration.underline,
                  height: 1.1,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Tone _tone() => switch (status) {
    SyncStatus.synced => Tone.success,
    SyncStatus.syncing => Tone.info,
    SyncStatus.offlinePending => Tone.neutral,
    SyncStatus.error => Tone.critical,
  };

  IconData _icone() => switch (status) {
    SyncStatus.synced => Icons.cloud_done,
    SyncStatus.syncing => Icons.cloud_sync,
    SyncStatus.offlinePending => Icons.cloud_off,
    SyncStatus.error => Icons.error_outline,
  };

  String _label() => switch (status) {
    SyncStatus.synced => 'Tudo salvo',
    SyncStatus.syncing => 'Enviando…',
    SyncStatus.offlinePending => pendingCount > 0
        ? 'Sem internet · $pendingCount por enviar'
        : 'Sem internet',
    SyncStatus.error => 'Não consegui enviar',
  };
}
