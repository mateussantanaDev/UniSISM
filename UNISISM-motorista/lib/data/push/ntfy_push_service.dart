import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:logger/logger.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'push_service.dart';

/// Push notifications via **ntfy.sh self-hosted** (open-source, MIT)
/// + `flutter_local_notifications` (apresentação).
class NtfyPushService implements PushService {
  final _log = Logger(printer: PrettyPrinter(methodCount: 0));
  final _local = FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  /// URL base do servidor ntfy. Configurável via `--dart-define=NTFY_BASE_URL=...`
  /// Default: `http://10.0.0.101:8080` (Docker self-host).
  static const _ntfyBaseUrl = String.fromEnvironment(
    'NTFY_BASE_URL',
    defaultValue: 'http://10.0.0.101:8080',
  );

  /// Chave do topic UUID no SharedPreferences.
  static const _topicPrefsKey = 'ntfy_topic_v1';

  final _tokenCtrl = StreamController<String>.broadcast();
  final _messageCtrl = StreamController<PushPayload>.broadcast();
  final _openedCtrl = StreamController<PushPayload>.broadcast();

  String? _topic;

  /// Canal Android para notificações UNISISM Motorista.
  static const _channel = AndroidNotificationChannel(
    'unisism_motorista_default',
    'Avisos do UNISISM Motorista',
    description: 'Atualizações sobre viagens, escalas e avisos.',
    importance: Importance.high,
  );

  /// Estado do WebSocket.
  WebSocketChannel? _ws;
  StreamSubscription<dynamic>? _wsSub;
  Timer? _reconnectTimer;
  int _reconnectAttempt = 0;

  @override
  Future<void> init() async {
    if (_initialized) return;

    // ─── 1. Local notifications ────────────────────────────────
    await _local.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@drawable/ic_notification'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: true,
          requestBadgePermission: true,
          requestSoundPermission: true,
        ),
      ),
      onDidReceiveNotificationResponse: (resp) {
        final payloadStr = resp.payload;
        if (payloadStr != null && payloadStr.isNotEmpty) {
          try {
            final payloadJson = jsonDecode(payloadStr) as Map<String, dynamic>;
            final title = payloadJson['title'] as String? ?? 'UNISISM';
            final body = payloadJson['body'] as String? ?? '';
            final deepLink = payloadJson['deepLink'] as String?;
            final tipo = payloadJson['tipo'] as String?;
            
            _openedCtrl.add(PushPayload(
              titulo: title,
              corpo: body,
              viagemId: _extractViagemId(deepLink),
              tipo: tipo,
            ));
          } catch (_) {
            // Se for string simples
            _openedCtrl.add(PushPayload(
              titulo: 'UNISISM',
              corpo: '',
              viagemId: _extractViagemId(payloadStr),
            ));
          }
        }
      },
    );

    await _createChannel();

    // ─── 2. Topic UUID local ───────────────────────────────────
    final prefs = await SharedPreferences.getInstance();
    var topic = prefs.getString(_topicPrefsKey);
    if (topic == null || topic.isEmpty) {
      topic = 'unisism-motorista-${const Uuid().v4().replaceAll('-', '')}';
      await prefs.setString(_topicPrefsKey, topic);
      _log.i('Topic ntfy gerado: ${topic.substring(0, 20)}...');
    } else {
      _log.i('Topic ntfy recuperado: ${topic.substring(0, 20)}...');
    }
    _topic = topic;

    // Dispara a rotação/geração do token inicial pros listeners
    _tokenCtrl.add(topic);

    // ─── 3. Conecta WebSocket ──────────────────────────────────
    _connectWebSocket();

    _initialized = true;
  }

  @override
  Future<String?> token() async {
    if (_topic == null) {
      final prefs = await SharedPreferences.getInstance();
      _topic = prefs.getString(_topicPrefsKey);
    }
    return _topic;
  }

  @override
  Stream<String> get onTokenRefresh => _tokenCtrl.stream;

  @override
  Stream<PushPayload> get onMessage => _messageCtrl.stream;

  @override
  Stream<PushPayload> get onOpened => _openedCtrl.stream;

  String _buildSubscribeUrl(String topic) {
    final base = _ntfyBaseUrl.replaceFirst(RegExp(r'^http'), 'ws');
    return '$base/$topic/ws';
  }

  void _connectWebSocket() {
    final topic = _topic;
    if (topic == null) return;

    _reconnectTimer?.cancel();
    final url = _buildSubscribeUrl(topic);

    try {
      _ws = WebSocketChannel.connect(Uri.parse(url));
      _log.i('WSS conectando: $url');
      _reconnectAttempt = 0;

      _wsSub = _ws!.stream.listen(
        _onWsMessage,
        onError: (Object e) {
          _log.w('WSS erro: $e');
          _scheduleReconnect();
        },
        onDone: () {
          _log.w('WSS fechou');
          _scheduleReconnect();
        },
      );
    } catch (e) {
      _log.w('WSS falhou em conectar: $e');
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    _wsSub?.cancel();
    _ws?.sink.close();
    _ws = null;

    _reconnectAttempt = (_reconnectAttempt + 1).clamp(1, 5);
    final delay = Duration(seconds: 2 * (1 << (_reconnectAttempt - 1)));
    final capped = delay > const Duration(seconds: 30)
        ? const Duration(seconds: 30)
        : delay;

    _log.i('WSS reconectando em ${capped.inSeconds}s');
    _reconnectTimer = Timer(capped, _connectWebSocket);
  }

  Future<void> _onWsMessage(dynamic raw) async {
    try {
      final str = raw is String ? raw : utf8.decode(raw as List<int>);
      _log.i('WSS recv: ${str.length > 120 ? "${str.substring(0, 120)}..." : str}');
      final json = jsonDecode(str) as Map<String, dynamic>;
      final event = json['event'] as String?;

      if (event != 'message') {
        _log.d('WSS event ignorado: $event');
        return;
      }

      final title = (json['title'] as String?) ?? 'UNISISM';
      var body = (json['message'] as String?) ?? '';
      String? click = json['click'] as String?;
      String? tipo;

      // Tenta des-aninhar o body se vier como JSON (do NtfyPushProvider)
      try {
        final inner = jsonDecode(body);
        if (inner is Map<String, dynamic>) {
          if (inner['message'] is String) {
            body = inner['message'] as String;
          }
          final meta = inner['meta'];
          if (meta is Map<String, dynamic>) {
            tipo = meta['tipo'] as String?;
            final innerDeep = meta['deepLink'];
            if ((click == null || click.isEmpty) && innerDeep is String) {
              click = innerDeep;
            }
          }
        }
      } catch (_) {
        // body não é JSON — usa raw
      }

      _log.i('📨 push: "$title" · click=${click ?? "-"}');

      final payload = PushPayload(
        titulo: title,
        corpo: body,
        viagemId: _extractViagemId(click),
        tipo: tipo,
      );

      // Emite no stream do app
      _messageCtrl.add(payload);

      // Mostra a notificação local para o usuário ver na barra do celular
      await _local.show(
        DateTime.now().millisecondsSinceEpoch ~/ 1000,
        title,
        body,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            'unisism_motorista_default',
            'Avisos do UNISISM Motorista',
            channelDescription: 'Atualizações sobre viagens, escalas e avisos.',
            importance: Importance.high,
            priority: Priority.high,
          ),
          iOS: DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: true,
            presentSound: true,
          ),
        ),
        payload: jsonEncode({
          'title': title,
          'body': body,
          'deepLink': click,
          'tipo': tipo,
        }),
      );
    } catch (e) {
      _log.w('Falha ao processar mensagem WSS: $e');
    }
  }

  Future<void> _createChannel() async {
    if (!Platform.isAndroid) return;
    final android = _local
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    await android?.createNotificationChannel(_channel);
  }

  static String? _extractViagemId(String? clickUrl) {
    if (clickUrl == null || clickUrl.isEmpty) return null;
    final path = clickUrl.startsWith('http') ? Uri.tryParse(clickUrl)?.path ?? clickUrl : clickUrl;
    
    if (path.startsWith('/viagens/')) {
      return path.replaceFirst('/viagens/', '');
    } else if (path.startsWith('viagens/')) {
      return path.replaceFirst('viagens/', '');
    }
    return null;
  }

  @override
  Future<void> dispose() async {
    _reconnectTimer?.cancel();
    await _wsSub?.cancel();
    await _ws?.sink.close();
    await _tokenCtrl.close();
    await _messageCtrl.close();
    await _openedCtrl.close();
  }
}
