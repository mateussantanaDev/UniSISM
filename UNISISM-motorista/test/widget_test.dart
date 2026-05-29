import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:unisism_motorista/presentation/screens/splash/splash_screen.dart';

void main() {
  testWidgets('SplashScreen mostra marca UNISISM Motorista', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(home: SplashScreen()),
    );
    await tester.pump();

    expect(find.text('UNISISM'), findsOneWidget);
    expect(find.text('Motorista'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
