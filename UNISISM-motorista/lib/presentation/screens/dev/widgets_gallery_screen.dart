import 'package:flutter/material.dart';

import '../../../core/theme/tokens.dart';
import '../../../core/theme/typography.dart';
import '../../widgets/brutalist_bottom_nav.dart';
import '../../widgets/brutalist_modal.dart';
import '../../widgets/form_field.dart';
import '../../widgets/metric_card.dart';
import '../../widgets/panel_header.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/status_badge.dart';
import '../../widgets/sync_indicator.dart';

/// Storybook interno do Design System (F1). Não é navegável pelo usuário
/// final — só pela tela `SplashScreen` em builds de dev.
class WidgetsGalleryScreen extends StatefulWidget {
  const WidgetsGalleryScreen({super.key});

  @override
  State<WidgetsGalleryScreen> createState() => _WidgetsGalleryScreenState();
}

class _WidgetsGalleryScreenState extends State<WidgetsGalleryScreen> {
  int _navIndex = 0;
  SyncStatus _syncStatus = SyncStatus.synced;
  bool _buttonLoading = false;
  final _hodController = TextEditingController(text: '45200');

  @override
  void dispose() {
    _hodController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Tokens.pageBackground,
      appBar: _Header(syncStatus: _syncStatus),
      bottomNavigationBar: BrutalistBottomNav(
        currentIndex: _navIndex,
        onTap: (i) => setState(() => _navIndex = i),
        items: const [
          BottomNavItem(label: 'Hoje', icon: Icons.today),
          BottomNavItem(
            label: 'Próximas',
            icon: Icons.event,
            badge: '3',
          ),
          BottomNavItem(
            label: 'Histórico',
            icon: Icons.history,
          ),
          BottomNavItem(label: 'Perfil', icon: Icons.person),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          _Section(
            n: '01',
            title: 'PanelHeader',
            subtitle: 'Cabeçalho com índice opcional',
            child: _Panel(
              header: const PanelHeader(
                title: 'Identificação do Veículo',
                subtitle: 'Frota TFD · Van escolar',
                index: '01',
              ),
              child: _placeholderBody(),
            ),
          ),

          _Section(
            n: '02',
            title: 'MetricCard',
            subtitle: '4 accents (info/warning/critical/success)',
            child: Column(
              children: [
                Row(
                  children: const [
                    Expanded(
                      child: MetricCard(
                        label: 'Hoje',
                        value: '3',
                        sublabel: 'viagens agendadas',
                        accent: Tone.info,
                      ),
                    ),
                    SizedBox(width: 8),
                    Expanded(
                      child: MetricCard(
                        label: 'Pendentes',
                        value: '12',
                        sublabel: 'sync pendente',
                        trend: '+4',
                        trendDirection: TrendDirection.up,
                        accent: Tone.warning,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: const [
                    Expanded(
                      child: MetricCard(
                        label: 'Cancelamentos',
                        value: '1',
                        sublabel: 'no mês',
                        trend: '-3',
                        trendDirection: TrendDirection.down,
                        accent: Tone.critical,
                      ),
                    ),
                    SizedBox(width: 8),
                    Expanded(
                      child: MetricCard(
                        label: 'KM rodados',
                        value: '4 320',
                        sublabel: 'maio/2026',
                        accent: Tone.success,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          _Section(
            n: '03',
            title: 'StatusBadge',
            subtitle: '5 tones (neutral/info/success/warning/critical)',
            child: const Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                StatusBadge(label: 'Rascunho', tone: Tone.neutral),
                StatusBadge(label: 'Agendada', tone: Tone.info),
                StatusBadge(label: 'Em andamento', tone: Tone.warning),
                StatusBadge(label: 'Concluída', tone: Tone.success),
                StatusBadge(label: 'Cancelada', tone: Tone.critical),
                StatusBadge(label: 'CNH a vencer', tone: Tone.warning),
              ],
            ),
          ),

          _Section(
            n: '04',
            title: 'PrimaryButton',
            subtitle: '3 variantes + loading',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                PrimaryButton(
                  label: 'Iniciar Viagem',
                  leading: Icons.play_arrow,
                  fullWidth: true,
                  onPressed: () => _toggleLoading(),
                  loading: _buttonLoading,
                ),
                const SizedBox(height: 8),
                PrimaryButton(
                  label: 'Concluir',
                  variant: ButtonVariant.secondary,
                  fullWidth: true,
                  onPressed: () {},
                ),
                const SizedBox(height: 8),
                PrimaryButton(
                  label: 'Cancelar Viagem',
                  variant: ButtonVariant.danger,
                  fullWidth: true,
                  onPressed: () {},
                ),
                const SizedBox(height: 8),
                const PrimaryButton(
                  label: 'Desabilitado',
                  fullWidth: true,
                  onPressed: null,
                ),
              ],
            ),
          ),

          _Section(
            n: '05',
            title: 'AppFormField',
            subtitle: 'Input com label uppercase, suporta mono',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AppFormField(
                  label: 'Matrícula',
                  type: AppFieldType.number,
                  hint: '12345',
                  mono: true,
                  maxLength: 6,
                ),
                const SizedBox(height: 12),
                AppFormField(
                  label: 'Hodômetro Inicial',
                  controller: _hodController,
                  type: AppFieldType.number,
                  mono: true,
                ),
                const SizedBox(height: 12),
                const AppFormField(
                  label: 'Senha',
                  type: AppFieldType.password,
                  hint: '••••••••',
                ),
                const SizedBox(height: 12),
                const AppFormField(
                  label: 'Observação',
                  error: 'Campo obrigatório para registrar AUSENTE',
                ),
              ],
            ),
          ),

          _Section(
            n: '06',
            title: 'Modal',
            subtitle: 'Brutalismo pesado, offset shadow 8/8',
            child: PrimaryButton(
              label: 'Abrir Modal',
              variant: ButtonVariant.secondary,
              fullWidth: true,
              onPressed: () => _openModal(context),
            ),
          ),

          _Section(
            n: '07',
            title: 'BrutalistBottomNav',
            subtitle: 'Veja embaixo da tela →',
            child: _Hint(
              text:
                  'Tabs HOJE · PRÓXIMAS · HISTÓRICO · PERFIL — '
                  'border-top blue-900 indica ativa. Toque para alternar.',
            ),
          ),

          _Section(
            n: '08',
            title: 'SyncIndicator',
            subtitle: '4 estados — testa cada um',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final s in SyncStatus.values)
                      OutlinedButton(
                        onPressed: () => setState(() => _syncStatus = s),
                        child: Text(
                          s.name.toUpperCase(),
                          style: AppTypography.button.copyWith(fontSize: 10),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerLeft,
                  child: SyncIndicator(
                    status: _syncStatus,
                    pendingCount: 4,
                    onRetry: () =>
                        setState(() => _syncStatus = SyncStatus.syncing),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _toggleLoading() async {
    setState(() => _buttonLoading = true);
    await Future.delayed(const Duration(milliseconds: 900));
    if (mounted) setState(() => _buttonLoading = false);
  }

  void _openModal(BuildContext ctx) {
    showBrutalistModal(
      context: ctx,
      title: 'Concluir Viagem',
      subtitle: 'Confirmação obrigatória',
      builder: (mctx) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'A viagem será marcada como CONCLUIDA e o hodômetro final '
              'será gravado na cadeia de auditoria do TJ.',
              style: AppTypography.bodySm,
            ),
            const SizedBox(height: 16),
            const AppFormField(
              label: 'Hodômetro Final',
              type: AppFieldType.number,
              mono: true,
              hint: '45580',
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: PrimaryButton(
                    label: 'Cancelar',
                    variant: ButtonVariant.secondary,
                    fullWidth: true,
                    onPressed: () => Navigator.of(mctx).pop(),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: PrimaryButton(
                    label: 'Concluir',
                    fullWidth: true,
                    onPressed: () => Navigator.of(mctx).pop(),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// Helpers privados do storybook
// ──────────────────────────────────────────────────────────────────────

class _Header extends StatelessWidget implements PreferredSizeWidget {
  const _Header({required this.syncStatus});

  final SyncStatus syncStatus;

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
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              IconButton(
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const Icon(Icons.arrow_back, size: 18),
                visualDensity: VisualDensity.compact,
                color: Tokens.slate700,
              ),
              const SizedBox(width: 4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'DESIGN SYSTEM · F1',
                      style: AppTypography.pageTitle.copyWith(fontSize: 13),
                    ),
                    Text(
                      '8 widgets · brutalismo B2G',
                      style: AppTypography.panelSubtitle.copyWith(
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
              ),
              SyncIndicator(status: syncStatus, pendingCount: 4),
            ],
          ),
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({
    required this.n,
    required this.title,
    required this.subtitle,
    required this.child,
  });

  final String n;
  final String title;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 26,
                height: 26,
                alignment: Alignment.center,
                color: Tokens.blue900,
                child: Text(
                  n,
                  style: const TextStyle(
                    fontFamily: AppTypography.monoFamily,
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 10,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(title, style: AppTypography.panelTitle),
                    Text(subtitle, style: AppTypography.panelSubtitle),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.header, required this.child});

  final Widget header;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: Tokens.panelBorder, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [header, child],
      ),
    );
  }
}

Widget _placeholderBody() => Padding(
  padding: const EdgeInsets.all(14),
  child: Text(
    'Conteúdo do painel — substituído pelo conteúdo real nas fases F7+.',
    style: AppTypography.bodyXs,
  ),
);

class _Hint extends StatelessWidget {
  const _Hint({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        border: Border(left: BorderSide(color: Tokens.blue900, width: 4)),
        color: Tokens.blue50,
      ),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Text(text, style: AppTypography.bodyXs),
    );
  }
}
