/// Notificação recebida via push (F15).
class PushPayload {
  const PushPayload({
    required this.titulo,
    required this.corpo,
    this.viagemId,
    this.tipo,
  });

  /// Título exibido na notificação.
  final String titulo;
  final String corpo;

  /// `viagemId` opcional — quando presente, o app navega pro detalhe
  /// dessa viagem ao toque na notificação.
  final String? viagemId;

  /// Tipo livre vindo do backend (ex.: `NOVA_VIAGEM`, `VIAGEM_ALTERADA`,
  /// `VIAGEM_CANCELADA`). Usado para decidir o lado da UI.
  final String? tipo;
}

/// Interface de Push Notifications.
///
/// Tem duas implementações:
/// - [NullPushService] (default): no-op; usado quando o app roda sem
///   Firebase configurado.
/// - `FirebasePushService` (a ser criada): usa `firebase_messaging`
///   quando o projeto tiver `GoogleService-Info.plist` /
///   `google-services.json` configurados. Ver instruções em
///   `BACKEND_REQUIREMENTS.md` e `CLAUDE.md` §13.
abstract class PushService {
  /// Inicializa o serviço (request permissions, attach listeners).
  /// Idempotente — pode ser chamado várias vezes.
  Future<void> init();

  /// Token atual do device — usado pelo backend pra direcionar pushes.
  /// `null` se o serviço ainda não obteve um token.
  Future<String?> token();

  /// Stream de novos tokens (rotação periódica pelo FCM).
  Stream<String> get onTokenRefresh;

  /// Stream de notificações recebidas em **foreground** (app aberto).
  /// Use para refresh de dados na UI ao receber notificação de
  /// "nova viagem alocada".
  Stream<PushPayload> get onMessage;

  /// Stream de notificações **tocadas pelo usuário** (background → opened).
  /// Use para navegar (ex.: abrir detalhe da viagem citada no payload).
  Stream<PushPayload> get onOpened;

  /// Limpa registros locais. Não revoga no servidor.
  Future<void> dispose();
}
