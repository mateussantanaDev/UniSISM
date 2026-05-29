/// Configuração central do mapa offline (F11).
///
/// O tile provider é o `FMTCTileProvider` apontando para o store
/// [storeName]. Tiles são baixados sob demanda durante navegação e
/// ficam cached automaticamente para uso offline posterior.
///
/// **Produção**: a SMS de Águas Belas deve hospedar seu próprio
/// tileserver (ex.: `tileserver-gl` rodando OSM extract do estado).
/// Em dev, usamos `tile.openstreetmap.org` direto.
class MapConfig {
  MapConfig._();

  /// Nome do store FMTC. Persiste entre sessões; logout do app limpa via
  /// `wipeCache()`.
  static const storeName = 'unisism_motorista';

  /// User-agent identificável — exigência da política de uso OSM.
  /// Ver: https://operations.osmfoundation.org/policies/tiles/
  static const userAgentPackageName =
      'br.gov.aguasbelas.unisism.motorista';

  /// URL template do tile server. Pode ser sobrescrito em build:
  /// `--dart-define=TILE_URL_TEMPLATE=https://tiles.unisism.aguasbelas.pe.gov.br/{z}/{x}/{y}.png`
  static String get urlTemplate {
    const custom = String.fromEnvironment('TILE_URL_TEMPLATE');
    if (custom.isNotEmpty) return custom;
    return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  }

  /// Bounding box aproximado de Águas Belas + 50 km. Usado para
  /// pre-download da região quando o motorista quiser pré-carregar a
  /// área no perfil (F14).
  ///
  /// Coordenadas SW/NE: -12.7,-39.4 → -11.9,-38.6.
  static const bboxFeiraSw = (lat: -12.7, lng: -39.4);
  static const bboxFeiraNe = (lat: -11.9, lng: -38.6);

  /// Centro inicial quando não há coordenadas — centro de Águas Belas.
  static const centroPadrao = (lat: -12.2569, lng: -38.9663);

  /// Zoom inicial.
  static const zoomPadrao = 12.0;

  /// Limites de zoom para pre-download.
  static const minZoom = 10;
  static const maxZoom = 16;
}
