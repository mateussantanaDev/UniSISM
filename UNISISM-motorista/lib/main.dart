import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/map/map_bootstrap.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Color(0xFF1E3A8A), // blue-900
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: Color(0xFFF8FAFC), // slate-50
      systemNavigationBarIconBrightness: Brightness.dark,
    ),
  );

  // FMTC (F11). Falha não bloqueia o app — só desabilita o mapa offline.
  await initMapaOffline();

  runApp(const ProviderScope(child: UnisismMotoristaApp()));
}
