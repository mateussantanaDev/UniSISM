import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unisism_motorista/core/theme/tokens.dart';
import 'package:unisism_motorista/presentation/widgets/metric_card.dart';

Widget _host(Widget child) => MaterialApp(
  home: Scaffold(body: SizedBox(width: 200, child: child)),
);

void main() {
  group('MetricCard', () {
    testWidgets('renderiza label uppercase, valor e sublabel', (tester) async {
      await tester.pumpWidget(
        _host(const MetricCard(
          label: 'Viagens',
          value: '12',
          sublabel: 'hoje',
        )),
      );
      expect(find.text('VIAGENS'), findsOneWidget);
      expect(find.text('12'), findsOneWidget);
      expect(find.text('hoje'), findsOneWidget);
    });

    testWidgets('mostra ícone de trend up quando trendDirection.up', (
      tester,
    ) async {
      await tester.pumpWidget(
        _host(const MetricCard(
          label: 'L',
          value: '1',
          trend: '+10%',
          trendDirection: TrendDirection.up,
        )),
      );
      expect(find.byIcon(Icons.arrow_upward), findsOneWidget);
      expect(find.text('+10%'), findsOneWidget);
    });

    testWidgets('barra de acento usa cor do tone warning', (tester) async {
      await tester.pumpWidget(
        _host(const MetricCard(
          label: 'L',
          value: '1',
          accent: Tone.warning,
        )),
      );
      // A primeira Container (width=4) é a barra.
      final containers = tester.widgetList<Container>(find.byType(Container));
      final barra = containers.firstWhere(
        (c) => c.constraints?.maxWidth == 4 || c.constraints?.minWidth == 4,
        orElse: () => containers.first,
      );
      expect(barra.color, Tone.warning.border);
    });
  });
}
