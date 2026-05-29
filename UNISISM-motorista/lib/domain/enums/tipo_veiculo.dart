import 'wire.dart';

enum TipoVeiculo {
  van('VAN'),
  onibus('ONIBUS'),
  carro('CARRO'),
  ambulancia('AMBULANCIA');

  const TipoVeiculo(this.wire);
  final String wire;

  static TipoVeiculo fromWire(String value) => TipoVeiculo.values.firstWhere(
    (e) => e.wire == value,
    orElse: () => throw WireException('TipoVeiculo', value),
  );

  String get rotulo => switch (this) {
    TipoVeiculo.van => 'Van',
    TipoVeiculo.onibus => 'Ônibus',
    TipoVeiculo.carro => 'Carro',
    TipoVeiculo.ambulancia => 'Ambulância',
  };
}
