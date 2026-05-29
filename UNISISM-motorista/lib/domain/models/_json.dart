// Helpers compartilhados de parsing JSON dos modelos.

/// Parse ISO 8601 com tolerância — alguns endpoints devolvem `Z`, outros
/// devolvem offset explícito.
DateTime parseDateTime(Object? value) {
  if (value is String) return DateTime.parse(value).toLocal();
  throw FormatException('Esperado DateTime ISO 8601: $value');
}

DateTime? parseDateTimeOrNull(Object? value) {
  if (value == null) return null;
  return parseDateTime(value);
}

/// Para campos `bigint` que vêm como string ou number.
int parseInt(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.parse(value);
  throw FormatException('Esperado int: $value');
}

int? parseIntOrNull(Object? value) =>
    value == null ? null : parseInt(value);

double parseDouble(Object? value) {
  if (value is num) return value.toDouble();
  if (value is String) return double.parse(value);
  throw FormatException('Esperado double: $value');
}

double? parseDoubleOrNull(Object? value) =>
    value == null ? null : parseDouble(value);
