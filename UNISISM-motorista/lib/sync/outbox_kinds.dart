/// Tipos de operação enfileiráveis na outbox.
///
/// O `OutboxProcessor` consulta a `OutboxRow.entityKind` para escolher
/// como traduzir o registro de volta em chamada do `TfdApi`.
class OutboxKinds {
  static const iniciarViagem = 'INICIAR_VIAGEM';
  static const concluirViagem = 'CONCLUIR_VIAGEM';
  static const marcarPresenca = 'MARCAR_PRESENCA';
  static const registrarFcm = 'REGISTRAR_FCM';
}
