import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Stream de status online/offline. Mapeia `ConnectivityResult.none` →
/// offline, resto → online (otimista). Verificação real de internet
/// acontece nas chamadas HTTP.
final connectivityProvider = StreamProvider<bool>((ref) async* {
  final connectivity = Connectivity();
  final initial = await connectivity.checkConnectivity();
  yield _toOnline(initial);
  yield* connectivity.onConnectivityChanged.map(_toOnline);
});

bool _toOnline(List<ConnectivityResult> results) {
  return results.any((r) => r != ConnectivityResult.none);
}

/// Snapshot atual — útil em fluxos imperativos (`ref.read`).
final isOnlineProvider = Provider<bool>((ref) {
  final async = ref.watch(connectivityProvider);
  return async.maybeWhen(data: (online) => online, orElse: () => true);
});
