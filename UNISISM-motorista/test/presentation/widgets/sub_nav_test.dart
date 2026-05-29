import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unisism_motorista/core/theme/tokens.dart';
import 'package:unisism_motorista/presentation/widgets/sub_nav.dart';

Widget _host(Widget child) =>
    MaterialApp(home: Scaffold(body: child));

void main() {
  group('SubNav', () {
    testWidgets('renderiza todas as tabs no case original (sem uppercase)', (
      tester,
    ) async {
      await tester.pumpWidget(_host(SubNav(
        tabs: const [
          SubNavTab(label: 'Hoje'),
          SubNavTab(label: 'Próximas'),
          SubNavTab(label: 'Histórico'),
        ],
        currentIndex: 0,
        onChanged: (_) {},
      )));
      expect(find.text('Hoje'), findsOneWidget);
      expect(find.text('Próximas'), findsOneWidget);
      expect(find.text('Histórico'), findsOneWidget);
      expect(find.text('HOJE'), findsNothing);
    });

    testWidgets('dispara onChanged ao tocar em outra aba', (tester) async {
      int? selecionada;
      await tester.pumpWidget(_host(SubNav(
        tabs: const [
          SubNavTab(label: 'A'),
          SubNavTab(label: 'B'),
        ],
        currentIndex: 0,
        onChanged: (i) => selecionada = i,
      )));
      await tester.tap(find.text('B'));
      expect(selecionada, 1);
    });

    testWidgets('renderiza badge quando tab tem badge', (tester) async {
      await tester.pumpWidget(_host(SubNav(
        tabs: const [
          SubNavTab(label: 'A'),
          SubNavTab(label: 'B', badge: '7', badgeTone: Tone.critical),
        ],
        currentIndex: 0,
        onChanged: (_) {},
      )));
      expect(find.text('7'), findsOneWidget);
    });
  });
}
