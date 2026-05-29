import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/theme/typography.dart';
import '../../../domain/enums/presenca_passageiro.dart';
import '../../../domain/models/passageiro.dart';
import '../../../domain/models/viagem.dart';
import '../../providers/sync_providers.dart';
import '../../providers/toast_controller.dart';
import '../../widgets/app_toast.dart';
import '../../widgets/panel_header.dart';
import '../../widgets/passageiro_card.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/status_badge.dart';
import '../../widgets/sub_nav.dart';
import '../../widgets/timeline_step.dart';
import '../../widgets/viagem_map.dart';
import 'hodometro_modal.dart';

enum _Tab { resumo, passageiros, mapa, historico }

class DetalheViagemScreen extends ConsumerStatefulWidget {
  const DetalheViagemScreen({super.key, required this.viagemId});

  final String viagemId;

  @override
  ConsumerState<DetalheViagemScreen> createState() =>
      _DetalheViagemScreenState();
}

class _DetalheViagemScreenState extends ConsumerState<DetalheViagemScreen> {
  _Tab _tab = _Tab.resumo;

  @override
  Widget build(BuildContext context) {
    final repo = ref.watch(viagensRepositoryProvider);

    return Scaffold(
      backgroundColor: Tokens.pageBackground,
      body: StreamBuilder<Viagem?>(
        stream: repo.watchById(widget.viagemId),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting &&
              !snapshot.hasData) {
            return const _LoadingState();
          }
          final viagem = snapshot.data;
          if (viagem == null) {
            return const _NotFoundState();
          }
          return _Content(
            viagem: viagem,
            tab: _tab,
            onTabChange: (t) => setState(() => _tab = t),
          );
        },
      ),
    );
  }
}

class _Content extends StatelessWidget {
  const _Content({
    required this.viagem,
    required this.tab,
    required this.onTabChange,
  });

  final Viagem viagem;
  final _Tab tab;
  final ValueChanged<_Tab> onTabChange;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _ActionBar(viagem: viagem),
        SubNav(
          tabs: [
            const SubNavTab(label: 'Resumo'),
            SubNavTab(
              label: 'Passageiros',
              badge: viagem.passageiros.length.toString(),
            ),
            const SubNavTab(label: 'Mapa'),
            const SubNavTab(label: 'Histórico'),
          ],
          currentIndex: tab.index,
          onChanged: (i) => onTabChange(_Tab.values[i]),
        ),
        Expanded(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 220),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            transitionBuilder: (child, animation) {
              final offset = Tween<Offset>(
                begin: const Offset(0.04, 0),
                end: Offset.zero,
              ).animate(animation);
              return FadeTransition(
                opacity: animation,
                child: SlideTransition(position: offset, child: child),
              );
            },
            child: KeyedSubtree(
              key: ValueKey(tab),
              child: switch (tab) {
                _Tab.resumo => _ResumoTab(viagem: viagem),
                _Tab.passageiros => _PassageirosTab(viagem: viagem),
                _Tab.mapa => _MapaTab(viagem: viagem),
                _Tab.historico => _HistoricoTab(viagem: viagem),
              },
            ),
          ),
        ),
        if (viagem.podeIniciar || viagem.podeConcluir)
          _BottomAction(viagem: viagem),
      ],
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// ACTION BAR superior (voltar + protocolo + status)
// ──────────────────────────────────────────────────────────────────────

class _ActionBar extends StatelessWidget {
  const _ActionBar({required this.viagem});
  final Viagem viagem;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(
          bottom: BorderSide(color: Tokens.panelBorder, width: 1),
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(4, 8, 12, 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              IconButton(
                onPressed: () {
                  if (context.canPop()) {
                    context.pop();
                  } else {
                    context.go('/home');
                  }
                },
                icon: const Icon(Icons.arrow_back, size: 24),
                color: Tokens.slate700,
                tooltip: 'Voltar',
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      viagem.protocolo ?? 'Viagem sem número',
                      style: const TextStyle(
                        fontFamily: AppTypography.sansFamily,
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: Tokens.textPrimary,
                        height: 1.15,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _formatarLinhaHorario(viagem),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodyXs.copyWith(
                        color: Tokens.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              StatusBadge(
                label: viagem.status.rotulo,
                tone: viagem.status.tone,
                icon: viagem.status.icone,
                dense: true,
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatarLinhaHorario(Viagem v) {
    const dias = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
    String two(int n) => n.toString().padLeft(2, '0');
    final data = '${dias[v.data.weekday - 1]} ${two(v.data.day)}/${two(v.data.month)}';
    final hora = v.horaPrevistaRetorno != null
        ? '${v.horaSaida} → ${v.horaPrevistaRetorno}'
        : v.horaSaida;
    return '$data · $hora';
  }
}

// ──────────────────────────────────────────────────────────────────────
// BOTTOM ACTION BAR (botão contextual fixo)
// ──────────────────────────────────────────────────────────────────────

class _BottomAction extends StatelessWidget {
  const _BottomAction({required this.viagem});
  final Viagem viagem;

  @override
  Widget build(BuildContext context) {
    final iniciar = viagem.podeIniciar;
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(
          top: BorderSide(color: Tokens.panelBorder, width: 1),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
          child: PrimaryButton(
            label: iniciar ? 'Iniciar viagem' : 'Concluir viagem',
            leading: iniciar ? Icons.play_arrow : Icons.flag_outlined,
            fullWidth: true,
            onPressed: () => abrirHodometroModal(
              context: context,
              viagem: viagem,
              acao: iniciar
                  ? HodometroAcao.iniciar
                  : HodometroAcao.concluir,
            ),
          ),
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// ABA · RESUMO
// ──────────────────────────────────────────────────────────────────────

class _ResumoTab extends StatelessWidget {
  const _ResumoTab({required this.viagem});
  final Viagem viagem;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
      children: [
        _Panel(
          title: 'Trajeto',
          subtitle: 'Onde a viagem vai',
          children: [
            _Row(label: 'Destino', value: viagem.destino, mono: false),
            if (viagem.unidadeDestino != null)
              _Row(label: 'Unidade', value: viagem.unidadeDestino!, mono: false),
            _Row(label: 'Saída', value: viagem.horaSaida),
            if (viagem.horaPrevistaRetorno != null)
              _Row(label: 'Volta prevista', value: viagem.horaPrevistaRetorno!),
            if (viagem.rotaResumo != null)
              _Row(label: 'Rota', value: viagem.rotaResumo!, mono: false),
            if (viagem.kmEstimados != null)
              _Row(label: 'Distância', value: '${viagem.kmEstimados} km'),
          ],
        ),
        const SizedBox(height: 14),
        _Panel(
          title: 'Veículo',
          subtitle: 'Carro que você vai usar',
          children: [
            _Row(label: 'Placa', value: viagem.veiculo.placa),
            _Row(label: 'Modelo', value: viagem.veiculo.modelo, mono: false),
            _Row(label: 'Tipo', value: viagem.veiculo.tipo.rotulo, mono: false),
            _Row(label: 'Lugares', value: '${viagem.veiculo.capacidade}'),
          ],
        ),
        const SizedBox(height: 14),
        _Panel(
          title: 'Quilometragem',
          subtitle: viagem.podeIniciar
              ? 'Anote o km antes de sair'
              : viagem.podeConcluir
                  ? 'Anote o km quando voltar'
                  : 'Histórico de KM',
          children: [
            if (viagem.kmInicialHodometro != null)
              _Row(label: 'KM antes', value: '${viagem.kmInicialHodometro}')
            else
              const _Row(label: 'KM antes', value: '— ainda não anotado'),
            if (viagem.kmFinalHodometro != null)
              _Row(label: 'KM depois', value: '${viagem.kmFinalHodometro}')
            else if (viagem.kmInicialHodometro != null)
              const _Row(label: 'KM depois', value: '— vai anotar no fim'),
            if (viagem.kmInicialHodometro != null &&
                viagem.kmFinalHodometro != null)
              _Row(
                label: 'KM rodados',
                value:
                    '${viagem.kmFinalHodometro! - viagem.kmInicialHodometro!}',
              ),
          ],
        ),
        const SizedBox(height: 14),
        _Panel(
          title: 'Lotação',
          subtitle: '${viagem.totalEmbarcantes} pessoas · ${viagem.vagasLivres} lugares livres',
          children: [
            _Row(label: 'Total de lugares', value: '${viagem.vagasTotais}'),
            _Row(label: 'Pacientes', value: '${viagem.vagasOcupadas}'),
            _Row(
              label: 'Acompanhantes',
              value: '${viagem.totalEmbarcantes - viagem.vagasOcupadas}',
            ),
          ],
        ),
        if (viagem.observacoes != null) ...[
          const SizedBox(height: 14),
          Container(
            decoration: const BoxDecoration(
              color: Tokens.blue50,
              border: Border(
                left: BorderSide(color: Tokens.blue900, width: 4),
              ),
            ),
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Observação da regulação',
                  style: AppTypography.bodySm.copyWith(
                    color: Tokens.blue900,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(viagem.observacoes!, style: AppTypography.bodySm),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// ABA · PASSAGEIROS (read-only em F8 — F9 adiciona swipe)
// ──────────────────────────────────────────────────────────────────────

class _PassageirosTab extends ConsumerWidget {
  const _PassageirosTab({required this.viagem});
  final Viagem viagem;

  bool get _bloqueado => viagem.status.terminal;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (viagem.passageiros.isEmpty) {
      return const _Empty(
        icon: Icons.people_outline,
        title: 'Sem passageiros',
        subtitle: 'A regulação ainda não colocou pacientes nessa viagem.',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
      itemCount: viagem.passageiros.length + 1,
      separatorBuilder: (_, _) => const SizedBox(height: 14),
      itemBuilder: (context, i) {
        if (i == 0) {
          return _CallToCall(viagem: viagem);
        }
        final passageiro = viagem.passageiros[i - 1];
        if (_bloqueado) {
          return PassageiroCard(passageiro: passageiro);
        }
        return _PassageiroChamada(viagem: viagem, passageiro: passageiro);
      },
    );
  }
}

/// Versão interativa do PassageiroCard pra chamada digital (S8).
///
/// Sem swipe oculto — mostra dois botões grandes "Embarcou ✓" / "Faltou ✗"
/// embaixo do card. Quando já marcado, mostra o status + botão "Mudar".
class _PassageiroChamada extends ConsumerWidget {
  const _PassageiroChamada({required this.viagem, required this.passageiro});
  final Viagem viagem;
  final Passageiro passageiro;

  Future<void> _marcar(
    BuildContext context,
    WidgetRef ref,
    PresencaPassageiro presenca,
  ) async {
    final toasts = ref.read(toastControllerProvider.notifier);
    final primeiroNome = passageiro.paciente.nome.split(' ').first;
    try {
      await ref.read(viagensRepositoryProvider).marcarPresenca(
        viagemId: viagem.id,
        passageiroId: passageiro.id,
        presenca: presenca,
      );
      unawaited(ref.read(syncEngineProvider).syncAll());
      final tone = switch (presenca) {
        PresencaPassageiro.embarcado => ToastTone.success,
        PresencaPassageiro.confirmado => ToastTone.info,
        PresencaPassageiro.ausente => ToastTone.warning,
        PresencaPassageiro.desistiu => ToastTone.warning,
        PresencaPassageiro.aguardando => ToastTone.info,
      };
      toasts.show(
        tone: tone,
        message: '$primeiroNome — ${presenca.rotulo.toLowerCase()}',
        title: 'Presença registrada',
      );
    } on ApiException catch (e, st) {
      debugPrint('[PRESENCA] ApiException: ${e.code} · ${e.message}\n$st');
      toasts.error(e.mensagemAmigavel, title: 'Não consegui marcar');
    } catch (e, st) {
      debugPrint('[PRESENCA] erro inesperado: $e\n$st');
      toasts.error('Algo deu errado ao marcar $primeiroNome.');
    }
  }

  Future<void> _abrirMaisOpcoes(BuildContext context, WidgetRef ref) async {
    final escolha = await showModalBottomSheet<PresencaPassageiro>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      builder: (sheetCtx) => _MaisOpcoesSheet(passageiro: passageiro),
    );
    if (escolha != null && context.mounted) {
      await _marcar(context, ref, escolha);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final jaMarcado =
        passageiro.presenca != PresencaPassageiro.aguardando;

    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Tokens.panelBorder, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Card do passageiro (read-only, sem borda redundante).
          DecoratedBox(
            decoration: const BoxDecoration(color: Colors.white),
            child: _PassageiroInfo(passageiro: passageiro),
          ),
          // Botões grandes.
          if (jaMarcado)
            _BotaoMudar(
              passageiro: passageiro,
              onMudar: () => _abrirMaisOpcoes(context, ref),
            )
          else
            Row(
              children: [
                Expanded(
                  child: _AcaoBotao(
                    label: 'Embarcou',
                    icon: Icons.check_circle,
                    cor: Tokens.emerald700,
                    onTap: () =>
                        _marcar(context, ref, PresencaPassageiro.embarcado),
                  ),
                ),
                Container(width: 1, color: Tokens.panelBorder),
                Expanded(
                  child: _AcaoBotao(
                    label: 'Faltou',
                    icon: Icons.cancel,
                    cor: Tokens.red700,
                    onTap: () =>
                        _marcar(context, ref, PresencaPassageiro.ausente),
                  ),
                ),
                Container(width: 1, color: Tokens.panelBorder),
                _AcaoBotao(
                  label: 'Mais',
                  icon: Icons.more_horiz,
                  cor: Tokens.slate700,
                  onTap: () => _abrirMaisOpcoes(context, ref),
                  largura: 80,
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _PassageiroInfo extends StatelessWidget {
  const _PassageiroInfo({required this.passageiro});
  final Passageiro passageiro;

  String _formatarCpf(String cpf) {
    final d = cpf.replaceAll(RegExp(r'\D'), '');
    if (d.length != 11) return cpf;
    return '${d.substring(0, 3)}.${d.substring(3, 6)}.${d.substring(6, 9)}-${d.substring(9)}';
  }

  String _iniciais(String nome) {
    final partes = nome
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .toList();
    if (partes.isEmpty) return '?';
    if (partes.length == 1) return partes.first.substring(0, 1).toUpperCase();
    return (partes.first.substring(0, 1) + partes.last.substring(0, 1))
        .toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final p = passageiro.paciente;
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Tokens.slate100,
                  border: Border.all(color: Tokens.slate300, width: 1),
                ),
                child: Text(
                  _iniciais(p.nome),
                  style: const TextStyle(
                    fontFamily: AppTypography.sansFamily,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: Tokens.slate700,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      p.nome,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontFamily: AppTypography.sansFamily,
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                        color: Tokens.textPrimary,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${_formatarCpf(p.cpf)} · ${p.idade} anos',
                      style: AppTypography.bodyXs.copyWith(
                        color: Tokens.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (p.ubs != null) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                const Icon(
                  Icons.location_on_outlined,
                  size: 18,
                  color: Tokens.slate500,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    p.ubs!.nome,
                    style: AppTypography.bodySm.copyWith(
                      color: Tokens.textSecondary,
                    ),
                  ),
                ),
              ],
            ),
          ],
          if (passageiro.acompanhante) ...[
            const SizedBox(height: 8),
            const StatusBadge(
              label: 'Acompanhante',
              tone: Tone.warning,
              icon: Icons.people_outline,
              dense: true,
            ),
          ],
          if (p.observacoesMobilidade != null) ...[
            const SizedBox(height: 10),
            Container(
              decoration: const BoxDecoration(
                color: Tokens.amber50,
                border: Border(
                  left: BorderSide(color: Tokens.amber600, width: 3),
                ),
              ),
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.accessible_outlined,
                    size: 18,
                    color: Tokens.amber800,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      p.observacoesMobilidade!,
                      style: AppTypography.bodySm.copyWith(
                        color: Tokens.amber900,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _AcaoBotao extends StatelessWidget {
  const _AcaoBotao({
    required this.label,
    required this.icon,
    required this.cor,
    required this.onTap,
    this.largura,
  });

  final String label;
  final IconData icon;
  final Color cor;
  final VoidCallback onTap;
  final double? largura;

  @override
  Widget build(BuildContext context) {
    final content = Padding(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 24, color: cor),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              fontFamily: AppTypography.sansFamily,
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: cor,
            ),
          ),
        ],
      ),
    );
    return Material(
      color: Tokens.slate50,
      child: InkWell(
        onTap: onTap,
        child: largura == null
            ? content
            : SizedBox(width: largura, child: content),
      ),
    );
  }
}

class _BotaoMudar extends StatelessWidget {
  const _BotaoMudar({required this.passageiro, required this.onMudar});

  final Passageiro passageiro;
  final VoidCallback onMudar;

  @override
  Widget build(BuildContext context) {
    final tone = passageiro.presenca.tone;
    return Material(
      color: tone.fill,
      child: InkWell(
        onTap: onMudar,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Icon(passageiro.presenca.icone, size: 24, color: tone.text),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  passageiro.presenca.rotulo,
                  style: TextStyle(
                    fontFamily: AppTypography.sansFamily,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: tone.text,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: tone.border, width: 1),
                ),
                child: Text(
                  'Mudar',
                  style: TextStyle(
                    fontFamily: AppTypography.sansFamily,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: tone.text,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MaisOpcoesSheet extends StatelessWidget {
  const _MaisOpcoesSheet({required this.passageiro});
  final Passageiro passageiro;

  static const _opcoes = [
    PresencaPassageiro.embarcado,
    PresencaPassageiro.confirmado,
    PresencaPassageiro.ausente,
    PresencaPassageiro.desistiu,
    PresencaPassageiro.aguardando,
  ];

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 40,
              height: 4,
              alignment: Alignment.center,
              decoration: const BoxDecoration(color: Tokens.slate300),
            ),
            const SizedBox(height: 16),
            Text(
              passageiro.paciente.nome,
              style: const TextStyle(
                fontFamily: AppTypography.sansFamily,
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: Tokens.textPrimary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Escolha o que aconteceu',
              style: AppTypography.bodySm.copyWith(
                color: Tokens.textSecondary,
              ),
            ),
            const SizedBox(height: 16),
            for (final opcao in _opcoes) ...[
              if (opcao != _opcoes.first) const SizedBox(height: 10),
              _OpcaoTile(
                opcao: opcao,
                selecionada: opcao == passageiro.presenca,
                onTap: () => Navigator.of(context).pop(opcao),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _OpcaoTile extends StatelessWidget {
  const _OpcaoTile({
    required this.opcao,
    required this.selecionada,
    required this.onTap,
  });

  final PresencaPassageiro opcao;
  final bool selecionada;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tone = opcao.tone;
    return Material(
      color: selecionada ? tone.fill : Colors.white,
      child: InkWell(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            border: Border.all(
              color: selecionada ? tone.border : Tokens.slate300,
              width: selecionada ? 2 : 1,
            ),
          ),
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
          child: Row(
            children: [
              Icon(opcao.icone, size: 26, color: tone.text),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  opcao.rotulo,
                  style: TextStyle(
                    fontFamily: AppTypography.sansFamily,
                    fontSize: 16,
                    fontWeight: selecionada
                        ? FontWeight.w800
                        : FontWeight.w600,
                    color: selecionada ? tone.text : Tokens.textPrimary,
                  ),
                ),
              ),
              if (selecionada)
                Icon(Icons.check, size: 22, color: tone.text),
            ],
          ),
        ),
      ),
    );
  }
}

class _CallToCall extends StatelessWidget {
  const _CallToCall({required this.viagem});
  final Viagem viagem;

  @override
  Widget build(BuildContext context) {
    final aguardando = viagem.passageiros
        .where((p) => p.presenca == PresencaPassageiro.aguardando)
        .length;
    final embarcados = viagem.passageiros
        .where((p) => p.presenca == PresencaPassageiro.embarcado)
        .length;

    return Container(
      decoration: const BoxDecoration(
        color: Tokens.blue50,
        border: Border(
          left: BorderSide(color: Tokens.blue900, width: 4),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      child: Row(
        children: [
          const Icon(
            Icons.checklist_rtl_outlined,
            size: 24,
            color: Tokens.blue900,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Marque quem está aqui',
                  style: AppTypography.bodySm.copyWith(
                    color: Tokens.blue900,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '$embarcados embarcaram · $aguardando faltam confirmar',
                  style: AppTypography.bodyXs.copyWith(
                    color: Tokens.blue900,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// ABA · MAPA (placeholder até F11)
// ──────────────────────────────────────────────────────────────────────

class _MapaTab extends StatelessWidget {
  const _MapaTab({required this.viagem});
  final Viagem viagem;

  @override
  Widget build(BuildContext context) {
    final pontos = <(_PontoTipo, String, String)>[
      if (viagem.coordOrigem != null)
        (_PontoTipo.origem, 'Origem', viagem.destino),
      for (final p in viagem.passageiros)
        if (p.paciente.ubs != null)
          (
            _PontoTipo.ubs,
            'UBS · ${p.paciente.nome.split(' ').first}',
            p.paciente.ubs!.nome,
          ),
      if (viagem.coordDestino != null)
        (
          _PontoTipo.destino,
          'Destino',
          viagem.unidadeDestino ?? viagem.destino,
        ),
    ];

    final temCoordenadas = pontos.isNotEmpty;

    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 24),
      children: [
        if (temCoordenadas)
          ViagemMap(viagem: viagem)
        else
          _SemCoordenadasCard(),
        const SizedBox(height: 14),
        _Panel(
          title: 'Pontos da viagem',
          subtitle: temCoordenadas
              ? '${pontos.length} pontos no mapa'
              : 'Sem localização cadastrada',
          children: [
            if (pontos.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  'Coordenadas geográficas não cadastradas no backend para '
                  'os pontos desta viagem.',
                  style: AppTypography.bodyXs,
                ),
              )
            else
              ...pontos.map((p) => _PontoTile(
                    tipo: p.$1,
                    titulo: p.$2,
                    subtitulo: p.$3,
                  )),
          ],
        ),
        if (temCoordenadas) ...[
          const SizedBox(height: 14),
          _LegendaMapa(),
          const SizedBox(height: 10),
          const _CacheHint(),
        ],
      ],
    );
  }
}

enum _PontoTipo { origem, ubs, destino }

class _SemCoordenadasCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      height: 180,
      decoration: BoxDecoration(
        color: Tokens.slate100,
        border: Border.all(color: Tokens.panelBorder, width: 1),
      ),
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              border: Border.all(color: Tokens.slate300, width: 1),
              color: Colors.white,
            ),
            child: const Icon(
              Icons.location_off_outlined,
              size: 24,
              color: Tokens.slate500,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'SEM COORDENADAS',
            style: AppTypography.label.copyWith(color: Tokens.slate600),
          ),
          const SizedBox(height: 4),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 24),
            child: Text(
              'O backend não tem latitude/longitude cadastradas para os '
              'pontos desta viagem.',
              textAlign: TextAlign.center,
              style: AppTypography.bodyXs,
            ),
          ),
        ],
      ),
    );
  }
}

class _PontoTile extends StatelessWidget {
  const _PontoTile({
    required this.tipo,
    required this.titulo,
    required this.subtitulo,
  });

  final _PontoTipo tipo;
  final String titulo;
  final String subtitulo;

  Tone get tone => switch (tipo) {
    _PontoTipo.origem => Tone.info,
    _PontoTipo.ubs => Tone.warning,
    _PontoTipo.destino => Tone.success,
  };

  String get letra => switch (tipo) {
    _PontoTipo.origem => 'O',
    _PontoTipo.ubs => 'U',
    _PontoTipo.destino => 'D',
  };

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Container(
            width: 20,
            height: 20,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: tone.border,
              border: Border.all(color: Colors.white, width: 1.5),
            ),
            child: Text(
              letra,
              style: const TextStyle(
                fontFamily: AppTypography.monoFamily,
                fontSize: 9,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                height: 1,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  titulo,
                  style: AppTypography.bodyXs.copyWith(
                    fontWeight: FontWeight.w700,
                    color: Tokens.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(subtitulo, style: AppTypography.bodyXs),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LegendaMapa extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: Tokens.panelBorder, width: 1),
      ),
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      child: Row(
        children: [
          _LegendaItem(cor: Tokens.blue900, letra: 'O', label: 'Origem'),
          const SizedBox(width: 12),
          _LegendaItem(cor: Tokens.amber600, letra: 'U', label: 'UBS'),
          const SizedBox(width: 12),
          _LegendaItem(cor: Tokens.emerald700, letra: 'D', label: 'Destino'),
        ],
      ),
    );
  }
}

class _LegendaItem extends StatelessWidget {
  const _LegendaItem({
    required this.cor,
    required this.letra,
    required this.label,
  });

  final Color cor;
  final String letra;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 16,
          height: 16,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: cor,
            border: Border.all(color: Colors.white, width: 1),
          ),
          child: Text(
            letra,
            style: const TextStyle(
              fontFamily: AppTypography.monoFamily,
              fontSize: 8,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              height: 1,
            ),
          ),
        ),
        const SizedBox(width: 6),
        Text(
          label.toUpperCase(),
          style: AppTypography.label.copyWith(fontSize: 9),
        ),
      ],
    );
  }
}

class _CacheHint extends StatelessWidget {
  const _CacheHint();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Tokens.blue50,
        border: Border(left: BorderSide(color: Tokens.blue900, width: 4)),
      ),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Row(
        children: [
          const Icon(
            Icons.cloud_download_outlined,
            color: Tokens.blue900,
            size: 16,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Os tiles ficam salvos no aparelho. Áreas já visualizadas '
              'continuam funcionando offline.',
              style: AppTypography.bodyXs.copyWith(color: Tokens.blue900),
            ),
          ),
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// ABA · HISTÓRICO (timeline derivada dos timestamps do modelo)
// ──────────────────────────────────────────────────────────────────────

class _HistoricoTab extends StatelessWidget {
  const _HistoricoTab({required this.viagem});
  final Viagem viagem;

  @override
  Widget build(BuildContext context) {
    final eventos = _construirEventos();
    if (eventos.isEmpty) {
      return const _Empty(
        icon: Icons.timeline,
        title: 'Sem eventos registrados',
        subtitle: 'A timeline aparece conforme você inicia a viagem, '
            'faz a chamada e conclui.',
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 24),
      itemCount: eventos.length,
      itemBuilder: (_, i) => TimelineStep(
        titulo: eventos[i].titulo,
        descricao: eventos[i].descricao,
        em: eventos[i].em,
        tone: eventos[i].tone,
        isLast: i == eventos.length - 1,
      ),
    );
  }

  List<_Evento> _construirEventos() {
    final eventos = <_Evento>[];

    // Sempre: viagem agendada.
    eventos.add(_Evento(
      titulo: 'Viagem agendada',
      descricao: 'Alocada para ${viagem.motorista.nome} '
          '· veículo ${viagem.veiculo.placa}',
      em: viagem.data,
      tone: Tone.info,
    ));

    if (viagem.iniciadaEm != null) {
      eventos.add(_Evento(
        titulo: 'Viagem iniciada',
        descricao: viagem.kmInicialHodometro != null
            ? 'Hodômetro inicial: ${viagem.kmInicialHodometro} km'
            : null,
        em: viagem.iniciadaEm!,
        tone: Tone.warning,
      ));
    }

    // Eventos de presença (ordenados por timestamp).
    final marcacoes = viagem.passageiros
        .where((p) => p.marcadoEm != null)
        .toList()
      ..sort((a, b) => a.marcadoEm!.compareTo(b.marcadoEm!));

    for (final p in marcacoes) {
      eventos.add(_Evento(
        titulo: '${p.presenca.rotulo}: ${p.paciente.nome}',
        descricao: p.observacao,
        em: p.marcadoEm!,
        tone: p.presenca.tone,
      ));
    }

    if (viagem.concluidaEm != null) {
      final km = (viagem.kmInicialHodometro != null &&
              viagem.kmFinalHodometro != null)
          ? viagem.kmFinalHodometro! - viagem.kmInicialHodometro!
          : null;
      eventos.add(_Evento(
        titulo: 'Viagem concluída',
        descricao: km != null
            ? 'Total rodado: $km km '
                '(hodômetro ${viagem.kmFinalHodometro})'
            : null,
        em: viagem.concluidaEm!,
        tone: Tone.success,
      ));
    }

    return eventos;
  }
}

class _Evento {
  _Evento({
    required this.titulo,
    required this.em,
    required this.tone,
    this.descricao,
  });

  final String titulo;
  final String? descricao;
  final DateTime em;
  final Tone tone;
}

// ──────────────────────────────────────────────────────────────────────
// Building blocks
// ──────────────────────────────────────────────────────────────────────

class _Panel extends StatelessWidget {
  const _Panel({
    required this.title,
    required this.subtitle,
    required this.children,
  });

  final String title;
  final String subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: Tokens.panelBorder, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PanelHeader(title: title, subtitle: subtitle),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: children,
            ),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value, this.mono = true});

  final String label;
  final String value;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(label.toUpperCase(), style: AppTypography.label),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              value,
              style: mono
                  ? AppTypography.monoSm.copyWith(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    )
                  : AppTypography.bodySm.copyWith(
                      color: Tokens.textPrimary,
                      fontWeight: FontWeight.w600,
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 28),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              border: Border.all(color: Tokens.panelBorder, width: 1),
              color: Colors.white,
            ),
            child: Icon(icon, size: 28, color: Tokens.slate400),
          ),
          const SizedBox(height: 14),
          Text(
            title,
            textAlign: TextAlign.center,
            style: AppTypography.bodySm.copyWith(
              fontWeight: FontWeight.w700,
              color: Tokens.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: AppTypography.bodyXs,
          ),
        ],
      ),
    );
  }
}

class _LoadingState extends StatelessWidget {
  const _LoadingState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(
              strokeWidth: 2.5,
              color: Tokens.blue900,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'CARREGANDO VIAGEM…',
            style: AppTypography.label.copyWith(color: Tokens.slate500),
          ),
        ],
      ),
    );
  }
}

class _NotFoundState extends StatelessWidget {
  const _NotFoundState();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              decoration: BoxDecoration(
                color: Tokens.red50,
                border: Border.all(color: Tokens.red700, width: 2),
              ),
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Text(
                    'VIAGEM NÃO ENCONTRADA',
                    style: AppTypography.panelTitle.copyWith(
                      color: Tokens.red800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'A viagem solicitada não está no cache local e não foi '
                    'possível buscá-la no servidor. Tente atualizar a lista '
                    'de viagens e voltar a abri-la.',
                    textAlign: TextAlign.center,
                    style: AppTypography.bodyXs,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            PrimaryButton(
              label: 'Voltar para lista',
              leading: Icons.arrow_back,
              variant: ButtonVariant.secondary,
              fullWidth: true,
              onPressed: () => context.go('/home'),
            ),
          ],
        ),
      ),
    );
  }
}
