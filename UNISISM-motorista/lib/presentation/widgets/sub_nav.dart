import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/tokens.dart';
import '../../core/theme/typography.dart';

class SubNavTab {
  const SubNavTab({required this.label, this.badge, this.badgeTone});
  final String label;
  final String? badge;
  final Tone? badgeTone;
}

/// Barra de abas — versão acessível e fluida.
///
/// Tab ativa: fundo branco + border-top 3px azul, com animação suave
/// entre abas (sem teleporte). Toque dá haptic leve.
class SubNav extends StatelessWidget {
  const SubNav({
    super.key,
    required this.tabs,
    required this.currentIndex,
    required this.onChanged,
  });

  final List<SubNavTab> tabs;
  final int currentIndex;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Tokens.slate50,
        border: Border(
          bottom: BorderSide(color: Tokens.panelBorder, width: 1),
        ),
      ),
      child: Row(
        children: [
          for (int i = 0; i < tabs.length; i++)
            Expanded(
              child: _TabCell(
                tab: tabs[i],
                active: i == currentIndex,
                onTap: () {
                  if (i == currentIndex) return;
                  HapticFeedback.selectionClick();
                  onChanged(i);
                },
              ),
            ),
        ],
      ),
    );
  }
}

class _TabCell extends StatelessWidget {
  const _TabCell({
    required this.tab,
    required this.active,
    required this.onTap,
  });

  final SubNavTab tab;
  final bool active;
  final VoidCallback onTap;

  static const _curve = Curves.easeOutCubic;
  static const _duration = Duration(milliseconds: 220);

  @override
  Widget build(BuildContext context) {
    final fg = active ? Tokens.slate900 : Tokens.slate600;
    final weight = active ? FontWeight.w800 : FontWeight.w600;
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
                padding: const EdgeInsets.symmetric(
                  vertical: 14,
                  horizontal: 6,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Flexible(
                      child: AnimatedDefaultTextStyle(
                        duration: _duration,
                        curve: _curve,
                        style: TextStyle(
                          fontFamily: AppTypography.sansFamily,
                          fontSize: 14,
                          fontWeight: weight,
                          color: fg,
                          height: 1.1,
                        ),
                        child: Text(
                          tab.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                    if (tab.badge != null) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: (tab.badgeTone ?? Tone.info).border,
                        ),
                        child: Text(
                          tab.badge!,
                          style: const TextStyle(
                            fontFamily: AppTypography.sansFamily,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            height: 1,
                          ),
                        ),
                      ),
                    ],
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
