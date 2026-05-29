import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_map_tile_caching/flutter_map_tile_caching.dart';
import 'package:latlong2/latlong.dart';

import '../../core/map/map_config.dart';
import '../../core/theme/tokens.dart';
import '../../core/theme/typography.dart';
import '../../domain/models/geo.dart';
import '../../domain/models/viagem.dart';

/// Marker tipado (categoria visual no mapa).
enum MarkerKind { origem, ubs, destino }

/// Ponto exibido no mapa.
class ViagemMarker {
  const ViagemMarker({
    required this.coord,
    required this.kind,
    required this.label,
    this.sublabel,
  });

  final GeoCoord coord;
  final MarkerKind kind;
  final String label;
  final String? sublabel;
}

/// Mapa interativo (OpenStreetMap via FMTC) para uma viagem específica.
/// Renderiza markers de origem/destino/UBSs e respeita a paleta brutalista.
///
/// Devolve `null` (via [build] retornando `SizedBox.shrink`) quando não
/// há coordenadas — o caller deve cuidar do fallback.
class ViagemMap extends StatelessWidget {
  const ViagemMap({super.key, required this.viagem, this.height = 280});

  final Viagem viagem;
  final double height;

  List<ViagemMarker> _markers() {
    final ms = <ViagemMarker>[];
    if (viagem.coordOrigem != null) {
      ms.add(ViagemMarker(
        coord: viagem.coordOrigem!,
        kind: MarkerKind.origem,
        label: 'Origem',
        sublabel: viagem.destino,
      ));
    }
    for (final p in viagem.passageiros) {
      final ubs = p.paciente.ubs;
      if (ubs?.coord != null) {
        ms.add(ViagemMarker(
          coord: ubs!.coord!,
          kind: MarkerKind.ubs,
          label: ubs.nome,
          sublabel: p.paciente.nome.split(' ').first,
        ));
      }
    }
    if (viagem.coordDestino != null) {
      ms.add(ViagemMarker(
        coord: viagem.coordDestino!,
        kind: MarkerKind.destino,
        label: 'Destino',
        sublabel: viagem.unidadeDestino ?? viagem.destino,
      ));
    }
    return ms;
  }

  @override
  Widget build(BuildContext context) {
    final markers = _markers();
    if (markers.isEmpty) {
      return const SizedBox.shrink();
    }

    final pontos = markers
        .map((m) => LatLng(m.coord.lat, m.coord.lng))
        .toList(growable: false);
    final bounds = _calcBounds(pontos);
    final center = _calcCenter(pontos);

    return SizedBox(
      height: height,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(color: Tokens.panelBorder, width: 1),
          color: Tokens.slate100,
        ),
        child: Stack(
          children: [
            ClipRect(
              child: FlutterMap(
                options: MapOptions(
                  initialCenter: center,
                  initialZoom: MapConfig.zoomPadrao,
                  initialCameraFit: bounds == null
                      ? null
                      : CameraFit.bounds(
                          bounds: bounds,
                          padding: const EdgeInsets.all(32),
                        ),
                  interactionOptions: const InteractionOptions(
                    flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                  ),
                  backgroundColor: Tokens.slate100,
                ),
                children: [
                  TileLayer(
                    urlTemplate: MapConfig.urlTemplate,
                    userAgentPackageName: MapConfig.userAgentPackageName,
                    tileProvider:
                        const FMTCStore(MapConfig.storeName).getTileProvider(),
                    maxZoom: 18,
                  ),
                  MarkerLayer(
                    markers: [
                      for (final m in markers)
                        Marker(
                          point: LatLng(m.coord.lat, m.coord.lng),
                          width: 32,
                          height: 32,
                          alignment: Alignment.topCenter,
                          child: _PinIcon(kind: m.kind),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            Positioned(
              bottom: 6,
              right: 8,
              child: Container(
                color: Colors.white.withValues(alpha: 0.92),
                padding: const EdgeInsets.symmetric(
                  horizontal: 6,
                  vertical: 2,
                ),
                child: const Text(
                  '© OpenStreetMap',
                  style: TextStyle(
                    fontFamily: AppTypography.monoFamily,
                    fontSize: 9,
                    color: Tokens.slate600,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  LatLng _calcCenter(List<LatLng> pontos) {
    if (pontos.length == 1) return pontos.first;
    double sumLat = 0, sumLng = 0;
    for (final p in pontos) {
      sumLat += p.latitude;
      sumLng += p.longitude;
    }
    return LatLng(sumLat / pontos.length, sumLng / pontos.length);
  }

  LatLngBounds? _calcBounds(List<LatLng> pontos) {
    if (pontos.length < 2) return null;
    double minLat = pontos.first.latitude;
    double maxLat = pontos.first.latitude;
    double minLng = pontos.first.longitude;
    double maxLng = pontos.first.longitude;
    for (final p in pontos.skip(1)) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }
    return LatLngBounds(LatLng(minLat, minLng), LatLng(maxLat, maxLng));
  }
}

class _PinIcon extends StatelessWidget {
  const _PinIcon({required this.kind});
  final MarkerKind kind;

  Color get cor => switch (kind) {
    MarkerKind.origem => Tokens.blue900,
    MarkerKind.ubs => Tokens.amber600,
    MarkerKind.destino => Tokens.emerald700,
  };

  String get letra => switch (kind) {
    MarkerKind.origem => 'O',
    MarkerKind.ubs => 'U',
    MarkerKind.destino => 'D',
  };

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 22,
          height: 22,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: cor,
            border: Border.all(color: Colors.white, width: 2),
          ),
          child: Text(
            letra,
            style: const TextStyle(
              fontFamily: AppTypography.monoFamily,
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              height: 1,
            ),
          ),
        ),
        CustomPaint(
          size: const Size(10, 6),
          painter: _PinTipPainter(cor: cor),
        ),
      ],
    );
  }
}

class _PinTipPainter extends CustomPainter {
  _PinTipPainter({required this.cor});
  final Color cor;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = cor;
    final path = ui.Path()
      ..moveTo(0, 0)
      ..lineTo(size.width / 2, size.height)
      ..lineTo(size.width, 0)
      ..close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(_PinTipPainter old) => old.cor != cor;
}
