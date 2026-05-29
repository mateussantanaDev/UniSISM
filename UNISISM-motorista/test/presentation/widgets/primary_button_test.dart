import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unisism_motorista/presentation/widgets/primary_button.dart';

Widget _host(Widget child) =>
    MaterialApp(home: Scaffold(body: child));

void main() {
  group('PrimaryButton', () {
    testWidgets('renderiza label em case normal (não uppercase)', (
      tester,
    ) async {
      await tester.pumpWidget(
        _host(PrimaryButton(label: 'Iniciar viagem', onPressed: () {})),
      );
      expect(find.text('Iniciar viagem'), findsOneWidget);
      expect(find.text('INICIAR VIAGEM'), findsNothing);
    });

    testWidgets('mostra spinner quando loading=true', (tester) async {
      await tester.pumpWidget(
        _host(PrimaryButton(
          label: 'Salvar',
          loading: true,
          onPressed: () {},
        )),
      );
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('fica desabilitado quando onPressed é null', (tester) async {
      await tester.pumpWidget(
        _host(const PrimaryButton(label: 'Salvar', onPressed: null)),
      );
      final inkwell = tester.widget<InkWell>(find.byType(InkWell));
      expect(inkwell.onTap, isNull);
    });

    testWidgets('dispara callback ao tap', (tester) async {
      int taps = 0;
      await tester.pumpWidget(
        _host(PrimaryButton(label: 'Ok', onPressed: () => taps++)),
      );
      await tester.tap(find.byType(InkWell));
      await tester.pump();
      expect(taps, 1);
    });

    testWidgets('variant=danger tem fundo vermelho', (tester) async {
      await tester.pumpWidget(
        _host(PrimaryButton(
          label: 'Apagar',
          variant: ButtonVariant.danger,
          onPressed: () {},
        )),
      );
      expect(
        find.byWidgetPredicate(
          (w) => w is Material && w.color == const Color(0xFF991B1B),
        ),
        findsOneWidget,
      );
    });

    testWidgets('altura mínima é 56dp (acessibilidade)', (tester) async {
      await tester.pumpWidget(
        _host(PrimaryButton(label: 'Botão', onPressed: () {})),
      );
      final container = tester.widget<Container>(
        find.descendant(
          of: find.byType(InkWell),
          matching: find.byType(Container),
        ),
      );
      expect(container.constraints?.minHeight, 56);
    });
  });
}
