import 'dart:async';

import '../../core/errors/api_exception.dart';
import '../../domain/enums/presenca_passageiro.dart';
import '../../domain/enums/status_viagem.dart';
import '../../domain/models/passageiro.dart';
import '../../domain/models/viagem.dart';
import '../../sync/outbox_kinds.dart';
import '../api/tfd_api.dart';
import '../local/daos/outbox_dao.dart';
import '../local/daos/viagens_dao.dart';

/// Coordena viagens entre cache local (Drift), API e outbox.
///
/// **Contrato**: leituras sempre saem do DB local (sempre disponível,
/// mesmo offline). Mutações escrevem otimisticamente no DB **e**
/// enfileiram na outbox. Quando online, o sync engine drena a outbox.
class ViagensRepository {
  ViagensRepository({
    required this.api,
    required this.viagensDao,
    required this.outboxDao,
  });

  final TfdApi api;
  final ViagensDao viagensDao;
  final OutboxDao outboxDao;

  // ── Leituras (sempre do cache local) ─────────────────────────

  Stream<List<Viagem>> watchDoDia(DateTime dia) =>
      viagensDao.watchDoDia(dia);

  Stream<Viagem?> watchById(String id) => viagensDao.watchById(id);

  Future<List<Viagem>> getProximas() => viagensDao.getProximas();

  Future<List<Viagem>> getHistorico() => viagensDao.getHistorico();

  Future<Viagem?> getById(String id) => viagensDao.getById(id);

  // ── Mutações (escrita otimista + outbox) ─────────────────────

  Future<void> marcarPresenca({
    required String viagemId,
    required String passageiroId,
    required PresencaPassageiro presenca,
    String? observacao,
  }) async {
    await viagensDao.setPresencaLocal(
      passageiroId: passageiroId,
      presenca: presenca,
      observacao: observacao,
    );
    await outboxDao.enqueue(
      op: 'POST',
      path:
          '/motorista-app/viagens/$viagemId/passageiros/$passageiroId/presenca',
      body: {
        'viagemId': viagemId,
        'presenca': presenca.wire,
        'observacao': ?observacao,
      },
      entityKind: OutboxKinds.marcarPresenca,
      entityId: passageiroId,
    );
  }

  Future<void> iniciarViagem({
    required String viagemId,
    required int kmInicialHodometro,
  }) async {
    await viagensDao.setStatusViagemLocal(
      viagemId: viagemId,
      status: StatusViagem.emAndamento,
      kmInicialHodometro: kmInicialHodometro,
      iniciadaEm: DateTime.now(),
    );
    await outboxDao.enqueue(
      op: 'POST',
      path: '/motorista-app/viagens/$viagemId/iniciar',
      body: {'kmInicialHodometro': kmInicialHodometro},
      entityKind: OutboxKinds.iniciarViagem,
      entityId: viagemId,
    );
  }

  Future<void> concluirViagem({
    required String viagemId,
    required int kmFinalHodometro,
  }) async {
    await viagensDao.setStatusViagemLocal(
      viagemId: viagemId,
      status: StatusViagem.concluida,
      kmFinalHodometro: kmFinalHodometro,
      concluidaEm: DateTime.now(),
    );
    await outboxDao.enqueue(
      op: 'POST',
      path: '/motorista-app/viagens/$viagemId/concluir',
      body: {'kmFinalHodometro': kmFinalHodometro},
      entityKind: OutboxKinds.concluirViagem,
      entityId: viagemId,
    );
  }

  // ── Refresh manual (pull-to-refresh) ──────────────────────────

  /// Força um pull e devolve quantas viagens chegaram. Lança
  /// `ApiException.offline` se sem rede.
  Future<int> refresh({DateTime? desde}) async {
    final result = await api.minhasViagens(desde: desde);
    await viagensDao.upsertAll(result.data);
    return result.data.length;
  }

  /// Atalho que retorna a viagem atualizada (sem lançar offline — devolve
  /// `null` quando indisponível e o caller usa o cache).
  Future<Viagem?> refetchOne(String id) async {
    try {
      final v = await api.viagemPorId(id);
      await viagensDao.upsert(v);
      return v;
    } on ApiException catch (e) {
      if (e.isOffline) return null;
      rethrow;
    }
  }

  /// Lista de passageiros de uma viagem específica (computed property).
  List<Passageiro> passageirosOf(Viagem v) => v.passageiros;
}
