import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unisism_motorista/presentation/widgets/sync_indicator.dart';

Widget _host(Widget child) =>
    MaterialApp(home: Scaffold(body: Center(child: child)));

void main() {
  group('SyncIndicator', () {
    testWidgets('estado synced mostra "Tudo salvo"', (tester) async {
      await tester.pumpWidget(
        _host(const SyncIndicator(status: SyncStatus.synced)),
      );
      expect(find.text('Tudo salvo'), findsOneWidget);
    });

    testWidgets('estado syncing mostra spinner + "Enviando…"', (tester) async {
      await tester.pumpWidget(
        _host(const SyncIndicator(status: SyncStatus.syncing)),
      );
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Enviando…'), findsOneWidget);
    });

    testWidgets('offlinePending com count mostra "Sem internet · N por enviar"', (
      tester,
    ) async {
      await tester.pumpWidget(
        _host(const SyncIndicator(
          status: SyncStatus.offlinePending,
          pendingCount: 4,
        )),
      );
      expect(find.text('Sem internet · 4 por enviar'), findsOneWidget);
    });

    testWidgets('offlinePending sem count mostra "Sem internet"', (
      tester,
    ) async {
      await tester.pumpWidget(
        _host(const SyncIndicator(status: SyncStatus.offlinePending)),
      );
      expect(find.text('Sem internet'), findsOneWidget);
    });

    testWidgets('estado error com onRetry mostra "Tentar de novo"', (
      tester,
    ) async {
      var clicks = 0;
      await tester.pumpWidget(
        _host(SyncIndicator(
          status: SyncStatus.error,
          onRetry: () => clicks++,
        )),
      );
      expect(find.text('Não consegui enviar'), findsOneWidget);
      expect(find.text('Tentar de novo'), findsOneWidget);
      await tester.tap(find.text('Tentar de novo'));
      expect(clicks, 1);
    });
  });
}
