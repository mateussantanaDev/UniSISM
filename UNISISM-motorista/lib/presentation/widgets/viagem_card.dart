import 'package:flutter/material.dart';

import '../../core/theme/tokens.dart';
import '../../core/theme/typography.dart';
import '../../domain/models/viagem.dart';
import 'status_badge.dart';

/// Card de viagem — versão **acessível** (S5).
///
/// Mudanças vs. brutalist original:
/// - Hora MUITO maior (28px mono) — info principal pra motorista.
/// - Destino com 17px bold.
/// - Status badge com ícone.
/// - Contadores embarcados/faltaram com texto claro ("3 embarcaram").
/// - Padding generoso, hierarquia visual evidente.
class ViagemCard extends StatelessWidget {
  const ViagemCard({super.key, required this.viagem, this.onTap});

  final Viagem viagem;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final ausentes = viagem.passageiros
        .where((p) => p.presenca.wire == 'AUSENTE')
        .length;
    final embarcados = viagem.passageiros
        .where((p) => p.presenca.wire == 'EMBARCADO')
        .length;

    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            border: Border.all(color: Tokens.panelBorder, width: 1),
          ),
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Container(
                    width: 78,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: const BoxDecoration(color: Tokens.blue900),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          viagem.horaSaida,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontFamily: AppTypography.monoFamily,
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 22,
                            letterSpacing: 0.5,
                            height: 1,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _diaCurto(viagem.data),
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontFamily: AppTypography.sansFamily,
                            color: Colors.white70,
                            fontWeight: FontWeight.w600,
                            fontSize: 11,
                            letterSpacing: 0.5,
                            height: 1,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          viagem.destino,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontFamily: AppTypography.sansFamily,
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: Tokens.textPrimary,
                            height: 1.25,
                          ),
                        ),
                        if (viagem.unidadeDestino != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            viagem.unidadeDestino!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.bodyXs.copyWith(
                              color: Tokens.textSecondary,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Container(height: 1, color: Tokens.divider),
              const SizedBox(height: 12),
              Row(
                children: [
                  StatusBadge(
                    label: viagem.status.rotulo,
                    tone: viagem.status.tone,
                    icon: viagem.status.icone,
                    dense: true,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _resumoPassageiros(
                        total: viagem.passageiros.length,
                        capacidade: viagem.vagasTotais,
                        embarcados: embarcados,
                        ausentes: ausentes,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodyXs.copyWith(
                        color: Tokens.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _resumoPassageiros({
    required int total,
    required int capacidade,
    required int embarcados,
    required int ausentes,
  }) {
    if (total == 0) return 'Sem passageiros';
    final partes = <String>['$total de $capacidade vagas'];
    if (embarcados > 0) {
      partes.add('$embarcados embarcaram');
    }
    if (ausentes > 0) {
      partes.add('$ausentes faltaram');
    }
    return partes.join(' · ');
  }

  String _diaCurto(DateTime d) {
    const meses = [
      'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
      'jul', 'ago', 'set', 'out', 'nov', 'dez',
    ];
    return '${d.day.toString().padLeft(2, '0')} ${meses[d.month - 1]}';
  }
}
