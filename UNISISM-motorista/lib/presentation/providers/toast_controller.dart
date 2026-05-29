import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../widgets/app_toast.dart';

@immutable
class ToastMessage {
  const ToastMessage({
    required this.id,
    required this.tone,
    required this.message,
    this.title,
    this.duration = const Duration(seconds: 4),
  });

  final int id;
  final ToastTone tone;
  final String message;
  final String? title;
  final Duration duration;
}

class ToastController extends Notifier<List<ToastMessage>> {
  int _nextId = 1;

  @override
  List<ToastMessage> build() => const [];

  void show({
    required ToastTone tone,
    required String message,
    String? title,
    Duration? duration,
  }) {
    final id = _nextId++;
    final effective =
        duration ??
        (tone == ToastTone.error
            ? const Duration(seconds: 6)
            : const Duration(seconds: 4));
    final toast = ToastMessage(
      id: id,
      tone: tone,
      message: message,
      title: title,
      duration: effective,
    );
    state = [...state, toast];
    Timer(effective, () => dismiss(id));
  }

  void success(String message, {String? title}) =>
      show(tone: ToastTone.success, message: message, title: title);

  void error(String message, {String? title}) =>
      show(tone: ToastTone.error, message: message, title: title);

  void info(String message, {String? title}) =>
      show(tone: ToastTone.info, message: message, title: title);

  void warning(String message, {String? title}) =>
      show(tone: ToastTone.warning, message: message, title: title);

  void dismiss(int id) {
    state = state.where((t) => t.id != id).toList();
  }
}

final toastControllerProvider =
    NotifierProvider<ToastController, List<ToastMessage>>(
      ToastController.new,
    );
