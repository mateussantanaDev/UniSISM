import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/theme/typography.dart';
import '../../providers/auth_provider.dart';
import '../../providers/toast_controller.dart';
import '../../widgets/form_field.dart';
import '../../widgets/primary_button.dart';

class TrocarSenhaScreen extends ConsumerStatefulWidget {
  const TrocarSenhaScreen({super.key});

  @override
  ConsumerState<TrocarSenhaScreen> createState() => _TrocarSenhaState();
}

class _TrocarSenhaState extends ConsumerState<TrocarSenhaScreen> {
  final _atual = TextEditingController();
  final _nova = TextEditingController();
  final _confirma = TextEditingController();
  bool _loading = false;
  String? _erro;

  @override
  void dispose() {
    _atual.dispose();
    _nova.dispose();
    _confirma.dispose();
    super.dispose();
  }

  /// Regra do backend (MOTORISTA_APP_API.md §4.2): mínimo 8 chars,
  /// com letras E números.
  String? _validarSenha(String s) {
    if (s.length < 8) {
      return 'A senha nova precisa ter pelo menos 8 caracteres.';
    }
    final temLetra = s.contains(RegExp(r'[A-Za-z]'));
    final temNumero = s.contains(RegExp(r'[0-9]'));
    if (!temLetra || !temNumero) {
      return 'A senha precisa ter letras e números.';
    }
    return null;
  }

  Future<void> _submit() async {
    final toasts = ref.read(toastControllerProvider.notifier);
    if (_nova.text != _confirma.text) {
      const msg = 'As duas senhas novas não são iguais.';
      setState(() => _erro = msg);
      toasts.warning(msg, title: 'Conferência');
      return;
    }
    final senhaInvalida = _validarSenha(_nova.text);
    if (senhaInvalida != null) {
      setState(() => _erro = senhaInvalida);
      toasts.warning(senhaInvalida, title: 'Senha fraca');
      return;
    }
    if (_nova.text == _atual.text) {
      const msg = 'Escolha uma senha diferente da atual.';
      setState(() => _erro = msg);
      toasts.warning(msg, title: 'Senha repetida');
      return;
    }
    setState(() {
      _loading = true;
      _erro = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).trocarSenha(
        senhaAtual: _atual.text,
        novaSenha: _nova.text,
      );
      toasts.success('Pronto! Você já pode usar o app.', title: 'Senha trocada');
    } on ApiException catch (e, st) {
      debugPrint('[TROCAR_SENHA] ApiException: ${e.code} · ${e.message}\n$st');
      final msg = e.mensagemAmigavel;
      if (mounted) setState(() => _erro = msg);
      toasts.error(msg, title: 'Não foi possível trocar');
    } catch (e, st) {
      debugPrint('[TROCAR_SENHA] erro inesperado: $e\n$st');
      const msg = 'Algo deu errado. Tente de novo em alguns segundos.';
      if (mounted) setState(() => _erro = msg);
      toasts.error(msg, title: 'Erro inesperado');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Tokens.pageBackground,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Crie sua senha',
                style: TextStyle(
                  fontFamily: AppTypography.sansFamily,
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  color: Tokens.textPrimary,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Esta é sua primeira vez no app. Escolha uma senha que '
                'só você sabe.',
                style: AppTypography.bodySm.copyWith(
                  color: Tokens.textSecondary,
                ),
              ),
              const SizedBox(height: 24),
              Container(
                decoration: const BoxDecoration(
                  color: Tokens.amber50,
                  border: Border(
                    left: BorderSide(color: Tokens.amber600, width: 4),
                  ),
                ),
                padding: const EdgeInsets.all(14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.lock_outline,
                      color: Tokens.amber800,
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Use pelo menos 8 letras ou números. Não conte '
                        'sua senha pra ninguém.',
                        style: AppTypography.bodySm.copyWith(
                          color: Tokens.amber900,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              AppFormField(
                label: 'Senha atual',
                controller: _atual,
                type: AppFieldType.password,
                autofocus: true,
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 18),
              AppFormField(
                label: 'Senha nova',
                controller: _nova,
                type: AppFieldType.password,
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 18),
              AppFormField(
                label: 'Repita a senha nova',
                controller: _confirma,
                type: AppFieldType.password,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _submit(),
              ),
              if (_erro != null) ...[
                const SizedBox(height: 18),
                Container(
                  decoration: BoxDecoration(
                    color: Tokens.red50,
                    border: Border.all(color: Tokens.red700, width: 1),
                  ),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.error_outline,
                        color: Tokens.red800,
                        size: 20,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          _erro!,
                          style: AppTypography.bodySm.copyWith(
                            color: Tokens.red900,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 28),
              PrimaryButton(
                label: 'Salvar senha nova',
                leading: Icons.check,
                fullWidth: true,
                loading: _loading,
                onPressed: _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
