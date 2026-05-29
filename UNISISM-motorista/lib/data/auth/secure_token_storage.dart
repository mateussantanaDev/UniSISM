import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Wrap do `flutter_secure_storage` com chaves canônicas.
class SecureTokenStorage {
  const SecureTokenStorage({this.storage = const FlutterSecureStorage()});

  final FlutterSecureStorage storage;

  static const _kToken = 'unisism.token';
  static const _kMatricula = 'unisism.matricula';

  Future<String?> readToken() => storage.read(key: _kToken);
  Future<void> writeToken(String value) =>
      storage.write(key: _kToken, value: value);

  Future<String?> readMatricula() => storage.read(key: _kMatricula);
  Future<void> writeMatricula(String value) =>
      storage.write(key: _kMatricula, value: value);

  Future<void> clear() async {
    await storage.delete(key: _kToken);
    await storage.delete(key: _kMatricula);
  }
}
