import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unisism_motorista/core/theme/tokens.dart';
import 'package:unisism_motorista/presentation/widgets/status_badge.dart';

Widget _host(Widget child) =>
    MaterialApp(home: Scaffold(body: Center(child: child)));

void main() {
  group('StatusBadge', () {
    testWidgets('renderiza label em case natural (não uppercase)', (
      tester,
    ) async {
      await tester.pumpWidget(
        _host(const StatusBadge(label: 'Agendada', tone: Tone.info)),
      );
      expect(find.text('Agendada'), findsOneWidget);
      expect(find.text('AGENDADA'), findsNothing);
    });

    testWidgets('mostra ícone quando icon é fornecido', (tester) async {
      await tester.pumpWidget(
        _host(const StatusBadge(
          label: 'Embarcou',
          tone: Tone.success,
          icon: Icons.check_circle,
        )),
      );
      expect(find.text('Embarcou'), findsOneWidget);
      expect(find.byIcon(Icons.check_circle), findsOneWidget);
    });

    testWidgets('aplica cores conforme tone success', (tester) async {
      await tester.pumpWidget(
        _host(const StatusBadge(label: 'OK', tone: Tone.success)),
      );
      final container = tester.widget<Container>(find.byType(Container));
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.color, Tone.success.fill);
      expect(
        (decoration.border as Border).top.color,
        Tone.success.border,
      );
    });

    testWidgets('dense=true usa fonte menor', (tester) async {
      await tester.pumpWidget(
        _host(const StatusBadge(label: 'X', tone: Tone.neutral, dense: true)),
      );
      final text = tester.widget<Text>(find.text('X'));
      expect(text.style?.fontSize, 11);
    });
  });
}
