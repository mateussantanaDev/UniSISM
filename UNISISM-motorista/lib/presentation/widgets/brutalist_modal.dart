import 'package:flutter/material.dart';

import '../../core/theme/tokens.dart';
import '../../core/theme/typography.dart';

/// Helper para abrir um modal brutalista — espelha o `<Modal>` da Face UBS.
///
/// Visual: borda 2px slate-900 + offset shadow `8 8 0 rgba(15,23,42,.12)`.
/// Animação: slide-up + fade da barreira (sem teleporte).
Future<T?> showBrutalistModal<T>({
  required BuildContext context,
  required String title,
  String? subtitle,
  required WidgetBuilder builder,
  bool barrierDismissible = true,
}) {
  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: barrierDismissible,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: Tokens.slate900.withValues(alpha: 0.6),
    transitionDuration: const Duration(milliseconds: 240),
    pageBuilder: (ctx, _, _) => Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 540),
          child: _ModalShell(
            title: title,
            subtitle: subtitle,
            child: Builder(builder: builder),
          ),
        ),
      ),
    ),
    transitionBuilder: (_, animation, _, child) {
      final fade = CurvedAnimation(
        parent: animation,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeInCubic,
      );
      final slide = Tween<Offset>(
        begin: const Offset(0, 0.06),
        end: Offset.zero,
      ).animate(fade);
      final scale = Tween<double>(begin: 0.98, end: 1).animate(fade);
      return FadeTransition(
        opacity: fade,
        child: SlideTransition(
          position: slide,
          child: ScaleTransition(scale: scale, child: child),
        ),
      );
    },
  );
}

class _ModalShell extends StatelessWidget {
  const _ModalShell({
    required this.title,
    required this.subtitle,
    required this.child,
  });

  final String title;
  final String? subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Material(
      type: MaterialType.transparency,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: Tokens.slate900, width: 2),
          boxShadow: [
            BoxShadow(
              color: Tokens.slate900.withValues(alpha: 0.12),
              offset: const Offset(8, 8),
              blurRadius: 0,
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _ModalHeader(title: title, subtitle: subtitle),
            Flexible(child: SingleChildScrollView(child: child)),
          ],
        ),
      ),
    );
  }
}

class _ModalHeader extends StatelessWidget {
  const _ModalHeader({required this.title, required this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Tokens.slate900, width: 2),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(16, 14, 8, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title.toUpperCase(),
                  style: AppTypography.panelTitle.copyWith(
                    fontSize: AppTypography.sizeSm,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(subtitle!, style: AppTypography.panelSubtitle),
                ],
              ],
            ),
          ),
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.close, size: 18),
            color: Tokens.slate700,
            visualDensity: VisualDensity.compact,
            tooltip: 'Fechar',
          ),
        ],
      ),
    );
  }
}
