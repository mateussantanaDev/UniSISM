import 'package:flutter/material.dart';

import '../../../core/theme/tokens.dart';
import '../../../core/theme/typography.dart';

/// Tela exibida brevemente enquanto o app restaura a sessão (F6 auth).
/// O `GoRouter` redireciona pra `/login` ou `/home` assim que o
/// `AuthController` termina o `_restore`.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Tokens.blue900,
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 88,
                height: 88,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.white, width: 3),
                ),
                child: const Text(
                  'U',
                  style: TextStyle(
                    fontFamily: AppTypography.sansFamily,
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 44,
                    height: 1,
                  ),
                ),
              ),
              const SizedBox(height: 24),
              const Text(
                'UNISISM',
                style: TextStyle(
                  fontFamily: AppTypography.sansFamily,
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 24,
                  letterSpacing: 4,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Motorista',
                style: TextStyle(
                  fontFamily: AppTypography.sansFamily,
                  color: Colors.white70,
                  fontWeight: FontWeight.w500,
                  fontSize: 16,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 40),
              const SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  valueColor: AlwaysStoppedAnimation(Colors.white),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
