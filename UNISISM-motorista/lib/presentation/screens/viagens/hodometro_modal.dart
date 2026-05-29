import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/theme/typography.dart';
import '../../../domain/models/viagem.dart';
import '../../providers/sync_providers.dart';
import '../../providers/toast_controller.dart';
import '../../widgets/brutalist_modal.dart';
import '../../widgets/form_field.dart';
import '../../widgets/primary_button.dart';

enum HodometroAcao { iniciar, concluir }

/// Modal de registro de hodômetro — usado tanto para iniciar quanto para
/// concluir a viagem. Devolve `true` se a ação foi gravada (local +
/// outbox), `null` se cancelada.
Future<bool?> abrirHodometroModal({
  required BuildContext context,
  required Viagem viagem,
  required HodometroAcao acao,
}) {
  return showBrutalistModal<bool?>(
    context: context,
    title: acao == HodometroAcao.iniciar ? 'Iniciar viagem' : 'Concluir viagem',
    subtitle: viagem.protocolo ?? viagem.destino,
    builder: (_) => _HodometroForm(viagem: viagem, acao: acao),
  );
}

class _HodometroForm extends ConsumerStatefulWidget {
  const _HodometroForm({required this.viagem, required this.acao});

  final Viagem viagem;
  final HodometroAcao acao;

  @override
  ConsumerState<_HodometroForm> createState() => _HodometroFormState();
}

class _HodometroFormState extends ConsumerState<_HodometroForm> {
  final _kmCtrl = TextEditingController();
  bool _salvando = false;
  String? _erro;

  int? get _kmInicial => widget.viagem.kmInicialHodometro;

  bool get _isIniciar => widget.acao == HodometroAcao.iniciar;

  @override
  void dispose() {
    _kmCtrl.dispose();
    super.dispose();
  }

  Future<void> _salvar() async {
    final toasts = ref.read(toastControllerProvider.notifier);
    final raw = _kmCtrl.text.trim();
    final km = int.tryParse(raw);
    if (km == null || km <= 0) {
      const msg = 'Digite só números (sem letras ou vírgulas).';
      setState(() => _erro = msg);
      toasts.warning(msg, title: 'Quilometragem inválida');
      return;
    }
    if (!_isIniciar && _kmInicial != null && km <= _kmInicial!) {
      final msg = 'A quilometragem do fim precisa ser maior que $_kmInicial (do início).';
      setState(() => _erro = msg);
      toasts.warning(msg, title: 'Quilometragem menor');
      return;
    }

    setState(() {
      _salvando = true;
      _erro = null;
    });

    try {
      final repo = ref.read(viagensRepositoryProvider);
      if (_isIniciar) {
        await repo.iniciarViagem(
          viagemId: widget.viagem.id,
          kmInicialHodometro: km,
        );
      } else {
        await repo.concluirViagem(
          viagemId: widget.viagem.id,
          kmFinalHodometro: km,
        );
      }
      unawaited(ref.read(syncEngineProvider).syncAll());

      if (!mounted) return;

      // Substitui o conteúdo do modal por um "sucesso brutalista" antes de fechar.
      await _mostrarSucesso(context, km: km);
      if (!mounted) return;
      Navigator.of(context).pop(true);
      return;
    } on ApiException catch (e, st) {
      debugPrint('[HODOMETRO] ApiException: ${e.code} · ${e.message}\n$st');
      final msg = e.mensagemAmigavel;
      if (mounted) setState(() => _erro = msg);
      toasts.error(msg, title: _isIniciar ? 'Não comecei a viagem' : 'Não consegui finalizar');
    } catch (e, st) {
      debugPrint('[HODOMETRO] erro inesperado: $e\n$st');
      const msg = 'Algo deu errado. Tente de novo.';
      if (mounted) setState(() => _erro = msg);
      toasts.error(msg, title: 'Erro inesperado');
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  Future<void> _mostrarSucesso(BuildContext ctx, {required int km}) async {
    await showDialog<void>(
      context: ctx,
      barrierColor: Tokens.slate900.withValues(alpha: 0.5),
      barrierDismissible: false,
      builder: (_) => _SucessoOverlay(
        titulo: _isIniciar ? 'Viagem começou!' : 'Viagem concluída!',
        protocolo: widget.viagem.protocolo ?? 'S/N',
        km: km,
        isIniciar: _isIniciar,
        kmInicial: _kmInicial,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.viagem;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Resumo da viagem
          Container(
            decoration: BoxDecoration(
              color: Tokens.slate50,
              border: Border.all(color: Tokens.panelBorder, width: 1),
            ),
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  v.destino.toUpperCase(),
                  style: AppTypography.panelTitle.copyWith(fontSize: 11),
                ),
                if (v.unidadeDestino != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    v.unidadeDestino!,
                    style: AppTypography.bodyXs,
                  ),
                ],
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${v.veiculo.placa} · ${v.veiculo.modelo}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyXs.copyWith(
                          color: Tokens.textSecondary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${v.totalEmbarcantes}/${v.vagasTotais} pax',
                      style: AppTypography.bodyXs.copyWith(
                        color: Tokens.textSecondary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Hodômetro atual (referência)
          if (!_isIniciar && _kmInicial != null) ...[
            const SizedBox(height: 12),
            Container(
              decoration: const BoxDecoration(
                color: Tokens.blue50,
                border: Border(
                  left: BorderSide(color: Tokens.blue900, width: 4),
                ),
              ),
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Antes de sair tinha',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodySm.copyWith(
                        color: Tokens.blue900,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '$_kmInicial km',
                    style: const TextStyle(
                      fontFamily: AppTypography.monoFamily,
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: Tokens.blue900,
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 18),
          AppFormField(
            label: _isIniciar
                ? 'Quilometragem antes de sair'
                : 'Quilometragem agora',
            controller: _kmCtrl,
            type: AppFieldType.number,
            mono: true,
            autofocus: true,
            hint: _isIniciar ? 'Ex.: 45200' : 'Ex.: 45580',
          ),

          if (_erro != null) ...[
            const SizedBox(height: 14),
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
                    size: 20,
                    color: Tokens.red800,
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

          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: PrimaryButton(
                  label: 'Cancelar',
                  variant: ButtonVariant.secondary,
                  fullWidth: true,
                  onPressed: _salvando
                      ? null
                      : () => Navigator.of(context).pop(),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: PrimaryButton(
                  label: _isIniciar ? 'Começar' : 'Finalizar',
                  leading: _isIniciar ? Icons.play_arrow : Icons.flag_outlined,
                  fullWidth: true,
                  loading: _salvando,
                  onPressed: _salvar,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Vamos salvar e enviar quando você tiver internet.',
            textAlign: TextAlign.center,
            style: AppTypography.bodyXs.copyWith(color: Tokens.slate500),
          ),
        ],
      ),
    );
  }
}

class _SucessoOverlay extends StatefulWidget {
  const _SucessoOverlay({
    required this.titulo,
    required this.protocolo,
    required this.km,
    required this.isIniciar,
    required this.kmInicial,
  });

  final String titulo;
  final String protocolo;
  final int km;
  final bool isIniciar;
  final int? kmInicial;

  @override
  State<_SucessoOverlay> createState() => _SucessoOverlayState();
}

class _SucessoOverlayState extends State<_SucessoOverlay> {
  Timer? _autoClose;

  @override
  void initState() {
    super.initState();
    _autoClose = Timer(const Duration(milliseconds: 1700), () {
      if (mounted) Navigator.of(context).maybePop();
    });
  }

  @override
  void dispose() {
    _autoClose?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final rodados = (!widget.isIniciar && widget.kmInicial != null)
        ? widget.km - widget.kmInicial!
        : null;
    final titulo = widget.titulo;
    final protocolo = widget.protocolo;
    final km = widget.km;
    final isIniciar = widget.isIniciar;

    return Center(
      child: Container(
        margin: const EdgeInsets.all(28),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: Tokens.emerald700, width: 2),
          boxShadow: [
            BoxShadow(
              color: Tokens.slate900.withValues(alpha: 0.18),
              offset: const Offset(8, 8),
              blurRadius: 0,
            ),
          ],
        ),
        padding: const EdgeInsets.fromLTRB(24, 22, 24, 22),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.check_circle,
              color: Tokens.emerald700,
              size: 44,
            ),
            const SizedBox(height: 12),
            Text(
              titulo,
              style: TextStyle(
                fontFamily: AppTypography.monoFamily,
                fontSize: 13,
                fontWeight: FontWeight.w800,
                letterSpacing: 2.5,
                color: Tokens.emerald800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              protocolo,
              style: const TextStyle(
                fontFamily: AppTypography.monoFamily,
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: Tokens.slate900,
                letterSpacing: 1,
              ),
            ),
            const SizedBox(height: 14),
            Text(
              isIniciar ? 'Saiu com $km km' : 'Voltou com $km km',
              style: AppTypography.bodySm.copyWith(
                color: Tokens.slate700,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (rodados != null) ...[
              const SizedBox(height: 6),
              Text(
                'Total rodado: $rodados km',
                style: AppTypography.bodyXs.copyWith(
                  color: Tokens.slate600,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
