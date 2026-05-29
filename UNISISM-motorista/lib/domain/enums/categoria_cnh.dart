import 'wire.dart';

enum CategoriaCnh {
  b('B'),
  c('C'),
  d('D'),
  e('E');

  const CategoriaCnh(this.wire);
  final String wire;

  static CategoriaCnh fromWire(String value) => CategoriaCnh.values.firstWhere(
    (e) => e.wire == value,
    orElse: () => throw WireException('CategoriaCnh', value),
  );

  String get rotulo => 'Categoria $wire';
}
