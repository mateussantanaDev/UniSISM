import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/toast_controller.dart';
import 'app_toast.dart';

/// Overlay global de toasts. Plugado em `MaterialApp.router.builder`
/// pra ficar acima de QUALQUER tela (login, viagens, modais).
class ToastOverlay extends ConsumerWidget {
  const ToastOverlay({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final toasts = ref.watch(toastControllerProvider);
    final topInset = MediaQuery.of(context).padding.top;

    return Stack(
      children: [
        child,
        if (toasts.isNotEmpty)
          Positioned(
            top: topInset + 12,
            left: 12,
            right: 12,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final toast in toasts)
                  Padding(
                    key: ValueKey(toast.id),
                    padding: const EdgeInsets.only(bottom: 8),
                    child: AppToast(
                      tone: toast.tone,
                      message: toast.message,
                      title: toast.title,
                      onDismiss: () => ref
                          .read(toastControllerProvider.notifier)
                          .dismiss(toast.id),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}
