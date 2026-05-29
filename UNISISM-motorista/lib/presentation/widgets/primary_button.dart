import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/tokens.dart';
import '../../core/theme/typography.dart';

enum ButtonVariant { primary, secondary, danger }

/// Botão de ação — acessível e responsivo ao toque.
///
/// - 56dp+ de altura, fonte 16px, case natural ("Iniciar viagem").
/// - **Pressionar** dispara `HapticFeedback.lightImpact()` e anima um
///   leve scale (1.0 → 0.97) — feedback tátil e visual sem teleporte.
/// - **Loading** mostra spinner inline e bloqueia novo toque.
class PrimaryButton extends StatefulWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = ButtonVariant.primary,
    this.loading = false,
    this.fullWidth = false,
    this.leading,
  });

  final String label;
  final VoidCallback? onPressed;
  final ButtonVariant variant;
  final bool loading;
  final bool fullWidth;
  final IconData? leading;

  @override
  State<PrimaryButton> createState() => _PrimaryButtonState();
}

class _PrimaryButtonState extends State<PrimaryButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _scale;

  bool get _disabled => widget.onPressed == null || widget.loading;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 90),
      reverseDuration: const Duration(milliseconds: 140),
      lowerBound: 0,
      upperBound: 1,
    );
    _scale = Tween<double>(begin: 1, end: 0.97)
        .chain(CurveTween(curve: Curves.easeOut))
        .animate(_ctrl);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails _) {
    if (_disabled) return;
    _ctrl.forward();
  }

  void _onTapUp(TapUpDetails _) {
    _ctrl.reverse();
  }

  void _onTapCancel() {
    _ctrl.reverse();
  }

  void _onTap() {
    if (_disabled) return;
    HapticFeedback.lightImpact();
    widget.onPressed?.call();
  }

  @override
  Widget build(BuildContext context) {
    final bg = _bg();
    final fg = _fg();
    final border = _border();

    final content = Row(
      mainAxisSize: widget.fullWidth ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (widget.loading)
          SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2.4,
              valueColor: AlwaysStoppedAnimation(fg),
            ),
          )
        else if (widget.leading != null)
          Icon(widget.leading, size: 20, color: fg),
        if (widget.loading || widget.leading != null) const SizedBox(width: 12),
        Flexible(
          child: Text(
            widget.label,
            style: AppTypography.button.copyWith(color: fg),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );

    return AnimatedOpacity(
      duration: const Duration(milliseconds: 160),
      opacity: _disabled && !widget.loading ? 0.5 : 1,
      child: ScaleTransition(
        scale: _scale,
        child: GestureDetector(
          onTapDown: _onTapDown,
          onTapUp: _onTapUp,
          onTapCancel: _onTapCancel,
          behavior: HitTestBehavior.opaque,
          child: Material(
            color: bg,
            child: InkWell(
              onTap: _disabled ? null : _onTap,
              splashColor: fg.withValues(alpha: 0.12),
              highlightColor: fg.withValues(alpha: 0.06),
              child: Container(
                decoration: border == null
                    ? null
                    : BoxDecoration(
                        border: Border.all(color: border, width: 1),
                      ),
                constraints: const BoxConstraints(minHeight: 56),
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 16,
                ),
                child: Center(child: content),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Color _bg() => switch (widget.variant) {
    ButtonVariant.primary => Tokens.blue900,
    ButtonVariant.secondary => Colors.white,
    ButtonVariant.danger => Tokens.red800,
  };

  Color _fg() => switch (widget.variant) {
    ButtonVariant.primary || ButtonVariant.danger => Colors.white,
    ButtonVariant.secondary => Tokens.slate900,
  };

  Color? _border() => switch (widget.variant) {
    ButtonVariant.secondary => Tokens.slate300,
    _ => null,
  };
}
