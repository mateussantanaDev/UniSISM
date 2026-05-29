import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/theme/typography.dart';
import '../../../domain/models/ajuda_custo.dart';
import '../../providers/api_providers.dart';
import '../../widgets/status_badge.dart';

class ListaAjudasScreen extends ConsumerStatefulWidget {
  const ListaAjudasScreen({super.key});

  @override
  ConsumerState<ListaAjudasScreen> createState() => _State();
}

class _State extends ConsumerState<ListaAjudasScreen> {
  late Future<List<AjudaCusto>> _future;

  @override
  void initState() {
    super.initState();
    _future = ref.read(tfdApiProvider).minhasAjudasCusto();
  }

  Future<void> _refresh() async {
    setState(() {
      _future = ref.read(tfdApiProvider).minhasAjudasCusto();
    });
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Tokens.pageBackground,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: const Text(
          'Ajudas de custo',
          style: TextStyle(
            fontFamily: AppTypography.sansFamily,
            fontWeight: FontWeight.w800,
            fontSize: 20,
            color: Tokens.slate900,
          ),
        ),
        shape: const Border(
          bottom: BorderSide(color: Tokens.panelBorder, width: 1),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        color: Tokens.blue900,
        child: FutureBuilder<List<AjudaCusto>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const _Loading();
            }
            if (snapshot.hasError) {
              return _ErroBlock(erro: snapshot.error!);
            }
            final lista = snapshot.data ?? const <AjudaCusto>[];
            if (lista.isEmpty) {
              return const _Empty();
            }
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 24),
              itemCount: lista.length + 1,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (_, i) {
                if (i == 0) return _Hint(total: lista.length);
                return _AjudaCard(item: lista[i - 1]);
              },
            );
          },
        ),
      ),
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint({required this.total});
  final int total;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Tokens.blue50,
        border: Border(left: BorderSide(color: Tokens.blue900, width: 4)),
      ),
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      child: Row(
        children: [
          const Icon(Icons.info_outline, color: Tokens.blue900, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '$total ajuda(s) associada(s) às suas viagens. Apenas a gestão '
              'TFD aprova e paga — você acompanha o status aqui.',
              style: AppTypography.bodyXs.copyWith(color: Tokens.blue900),
            ),
          ),
        ],
      ),
    );
  }
}

class _AjudaCard extends StatelessWidget {
  const _AjudaCard({required this.item});
  final AjudaCusto item;

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
          // Cabeçalho
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Tokens.slate50, Colors.white],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
              border: Border(
                bottom: BorderSide(color: Tokens.panelBorder, width: 1),
              ),
            ),
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        item.protocolo ?? 'AJC S/N',
                        style: AppTypography.panelTitle.copyWith(fontSize: 12),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        item.pacienteNome,
                        style: AppTypography.bodyXs.copyWith(
                          color: Tokens.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                StatusBadge(
                  label: item.status.rotulo,
                  tone: item.status.tone,
                ),
              ],
            ),
          ),
          // Itens
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final it in item.itens) _ItemRow(item: it),
                const SizedBox(height: 6),
                Container(height: 1, color: Tokens.divider),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Total',
                        style: AppTypography.label.copyWith(
                          color: Tokens.slate700,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'R\$ ${item.valorTotalBrl.toStringAsFixed(2)}',
                      style: const TextStyle(
                        fontFamily: AppTypography.monoFamily,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: Tokens.slate900,
                      ),
                    ),
                  ],
                ),
                if (item.metodoPagamento != null) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(
                        Icons.payments_outlined,
                        size: 12,
                        color: Tokens.slate500,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        item.metodoPagamento!,
                        style: AppTypography.label.copyWith(
                          fontSize: 9,
                          color: Tokens.slate600,
                        ),
                      ),
                    ],
                  ),
                ],
                if (item.motivoNegacao != null) ...[
                  const SizedBox(height: 8),
                  Container(
                    decoration: const BoxDecoration(
                      color: Tokens.red50,
                      border: Border(
                        left: BorderSide(color: Tokens.red700, width: 3),
                      ),
                    ),
                    padding: const EdgeInsets.fromLTRB(10, 6, 10, 6),
                    child: Text(
                      item.motivoNegacao!,
                      style: AppTypography.bodyXs.copyWith(
                        color: Tokens.red900,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({required this.item});
  final AjudaCustoItem item;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
            decoration: BoxDecoration(
              border: Border.all(color: Tokens.slate400, width: 1),
              color: Tokens.slate50,
            ),
            child: Text(
              item.categoria,
              style: const TextStyle(
                fontFamily: AppTypography.monoFamily,
                fontSize: 9,
                fontWeight: FontWeight.w700,
                color: Tokens.slate700,
                letterSpacing: 1,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              item.descricao,
              style: AppTypography.bodyXs,
            ),
          ),
          Text(
            'R\$ ${item.valorBrl.toStringAsFixed(2)}',
            style: AppTypography.monoXs.copyWith(
              fontWeight: FontWeight.w700,
              color: Tokens.slate900,
            ),
          ),
        ],
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 24),
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
                child: const Icon(
                  Icons.savings_outlined,
                  size: 28,
                  color: Tokens.slate400,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'Sem ajudas de custo',
                textAlign: TextAlign.center,
                style: AppTypography.bodySm.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Quando a gestão TFD criar uma ajuda associada a algum '
                'paciente da sua viagem, ela aparece aqui.',
                textAlign: TextAlign.center,
                style: AppTypography.bodyXs,
              ),
            ],
          ),
        ),
      ],
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
                'CARREGANDO…',
                style: AppTypography.label.copyWith(color: Tokens.slate500),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ErroBlock extends StatelessWidget {
  const _ErroBlock({required this.erro});
  final Object erro;

  @override
  Widget build(BuildContext context) {
    final msg = erro is ApiException
        ? (erro as ApiException).message
        : erro.toString();
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        Container(
          decoration: BoxDecoration(
            color: Tokens.red50,
            border: Border.all(color: Tokens.red700, width: 1),
          ),
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              const Icon(
                Icons.error_outline,
                color: Tokens.red800,
                size: 16,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  msg,
                  style: AppTypography.bodyXs.copyWith(
                    color: Tokens.red900,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
