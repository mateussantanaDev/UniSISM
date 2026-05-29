import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/tokens.dart';
import '../../core/theme/typography.dart';

class BottomNavItem {
  const BottomNavItem({
    required this.label,
    required this.icon,
    this.badge,
    this.badgeTone = Tone.info,
  });

  final String label;
  final IconData icon;
  final String? badge;
  final Tone badgeTone;
}

/// Bottom navigation acessível.
///
/// Cada célula anima cor de fundo, cor de ícone, peso do label e
/// indicador topo via `AnimatedContainer`/`AnimatedDefaultTextStyle` —
/// sem teleporte na troca de aba. Toque dispara haptic leve.
class BrutalistBottomNav extends StatelessWidget {
  const BrutalistBottomNav({
    super.key,
    required this.items,
    required this.currentIndex,
    required this.onTap,
  });

  final List<BottomNavItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: Tokens.slate50,
        border: Border(
          top: BorderSide(color: Tokens.panelBorder, width: 1),
        ),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 72,
          child: Row(
            children: [
              for (int i = 0; i < items.length; i++)
                Expanded(
                  child: _NavCell(
                    item: items[i],
                    active: i == currentIndex,
                    onTap: () {
                      if (i == currentIndex) return;
                      HapticFeedback.selectionClick();
                      onTap(i);
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavCell extends StatelessWidget {
  const _NavCell({
    required this.item,
    required this.active,
    required this.onTap,
  });

  final BottomNavItem item;
  final bool active;
  final VoidCallback onTap;

  static const _curve = Curves.easeOutCubic;
  static const _duration = Duration(milliseconds: 220);

  @override
  Widget build(BuildContext context) {
    final iconColor = active ? Tokens.blue900 : Tokens.slate500;
    final labelColor = active ? Tokens.slate900 : Tokens.slate600;
    final labelWeight = active ? FontWeight.w800 : FontWeight.w600;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: AnimatedContainer(
          duration: _duration,
          curve: _curve,
          color: active ? Colors.white : Tokens.slate50,
          child: Stack(
            children: [
              // Indicador topo animado (cresce de 0→3px sem teleporte)
              AnimatedPositioned(
                duration: _duration,
                curve: _curve,
                top: 0,
                left: 0,
                right: 0,
                height: active ? 3 : 0,
                child: Container(color: Tokens.blue900),
              ),
              const Positioned(
                top: 0,
                right: 0,
                bottom: 0,
                child: VerticalDivider(
                  width: 1,
                  thickness: 1,
                  color: Tokens.panelBorder,
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Stack(
                      clipBehavior: Clip.none,
                      children: [
                        TweenAnimationBuilder<double>(
                          tween: Tween(begin: 1, end: active ? 1.08 : 1),
                          duration: _duration,
                          curve: _curve,
                          builder: (_, scale, child) =>
                              Transform.scale(scale: scale, child: child),
                          child: AnimatedSwitcher(
                            duration: _duration,
                            child: Icon(
                              item.icon,
                              key: ValueKey(iconColor),
                              size: 28,
                              color: iconColor,
                            ),
                          ),
                        ),
                        if (item.badge != null)
                          Positioned(
                            right: -10,
                            top: -4,
                            child: _Badge(
                              text: item.badge!,
                              tone: item.badgeTone,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    AnimatedDefaultTextStyle(
                      duration: _duration,
                      curve: _curve,
                      style: TextStyle(
                        fontFamily: AppTypography.sansFamily,
                        fontSize: 12,
                        fontWeight: labelWeight,
                        color: labelColor,
                        height: 1,
                      ),
                      child: Text(item.label),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.text, required this.tone});

  final String text;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: tone.border,
        border: Border.all(color: tone.border, width: 1),
      ),
      child: Text(
        text,
        style: const TextStyle(
          fontFamily: AppTypography.sansFamily,
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: Colors.white,
          height: 1,
        ),
      ),
    );
  }
}
