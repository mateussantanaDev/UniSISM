import 'package:flutter/material.dart';

import '../../core/theme/tokens.dart';
import '../../core/theme/typography.dart';
import '../../domain/models/passageiro.dart';
import 'status_badge.dart';

/// Card de passageiro usado na aba "Passageiros" do detalhe de viagem
/// (F8 — somente leitura) e na chamada digital (F9 — com swipe + ações).
///
/// Quando `onTap` está definido, o card vira clicável (abre modal de
/// detalhe na F9).
class PassageiroCard extends StatelessWidget {
  const PassageiroCard({
    super.key,
    required this.passageiro,
    this.onTap,
    this.dense = false,
  });

  final Passageiro passageiro;
  final VoidCallback? onTap;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final p = passageiro.paciente;
    final s = passageiro.solicitacao;

    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            border: Border.all(color: Tokens.panelBorder, width: 1),
          ),
          padding: EdgeInsets.fromLTRB(12, dense ? 10 : 12, 12, dense ? 10 : 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Cabeçalho — avatar iniciais + nome + presença
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  _Avatar(nome: p.nome),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          p.nome,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.bodySm.copyWith(
                            fontWeight: FontWeight.w700,
                            color: Tokens.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${_formatarCpf(p.cpf)} · ${p.idade} anos',
                          style: AppTypography.monoXs.copyWith(
                            fontSize: 10,
                            color: Tokens.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  StatusBadge(
                    label: passageiro.presenca.rotulo,
                    tone: passageiro.presenca.tone,
                  ),
                ],
              ),

              // Linha de metadados (UBS + protocolo + acompanhante)
              const SizedBox(height: 10),
              Container(height: 1, color: Tokens.divider),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  if (p.ubs != null)
                    _Chip(
                      icon: Icons.local_hospital_outlined,
                      label: p.ubs!.nome,
                    ),
                  _Chip(
                    icon: Icons.confirmation_number_outlined,
                    label: s.protocolo,
                  ),
                  StatusBadge(
                    label: s.prioridade.rotulo,
                    tone: s.prioridade.tone,
                    dense: true,
                  ),
                  if (passageiro.acompanhante)
                    const StatusBadge(
                      label: 'Acompanhante',
                      tone: Tone.warning,
                      dense: true,
                    ),
                ],
              ),

              // Observações de mobilidade (callout amarelo crítico)
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
                        size: 14,
                        color: Tokens.amber800,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          p.observacoesMobilidade!,
                          style: AppTypography.bodyXs.copyWith(
                            color: Tokens.amber900,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              // Observação livre marcada pelo motorista (após chamada)
              if (passageiro.observacao != null &&
                  passageiro.observacao!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Container(
                  decoration: const BoxDecoration(
                    color: Tokens.slate50,
                    border: Border(
                      left: BorderSide(color: Tokens.slate600, width: 3),
                    ),
                  ),
                  padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                  child: Text(
                    passageiro.observacao!,
                    style: AppTypography.bodyXs.copyWith(
                      color: Tokens.slate700,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String _formatarCpf(String cpf) {
    final d = cpf.replaceAll(RegExp(r'\D'), '');
    if (d.length != 11) return cpf;
    return '${d.substring(0, 3)}.${d.substring(3, 6)}.${d.substring(6, 9)}-${d.substring(9)}';
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.nome});
  final String nome;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 38,
      height: 38,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Tokens.slate100,
        border: Border.all(color: Tokens.slate300, width: 1),
      ),
      child: Text(
        _iniciais(nome),
        style: const TextStyle(
          fontFamily: AppTypography.monoFamily,
          fontSize: 12,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.5,
          color: Tokens.slate700,
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
    if (partes.isEmpty) return '?';
    if (partes.length == 1) return partes.first.substring(0, 1).toUpperCase();
    return (partes.first.substring(0, 1) + partes.last.substring(0, 1))
        .toUpperCase();
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: Tokens.slate500),
        const SizedBox(width: 4),
        Text(
          label,
          style: AppTypography.monoXs.copyWith(
            fontSize: 10,
            color: Tokens.textSecondary,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
