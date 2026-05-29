import 'dart:async';
import 'dart:convert';

import '../core/errors/api_exception.dart';
import '../data/api/tfd_api.dart';
import '../data/local/daos/outbox_dao.dart';
import '../data/local/daos/viagens_dao.dart';
import '../data/local/database.dart';
import '../domain/enums/presenca_passageiro.dart';
import 'outbox_kinds.dart';

/// Drena a tabela `outbox` enviando cada mutação ao `TfdApi`. Após cada
/// envio bem-sucedido, marca a entidade local como `dirty=false`.
///
/// **Política de retry**: até 5 tentativas com backoff exponencial
/// (2^n segundos). Erros 409 marcam o registro como CONFLICT — esperam
/// intervenção manual (futura UI de "conflitos").
class OutboxProcessor {
  OutboxProcessor({
    required this.api,
    required this.outboxDao,
    required this.viagensDao,
  });

  final TfdApi api;
  final OutboxDao outboxDao;
  final ViagensDao viagensDao;

  static const _maxAttempts = 5;

  bool _running = false;

  /// Drena tudo que está PENDING/RETRYING. Retorna a quantidade de
  /// envios bem-sucedidos.
  Future<int> drain() async {
    if (_running) return 0;
    _running = true;
    int sent = 0;
    try {
      while (true) {
        final batch = await outboxDao.pending(limit: 20);
        if (batch.isEmpty) break;
        for (final row in batch) {
          final ok = await _process(row);
          if (ok) sent++;
        }
        // Se o backend está fora, evita loop infinito de RETRYING.
        if (batch.every((r) => r.lastError != null)) break;
      }
    } finally {
      _running = false;
    }
    return sent;
  }

  Future<bool> _process(OutboxRow row) async {
    try {
      await _dispatch(row);
      await outboxDao.markDone(row.id);
      await _clearDirty(row);
      return true;
    } on ApiException catch (e) {
      if (e.isConflict) {
        await outboxDao.markFailed(row.id, e.message, conflict: true);
        return false;
      }
      if (e.isOffline) {
        await outboxDao.markRetrying(row.id);
        await outboxDao.markFailed(row.id, e.message);
        return false;
      }
      if (e.isUnauthorized || (e.status != null && e.status! >= 500)) {
        if (row.attempts + 1 >= _maxAttempts) {
          await outboxDao.markFailed(row.id, e.message);
        } else {
          await outboxDao.markRetrying(row.id);
        }
        return false;
      }
      // Erros 4xx restantes (validação, status_invalido): permanentes.
      await outboxDao.markFailed(row.id, '${e.code}: ${e.message}');
      return false;
    } catch (e) {
      if (row.attempts + 1 >= _maxAttempts) {
        await outboxDao.markFailed(row.id, e.toString());
      } else {
        await outboxDao.markRetrying(row.id);
      }
      return false;
    }
  }

  Future<void> _dispatch(OutboxRow row) async {
    final body = row.bodyJson.isEmpty
        ? const <String, dynamic>{}
        : jsonDecode(row.bodyJson) as Map<String, dynamic>;

    switch (row.entityKind) {
      case OutboxKinds.iniciarViagem:
        await api.iniciarViagem(
          viagemId: row.entityId!,
          kmInicialHodometro: body['kmInicialHodometro'] as int,
        );
        return;

      case OutboxKinds.concluirViagem:
        await api.concluirViagem(
          viagemId: row.entityId!,
          kmFinalHodometro: body['kmFinalHodometro'] as int,
        );
        return;

      case OutboxKinds.marcarPresenca:
        await api.marcarPresenca(
          viagemId: body['viagemId'] as String,
          passageiroId: row.entityId!,
          presenca: PresencaPassageiro.fromWire(body['presenca'] as String),
          observacao: body['observacao'] as String?,
        );
        return;

      case OutboxKinds.registrarFcm:
        await api.registrarFcmToken(body['fcmToken'] as String);
        return;

      default:
        throw StateError('OutboxKind desconhecido: ${row.entityKind}');
    }
  }

  Future<void> _clearDirty(OutboxRow row) async {
    switch (row.entityKind) {
      case OutboxKinds.iniciarViagem:
      case OutboxKinds.concluirViagem:
        if (row.entityId != null) {
          await viagensDao.clearDirtyViagem(row.entityId!);
        }
        return;
      case OutboxKinds.marcarPresenca:
        if (row.entityId != null) {
          await viagensDao.clearDirtyPassageiro(row.entityId!);
        }
        return;
    }
  }
}
