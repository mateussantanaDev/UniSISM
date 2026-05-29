import 'package:meta/meta.dart';

/// Par latitude/longitude desacoplado de qualquer pacote de mapa.
///
/// A presentation layer converte para `latlong2.LatLng` ao desenhar no mapa.
@immutable
class GeoCoord {
  const GeoCoord({required this.lat, required this.lng});

  final double lat;
  final double lng;

  factory GeoCoord.fromJson(Map<String, dynamic> json) => GeoCoord(
    lat: (json['lat'] as num).toDouble(),
    lng: (json['lng'] as num).toDouble(),
  );

  Map<String, dynamic> toJson() => {'lat': lat, 'lng': lng};

  @override
  bool operator ==(Object other) =>
      other is GeoCoord && other.lat == lat && other.lng == lng;

  @override
  int get hashCode => Object.hash(lat, lng);
}
