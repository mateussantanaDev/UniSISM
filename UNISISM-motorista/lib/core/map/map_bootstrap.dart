import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_map_tile_caching/flutter_map_tile_caching.dart';

import 'map_config.dart';

/// Inicializa o backend FMTC e garante que o store existe. Chamado
/// **uma vez** no `main()` antes do `runApp`.
///
/// Falha silenciosa (devolve erro mas não lança) — o app continua a
/// funcionar sem mapa offline; a aba Mapa cai em fallback de lista.
Future<Object?> initMapaOffline() async {
  try {
    await FMTCObjectBoxBackend().initialise();
    const store = FMTCStore(MapConfig.storeName);
    final exists = await store.manage.ready;
    if (!exists) {
      await store.manage.create();
    }
    return null;
  } catch (err, stack) {
    if (kDebugMode) {
      debugPrint('FMTC initialise failed: $err\n$stack');
    }
    return err;
  }
}

/// Limpa todo o cache de tiles. Chamado pelo logout (F6) junto do
/// `AppDatabase.wipe()`.
Future<void> wipeMapaOfflineCache() async {
  try {
    const store = FMTCStore(MapConfig.storeName);
    if (await store.manage.ready) {
      await store.manage.reset();
    }
  } catch (err) {
    if (kDebugMode) debugPrint('FMTC wipe failed: $err');
  }
}
