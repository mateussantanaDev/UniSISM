import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/theme/typography.dart';
import '../../../domain/models/motorista.dart';
import '../../providers/api_providers.dart';
import '../../providers/auth_provider.dart';
import '../../providers/sync_providers.dart';
import '../../providers/toast_controller.dart';
import '../../widgets/brutalist_bottom_nav.dart';
import '../../widgets/brutalist_modal.dart';
import '../../widgets/metric_card.dart';
import '../../widgets/panel_header.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/status_badge.dart';
import '../../widgets/sync_indicator.dart';

class PerfilScreen extends ConsumerStatefulWidget {
  const PerfilScreen({super.key});

  @override
  ConsumerState<PerfilScreen> createState() => _State();
}

class _State extends ConsumerState<PerfilScreen> {
  late Future<Motorista> _future;

  @override
  void initState() {
    super.initState();
    _future = _fetch();
  }

  Future<Motorista> _fetch() async {
    final api = ref.read(tfdApiProvider);
    final db = ref.read(databaseProvider);
    try {
      final me = await api.me();
      await db.motoristasDao.upsert(me);
      return me;
    } on ApiException {
      // Sem rede: usa cache local
      final id = await db.syncMetaDao.getMotoristaId();
      if (id != null) {
        final cached = await db.motoristasDao.getById(id);
        if (cached != null) return cached;
      }
      rethrow;
    }
  }

  Future<void> _refresh() async {
    setState(() => _future = _fetch());
    await _future;
  }

  Future<void> _confirmarLogout() async {
    final ok = await showBrutalistModal<bool>(
      context: context,
      title: 'Sair do app',
      subtitle: 'Você vai sair deste celular',
      builder: (modalCtx) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              decoration: const BoxDecoration(
                color: Tokens.amber50,
                border: Border(
                  left: BorderSide(color: Tokens.amber600, width: 4),
                ),
              ),
              padding: const EdgeInsets.all(14),
              child: const Text(
                'As suas viagens e dados salvos no celular vão ser apagados. '
                'Você vai precisar entrar de novo com sua senha.',
                style: AppTypography.bodySm,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: PrimaryButton(
                    label: 'Cancelar',
                    variant: ButtonVariant.secondary,
                    fullWidth: true,
                    onPressed: () => Navigator.of(modalCtx).pop(false),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: PrimaryButton(
                    label: 'Sair',
                    variant: ButtonVariant.danger,
                    leading: Icons.logout,
                    fullWidth: true,
                    onPressed: () => Navigator.of(modalCtx).pop(true),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );

    if (ok == true && mounted) {
      final toasts = ref.read(toastControllerProvider.notifier);
      try {
        await ref.read(authControllerProvider.notifier).logout();
        toasts.info('Até a próxima!', title: 'Saiu do app');
      } catch (e, st) {
        debugPrint('[LOGOUT] erro: $e\n$st');
        toasts.error('Não consegui avisar o servidor, mas você já saiu daqui.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final sync = ref.watch(syncStatusProvider);

    return Scaffold(
      backgroundColor: Tokens.pageBackground,
      appBar: _AppBar(syncStatus: sync.status, pending: sync.pending),
      bottomNavigationBar: BrutalistBottomNav(
        currentIndex: 1,
        onTap: (i) {
          if (i == 0) context.go('/home');
        },
        items: const [
          BottomNavItem(label: 'Viagens', icon: Icons.directions_bus),
          BottomNavItem(label: 'Perfil', icon: Icons.person_outline),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        color: Tokens.blue900,
        child: FutureBuilder<Motorista>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting &&
                !snapshot.hasData) {
              return const _Loading();
            }
            final m = snapshot.data;
            if (m == null) {
              return _Erro(
                erro: snapshot.error,
                onLogout: _confirmarLogout,
              );
            }
            return _Conteudo(
              motorista: m,
              authNome: auth.motorista?.nome,
              onLogout: _confirmarLogout,
            );
          },
        ),
      ),
    );
  }
}

class _Conteudo extends StatelessWidget {
  const _Conteudo({
    required this.motorista,
    required this.authNome,
    required this.onLogout,
  });

  final Motorista motorista;
  final String? authNome;
  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 24),
      children: [
        _Header(motorista: motorista),
        const SizedBox(height: 14),
        _PainelDados(motorista: motorista),
        const SizedBox(height: 12),
        _PainelCnh(motorista: motorista),
        const SizedBox(height: 12),
        _PainelProducao(motorista: motorista),
        const SizedBox(height: 12),
        _Atalhos(),
        const SizedBox(height: 18),
        PrimaryButton(
          label: 'Sair do app',
          leading: Icons.logout,
          variant: ButtonVariant.danger,
          fullWidth: true,
          onPressed: onLogout,
        ),
        const SizedBox(height: 8),
        Text(
          'UNISISM MOTORISTA · v0.1.0 · BUILD 2026.05',
          textAlign: TextAlign.center,
          style: AppTypography.label.copyWith(
            fontSize: 9,
            color: Tokens.slate500,
          ),
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.motorista});
  final Motorista motorista;

  String get _iniciais {
    final partes = motorista.nome
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
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: Tokens.panelBorder, width: 1),
      ),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      child: Row(
        children: [
          Container(
            width: 72,
            height: 72,
            alignment: Alignment.center,
            color: Tokens.blue900,
            child: Text(
              _iniciais,
              style: const TextStyle(
                fontFamily: AppTypography.sansFamily,
                color: Colors.white,
                fontSize: 26,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  motorista.nome,
                  style: const TextStyle(
                    fontFamily: AppTypography.sansFamily,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Tokens.textPrimary,
                    height: 1.2,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 6),
                Text(
                  'Matrícula ${motorista.matricula}',
                  style: AppTypography.bodyXs.copyWith(
                    color: Tokens.textSecondary,
                  ),
                ),
                Text(
                  motorista.prefeituraNome,
                  style: AppTypography.bodyXs.copyWith(
                    color: Tokens.textSecondary,
                  ),
                ),
                const SizedBox(height: 10),
                StatusBadge(
                  label: motorista.status.rotulo,
                  tone: motorista.status.tone,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PainelDados extends StatelessWidget {
  const _PainelDados({required this.motorista});
  final Motorista motorista;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      title: 'Seus dados',
      subtitle: 'Cadastro',
      children: [
        _Row(label: 'CPF', value: _formatarCpf(motorista.cpf)),
        _Row(label: 'Telefone', value: motorista.telefone),
        _Row(
          label: 'Prefeitura',
          value: motorista.prefeituraNome,
          mono: false,
        ),
      ],
    );
  }

  String _formatarCpf(String cpf) {
    final d = cpf.replaceAll(RegExp(r'\D'), '');
    if (d.length != 11) return cpf;
    return '${d.substring(0, 3)}.${d.substring(3, 6)}.${d.substring(6, 9)}-${d.substring(9)}';
  }
}

class _PainelCnh extends StatelessWidget {
  const _PainelCnh({required this.motorista});
  final Motorista motorista;

  String _formatarData(DateTime d) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.day)}/${two(d.month)}/${d.year}';
  }

  @override
  Widget build(BuildContext context) {
    final vencida = motorista.cnhVencida;
    final aVencer = motorista.cnhAVencer && !vencida;

    return _Panel(
      title: 'Sua CNH',
      subtitle: vencida
          ? 'Vencida — não pode dirigir até renovar'
          : aVencer
              ? 'Vence em menos de 30 dias'
              : 'Tudo certo',
      trailing: vencida
          ? const StatusBadge(
              label: 'Vencida',
              tone: Tone.critical,
              icon: Icons.warning_amber,
            )
          : aVencer
              ? const StatusBadge(
                  label: 'Vence logo',
                  tone: Tone.warning,
                  icon: Icons.schedule,
                )
              : const StatusBadge(
                  label: 'OK',
                  tone: Tone.success,
                  icon: Icons.check_circle,
                ),
      children: [
        _Row(label: 'Número', value: motorista.cnh),
        _Row(label: 'Categoria', value: motorista.categoriaCnh.wire),
        _Row(label: 'Vale até', value: _formatarData(motorista.validadeCnh)),
      ],
    );
  }
}

class _PainelProducao extends StatelessWidget {
  const _PainelProducao({required this.motorista});
  final Motorista motorista;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: MetricCard(
            label: 'Viagens',
            value: '${motorista.totalViagens}',
            sublabel: 'que você fez',
            accent: Tone.info,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: MetricCard(
            label: 'KM rodados',
            value: _formatarMilhar(motorista.totalKmRodados),
            sublabel: 'no total',
            accent: Tone.success,
          ),
        ),
      ],
    );
  }

  String _formatarMilhar(int n) {
    final s = n.toString();
    final buf = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(' ');
      buf.write(s[i]);
    }
    return buf.toString();
  }
}

class _Atalhos extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: Tokens.panelBorder, width: 1),
      ),
      child: _AtalhoTile(
        icon: Icons.savings_outlined,
        titulo: 'Ajudas de custo',
        subtitulo: 'Ver as ajudas dos seus pacientes',
        onTap: () => context.push('/ajudas-custo'),
      ),
    );
  }
}

class _AtalhoTile extends StatelessWidget {
  const _AtalhoTile({
    required this.icon,
    required this.titulo,
    required this.subtitulo,
    required this.onTap,
  });

  final IconData icon;
  final String titulo;
  final String subtitulo;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Row(
            children: [
              Container(
                width: 32,
                height: 32,
                alignment: Alignment.center,
                color: Tokens.slate100,
                child: Icon(icon, size: 18, color: Tokens.slate700),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      titulo,
                      style: AppTypography.bodySm.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(subtitulo, style: AppTypography.bodyXs),
                  ],
                ),
              ),
              const Icon(
                Icons.chevron_right,
                size: 18,
                color: Tokens.slate400,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({
    required this.title,
    required this.subtitle,
    required this.children,
    this.trailing,
  });

  final String title;
  final String subtitle;
  final List<Widget> children;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: Tokens.panelBorder, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PanelHeader(
            title: title,
            subtitle: subtitle,
            trailing: trailing,
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Column(children: children),
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
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(label, style: AppTypography.label),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              value,
              style: mono
                  ? AppTypography.monoSm.copyWith(
                      fontSize: 15,
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

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 60),
          child: Column(
            children: [
              const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  color: Tokens.blue900,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                'CARREGANDO PERFIL…',
                style: AppTypography.label.copyWith(color: Tokens.slate500),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Erro extends StatelessWidget {
  const _Erro({required this.erro, required this.onLogout});
  final Object? erro;
  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    final msg = erro is ApiException
        ? (erro! as ApiException).message
        : erro?.toString() ?? 'Erro desconhecido';
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        Container(
          decoration: BoxDecoration(
            color: Tokens.red50,
            border: Border.all(color: Tokens.red700, width: 1),
          ),
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'NÃO FOI POSSÍVEL CARREGAR O PERFIL',
                style: AppTypography.panelTitle.copyWith(
                  color: Tokens.red800,
                ),
              ),
              const SizedBox(height: 6),
              Text(msg, style: AppTypography.bodyXs),
            ],
          ),
        ),
        const SizedBox(height: 14),
        PrimaryButton(
          label: 'Sair do app',
          variant: ButtonVariant.danger,
          fullWidth: true,
          leading: Icons.logout,
          onPressed: onLogout,
        ),
      ],
    );
  }
}

class _AppBar extends StatelessWidget implements PreferredSizeWidget {
  const _AppBar({required this.syncStatus, required this.pending});

  final SyncStatus syncStatus;
  final int pending;

  @override
  Size get preferredSize => const Size.fromHeight(58);

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
          padding: const EdgeInsets.fromLTRB(20, 12, 16, 12),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Perfil',
                  style: TextStyle(
                    fontFamily: AppTypography.sansFamily,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: Tokens.slate900,
                  ),
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
}
