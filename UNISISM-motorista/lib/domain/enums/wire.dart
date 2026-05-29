/// Helpers compartilhados pelos enums do domínio.
///
/// Convenção: todo enum exposto pelo backend tem um nome string em
/// SNAKE_CASE uppercase (`AGENDADA`, `EM_ANDAMENTO`) que é tratado como
/// "valor wire". O enum Dart traz `wire` (string) e `fromWire(value)`
/// para conversão simétrica.
class WireException implements Exception {
  WireException(this.kind, this.value);
  final String kind;
  final String value;

  @override
  String toString() => 'Valor "$value" não é um $kind válido.';
}
