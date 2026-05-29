import 'dart:convert';

import 'package:drift/drift.dart';

import '../../../domain/enums/presenca_passageiro.dart';
import '../../../domain/enums/status_viagem.dart';
import '../../../domain/models/passageiro.dart' as dom;
import '../../../domain/models/viagem.dart';
import '../database.dart';
import '../tables/passageiros_table.dart';
import '../tables/viagens_table.dart';

part 'viagens_dao.g.dart';

@DriftAccessor(tables: [Viagens, Passageiros])
class ViagensDao extends DatabaseAccessor<AppDatabase>
    with _$ViagensDaoMixin {
  ViagensDao(super.db);

  // ── Queries ────────────────────────────────────────────────────

  Future<List<Viagem>> getDoDia(DateTime dia) async {
    final inicio = DateTime(dia.year, dia.month, dia.day);
    final fim = inicio.add(const Duration(days: 1));
    final rows = await (select(viagens)
          ..where((v) => v.data.isBetweenValues(inicio, fim))
          ..orderBy([(v) => OrderingTerm.asc(v.horaSaida)]))
        .get();
    return _hydrateMany(rows);
  }

  Future<List<Viagem>> getProximas({int dias = 14}) async {
    final amanha = DateTime.now()
        .add(const Duration(days: 1))
        .copyWith(hour: 0, minute: 0, second: 0, millisecond: 0);
    final fim = amanha.add(Duration(days: dias));
    final rows = await (select(viagens)
          ..where(
            (v) =>
                v.data.isBetweenValues(amanha, fim) &
                v.status.isIn([
                  StatusViagem.agendada.wire,
                  StatusViagem.emAndamento.wire,
                ]),
          )
          ..orderBy([
            (v) => OrderingTerm.asc(v.data),
            (v) => OrderingTerm.asc(v.horaSaida),
          ]))
        .get();
    return _hydrateMany(rows);
  }

  Future<List<Viagem>> getHistorico({int limit = 50}) async {
    final rows = await (select(viagens)
          ..where(
            (v) => v.status.isIn([
              StatusViagem.concluida.wire,
              StatusViagem.cancelada.wire,
            ]),
          )
          ..orderBy([(v) => OrderingTerm.desc(v.data)])
          ..limit(limit))
        .get();
    return _hydrateMany(rows);
  }

  Future<Viagem?> getById(String id) async {
    final row = await (select(viagens)
          ..where((v) => v.id.equals(id)))
        .getSingleOrNull();
    if (row == null) return null;
    final pax = await _passageirosDe(id);
    return _toDomain(row, pax);
  }

  Stream<Viagem?> watchById(String id) {
    final viagemStream = (select(viagens)..where((v) => v.id.equals(id)))
        .watchSingleOrNull();
    return viagemStream.asyncMap((row) async {
      if (row == null) return null;
      final pax = await _passageirosDe(id);
      return _toDomain(row, pax);
    });
  }

  Stream<List<Viagem>> watchDoDia(DateTime dia) {
    final inicio = DateTime(dia.year, dia.month, dia.day);
    final fim = inicio.add(const Duration(days: 1));
    return (select(viagens)
          ..where((v) => v.data.isBetweenValues(inicio, fim))
          ..orderBy([(v) => OrderingTerm.asc(v.horaSaida)]))
        .watch()
        .asyncMap(_hydrateMany);
  }

  // ── Upserts (chamados pelo sync engine após pull bem-sucedido) ──

  /// Insere ou atualiza uma viagem **inteira** (incluindo passageiros).
  /// Linhas locais marcadas como `dirty` são preservadas — o sync engine
  /// trata reconciliação separadamente.
  Future<void> upsert(Viagem v) async {
    await transaction(() async {
      final existente = await (select(viagens)
            ..where((row) => row.id.equals(v.id)))
          .getSingleOrNull();

      final preservaDirty = existente?.dirty ?? false;

      await into(viagens).insertOnConflictUpdate(_toRow(v, dirty: preservaDirty));

      // Reseta os passageiros da viagem (delete + insert do snapshot).
      // Linhas `dirty` precisam ser preservadas — sync engine decide.
      final dirtyLocais = await (select(passageiros)
            ..where(
              (p) => p.viagemId.equals(v.id) & p.dirty.equals(true),
            ))
          .get();
      final dirtyIds = dirtyLocais.map((d) => d.id).toSet();

      await (delete(passageiros)
            ..where(
              (p) => p.viagemId.equals(v.id) & p.dirty.equals(false),
            ))
          .go();

      for (final p in v.passageiros) {
        if (dirtyIds.contains(p.id)) continue;
        await into(passageiros).insertOnConflictUpdate(
          _passageiroToRow(p, viagemId: v.id, dirty: false),
        );
      }
    });
  }

  Future<void> upsertAll(List<Viagem> vs) async {
    for (final v in vs) {
      await upsert(v);
    }
  }

  // ── Mutações locais (chamam outbox separadamente) ──────────────

  Future<void> setPresencaLocal({
    required String passageiroId,
    required PresencaPassageiro presenca,
    String? observacao,
  }) async {
    await (update(passageiros)..where((p) => p.id.equals(passageiroId))).write(
      PassageirosCompanion(
        presenca: Value(presenca.wire),
        observacao: observacao == null
            ? const Value.absent()
            : Value(observacao),
        marcadoEm: Value(DateTime.now()),
        dirty: const Value(true),
      ),
    );
  }

  Future<void> setStatusViagemLocal({
    required String viagemId,
    required StatusViagem status,
    int? kmInicialHodometro,
    int? kmFinalHodometro,
    DateTime? iniciadaEm,
    DateTime? concluidaEm,
  }) async {
    await (update(viagens)..where((v) => v.id.equals(viagemId))).write(
      ViagensCompanion(
        status: Value(status.wire),
        kmInicialHodometro: kmInicialHodometro == null
            ? const Value.absent()
            : Value(kmInicialHodometro),
        kmFinalHodometro: kmFinalHodometro == null
            ? const Value.absent()
            : Value(kmFinalHodometro),
        iniciadaEm: iniciadaEm == null
            ? const Value.absent()
            : Value(iniciadaEm),
        concluidaEm: concluidaEm == null
            ? const Value.absent()
            : Value(concluidaEm),
        dirty: const Value(true),
      ),
    );
  }

  /// Limpa a flag `dirty` após confirmação do servidor (sync engine).
  Future<void> clearDirtyPassageiro(String id) async {
    await (update(passageiros)..where((p) => p.id.equals(id)))
        .write(const PassageirosCompanion(dirty: Value(false)));
  }

  Future<void> clearDirtyViagem(String id) async {
    await (update(viagens)..where((v) => v.id.equals(id)))
        .write(const ViagensCompanion(dirty: Value(false)));
  }

  // ── Mappers ────────────────────────────────────────────────────

  Future<List<Viagem>> _hydrateMany(List<ViagemRow> rows) async {
    if (rows.isEmpty) return const [];
    final ids = rows.map((r) => r.id).toList();
    final pax = await (select(passageiros)
          ..where((p) => p.viagemId.isIn(ids)))
        .get();
    final byViagem = <String, List<PassageiroRow>>{};
    for (final p in pax) {
      byViagem.putIfAbsent(p.viagemId, () => []).add(p);
    }
    return rows
        .map((r) => _toDomain(r, byViagem[r.id] ?? const []))
        .toList(growable: false);
  }

  Future<List<PassageiroRow>> _passageirosDe(String viagemId) {
    return (select(passageiros)
          ..where((p) => p.viagemId.equals(viagemId)))
        .get();
  }

  Viagem _toDomain(ViagemRow row, List<PassageiroRow> pax) {
    final raw = jsonDecode(row.rawJson) as Map<String, dynamic>;
    // Substitui passageiros do raw por estado atual da tabela
    // (que reflete mutações locais dirty).
    raw['passageiros'] = pax.map(_passageiroRowToJson).toList();
    // Garante que campos críticos da row sobrescrevem o JSON cacheado
    // (caso o sync tenha atualizado colunas mas não o rawJson).
    raw['status'] = row.status;
    if (row.kmInicialHodometro != null) {
      raw['kmInicialHodometro'] = row.kmInicialHodometro;
    }
    if (row.kmFinalHodometro != null) {
      raw['kmFinalHodometro'] = row.kmFinalHodometro;
    }
    raw['iniciadaEm'] = row.iniciadaEm?.toIso8601String();
    raw['concluidaEm'] = row.concluidaEm?.toIso8601String();
    raw['atualizadoEm'] = row.serverUpdatedAt?.toIso8601String();
    return Viagem.fromJson(raw);
  }

  ViagensCompanion _toRow(Viagem v, {required bool dirty}) {
    final json = v.toJson();
    json.remove('passageiros');
    return ViagensCompanion.insert(
      id: v.id,
      protocolo: Value(v.protocolo),
      data: v.data,
      horaSaida: v.horaSaida,
      horaPrevistaRetorno: Value(v.horaPrevistaRetorno),
      destino: v.destino,
      unidadeDestino: Value(v.unidadeDestino),
      veiculoId: v.veiculo.id,
      veiculoPlaca: v.veiculo.placa,
      veiculoModelo: v.veiculo.modelo,
      motoristaId: v.motorista.id,
      vagasTotais: v.vagasTotais,
      kmInicialHodometro: Value(v.kmInicialHodometro),
      kmFinalHodometro: Value(v.kmFinalHodometro),
      status: v.status.wire,
      iniciadaEm: Value(v.iniciadaEm),
      concluidaEm: Value(v.concluidaEm),
      serverUpdatedAt: Value(v.atualizadoEm),
      dirty: Value(dirty),
      rawJson: jsonEncode(json),
    );
  }

  PassageirosCompanion _passageiroToRow(
    dom.Passageiro p, {
    required String viagemId,
    required bool dirty,
  }) {
    return PassageirosCompanion.insert(
      id: p.id,
      viagemId: viagemId,
      pacienteId: p.paciente.id,
      pacienteNome: p.paciente.nome,
      pacienteCpf: p.paciente.cpf,
      solicitacaoProtocolo: p.solicitacao.protocolo,
      solicitacaoPrioridade: p.solicitacao.prioridade.wire,
      acompanhante: Value(p.acompanhante),
      presenca: p.presenca.wire,
      observacao: Value(p.observacao),
      marcadoEm: Value(p.marcadoEm),
      marcadoPor: Value(p.marcadoPor),
      dirty: Value(dirty),
      rawJson: jsonEncode(p.toJson()),
    );
  }

  Map<String, dynamic> _passageiroRowToJson(PassageiroRow row) {
    final raw = jsonDecode(row.rawJson) as Map<String, dynamic>;
    raw['presenca'] = row.presenca;
    raw['observacao'] = row.observacao;
    raw['marcadoEm'] = row.marcadoEm?.toIso8601String();
    raw['marcadoPor'] = row.marcadoPor;
    return raw;
  }
}
