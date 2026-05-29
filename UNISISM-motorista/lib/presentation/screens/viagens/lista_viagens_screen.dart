import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/theme/typography.dart';
import '../../../domain/enums/status_viagem.dart';
import '../../../domain/models/viagem.dart';
import '../../providers/auth_provider.dart';
import '../../providers/sync_providers.dart';
import '../../providers/toast_controller.dart';
import '../../widgets/brutalist_bottom_nav.dart';
import '../../widgets/metric_card.dart';
import '../../widgets/sub_nav.dart';
import '../../widgets/sync_indicator.dart';
import '../../widgets/viagem_card.dart';

enum ListaTab { hoje, proximas, historico }

class ListaViagensScreen extends ConsumerStatefulWidget {
  const ListaViagensScreen({super.key});

  @override
  ConsumerState<ListaViagensScreen> createState() => _ListaState();
}

class _ListaState extends ConsumerState<ListaViagensScreen> {
  ListaTab _tab = ListaTab.hoje;

  Future<void> _refresh() async {
    final toasts = ref.read(toastControllerProvider.notifier);
    try {
      await ref.read(viagensRepositoryProvider).refresh();
    } on ApiException catch (e, st) {
      debugPrint('[REFRESH] ApiException: ${e.code} · ${e.message}\n$st');
      if (!mounted) return;
      toasts.error(
        e.mensagemAmigavel,
        title: e.isOffline ? 'Sem internet' : 'Não consegui atualizar',
      );
    } catch (e, st) {
      debugPrint('[REFRESH] erro inesperado: $e\n$st');
      if (!mounted) return;
      toasts.error('Tive um problema ao atualizar. Tente de novo.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final sync = ref.watch(syncStatusProvider);

    return Scaffold(
      backgroundColor: Tokens.pageBackground,
      appBar: _AppBar(
        nome: auth.motorista?.nome ?? '—',
        matricula: auth.motorista?.matricula ?? '—',
        syncStatus: sync.status,
        pending: sync.pending,
      ),
      bottomNavigationBar: BrutalistBottomNav(
        currentIndex: 0,
        onTap: (i) {
          if (i == 1) context.go('/perfil');
        },
        items: const [
          BottomNavItem(label: 'Viagens', icon: Icons.directions_bus),
          BottomNavItem(label: 'Perfil', icon: Icons.person_outline),
        ],
      ),
      body: Column(
        children: [
          SubNav(
            tabs: const [
              SubNavTab(label: 'Hoje'),
              SubNavTab(label: 'Próximas'),
              SubNavTab(label: 'Histórico'),
            ],
            currentIndex: _tab.index,
            onChanged: (i) => setState(() => _tab = ListaTab.values[i]),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refresh,
              color: Tokens.blue900,
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
                  key: ValueKey(_tab),
                  child: _body(),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _body() {
    switch (_tab) {
      case ListaTab.hoje:
        return const _HojeTab();
      case ListaTab.proximas:
        return const _ProximasTab();
      case ListaTab.historico:
        return const _HistoricoTab();
    }
  }
}

class _HojeTab extends ConsumerWidget {
  const _HojeTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hoje = DateTime.now();
    final repo = ref.watch(viagensRepositoryProvider);
    return StreamBuilder<List<Viagem>>(
      stream: repo.watchDoDia(hoje),
      builder: (context, snapshot) {
        final viagens = snapshot.data ?? const <Viagem>[];
        final emAndamento = viagens
            .where((v) => v.status == StatusViagem.emAndamento)
            .length;
        // Loading só aparece se o stream ainda não emitiu nenhum dado
        // (mesmo lista vazia conta como dado).
        final mostrandoLoading =
            snapshot.connectionState == ConnectionState.waiting &&
                !snapshot.hasData;

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
          children: [
            _ResumoHoje(
              total: viagens.length,
              emAndamento: emAndamento,
            ),
            const SizedBox(height: 18),
            if (snapshot.hasError)
              _ErroBlock(erro: snapshot.error!)
            else if (mostrandoLoading)
              const _LoadingBlock()
            else if (viagens.isEmpty)
              const _Empty(
                icon: Icons.event_busy_outlined,
                title: 'Sem viagens hoje',
                subtitle: 'Quando a regulação alocar uma viagem, '
                    'ela aparece aqui.',
              )
            else
              ..._viagensList(context, viagens),
          ],
        );
      },
    );
  }

  List<Widget> _viagensList(BuildContext context, List<Viagem> viagens) {
    return [
      for (int i = 0; i < viagens.length; i++) ...[
        if (i > 0) const SizedBox(height: 14),
        ViagemCard(
          viagem: viagens[i],
          onTap: () => context.push('/viagens/${viagens[i].id}'),
        ),
      ],
    ];
  }
}

class _ProximasTab extends ConsumerWidget {
  const _ProximasTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(viagensRepositoryProvider);
    return FutureBuilder<List<Viagem>>(
      future: repo.getProximas(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
            children: [_ErroBlock(erro: snapshot.error!)],
          );
        }
        final viagens = snapshot.data ?? const <Viagem>[];
        if (snapshot.connectionState == ConnectionState.waiting &&
            !snapshot.hasData) {
          return const _LoadingBlock();
        }
        if (viagens.isEmpty) {
          return const _Empty(
            icon: Icons.event_available_outlined,
            title: 'Nenhuma viagem nos próximos dias',
            subtitle: 'A escala fica disponível assim que a regulação criar.',
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
          itemCount: viagens.length,
          separatorBuilder: (_, _) => const SizedBox(height: 14),
          itemBuilder: (_, i) => ViagemCard(
            viagem: viagens[i],
            onTap: () => context.push('/viagens/${viagens[i].id}'),
          ),
        );
      },
    );
  }
}

class _HistoricoTab extends ConsumerWidget {
  const _HistoricoTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(viagensRepositoryProvider);
    return FutureBuilder<List<Viagem>>(
      future: repo.getHistorico(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
            children: [_ErroBlock(erro: snapshot.error!)],
          );
        }
        final viagens = snapshot.data ?? const <Viagem>[];
        if (snapshot.connectionState == ConnectionState.waiting &&
            !snapshot.hasData) {
          return const _LoadingBlock();
        }
        if (viagens.isEmpty) {
          return const _Empty(
            icon: Icons.history,
            title: 'Sem histórico ainda',
            subtitle: 'Suas viagens concluídas aparecem aqui.',
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
          itemCount: viagens.length,
          separatorBuilder: (_, _) => const SizedBox(height: 14),
          itemBuilder: (_, i) => ViagemCard(
            viagem: viagens[i],
            onTap: () => context.push('/viagens/${viagens[i].id}'),
          ),
        );
      },
    );
  }
}

/// Bloco vermelho com mensagem de erro + sugestão de ação.
class _ErroBlock extends StatelessWidget {
  const _ErroBlock({required this.erro});
  final Object erro;

  @override
  Widget build(BuildContext context) {
    final msg = _mensagem(erro);
    return Container(
      decoration: BoxDecoration(
        color: Tokens.red50,
        border: Border.all(color: Tokens.red700, width: 1),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.error_outline,
                color: Tokens.red800,
                size: 22,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Não consegui carregar',
                  style: AppTypography.bodySm.copyWith(
                    color: Tokens.red900,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            msg,
            style: AppTypography.bodyXs.copyWith(color: Tokens.red900),
          ),
        ],
      ),
    );
  }

  String _mensagem(Object e) {
    final s = e.toString();
    if (s.length > 240) return '${s.substring(0, 240)}…';
    return s;
  }
}

class _ResumoHoje extends StatelessWidget {
  const _ResumoHoje({required this.total, required this.emAndamento});

  final int total;
  final int emAndamento;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: MetricCard(
            label: 'Viagens hoje',
            value: '$total',
            sublabel: total == 1 ? 'no total' : 'no total',
            accent: Tone.info,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: MetricCard(
            label: 'Em andamento',
            value: '$emAndamento',
            sublabel: emAndamento == 1 ? 'iniciada' : 'iniciadas',
            accent: emAndamento > 0 ? Tone.warning : Tone.neutral,
          ),
        ),
      ],
    );
  }
}

class _LoadingBlock extends StatelessWidget {
  const _LoadingBlock();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Column(
        children: [
          const SizedBox(
            width: 26,
            height: 26,
            child: CircularProgressIndicator(
              strokeWidth: 2.5,
              color: Tokens.blue900,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'Carregando…',
            style: AppTypography.bodySm.copyWith(color: Tokens.textSecondary),
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
      padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
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

class _AppBar extends StatelessWidget implements PreferredSizeWidget {
  const _AppBar({
    required this.nome,
    required this.matricula,
    required this.syncStatus,
    required this.pending,
  });

  final String nome;
  final String matricula;
  final SyncStatus syncStatus;
  final int pending;

  @override
  Size get preferredSize => const Size.fromHeight(64);

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
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                color: Tokens.blue900,
                child: Text(
                  _iniciais(nome),
                  style: const TextStyle(
                    fontFamily: AppTypography.sansFamily,
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
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
                      _primeiroNome(nome),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.pageTitle.copyWith(fontSize: 18),
                    ),
                    Text(
                      'Matrícula $matricula',
                      style: AppTypography.bodyXs.copyWith(
                        color: Tokens.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              SyncIndicator(
                status: syncStatus,
                pendingCount: pending,
                compact: true,
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _iniciais(String nome) {
    final partes = nome
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .toList();
    if (partes.isEmpty) return '—';
    if (partes.length == 1) return partes.first.substring(0, 1).toUpperCase();
    return (partes.first.substring(0, 1) + partes.last.substring(0, 1))
        .toUpperCase();
  }

  String _primeiroNome(String nome) {
    final partes = nome.trim().split(RegExp(r'\s+'));
    if (partes.isEmpty) return nome;
    if (partes.length == 1) return partes.first;
    return '${partes.first} ${partes.last}';
  }
}
