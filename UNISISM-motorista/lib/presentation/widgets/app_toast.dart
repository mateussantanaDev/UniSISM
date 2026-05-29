import 'package:flutter/material.dart';

import '../../core/theme/tokens.dart';
import '../../core/theme/typography.dart';

/// Tom semântico do toast. Mapeia 1:1 pra `Tone` do DS.
enum ToastTone { success, error, info, warning }

extension _ToastToneStyle on ToastTone {
  Tone get _tone => switch (this) {
    ToastTone.success => Tone.success,
    ToastTone.error => Tone.critical,
    ToastTone.info => Tone.info,
    ToastTone.warning => Tone.warning,
  };

  IconData get icon => switch (this) {
    ToastTone.success => Icons.check_circle_outline,
    ToastTone.error => Icons.error_outline,
    ToastTone.info => Icons.info_outline,
    ToastTone.warning => Icons.warning_amber_outlined,
  };

  Color get border => _tone.border;
  Color get fill => _tone.fill;
  Color get textColor => _tone.text;
}

/// Toast estilizado seguindo o DS acessível do app.
///
/// Slide-down do topo, borda fina + acento de 4px à esquerda no tom,
/// auto-dismiss controlado por quem mostra.
class AppToast extends StatefulWidget {
  const AppToast({
    super.key,
    required this.tone,
    required this.message,
    this.title,
    this.onDismiss,
  });

  final ToastTone tone;
  final String message;
  final String? title;
  final VoidCallback? onDismiss;

  @override
  State<AppToast> createState() => _AppToastState();
}

class _AppToastState extends State<AppToast>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<Offset> _slide;
  late final Animation<double> _fade;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 220),
    );
    _slide = Tween<Offset>(
      begin: const Offset(0, -1.2),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));
    _fade = CurvedAnimation(parent: _ctrl, curve: Curves.easeIn);
    _ctrl.forward();
  }

  Future<void> dismiss() async {
    if (!mounted) return;
    await _ctrl.reverse();
    widget.onDismiss?.call();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SlideTransition(
      position: _slide,
      child: FadeTransition(
        opacity: _fade,
        child: Material(
          color: Colors.transparent,
          child: Container(
            decoration: BoxDecoration(
              color: widget.tone.fill,
              border: Border(
                left: BorderSide(color: widget.tone.border, width: 4),
                top: BorderSide(color: widget.tone.border, width: 1),
                right: BorderSide(color: widget.tone.border, width: 1),
                bottom: BorderSide(color: widget.tone.border, width: 1),
              ),
            ),
            padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(widget.tone.icon, color: widget.tone.border, size: 22),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (widget.title != null) ...[
                        Text(
                          widget.title!,
                          style: AppTypography.bodySm.copyWith(
                            color: widget.tone.textColor,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 2),
                      ],
                      Text(
                        widget.message,
                        style: AppTypography.bodySm.copyWith(
                          color: widget.tone.textColor,
                          fontWeight: widget.title == null
                              ? FontWeight.w600
                              : FontWeight.w500,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                InkWell(
                  onTap: dismiss,
                  child: Padding(
                    padding: const EdgeInsets.all(6),
                    child: Icon(
                      Icons.close,
                      color: widget.tone.textColor,
                      size: 18,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
