// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'database.dart';

// ignore_for_file: type=lint
class $ViagensTable extends Viagens with TableInfo<$ViagensTable, ViagemRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ViagensTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _protocoloMeta = const VerificationMeta(
    'protocolo',
  );
  @override
  late final GeneratedColumn<String> protocolo = GeneratedColumn<String>(
    'protocolo',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _dataMeta = const VerificationMeta('data');
  @override
  late final GeneratedColumn<DateTime> data = GeneratedColumn<DateTime>(
    'data',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _horaSaidaMeta = const VerificationMeta(
    'horaSaida',
  );
  @override
  late final GeneratedColumn<String> horaSaida = GeneratedColumn<String>(
    'hora_saida',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _horaPrevistaRetornoMeta =
      const VerificationMeta('horaPrevistaRetorno');
  @override
  late final GeneratedColumn<String> horaPrevistaRetorno =
      GeneratedColumn<String>(
        'hora_prevista_retorno',
        aliasedName,
        true,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _destinoMeta = const VerificationMeta(
    'destino',
  );
  @override
  late final GeneratedColumn<String> destino = GeneratedColumn<String>(
    'destino',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _unidadeDestinoMeta = const VerificationMeta(
    'unidadeDestino',
  );
  @override
  late final GeneratedColumn<String> unidadeDestino = GeneratedColumn<String>(
    'unidade_destino',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _veiculoIdMeta = const VerificationMeta(
    'veiculoId',
  );
  @override
  late final GeneratedColumn<String> veiculoId = GeneratedColumn<String>(
    'veiculo_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _veiculoPlacaMeta = const VerificationMeta(
    'veiculoPlaca',
  );
  @override
  late final GeneratedColumn<String> veiculoPlaca = GeneratedColumn<String>(
    'veiculo_placa',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _veiculoModeloMeta = const VerificationMeta(
    'veiculoModelo',
  );
  @override
  late final GeneratedColumn<String> veiculoModelo = GeneratedColumn<String>(
    'veiculo_modelo',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _motoristaIdMeta = const VerificationMeta(
    'motoristaId',
  );
  @override
  late final GeneratedColumn<String> motoristaId = GeneratedColumn<String>(
    'motorista_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _vagasTotaisMeta = const VerificationMeta(
    'vagasTotais',
  );
  @override
  late final GeneratedColumn<int> vagasTotais = GeneratedColumn<int>(
    'vagas_totais',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _kmInicialHodometroMeta =
      const VerificationMeta('kmInicialHodometro');
  @override
  late final GeneratedColumn<int> kmInicialHodometro = GeneratedColumn<int>(
    'km_inicial_hodometro',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _kmFinalHodometroMeta = const VerificationMeta(
    'kmFinalHodometro',
  );
  @override
  late final GeneratedColumn<int> kmFinalHodometro = GeneratedColumn<int>(
    'km_final_hodometro',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _iniciadaEmMeta = const VerificationMeta(
    'iniciadaEm',
  );
  @override
  late final GeneratedColumn<DateTime> iniciadaEm = GeneratedColumn<DateTime>(
    'iniciada_em',
    aliasedName,
    true,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _concluidaEmMeta = const VerificationMeta(
    'concluidaEm',
  );
  @override
  late final GeneratedColumn<DateTime> concluidaEm = GeneratedColumn<DateTime>(
    'concluida_em',
    aliasedName,
    true,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _serverUpdatedAtMeta = const VerificationMeta(
    'serverUpdatedAt',
  );
  @override
  late final GeneratedColumn<DateTime> serverUpdatedAt =
      GeneratedColumn<DateTime>(
        'server_updated_at',
        aliasedName,
        true,
        type: DriftSqlType.dateTime,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _dirtyMeta = const VerificationMeta('dirty');
  @override
  late final GeneratedColumn<bool> dirty = GeneratedColumn<bool>(
    'dirty',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("dirty" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _rawJsonMeta = const VerificationMeta(
    'rawJson',
  );
  @override
  late final GeneratedColumn<String> rawJson = GeneratedColumn<String>(
    'raw_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    protocolo,
    data,
    horaSaida,
    horaPrevistaRetorno,
    destino,
    unidadeDestino,
    veiculoId,
    veiculoPlaca,
    veiculoModelo,
    motoristaId,
    vagasTotais,
    kmInicialHodometro,
    kmFinalHodometro,
    status,
    iniciadaEm,
    concluidaEm,
    serverUpdatedAt,
    dirty,
    rawJson,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'viagens';
  @override
  VerificationContext validateIntegrity(
    Insertable<ViagemRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('protocolo')) {
      context.handle(
        _protocoloMeta,
        protocolo.isAcceptableOrUnknown(data['protocolo']!, _protocoloMeta),
      );
    }
    if (data.containsKey('data')) {
      context.handle(
        _dataMeta,
        this.data.isAcceptableOrUnknown(data['data']!, _dataMeta),
      );
    } else if (isInserting) {
      context.missing(_dataMeta);
    }
    if (data.containsKey('hora_saida')) {
      context.handle(
        _horaSaidaMeta,
        horaSaida.isAcceptableOrUnknown(data['hora_saida']!, _horaSaidaMeta),
      );
    } else if (isInserting) {
      context.missing(_horaSaidaMeta);
    }
    if (data.containsKey('hora_prevista_retorno')) {
      context.handle(
        _horaPrevistaRetornoMeta,
        horaPrevistaRetorno.isAcceptableOrUnknown(
          data['hora_prevista_retorno']!,
          _horaPrevistaRetornoMeta,
        ),
      );
    }
    if (data.containsKey('destino')) {
      context.handle(
        _destinoMeta,
        destino.isAcceptableOrUnknown(data['destino']!, _destinoMeta),
      );
    } else if (isInserting) {
      context.missing(_destinoMeta);
    }
    if (data.containsKey('unidade_destino')) {
      context.handle(
        _unidadeDestinoMeta,
        unidadeDestino.isAcceptableOrUnknown(
          data['unidade_destino']!,
          _unidadeDestinoMeta,
        ),
      );
    }
    if (data.containsKey('veiculo_id')) {
      context.handle(
        _veiculoIdMeta,
        veiculoId.isAcceptableOrUnknown(data['veiculo_id']!, _veiculoIdMeta),
      );
    } else if (isInserting) {
      context.missing(_veiculoIdMeta);
    }
    if (data.containsKey('veiculo_placa')) {
      context.handle(
        _veiculoPlacaMeta,
        veiculoPlaca.isAcceptableOrUnknown(
          data['veiculo_placa']!,
          _veiculoPlacaMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_veiculoPlacaMeta);
    }
    if (data.containsKey('veiculo_modelo')) {
      context.handle(
        _veiculoModeloMeta,
        veiculoModelo.isAcceptableOrUnknown(
          data['veiculo_modelo']!,
          _veiculoModeloMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_veiculoModeloMeta);
    }
    if (data.containsKey('motorista_id')) {
      context.handle(
        _motoristaIdMeta,
        motoristaId.isAcceptableOrUnknown(
          data['motorista_id']!,
          _motoristaIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_motoristaIdMeta);
    }
    if (data.containsKey('vagas_totais')) {
      context.handle(
        _vagasTotaisMeta,
        vagasTotais.isAcceptableOrUnknown(
          data['vagas_totais']!,
          _vagasTotaisMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_vagasTotaisMeta);
    }
    if (data.containsKey('km_inicial_hodometro')) {
      context.handle(
        _kmInicialHodometroMeta,
        kmInicialHodometro.isAcceptableOrUnknown(
          data['km_inicial_hodometro']!,
          _kmInicialHodometroMeta,
        ),
      );
    }
    if (data.containsKey('km_final_hodometro')) {
      context.handle(
        _kmFinalHodometroMeta,
        kmFinalHodometro.isAcceptableOrUnknown(
          data['km_final_hodometro']!,
          _kmFinalHodometroMeta,
        ),
      );
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    } else if (isInserting) {
      context.missing(_statusMeta);
    }
    if (data.containsKey('iniciada_em')) {
      context.handle(
        _iniciadaEmMeta,
        iniciadaEm.isAcceptableOrUnknown(data['iniciada_em']!, _iniciadaEmMeta),
      );
    }
    if (data.containsKey('concluida_em')) {
      context.handle(
        _concluidaEmMeta,
        concluidaEm.isAcceptableOrUnknown(
          data['concluida_em']!,
          _concluidaEmMeta,
        ),
      );
    }
    if (data.containsKey('server_updated_at')) {
      context.handle(
        _serverUpdatedAtMeta,
        serverUpdatedAt.isAcceptableOrUnknown(
          data['server_updated_at']!,
          _serverUpdatedAtMeta,
        ),
      );
    }
    if (data.containsKey('dirty')) {
      context.handle(
        _dirtyMeta,
        dirty.isAcceptableOrUnknown(data['dirty']!, _dirtyMeta),
      );
    }
    if (data.containsKey('raw_json')) {
      context.handle(
        _rawJsonMeta,
        rawJson.isAcceptableOrUnknown(data['raw_json']!, _rawJsonMeta),
      );
    } else if (isInserting) {
      context.missing(_rawJsonMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ViagemRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ViagemRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      protocolo: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}protocolo'],
      ),
      data: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}data'],
      )!,
      horaSaida: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}hora_saida'],
      )!,
      horaPrevistaRetorno: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}hora_prevista_retorno'],
      ),
      destino: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}destino'],
      )!,
      unidadeDestino: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}unidade_destino'],
      ),
      veiculoId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}veiculo_id'],
      )!,
      veiculoPlaca: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}veiculo_placa'],
      )!,
      veiculoModelo: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}veiculo_modelo'],
      )!,
      motoristaId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}motorista_id'],
      )!,
      vagasTotais: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}vagas_totais'],
      )!,
      kmInicialHodometro: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}km_inicial_hodometro'],
      ),
      kmFinalHodometro: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}km_final_hodometro'],
      ),
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      iniciadaEm: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}iniciada_em'],
      ),
      concluidaEm: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}concluida_em'],
      ),
      serverUpdatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}server_updated_at'],
      ),
      dirty: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}dirty'],
      )!,
      rawJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}raw_json'],
      )!,
    );
  }

  @override
  $ViagensTable createAlias(String alias) {
    return $ViagensTable(attachedDatabase, alias);
  }
}

class ViagemRow extends DataClass implements Insertable<ViagemRow> {
  final String id;
  final String? protocolo;
  final DateTime data;
  final String horaSaida;
  final String? horaPrevistaRetorno;
  final String destino;
  final String? unidadeDestino;
  final String veiculoId;
  final String veiculoPlaca;
  final String veiculoModelo;
  final String motoristaId;
  final int vagasTotais;
  final int? kmInicialHodometro;
  final int? kmFinalHodometro;

  /// `StatusViagem.wire` (`AGENDADA`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`).
  final String status;
  final DateTime? iniciadaEm;
  final DateTime? concluidaEm;

  /// Timestamp informado pelo servidor (`atualizadoEm`). Usado pelo sync
  /// engine para decidir merge.
  final DateTime? serverUpdatedAt;

  /// `true` quando a viagem tem mutação local ainda não confirmada pelo
  /// servidor (outbox pendente).
  final bool dirty;

  /// JSON canônico de `Viagem.toJson()` SEM o array `passageiros` (esse
  /// vive na tabela `passageiros`). Usado para reidratar campos não
  /// indexados (`rotaResumo`, `observacoes`, `coordOrigem/Destino` etc.).
  final String rawJson;
  const ViagemRow({
    required this.id,
    this.protocolo,
    required this.data,
    required this.horaSaida,
    this.horaPrevistaRetorno,
    required this.destino,
    this.unidadeDestino,
    required this.veiculoId,
    required this.veiculoPlaca,
    required this.veiculoModelo,
    required this.motoristaId,
    required this.vagasTotais,
    this.kmInicialHodometro,
    this.kmFinalHodometro,
    required this.status,
    this.iniciadaEm,
    this.concluidaEm,
    this.serverUpdatedAt,
    required this.dirty,
    required this.rawJson,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    if (!nullToAbsent || protocolo != null) {
      map['protocolo'] = Variable<String>(protocolo);
    }
    map['data'] = Variable<DateTime>(data);
    map['hora_saida'] = Variable<String>(horaSaida);
    if (!nullToAbsent || horaPrevistaRetorno != null) {
      map['hora_prevista_retorno'] = Variable<String>(horaPrevistaRetorno);
    }
    map['destino'] = Variable<String>(destino);
    if (!nullToAbsent || unidadeDestino != null) {
      map['unidade_destino'] = Variable<String>(unidadeDestino);
    }
    map['veiculo_id'] = Variable<String>(veiculoId);
    map['veiculo_placa'] = Variable<String>(veiculoPlaca);
    map['veiculo_modelo'] = Variable<String>(veiculoModelo);
    map['motorista_id'] = Variable<String>(motoristaId);
    map['vagas_totais'] = Variable<int>(vagasTotais);
    if (!nullToAbsent || kmInicialHodometro != null) {
      map['km_inicial_hodometro'] = Variable<int>(kmInicialHodometro);
    }
    if (!nullToAbsent || kmFinalHodometro != null) {
      map['km_final_hodometro'] = Variable<int>(kmFinalHodometro);
    }
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || iniciadaEm != null) {
      map['iniciada_em'] = Variable<DateTime>(iniciadaEm);
    }
    if (!nullToAbsent || concluidaEm != null) {
      map['concluida_em'] = Variable<DateTime>(concluidaEm);
    }
    if (!nullToAbsent || serverUpdatedAt != null) {
      map['server_updated_at'] = Variable<DateTime>(serverUpdatedAt);
    }
    map['dirty'] = Variable<bool>(dirty);
    map['raw_json'] = Variable<String>(rawJson);
    return map;
  }

  ViagensCompanion toCompanion(bool nullToAbsent) {
    return ViagensCompanion(
      id: Value(id),
      protocolo: protocolo == null && nullToAbsent
          ? const Value.absent()
          : Value(protocolo),
      data: Value(data),
      horaSaida: Value(horaSaida),
      horaPrevistaRetorno: horaPrevistaRetorno == null && nullToAbsent
          ? const Value.absent()
          : Value(horaPrevistaRetorno),
      destino: Value(destino),
      unidadeDestino: unidadeDestino == null && nullToAbsent
          ? const Value.absent()
          : Value(unidadeDestino),
      veiculoId: Value(veiculoId),
      veiculoPlaca: Value(veiculoPlaca),
      veiculoModelo: Value(veiculoModelo),
      motoristaId: Value(motoristaId),
      vagasTotais: Value(vagasTotais),
      kmInicialHodometro: kmInicialHodometro == null && nullToAbsent
          ? const Value.absent()
          : Value(kmInicialHodometro),
      kmFinalHodometro: kmFinalHodometro == null && nullToAbsent
          ? const Value.absent()
          : Value(kmFinalHodometro),
      status: Value(status),
      iniciadaEm: iniciadaEm == null && nullToAbsent
          ? const Value.absent()
          : Value(iniciadaEm),
      concluidaEm: concluidaEm == null && nullToAbsent
          ? const Value.absent()
          : Value(concluidaEm),
      serverUpdatedAt: serverUpdatedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(serverUpdatedAt),
      dirty: Value(dirty),
      rawJson: Value(rawJson),
    );
  }

  factory ViagemRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ViagemRow(
      id: serializer.fromJson<String>(json['id']),
      protocolo: serializer.fromJson<String?>(json['protocolo']),
      data: serializer.fromJson<DateTime>(json['data']),
      horaSaida: serializer.fromJson<String>(json['horaSaida']),
      horaPrevistaRetorno: serializer.fromJson<String?>(
        json['horaPrevistaRetorno'],
      ),
      destino: serializer.fromJson<String>(json['destino']),
      unidadeDestino: serializer.fromJson<String?>(json['unidadeDestino']),
      veiculoId: serializer.fromJson<String>(json['veiculoId']),
      veiculoPlaca: serializer.fromJson<String>(json['veiculoPlaca']),
      veiculoModelo: serializer.fromJson<String>(json['veiculoModelo']),
      motoristaId: serializer.fromJson<String>(json['motoristaId']),
      vagasTotais: serializer.fromJson<int>(json['vagasTotais']),
      kmInicialHodometro: serializer.fromJson<int?>(json['kmInicialHodometro']),
      kmFinalHodometro: serializer.fromJson<int?>(json['kmFinalHodometro']),
      status: serializer.fromJson<String>(json['status']),
      iniciadaEm: serializer.fromJson<DateTime?>(json['iniciadaEm']),
      concluidaEm: serializer.fromJson<DateTime?>(json['concluidaEm']),
      serverUpdatedAt: serializer.fromJson<DateTime?>(json['serverUpdatedAt']),
      dirty: serializer.fromJson<bool>(json['dirty']),
      rawJson: serializer.fromJson<String>(json['rawJson']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'protocolo': serializer.toJson<String?>(protocolo),
      'data': serializer.toJson<DateTime>(data),
      'horaSaida': serializer.toJson<String>(horaSaida),
      'horaPrevistaRetorno': serializer.toJson<String?>(horaPrevistaRetorno),
      'destino': serializer.toJson<String>(destino),
      'unidadeDestino': serializer.toJson<String?>(unidadeDestino),
      'veiculoId': serializer.toJson<String>(veiculoId),
      'veiculoPlaca': serializer.toJson<String>(veiculoPlaca),
      'veiculoModelo': serializer.toJson<String>(veiculoModelo),
      'motoristaId': serializer.toJson<String>(motoristaId),
      'vagasTotais': serializer.toJson<int>(vagasTotais),
      'kmInicialHodometro': serializer.toJson<int?>(kmInicialHodometro),
      'kmFinalHodometro': serializer.toJson<int?>(kmFinalHodometro),
      'status': serializer.toJson<String>(status),
      'iniciadaEm': serializer.toJson<DateTime?>(iniciadaEm),
      'concluidaEm': serializer.toJson<DateTime?>(concluidaEm),
      'serverUpdatedAt': serializer.toJson<DateTime?>(serverUpdatedAt),
      'dirty': serializer.toJson<bool>(dirty),
      'rawJson': serializer.toJson<String>(rawJson),
    };
  }

  ViagemRow copyWith({
    String? id,
    Value<String?> protocolo = const Value.absent(),
    DateTime? data,
    String? horaSaida,
    Value<String?> horaPrevistaRetorno = const Value.absent(),
    String? destino,
    Value<String?> unidadeDestino = const Value.absent(),
    String? veiculoId,
    String? veiculoPlaca,
    String? veiculoModelo,
    String? motoristaId,
    int? vagasTotais,
    Value<int?> kmInicialHodometro = const Value.absent(),
    Value<int?> kmFinalHodometro = const Value.absent(),
    String? status,
    Value<DateTime?> iniciadaEm = const Value.absent(),
    Value<DateTime?> concluidaEm = const Value.absent(),
    Value<DateTime?> serverUpdatedAt = const Value.absent(),
    bool? dirty,
    String? rawJson,
  }) => ViagemRow(
    id: id ?? this.id,
    protocolo: protocolo.present ? protocolo.value : this.protocolo,
    data: data ?? this.data,
    horaSaida: horaSaida ?? this.horaSaida,
    horaPrevistaRetorno: horaPrevistaRetorno.present
        ? horaPrevistaRetorno.value
        : this.horaPrevistaRetorno,
    destino: destino ?? this.destino,
    unidadeDestino: unidadeDestino.present
        ? unidadeDestino.value
        : this.unidadeDestino,
    veiculoId: veiculoId ?? this.veiculoId,
    veiculoPlaca: veiculoPlaca ?? this.veiculoPlaca,
    veiculoModelo: veiculoModelo ?? this.veiculoModelo,
    motoristaId: motoristaId ?? this.motoristaId,
    vagasTotais: vagasTotais ?? this.vagasTotais,
    kmInicialHodometro: kmInicialHodometro.present
        ? kmInicialHodometro.value
        : this.kmInicialHodometro,
    kmFinalHodometro: kmFinalHodometro.present
        ? kmFinalHodometro.value
        : this.kmFinalHodometro,
    status: status ?? this.status,
    iniciadaEm: iniciadaEm.present ? iniciadaEm.value : this.iniciadaEm,
    concluidaEm: concluidaEm.present ? concluidaEm.value : this.concluidaEm,
    serverUpdatedAt: serverUpdatedAt.present
        ? serverUpdatedAt.value
        : this.serverUpdatedAt,
    dirty: dirty ?? this.dirty,
    rawJson: rawJson ?? this.rawJson,
  );
  ViagemRow copyWithCompanion(ViagensCompanion data) {
    return ViagemRow(
      id: data.id.present ? data.id.value : this.id,
      protocolo: data.protocolo.present ? data.protocolo.value : this.protocolo,
      data: data.data.present ? data.data.value : this.data,
      horaSaida: data.horaSaida.present ? data.horaSaida.value : this.horaSaida,
      horaPrevistaRetorno: data.horaPrevistaRetorno.present
          ? data.horaPrevistaRetorno.value
          : this.horaPrevistaRetorno,
      destino: data.destino.present ? data.destino.value : this.destino,
      unidadeDestino: data.unidadeDestino.present
          ? data.unidadeDestino.value
          : this.unidadeDestino,
      veiculoId: data.veiculoId.present ? data.veiculoId.value : this.veiculoId,
      veiculoPlaca: data.veiculoPlaca.present
          ? data.veiculoPlaca.value
          : this.veiculoPlaca,
      veiculoModelo: data.veiculoModelo.present
          ? data.veiculoModelo.value
          : this.veiculoModelo,
      motoristaId: data.motoristaId.present
          ? data.motoristaId.value
          : this.motoristaId,
      vagasTotais: data.vagasTotais.present
          ? data.vagasTotais.value
          : this.vagasTotais,
      kmInicialHodometro: data.kmInicialHodometro.present
          ? data.kmInicialHodometro.value
          : this.kmInicialHodometro,
      kmFinalHodometro: data.kmFinalHodometro.present
          ? data.kmFinalHodometro.value
          : this.kmFinalHodometro,
      status: data.status.present ? data.status.value : this.status,
      iniciadaEm: data.iniciadaEm.present
          ? data.iniciadaEm.value
          : this.iniciadaEm,
      concluidaEm: data.concluidaEm.present
          ? data.concluidaEm.value
          : this.concluidaEm,
      serverUpdatedAt: data.serverUpdatedAt.present
          ? data.serverUpdatedAt.value
          : this.serverUpdatedAt,
      dirty: data.dirty.present ? data.dirty.value : this.dirty,
      rawJson: data.rawJson.present ? data.rawJson.value : this.rawJson,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ViagemRow(')
          ..write('id: $id, ')
          ..write('protocolo: $protocolo, ')
          ..write('data: $data, ')
          ..write('horaSaida: $horaSaida, ')
          ..write('horaPrevistaRetorno: $horaPrevistaRetorno, ')
          ..write('destino: $destino, ')
          ..write('unidadeDestino: $unidadeDestino, ')
          ..write('veiculoId: $veiculoId, ')
          ..write('veiculoPlaca: $veiculoPlaca, ')
          ..write('veiculoModelo: $veiculoModelo, ')
          ..write('motoristaId: $motoristaId, ')
          ..write('vagasTotais: $vagasTotais, ')
          ..write('kmInicialHodometro: $kmInicialHodometro, ')
          ..write('kmFinalHodometro: $kmFinalHodometro, ')
          ..write('status: $status, ')
          ..write('iniciadaEm: $iniciadaEm, ')
          ..write('concluidaEm: $concluidaEm, ')
          ..write('serverUpdatedAt: $serverUpdatedAt, ')
          ..write('dirty: $dirty, ')
          ..write('rawJson: $rawJson')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    protocolo,
    data,
    horaSaida,
    horaPrevistaRetorno,
    destino,
    unidadeDestino,
    veiculoId,
    veiculoPlaca,
    veiculoModelo,
    motoristaId,
    vagasTotais,
    kmInicialHodometro,
    kmFinalHodometro,
    status,
    iniciadaEm,
    concluidaEm,
    serverUpdatedAt,
    dirty,
    rawJson,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ViagemRow &&
          other.id == this.id &&
          other.protocolo == this.protocolo &&
          other.data == this.data &&
          other.horaSaida == this.horaSaida &&
          other.horaPrevistaRetorno == this.horaPrevistaRetorno &&
          other.destino == this.destino &&
          other.unidadeDestino == this.unidadeDestino &&
          other.veiculoId == this.veiculoId &&
          other.veiculoPlaca == this.veiculoPlaca &&
          other.veiculoModelo == this.veiculoModelo &&
          other.motoristaId == this.motoristaId &&
          other.vagasTotais == this.vagasTotais &&
          other.kmInicialHodometro == this.kmInicialHodometro &&
          other.kmFinalHodometro == this.kmFinalHodometro &&
          other.status == this.status &&
          other.iniciadaEm == this.iniciadaEm &&
          other.concluidaEm == this.concluidaEm &&
          other.serverUpdatedAt == this.serverUpdatedAt &&
          other.dirty == this.dirty &&
          other.rawJson == this.rawJson);
}

class ViagensCompanion extends UpdateCompanion<ViagemRow> {
  final Value<String> id;
  final Value<String?> protocolo;
  final Value<DateTime> data;
  final Value<String> horaSaida;
  final Value<String?> horaPrevistaRetorno;
  final Value<String> destino;
  final Value<String?> unidadeDestino;
  final Value<String> veiculoId;
  final Value<String> veiculoPlaca;
  final Value<String> veiculoModelo;
  final Value<String> motoristaId;
  final Value<int> vagasTotais;
  final Value<int?> kmInicialHodometro;
  final Value<int?> kmFinalHodometro;
  final Value<String> status;
  final Value<DateTime?> iniciadaEm;
  final Value<DateTime?> concluidaEm;
  final Value<DateTime?> serverUpdatedAt;
  final Value<bool> dirty;
  final Value<String> rawJson;
  final Value<int> rowid;
  const ViagensCompanion({
    this.id = const Value.absent(),
    this.protocolo = const Value.absent(),
    this.data = const Value.absent(),
    this.horaSaida = const Value.absent(),
    this.horaPrevistaRetorno = const Value.absent(),
    this.destino = const Value.absent(),
    this.unidadeDestino = const Value.absent(),
    this.veiculoId = const Value.absent(),
    this.veiculoPlaca = const Value.absent(),
    this.veiculoModelo = const Value.absent(),
    this.motoristaId = const Value.absent(),
    this.vagasTotais = const Value.absent(),
    this.kmInicialHodometro = const Value.absent(),
    this.kmFinalHodometro = const Value.absent(),
    this.status = const Value.absent(),
    this.iniciadaEm = const Value.absent(),
    this.concluidaEm = const Value.absent(),
    this.serverUpdatedAt = const Value.absent(),
    this.dirty = const Value.absent(),
    this.rawJson = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ViagensCompanion.insert({
    required String id,
    this.protocolo = const Value.absent(),
    required DateTime data,
    required String horaSaida,
    this.horaPrevistaRetorno = const Value.absent(),
    required String destino,
    this.unidadeDestino = const Value.absent(),
    required String veiculoId,
    required String veiculoPlaca,
    required String veiculoModelo,
    required String motoristaId,
    required int vagasTotais,
    this.kmInicialHodometro = const Value.absent(),
    this.kmFinalHodometro = const Value.absent(),
    required String status,
    this.iniciadaEm = const Value.absent(),
    this.concluidaEm = const Value.absent(),
    this.serverUpdatedAt = const Value.absent(),
    this.dirty = const Value.absent(),
    required String rawJson,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       data = Value(data),
       horaSaida = Value(horaSaida),
       destino = Value(destino),
       veiculoId = Value(veiculoId),
       veiculoPlaca = Value(veiculoPlaca),
       veiculoModelo = Value(veiculoModelo),
       motoristaId = Value(motoristaId),
       vagasTotais = Value(vagasTotais),
       status = Value(status),
       rawJson = Value(rawJson);
  static Insertable<ViagemRow> custom({
    Expression<String>? id,
    Expression<String>? protocolo,
    Expression<DateTime>? data,
    Expression<String>? horaSaida,
    Expression<String>? horaPrevistaRetorno,
    Expression<String>? destino,
    Expression<String>? unidadeDestino,
    Expression<String>? veiculoId,
    Expression<String>? veiculoPlaca,
    Expression<String>? veiculoModelo,
    Expression<String>? motoristaId,
    Expression<int>? vagasTotais,
    Expression<int>? kmInicialHodometro,
    Expression<int>? kmFinalHodometro,
    Expression<String>? status,
    Expression<DateTime>? iniciadaEm,
    Expression<DateTime>? concluidaEm,
    Expression<DateTime>? serverUpdatedAt,
    Expression<bool>? dirty,
    Expression<String>? rawJson,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (protocolo != null) 'protocolo': protocolo,
      if (data != null) 'data': data,
      if (horaSaida != null) 'hora_saida': horaSaida,
      if (horaPrevistaRetorno != null)
        'hora_prevista_retorno': horaPrevistaRetorno,
      if (destino != null) 'destino': destino,
      if (unidadeDestino != null) 'unidade_destino': unidadeDestino,
      if (veiculoId != null) 'veiculo_id': veiculoId,
      if (veiculoPlaca != null) 'veiculo_placa': veiculoPlaca,
      if (veiculoModelo != null) 'veiculo_modelo': veiculoModelo,
      if (motoristaId != null) 'motorista_id': motoristaId,
      if (vagasTotais != null) 'vagas_totais': vagasTotais,
      if (kmInicialHodometro != null)
        'km_inicial_hodometro': kmInicialHodometro,
      if (kmFinalHodometro != null) 'km_final_hodometro': kmFinalHodometro,
      if (status != null) 'status': status,
      if (iniciadaEm != null) 'iniciada_em': iniciadaEm,
      if (concluidaEm != null) 'concluida_em': concluidaEm,
      if (serverUpdatedAt != null) 'server_updated_at': serverUpdatedAt,
      if (dirty != null) 'dirty': dirty,
      if (rawJson != null) 'raw_json': rawJson,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ViagensCompanion copyWith({
    Value<String>? id,
    Value<String?>? protocolo,
    Value<DateTime>? data,
    Value<String>? horaSaida,
    Value<String?>? horaPrevistaRetorno,
    Value<String>? destino,
    Value<String?>? unidadeDestino,
    Value<String>? veiculoId,
    Value<String>? veiculoPlaca,
    Value<String>? veiculoModelo,
    Value<String>? motoristaId,
    Value<int>? vagasTotais,
    Value<int?>? kmInicialHodometro,
    Value<int?>? kmFinalHodometro,
    Value<String>? status,
    Value<DateTime?>? iniciadaEm,
    Value<DateTime?>? concluidaEm,
    Value<DateTime?>? serverUpdatedAt,
    Value<bool>? dirty,
    Value<String>? rawJson,
    Value<int>? rowid,
  }) {
    return ViagensCompanion(
      id: id ?? this.id,
      protocolo: protocolo ?? this.protocolo,
      data: data ?? this.data,
      horaSaida: horaSaida ?? this.horaSaida,
      horaPrevistaRetorno: horaPrevistaRetorno ?? this.horaPrevistaRetorno,
      destino: destino ?? this.destino,
      unidadeDestino: unidadeDestino ?? this.unidadeDestino,
      veiculoId: veiculoId ?? this.veiculoId,
      veiculoPlaca: veiculoPlaca ?? this.veiculoPlaca,
      veiculoModelo: veiculoModelo ?? this.veiculoModelo,
      motoristaId: motoristaId ?? this.motoristaId,
      vagasTotais: vagasTotais ?? this.vagasTotais,
      kmInicialHodometro: kmInicialHodometro ?? this.kmInicialHodometro,
      kmFinalHodometro: kmFinalHodometro ?? this.kmFinalHodometro,
      status: status ?? this.status,
      iniciadaEm: iniciadaEm ?? this.iniciadaEm,
      concluidaEm: concluidaEm ?? this.concluidaEm,
      serverUpdatedAt: serverUpdatedAt ?? this.serverUpdatedAt,
      dirty: dirty ?? this.dirty,
      rawJson: rawJson ?? this.rawJson,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (protocolo.present) {
      map['protocolo'] = Variable<String>(protocolo.value);
    }
    if (data.present) {
      map['data'] = Variable<DateTime>(data.value);
    }
    if (horaSaida.present) {
      map['hora_saida'] = Variable<String>(horaSaida.value);
    }
    if (horaPrevistaRetorno.present) {
      map['hora_prevista_retorno'] = Variable<String>(
        horaPrevistaRetorno.value,
      );
    }
    if (destino.present) {
      map['destino'] = Variable<String>(destino.value);
    }
    if (unidadeDestino.present) {
      map['unidade_destino'] = Variable<String>(unidadeDestino.value);
    }
    if (veiculoId.present) {
      map['veiculo_id'] = Variable<String>(veiculoId.value);
    }
    if (veiculoPlaca.present) {
      map['veiculo_placa'] = Variable<String>(veiculoPlaca.value);
    }
    if (veiculoModelo.present) {
      map['veiculo_modelo'] = Variable<String>(veiculoModelo.value);
    }
    if (motoristaId.present) {
      map['motorista_id'] = Variable<String>(motoristaId.value);
    }
    if (vagasTotais.present) {
      map['vagas_totais'] = Variable<int>(vagasTotais.value);
    }
    if (kmInicialHodometro.present) {
      map['km_inicial_hodometro'] = Variable<int>(kmInicialHodometro.value);
    }
    if (kmFinalHodometro.present) {
      map['km_final_hodometro'] = Variable<int>(kmFinalHodometro.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (iniciadaEm.present) {
      map['iniciada_em'] = Variable<DateTime>(iniciadaEm.value);
    }
    if (concluidaEm.present) {
      map['concluida_em'] = Variable<DateTime>(concluidaEm.value);
    }
    if (serverUpdatedAt.present) {
      map['server_updated_at'] = Variable<DateTime>(serverUpdatedAt.value);
    }
    if (dirty.present) {
      map['dirty'] = Variable<bool>(dirty.value);
    }
    if (rawJson.present) {
      map['raw_json'] = Variable<String>(rawJson.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ViagensCompanion(')
          ..write('id: $id, ')
          ..write('protocolo: $protocolo, ')
          ..write('data: $data, ')
          ..write('horaSaida: $horaSaida, ')
          ..write('horaPrevistaRetorno: $horaPrevistaRetorno, ')
          ..write('destino: $destino, ')
          ..write('unidadeDestino: $unidadeDestino, ')
          ..write('veiculoId: $veiculoId, ')
          ..write('veiculoPlaca: $veiculoPlaca, ')
          ..write('veiculoModelo: $veiculoModelo, ')
          ..write('motoristaId: $motoristaId, ')
          ..write('vagasTotais: $vagasTotais, ')
          ..write('kmInicialHodometro: $kmInicialHodometro, ')
          ..write('kmFinalHodometro: $kmFinalHodometro, ')
          ..write('status: $status, ')
          ..write('iniciadaEm: $iniciadaEm, ')
          ..write('concluidaEm: $concluidaEm, ')
          ..write('serverUpdatedAt: $serverUpdatedAt, ')
          ..write('dirty: $dirty, ')
          ..write('rawJson: $rawJson, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $PassageirosTable extends Passageiros
    with TableInfo<$PassageirosTable, PassageiroRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $PassageirosTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _viagemIdMeta = const VerificationMeta(
    'viagemId',
  );
  @override
  late final GeneratedColumn<String> viagemId = GeneratedColumn<String>(
    'viagem_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES viagens (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _pacienteIdMeta = const VerificationMeta(
    'pacienteId',
  );
  @override
  late final GeneratedColumn<String> pacienteId = GeneratedColumn<String>(
    'paciente_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _pacienteNomeMeta = const VerificationMeta(
    'pacienteNome',
  );
  @override
  late final GeneratedColumn<String> pacienteNome = GeneratedColumn<String>(
    'paciente_nome',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _pacienteCpfMeta = const VerificationMeta(
    'pacienteCpf',
  );
  @override
  late final GeneratedColumn<String> pacienteCpf = GeneratedColumn<String>(
    'paciente_cpf',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _solicitacaoProtocoloMeta =
      const VerificationMeta('solicitacaoProtocolo');
  @override
  late final GeneratedColumn<String> solicitacaoProtocolo =
      GeneratedColumn<String>(
        'solicitacao_protocolo',
        aliasedName,
        false,
        type: DriftSqlType.string,
        requiredDuringInsert: true,
      );
  static const VerificationMeta _solicitacaoPrioridadeMeta =
      const VerificationMeta('solicitacaoPrioridade');
  @override
  late final GeneratedColumn<String> solicitacaoPrioridade =
      GeneratedColumn<String>(
        'solicitacao_prioridade',
        aliasedName,
        false,
        type: DriftSqlType.string,
        requiredDuringInsert: true,
      );
  static const VerificationMeta _acompanhanteMeta = const VerificationMeta(
    'acompanhante',
  );
  @override
  late final GeneratedColumn<bool> acompanhante = GeneratedColumn<bool>(
    'acompanhante',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("acompanhante" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _presencaMeta = const VerificationMeta(
    'presenca',
  );
  @override
  late final GeneratedColumn<String> presenca = GeneratedColumn<String>(
    'presenca',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _observacaoMeta = const VerificationMeta(
    'observacao',
  );
  @override
  late final GeneratedColumn<String> observacao = GeneratedColumn<String>(
    'observacao',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _marcadoEmMeta = const VerificationMeta(
    'marcadoEm',
  );
  @override
  late final GeneratedColumn<DateTime> marcadoEm = GeneratedColumn<DateTime>(
    'marcado_em',
    aliasedName,
    true,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _marcadoPorMeta = const VerificationMeta(
    'marcadoPor',
  );
  @override
  late final GeneratedColumn<String> marcadoPor = GeneratedColumn<String>(
    'marcado_por',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _dirtyMeta = const VerificationMeta('dirty');
  @override
  late final GeneratedColumn<bool> dirty = GeneratedColumn<bool>(
    'dirty',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("dirty" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _rawJsonMeta = const VerificationMeta(
    'rawJson',
  );
  @override
  late final GeneratedColumn<String> rawJson = GeneratedColumn<String>(
    'raw_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    viagemId,
    pacienteId,
    pacienteNome,
    pacienteCpf,
    solicitacaoProtocolo,
    solicitacaoPrioridade,
    acompanhante,
    presenca,
    observacao,
    marcadoEm,
    marcadoPor,
    dirty,
    rawJson,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'passageiros';
  @override
  VerificationContext validateIntegrity(
    Insertable<PassageiroRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('viagem_id')) {
      context.handle(
        _viagemIdMeta,
        viagemId.isAcceptableOrUnknown(data['viagem_id']!, _viagemIdMeta),
      );
    } else if (isInserting) {
      context.missing(_viagemIdMeta);
    }
    if (data.containsKey('paciente_id')) {
      context.handle(
        _pacienteIdMeta,
        pacienteId.isAcceptableOrUnknown(data['paciente_id']!, _pacienteIdMeta),
      );
    } else if (isInserting) {
      context.missing(_pacienteIdMeta);
    }
    if (data.containsKey('paciente_nome')) {
      context.handle(
        _pacienteNomeMeta,
        pacienteNome.isAcceptableOrUnknown(
          data['paciente_nome']!,
          _pacienteNomeMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_pacienteNomeMeta);
    }
    if (data.containsKey('paciente_cpf')) {
      context.handle(
        _pacienteCpfMeta,
        pacienteCpf.isAcceptableOrUnknown(
          data['paciente_cpf']!,
          _pacienteCpfMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_pacienteCpfMeta);
    }
    if (data.containsKey('solicitacao_protocolo')) {
      context.handle(
        _solicitacaoProtocoloMeta,
        solicitacaoProtocolo.isAcceptableOrUnknown(
          data['solicitacao_protocolo']!,
          _solicitacaoProtocoloMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_solicitacaoProtocoloMeta);
    }
    if (data.containsKey('solicitacao_prioridade')) {
      context.handle(
        _solicitacaoPrioridadeMeta,
        solicitacaoPrioridade.isAcceptableOrUnknown(
          data['solicitacao_prioridade']!,
          _solicitacaoPrioridadeMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_solicitacaoPrioridadeMeta);
    }
    if (data.containsKey('acompanhante')) {
      context.handle(
        _acompanhanteMeta,
        acompanhante.isAcceptableOrUnknown(
          data['acompanhante']!,
          _acompanhanteMeta,
        ),
      );
    }
    if (data.containsKey('presenca')) {
      context.handle(
        _presencaMeta,
        presenca.isAcceptableOrUnknown(data['presenca']!, _presencaMeta),
      );
    } else if (isInserting) {
      context.missing(_presencaMeta);
    }
    if (data.containsKey('observacao')) {
      context.handle(
        _observacaoMeta,
        observacao.isAcceptableOrUnknown(data['observacao']!, _observacaoMeta),
      );
    }
    if (data.containsKey('marcado_em')) {
      context.handle(
        _marcadoEmMeta,
        marcadoEm.isAcceptableOrUnknown(data['marcado_em']!, _marcadoEmMeta),
      );
    }
    if (data.containsKey('marcado_por')) {
      context.handle(
        _marcadoPorMeta,
        marcadoPor.isAcceptableOrUnknown(data['marcado_por']!, _marcadoPorMeta),
      );
    }
    if (data.containsKey('dirty')) {
      context.handle(
        _dirtyMeta,
        dirty.isAcceptableOrUnknown(data['dirty']!, _dirtyMeta),
      );
    }
    if (data.containsKey('raw_json')) {
      context.handle(
        _rawJsonMeta,
        rawJson.isAcceptableOrUnknown(data['raw_json']!, _rawJsonMeta),
      );
    } else if (isInserting) {
      context.missing(_rawJsonMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  PassageiroRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return PassageiroRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      viagemId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}viagem_id'],
      )!,
      pacienteId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}paciente_id'],
      )!,
      pacienteNome: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}paciente_nome'],
      )!,
      pacienteCpf: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}paciente_cpf'],
      )!,
      solicitacaoProtocolo: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}solicitacao_protocolo'],
      )!,
      solicitacaoPrioridade: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}solicitacao_prioridade'],
      )!,
      acompanhante: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}acompanhante'],
      )!,
      presenca: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}presenca'],
      )!,
      observacao: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}observacao'],
      ),
      marcadoEm: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}marcado_em'],
      ),
      marcadoPor: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}marcado_por'],
      ),
      dirty: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}dirty'],
      )!,
      rawJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}raw_json'],
      )!,
    );
  }

  @override
  $PassageirosTable createAlias(String alias) {
    return $PassageirosTable(attachedDatabase, alias);
  }
}

class PassageiroRow extends DataClass implements Insertable<PassageiroRow> {
  final String id;
  final String viagemId;
  final String pacienteId;
  final String pacienteNome;
  final String pacienteCpf;
  final String solicitacaoProtocolo;
  final String solicitacaoPrioridade;
  final bool acompanhante;

  /// `PresencaPassageiro.wire`.
  final String presenca;
  final String? observacao;
  final DateTime? marcadoEm;
  final String? marcadoPor;
  final bool dirty;

  /// JSON canônico de `Passageiro.toJson()` — usado pra reidratar foto,
  /// dataNascimento, observacoesMobilidade, etc.
  final String rawJson;
  const PassageiroRow({
    required this.id,
    required this.viagemId,
    required this.pacienteId,
    required this.pacienteNome,
    required this.pacienteCpf,
    required this.solicitacaoProtocolo,
    required this.solicitacaoPrioridade,
    required this.acompanhante,
    required this.presenca,
    this.observacao,
    this.marcadoEm,
    this.marcadoPor,
    required this.dirty,
    required this.rawJson,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['viagem_id'] = Variable<String>(viagemId);
    map['paciente_id'] = Variable<String>(pacienteId);
    map['paciente_nome'] = Variable<String>(pacienteNome);
    map['paciente_cpf'] = Variable<String>(pacienteCpf);
    map['solicitacao_protocolo'] = Variable<String>(solicitacaoProtocolo);
    map['solicitacao_prioridade'] = Variable<String>(solicitacaoPrioridade);
    map['acompanhante'] = Variable<bool>(acompanhante);
    map['presenca'] = Variable<String>(presenca);
    if (!nullToAbsent || observacao != null) {
      map['observacao'] = Variable<String>(observacao);
    }
    if (!nullToAbsent || marcadoEm != null) {
      map['marcado_em'] = Variable<DateTime>(marcadoEm);
    }
    if (!nullToAbsent || marcadoPor != null) {
      map['marcado_por'] = Variable<String>(marcadoPor);
    }
    map['dirty'] = Variable<bool>(dirty);
    map['raw_json'] = Variable<String>(rawJson);
    return map;
  }

  PassageirosCompanion toCompanion(bool nullToAbsent) {
    return PassageirosCompanion(
      id: Value(id),
      viagemId: Value(viagemId),
      pacienteId: Value(pacienteId),
      pacienteNome: Value(pacienteNome),
      pacienteCpf: Value(pacienteCpf),
      solicitacaoProtocolo: Value(solicitacaoProtocolo),
      solicitacaoPrioridade: Value(solicitacaoPrioridade),
      acompanhante: Value(acompanhante),
      presenca: Value(presenca),
      observacao: observacao == null && nullToAbsent
          ? const Value.absent()
          : Value(observacao),
      marcadoEm: marcadoEm == null && nullToAbsent
          ? const Value.absent()
          : Value(marcadoEm),
      marcadoPor: marcadoPor == null && nullToAbsent
          ? const Value.absent()
          : Value(marcadoPor),
      dirty: Value(dirty),
      rawJson: Value(rawJson),
    );
  }

  factory PassageiroRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return PassageiroRow(
      id: serializer.fromJson<String>(json['id']),
      viagemId: serializer.fromJson<String>(json['viagemId']),
      pacienteId: serializer.fromJson<String>(json['pacienteId']),
      pacienteNome: serializer.fromJson<String>(json['pacienteNome']),
      pacienteCpf: serializer.fromJson<String>(json['pacienteCpf']),
      solicitacaoProtocolo: serializer.fromJson<String>(
        json['solicitacaoProtocolo'],
      ),
      solicitacaoPrioridade: serializer.fromJson<String>(
        json['solicitacaoPrioridade'],
      ),
      acompanhante: serializer.fromJson<bool>(json['acompanhante']),
      presenca: serializer.fromJson<String>(json['presenca']),
      observacao: serializer.fromJson<String?>(json['observacao']),
      marcadoEm: serializer.fromJson<DateTime?>(json['marcadoEm']),
      marcadoPor: serializer.fromJson<String?>(json['marcadoPor']),
      dirty: serializer.fromJson<bool>(json['dirty']),
      rawJson: serializer.fromJson<String>(json['rawJson']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'viagemId': serializer.toJson<String>(viagemId),
      'pacienteId': serializer.toJson<String>(pacienteId),
      'pacienteNome': serializer.toJson<String>(pacienteNome),
      'pacienteCpf': serializer.toJson<String>(pacienteCpf),
      'solicitacaoProtocolo': serializer.toJson<String>(solicitacaoProtocolo),
      'solicitacaoPrioridade': serializer.toJson<String>(solicitacaoPrioridade),
      'acompanhante': serializer.toJson<bool>(acompanhante),
      'presenca': serializer.toJson<String>(presenca),
      'observacao': serializer.toJson<String?>(observacao),
      'marcadoEm': serializer.toJson<DateTime?>(marcadoEm),
      'marcadoPor': serializer.toJson<String?>(marcadoPor),
      'dirty': serializer.toJson<bool>(dirty),
      'rawJson': serializer.toJson<String>(rawJson),
    };
  }

  PassageiroRow copyWith({
    String? id,
    String? viagemId,
    String? pacienteId,
    String? pacienteNome,
    String? pacienteCpf,
    String? solicitacaoProtocolo,
    String? solicitacaoPrioridade,
    bool? acompanhante,
    String? presenca,
    Value<String?> observacao = const Value.absent(),
    Value<DateTime?> marcadoEm = const Value.absent(),
    Value<String?> marcadoPor = const Value.absent(),
    bool? dirty,
    String? rawJson,
  }) => PassageiroRow(
    id: id ?? this.id,
    viagemId: viagemId ?? this.viagemId,
    pacienteId: pacienteId ?? this.pacienteId,
    pacienteNome: pacienteNome ?? this.pacienteNome,
    pacienteCpf: pacienteCpf ?? this.pacienteCpf,
    solicitacaoProtocolo: solicitacaoProtocolo ?? this.solicitacaoProtocolo,
    solicitacaoPrioridade: solicitacaoPrioridade ?? this.solicitacaoPrioridade,
    acompanhante: acompanhante ?? this.acompanhante,
    presenca: presenca ?? this.presenca,
    observacao: observacao.present ? observacao.value : this.observacao,
    marcadoEm: marcadoEm.present ? marcadoEm.value : this.marcadoEm,
    marcadoPor: marcadoPor.present ? marcadoPor.value : this.marcadoPor,
    dirty: dirty ?? this.dirty,
    rawJson: rawJson ?? this.rawJson,
  );
  PassageiroRow copyWithCompanion(PassageirosCompanion data) {
    return PassageiroRow(
      id: data.id.present ? data.id.value : this.id,
      viagemId: data.viagemId.present ? data.viagemId.value : this.viagemId,
      pacienteId: data.pacienteId.present
          ? data.pacienteId.value
          : this.pacienteId,
      pacienteNome: data.pacienteNome.present
          ? data.pacienteNome.value
          : this.pacienteNome,
      pacienteCpf: data.pacienteCpf.present
          ? data.pacienteCpf.value
          : this.pacienteCpf,
      solicitacaoProtocolo: data.solicitacaoProtocolo.present
          ? data.solicitacaoProtocolo.value
          : this.solicitacaoProtocolo,
      solicitacaoPrioridade: data.solicitacaoPrioridade.present
          ? data.solicitacaoPrioridade.value
          : this.solicitacaoPrioridade,
      acompanhante: data.acompanhante.present
          ? data.acompanhante.value
          : this.acompanhante,
      presenca: data.presenca.present ? data.presenca.value : this.presenca,
      observacao: data.observacao.present
          ? data.observacao.value
          : this.observacao,
      marcadoEm: data.marcadoEm.present ? data.marcadoEm.value : this.marcadoEm,
      marcadoPor: data.marcadoPor.present
          ? data.marcadoPor.value
          : this.marcadoPor,
      dirty: data.dirty.present ? data.dirty.value : this.dirty,
      rawJson: data.rawJson.present ? data.rawJson.value : this.rawJson,
    );
  }

  @override
  String toString() {
    return (StringBuffer('PassageiroRow(')
          ..write('id: $id, ')
          ..write('viagemId: $viagemId, ')
          ..write('pacienteId: $pacienteId, ')
          ..write('pacienteNome: $pacienteNome, ')
          ..write('pacienteCpf: $pacienteCpf, ')
          ..write('solicitacaoProtocolo: $solicitacaoProtocolo, ')
          ..write('solicitacaoPrioridade: $solicitacaoPrioridade, ')
          ..write('acompanhante: $acompanhante, ')
          ..write('presenca: $presenca, ')
          ..write('observacao: $observacao, ')
          ..write('marcadoEm: $marcadoEm, ')
          ..write('marcadoPor: $marcadoPor, ')
          ..write('dirty: $dirty, ')
          ..write('rawJson: $rawJson')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    viagemId,
    pacienteId,
    pacienteNome,
    pacienteCpf,
    solicitacaoProtocolo,
    solicitacaoPrioridade,
    acompanhante,
    presenca,
    observacao,
    marcadoEm,
    marcadoPor,
    dirty,
    rawJson,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PassageiroRow &&
          other.id == this.id &&
          other.viagemId == this.viagemId &&
          other.pacienteId == this.pacienteId &&
          other.pacienteNome == this.pacienteNome &&
          other.pacienteCpf == this.pacienteCpf &&
          other.solicitacaoProtocolo == this.solicitacaoProtocolo &&
          other.solicitacaoPrioridade == this.solicitacaoPrioridade &&
          other.acompanhante == this.acompanhante &&
          other.presenca == this.presenca &&
          other.observacao == this.observacao &&
          other.marcadoEm == this.marcadoEm &&
          other.marcadoPor == this.marcadoPor &&
          other.dirty == this.dirty &&
          other.rawJson == this.rawJson);
}

class PassageirosCompanion extends UpdateCompanion<PassageiroRow> {
  final Value<String> id;
  final Value<String> viagemId;
  final Value<String> pacienteId;
  final Value<String> pacienteNome;
  final Value<String> pacienteCpf;
  final Value<String> solicitacaoProtocolo;
  final Value<String> solicitacaoPrioridade;
  final Value<bool> acompanhante;
  final Value<String> presenca;
  final Value<String?> observacao;
  final Value<DateTime?> marcadoEm;
  final Value<String?> marcadoPor;
  final Value<bool> dirty;
  final Value<String> rawJson;
  final Value<int> rowid;
  const PassageirosCompanion({
    this.id = const Value.absent(),
    this.viagemId = const Value.absent(),
    this.pacienteId = const Value.absent(),
    this.pacienteNome = const Value.absent(),
    this.pacienteCpf = const Value.absent(),
    this.solicitacaoProtocolo = const Value.absent(),
    this.solicitacaoPrioridade = const Value.absent(),
    this.acompanhante = const Value.absent(),
    this.presenca = const Value.absent(),
    this.observacao = const Value.absent(),
    this.marcadoEm = const Value.absent(),
    this.marcadoPor = const Value.absent(),
    this.dirty = const Value.absent(),
    this.rawJson = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PassageirosCompanion.insert({
    required String id,
    required String viagemId,
    required String pacienteId,
    required String pacienteNome,
    required String pacienteCpf,
    required String solicitacaoProtocolo,
    required String solicitacaoPrioridade,
    this.acompanhante = const Value.absent(),
    required String presenca,
    this.observacao = const Value.absent(),
    this.marcadoEm = const Value.absent(),
    this.marcadoPor = const Value.absent(),
    this.dirty = const Value.absent(),
    required String rawJson,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       viagemId = Value(viagemId),
       pacienteId = Value(pacienteId),
       pacienteNome = Value(pacienteNome),
       pacienteCpf = Value(pacienteCpf),
       solicitacaoProtocolo = Value(solicitacaoProtocolo),
       solicitacaoPrioridade = Value(solicitacaoPrioridade),
       presenca = Value(presenca),
       rawJson = Value(rawJson);
  static Insertable<PassageiroRow> custom({
    Expression<String>? id,
    Expression<String>? viagemId,
    Expression<String>? pacienteId,
    Expression<String>? pacienteNome,
    Expression<String>? pacienteCpf,
    Expression<String>? solicitacaoProtocolo,
    Expression<String>? solicitacaoPrioridade,
    Expression<bool>? acompanhante,
    Expression<String>? presenca,
    Expression<String>? observacao,
    Expression<DateTime>? marcadoEm,
    Expression<String>? marcadoPor,
    Expression<bool>? dirty,
    Expression<String>? rawJson,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (viagemId != null) 'viagem_id': viagemId,
      if (pacienteId != null) 'paciente_id': pacienteId,
      if (pacienteNome != null) 'paciente_nome': pacienteNome,
      if (pacienteCpf != null) 'paciente_cpf': pacienteCpf,
      if (solicitacaoProtocolo != null)
        'solicitacao_protocolo': solicitacaoProtocolo,
      if (solicitacaoPrioridade != null)
        'solicitacao_prioridade': solicitacaoPrioridade,
      if (acompanhante != null) 'acompanhante': acompanhante,
      if (presenca != null) 'presenca': presenca,
      if (observacao != null) 'observacao': observacao,
      if (marcadoEm != null) 'marcado_em': marcadoEm,
      if (marcadoPor != null) 'marcado_por': marcadoPor,
      if (dirty != null) 'dirty': dirty,
      if (rawJson != null) 'raw_json': rawJson,
      if (rowid != null) 'rowid': rowid,
    });
  }

  PassageirosCompanion copyWith({
    Value<String>? id,
    Value<String>? viagemId,
    Value<String>? pacienteId,
    Value<String>? pacienteNome,
    Value<String>? pacienteCpf,
    Value<String>? solicitacaoProtocolo,
    Value<String>? solicitacaoPrioridade,
    Value<bool>? acompanhante,
    Value<String>? presenca,
    Value<String?>? observacao,
    Value<DateTime?>? marcadoEm,
    Value<String?>? marcadoPor,
    Value<bool>? dirty,
    Value<String>? rawJson,
    Value<int>? rowid,
  }) {
    return PassageirosCompanion(
      id: id ?? this.id,
      viagemId: viagemId ?? this.viagemId,
      pacienteId: pacienteId ?? this.pacienteId,
      pacienteNome: pacienteNome ?? this.pacienteNome,
      pacienteCpf: pacienteCpf ?? this.pacienteCpf,
      solicitacaoProtocolo: solicitacaoProtocolo ?? this.solicitacaoProtocolo,
      solicitacaoPrioridade:
          solicitacaoPrioridade ?? this.solicitacaoPrioridade,
      acompanhante: acompanhante ?? this.acompanhante,
      presenca: presenca ?? this.presenca,
      observacao: observacao ?? this.observacao,
      marcadoEm: marcadoEm ?? this.marcadoEm,
      marcadoPor: marcadoPor ?? this.marcadoPor,
      dirty: dirty ?? this.dirty,
      rawJson: rawJson ?? this.rawJson,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (viagemId.present) {
      map['viagem_id'] = Variable<String>(viagemId.value);
    }
    if (pacienteId.present) {
      map['paciente_id'] = Variable<String>(pacienteId.value);
    }
    if (pacienteNome.present) {
      map['paciente_nome'] = Variable<String>(pacienteNome.value);
    }
    if (pacienteCpf.present) {
      map['paciente_cpf'] = Variable<String>(pacienteCpf.value);
    }
    if (solicitacaoProtocolo.present) {
      map['solicitacao_protocolo'] = Variable<String>(
        solicitacaoProtocolo.value,
      );
    }
    if (solicitacaoPrioridade.present) {
      map['solicitacao_prioridade'] = Variable<String>(
        solicitacaoPrioridade.value,
      );
    }
    if (acompanhante.present) {
      map['acompanhante'] = Variable<bool>(acompanhante.value);
    }
    if (presenca.present) {
      map['presenca'] = Variable<String>(presenca.value);
    }
    if (observacao.present) {
      map['observacao'] = Variable<String>(observacao.value);
    }
    if (marcadoEm.present) {
      map['marcado_em'] = Variable<DateTime>(marcadoEm.value);
    }
    if (marcadoPor.present) {
      map['marcado_por'] = Variable<String>(marcadoPor.value);
    }
    if (dirty.present) {
      map['dirty'] = Variable<bool>(dirty.value);
    }
    if (rawJson.present) {
      map['raw_json'] = Variable<String>(rawJson.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('PassageirosCompanion(')
          ..write('id: $id, ')
          ..write('viagemId: $viagemId, ')
          ..write('pacienteId: $pacienteId, ')
          ..write('pacienteNome: $pacienteNome, ')
          ..write('pacienteCpf: $pacienteCpf, ')
          ..write('solicitacaoProtocolo: $solicitacaoProtocolo, ')
          ..write('solicitacaoPrioridade: $solicitacaoPrioridade, ')
          ..write('acompanhante: $acompanhante, ')
          ..write('presenca: $presenca, ')
          ..write('observacao: $observacao, ')
          ..write('marcadoEm: $marcadoEm, ')
          ..write('marcadoPor: $marcadoPor, ')
          ..write('dirty: $dirty, ')
          ..write('rawJson: $rawJson, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $OutboxTable extends Outbox with TableInfo<$OutboxTable, OutboxRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $OutboxTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _opMeta = const VerificationMeta('op');
  @override
  late final GeneratedColumn<String> op = GeneratedColumn<String>(
    'op',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _pathMeta = const VerificationMeta('path');
  @override
  late final GeneratedColumn<String> path = GeneratedColumn<String>(
    'path',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _bodyJsonMeta = const VerificationMeta(
    'bodyJson',
  );
  @override
  late final GeneratedColumn<String> bodyJson = GeneratedColumn<String>(
    'body_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _entityKindMeta = const VerificationMeta(
    'entityKind',
  );
  @override
  late final GeneratedColumn<String> entityKind = GeneratedColumn<String>(
    'entity_kind',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _entityIdMeta = const VerificationMeta(
    'entityId',
  );
  @override
  late final GeneratedColumn<String> entityId = GeneratedColumn<String>(
    'entity_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _attemptsMeta = const VerificationMeta(
    'attempts',
  );
  @override
  late final GeneratedColumn<int> attempts = GeneratedColumn<int>(
    'attempts',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _lastAttemptAtMeta = const VerificationMeta(
    'lastAttemptAt',
  );
  @override
  late final GeneratedColumn<DateTime> lastAttemptAt =
      GeneratedColumn<DateTime>(
        'last_attempt_at',
        aliasedName,
        true,
        type: DriftSqlType.dateTime,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _lastErrorMeta = const VerificationMeta(
    'lastError',
  );
  @override
  late final GeneratedColumn<String> lastError = GeneratedColumn<String>(
    'last_error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('PENDING'),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    op,
    path,
    bodyJson,
    entityKind,
    entityId,
    attempts,
    createdAt,
    lastAttemptAt,
    lastError,
    status,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'outbox';
  @override
  VerificationContext validateIntegrity(
    Insertable<OutboxRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('op')) {
      context.handle(_opMeta, op.isAcceptableOrUnknown(data['op']!, _opMeta));
    } else if (isInserting) {
      context.missing(_opMeta);
    }
    if (data.containsKey('path')) {
      context.handle(
        _pathMeta,
        path.isAcceptableOrUnknown(data['path']!, _pathMeta),
      );
    } else if (isInserting) {
      context.missing(_pathMeta);
    }
    if (data.containsKey('body_json')) {
      context.handle(
        _bodyJsonMeta,
        bodyJson.isAcceptableOrUnknown(data['body_json']!, _bodyJsonMeta),
      );
    }
    if (data.containsKey('entity_kind')) {
      context.handle(
        _entityKindMeta,
        entityKind.isAcceptableOrUnknown(data['entity_kind']!, _entityKindMeta),
      );
    }
    if (data.containsKey('entity_id')) {
      context.handle(
        _entityIdMeta,
        entityId.isAcceptableOrUnknown(data['entity_id']!, _entityIdMeta),
      );
    }
    if (data.containsKey('attempts')) {
      context.handle(
        _attemptsMeta,
        attempts.isAcceptableOrUnknown(data['attempts']!, _attemptsMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('last_attempt_at')) {
      context.handle(
        _lastAttemptAtMeta,
        lastAttemptAt.isAcceptableOrUnknown(
          data['last_attempt_at']!,
          _lastAttemptAtMeta,
        ),
      );
    }
    if (data.containsKey('last_error')) {
      context.handle(
        _lastErrorMeta,
        lastError.isAcceptableOrUnknown(data['last_error']!, _lastErrorMeta),
      );
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  OutboxRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return OutboxRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      op: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}op'],
      )!,
      path: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}path'],
      )!,
      bodyJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}body_json'],
      )!,
      entityKind: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}entity_kind'],
      ),
      entityId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}entity_id'],
      ),
      attempts: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}attempts'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
      lastAttemptAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}last_attempt_at'],
      ),
      lastError: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}last_error'],
      ),
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
    );
  }

  @override
  $OutboxTable createAlias(String alias) {
    return $OutboxTable(attachedDatabase, alias);
  }
}

class OutboxRow extends DataClass implements Insertable<OutboxRow> {
  final int id;

  /// `POST` | `PATCH` | `DELETE` (sem `GET`).
  final String op;

  /// Caminho relativo já resolvido (sem `:id` — substituído pelo valor real).
  /// Ex.: `/motorista-app/viagens/abc-123/passageiros/def-456/presenca`.
  final String path;

  /// Body JSON serializado (ou string vazia em DELETE/PUT sem corpo).
  final String bodyJson;

  /// Tipo da entidade afetada — apenas para inspeção/debug e UI ("4
  /// presenças pendentes"). Não muda lógica de envio.
  final String? entityKind;
  final String? entityId;
  final int attempts;
  final DateTime createdAt;
  final DateTime? lastAttemptAt;
  final String? lastError;

  /// `PENDING` | `RETRYING` | `DONE` | `FAILED` | `CONFLICT`.
  final String status;
  const OutboxRow({
    required this.id,
    required this.op,
    required this.path,
    required this.bodyJson,
    this.entityKind,
    this.entityId,
    required this.attempts,
    required this.createdAt,
    this.lastAttemptAt,
    this.lastError,
    required this.status,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['op'] = Variable<String>(op);
    map['path'] = Variable<String>(path);
    map['body_json'] = Variable<String>(bodyJson);
    if (!nullToAbsent || entityKind != null) {
      map['entity_kind'] = Variable<String>(entityKind);
    }
    if (!nullToAbsent || entityId != null) {
      map['entity_id'] = Variable<String>(entityId);
    }
    map['attempts'] = Variable<int>(attempts);
    map['created_at'] = Variable<DateTime>(createdAt);
    if (!nullToAbsent || lastAttemptAt != null) {
      map['last_attempt_at'] = Variable<DateTime>(lastAttemptAt);
    }
    if (!nullToAbsent || lastError != null) {
      map['last_error'] = Variable<String>(lastError);
    }
    map['status'] = Variable<String>(status);
    return map;
  }

  OutboxCompanion toCompanion(bool nullToAbsent) {
    return OutboxCompanion(
      id: Value(id),
      op: Value(op),
      path: Value(path),
      bodyJson: Value(bodyJson),
      entityKind: entityKind == null && nullToAbsent
          ? const Value.absent()
          : Value(entityKind),
      entityId: entityId == null && nullToAbsent
          ? const Value.absent()
          : Value(entityId),
      attempts: Value(attempts),
      createdAt: Value(createdAt),
      lastAttemptAt: lastAttemptAt == null && nullToAbsent
          ? const Value.absent()
          : Value(lastAttemptAt),
      lastError: lastError == null && nullToAbsent
          ? const Value.absent()
          : Value(lastError),
      status: Value(status),
    );
  }

  factory OutboxRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return OutboxRow(
      id: serializer.fromJson<int>(json['id']),
      op: serializer.fromJson<String>(json['op']),
      path: serializer.fromJson<String>(json['path']),
      bodyJson: serializer.fromJson<String>(json['bodyJson']),
      entityKind: serializer.fromJson<String?>(json['entityKind']),
      entityId: serializer.fromJson<String?>(json['entityId']),
      attempts: serializer.fromJson<int>(json['attempts']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
      lastAttemptAt: serializer.fromJson<DateTime?>(json['lastAttemptAt']),
      lastError: serializer.fromJson<String?>(json['lastError']),
      status: serializer.fromJson<String>(json['status']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'op': serializer.toJson<String>(op),
      'path': serializer.toJson<String>(path),
      'bodyJson': serializer.toJson<String>(bodyJson),
      'entityKind': serializer.toJson<String?>(entityKind),
      'entityId': serializer.toJson<String?>(entityId),
      'attempts': serializer.toJson<int>(attempts),
      'createdAt': serializer.toJson<DateTime>(createdAt),
      'lastAttemptAt': serializer.toJson<DateTime?>(lastAttemptAt),
      'lastError': serializer.toJson<String?>(lastError),
      'status': serializer.toJson<String>(status),
    };
  }

  OutboxRow copyWith({
    int? id,
    String? op,
    String? path,
    String? bodyJson,
    Value<String?> entityKind = const Value.absent(),
    Value<String?> entityId = const Value.absent(),
    int? attempts,
    DateTime? createdAt,
    Value<DateTime?> lastAttemptAt = const Value.absent(),
    Value<String?> lastError = const Value.absent(),
    String? status,
  }) => OutboxRow(
    id: id ?? this.id,
    op: op ?? this.op,
    path: path ?? this.path,
    bodyJson: bodyJson ?? this.bodyJson,
    entityKind: entityKind.present ? entityKind.value : this.entityKind,
    entityId: entityId.present ? entityId.value : this.entityId,
    attempts: attempts ?? this.attempts,
    createdAt: createdAt ?? this.createdAt,
    lastAttemptAt: lastAttemptAt.present
        ? lastAttemptAt.value
        : this.lastAttemptAt,
    lastError: lastError.present ? lastError.value : this.lastError,
    status: status ?? this.status,
  );
  OutboxRow copyWithCompanion(OutboxCompanion data) {
    return OutboxRow(
      id: data.id.present ? data.id.value : this.id,
      op: data.op.present ? data.op.value : this.op,
      path: data.path.present ? data.path.value : this.path,
      bodyJson: data.bodyJson.present ? data.bodyJson.value : this.bodyJson,
      entityKind: data.entityKind.present
          ? data.entityKind.value
          : this.entityKind,
      entityId: data.entityId.present ? data.entityId.value : this.entityId,
      attempts: data.attempts.present ? data.attempts.value : this.attempts,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      lastAttemptAt: data.lastAttemptAt.present
          ? data.lastAttemptAt.value
          : this.lastAttemptAt,
      lastError: data.lastError.present ? data.lastError.value : this.lastError,
      status: data.status.present ? data.status.value : this.status,
    );
  }

  @override
  String toString() {
    return (StringBuffer('OutboxRow(')
          ..write('id: $id, ')
          ..write('op: $op, ')
          ..write('path: $path, ')
          ..write('bodyJson: $bodyJson, ')
          ..write('entityKind: $entityKind, ')
          ..write('entityId: $entityId, ')
          ..write('attempts: $attempts, ')
          ..write('createdAt: $createdAt, ')
          ..write('lastAttemptAt: $lastAttemptAt, ')
          ..write('lastError: $lastError, ')
          ..write('status: $status')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    op,
    path,
    bodyJson,
    entityKind,
    entityId,
    attempts,
    createdAt,
    lastAttemptAt,
    lastError,
    status,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is OutboxRow &&
          other.id == this.id &&
          other.op == this.op &&
          other.path == this.path &&
          other.bodyJson == this.bodyJson &&
          other.entityKind == this.entityKind &&
          other.entityId == this.entityId &&
          other.attempts == this.attempts &&
          other.createdAt == this.createdAt &&
          other.lastAttemptAt == this.lastAttemptAt &&
          other.lastError == this.lastError &&
          other.status == this.status);
}

class OutboxCompanion extends UpdateCompanion<OutboxRow> {
  final Value<int> id;
  final Value<String> op;
  final Value<String> path;
  final Value<String> bodyJson;
  final Value<String?> entityKind;
  final Value<String?> entityId;
  final Value<int> attempts;
  final Value<DateTime> createdAt;
  final Value<DateTime?> lastAttemptAt;
  final Value<String?> lastError;
  final Value<String> status;
  const OutboxCompanion({
    this.id = const Value.absent(),
    this.op = const Value.absent(),
    this.path = const Value.absent(),
    this.bodyJson = const Value.absent(),
    this.entityKind = const Value.absent(),
    this.entityId = const Value.absent(),
    this.attempts = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.lastAttemptAt = const Value.absent(),
    this.lastError = const Value.absent(),
    this.status = const Value.absent(),
  });
  OutboxCompanion.insert({
    this.id = const Value.absent(),
    required String op,
    required String path,
    this.bodyJson = const Value.absent(),
    this.entityKind = const Value.absent(),
    this.entityId = const Value.absent(),
    this.attempts = const Value.absent(),
    required DateTime createdAt,
    this.lastAttemptAt = const Value.absent(),
    this.lastError = const Value.absent(),
    this.status = const Value.absent(),
  }) : op = Value(op),
       path = Value(path),
       createdAt = Value(createdAt);
  static Insertable<OutboxRow> custom({
    Expression<int>? id,
    Expression<String>? op,
    Expression<String>? path,
    Expression<String>? bodyJson,
    Expression<String>? entityKind,
    Expression<String>? entityId,
    Expression<int>? attempts,
    Expression<DateTime>? createdAt,
    Expression<DateTime>? lastAttemptAt,
    Expression<String>? lastError,
    Expression<String>? status,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (op != null) 'op': op,
      if (path != null) 'path': path,
      if (bodyJson != null) 'body_json': bodyJson,
      if (entityKind != null) 'entity_kind': entityKind,
      if (entityId != null) 'entity_id': entityId,
      if (attempts != null) 'attempts': attempts,
      if (createdAt != null) 'created_at': createdAt,
      if (lastAttemptAt != null) 'last_attempt_at': lastAttemptAt,
      if (lastError != null) 'last_error': lastError,
      if (status != null) 'status': status,
    });
  }

  OutboxCompanion copyWith({
    Value<int>? id,
    Value<String>? op,
    Value<String>? path,
    Value<String>? bodyJson,
    Value<String?>? entityKind,
    Value<String?>? entityId,
    Value<int>? attempts,
    Value<DateTime>? createdAt,
    Value<DateTime?>? lastAttemptAt,
    Value<String?>? lastError,
    Value<String>? status,
  }) {
    return OutboxCompanion(
      id: id ?? this.id,
      op: op ?? this.op,
      path: path ?? this.path,
      bodyJson: bodyJson ?? this.bodyJson,
      entityKind: entityKind ?? this.entityKind,
      entityId: entityId ?? this.entityId,
      attempts: attempts ?? this.attempts,
      createdAt: createdAt ?? this.createdAt,
      lastAttemptAt: lastAttemptAt ?? this.lastAttemptAt,
      lastError: lastError ?? this.lastError,
      status: status ?? this.status,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (op.present) {
      map['op'] = Variable<String>(op.value);
    }
    if (path.present) {
      map['path'] = Variable<String>(path.value);
    }
    if (bodyJson.present) {
      map['body_json'] = Variable<String>(bodyJson.value);
    }
    if (entityKind.present) {
      map['entity_kind'] = Variable<String>(entityKind.value);
    }
    if (entityId.present) {
      map['entity_id'] = Variable<String>(entityId.value);
    }
    if (attempts.present) {
      map['attempts'] = Variable<int>(attempts.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (lastAttemptAt.present) {
      map['last_attempt_at'] = Variable<DateTime>(lastAttemptAt.value);
    }
    if (lastError.present) {
      map['last_error'] = Variable<String>(lastError.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('OutboxCompanion(')
          ..write('id: $id, ')
          ..write('op: $op, ')
          ..write('path: $path, ')
          ..write('bodyJson: $bodyJson, ')
          ..write('entityKind: $entityKind, ')
          ..write('entityId: $entityId, ')
          ..write('attempts: $attempts, ')
          ..write('createdAt: $createdAt, ')
          ..write('lastAttemptAt: $lastAttemptAt, ')
          ..write('lastError: $lastError, ')
          ..write('status: $status')
          ..write(')'))
        .toString();
  }
}

class $SyncMetaTable extends SyncMeta
    with TableInfo<$SyncMetaTable, SyncMetaRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SyncMetaTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _valueMeta = const VerificationMeta('value');
  @override
  late final GeneratedColumn<String> value = GeneratedColumn<String>(
    'value',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [key, value];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sync_meta';
  @override
  VerificationContext validateIntegrity(
    Insertable<SyncMetaRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
        _keyMeta,
        key.isAcceptableOrUnknown(data['key']!, _keyMeta),
      );
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('value')) {
      context.handle(
        _valueMeta,
        value.isAcceptableOrUnknown(data['value']!, _valueMeta),
      );
    } else if (isInserting) {
      context.missing(_valueMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  SyncMetaRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SyncMetaRow(
      key: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}key'],
      )!,
      value: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}value'],
      )!,
    );
  }

  @override
  $SyncMetaTable createAlias(String alias) {
    return $SyncMetaTable(attachedDatabase, alias);
  }
}

class SyncMetaRow extends DataClass implements Insertable<SyncMetaRow> {
  final String key;
  final String value;
  const SyncMetaRow({required this.key, required this.value});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['value'] = Variable<String>(value);
    return map;
  }

  SyncMetaCompanion toCompanion(bool nullToAbsent) {
    return SyncMetaCompanion(key: Value(key), value: Value(value));
  }

  factory SyncMetaRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SyncMetaRow(
      key: serializer.fromJson<String>(json['key']),
      value: serializer.fromJson<String>(json['value']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'value': serializer.toJson<String>(value),
    };
  }

  SyncMetaRow copyWith({String? key, String? value}) =>
      SyncMetaRow(key: key ?? this.key, value: value ?? this.value);
  SyncMetaRow copyWithCompanion(SyncMetaCompanion data) {
    return SyncMetaRow(
      key: data.key.present ? data.key.value : this.key,
      value: data.value.present ? data.value.value : this.value,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SyncMetaRow(')
          ..write('key: $key, ')
          ..write('value: $value')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(key, value);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SyncMetaRow &&
          other.key == this.key &&
          other.value == this.value);
}

class SyncMetaCompanion extends UpdateCompanion<SyncMetaRow> {
  final Value<String> key;
  final Value<String> value;
  final Value<int> rowid;
  const SyncMetaCompanion({
    this.key = const Value.absent(),
    this.value = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SyncMetaCompanion.insert({
    required String key,
    required String value,
    this.rowid = const Value.absent(),
  }) : key = Value(key),
       value = Value(value);
  static Insertable<SyncMetaRow> custom({
    Expression<String>? key,
    Expression<String>? value,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (value != null) 'value': value,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SyncMetaCompanion copyWith({
    Value<String>? key,
    Value<String>? value,
    Value<int>? rowid,
  }) {
    return SyncMetaCompanion(
      key: key ?? this.key,
      value: value ?? this.value,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (value.present) {
      map['value'] = Variable<String>(value.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SyncMetaCompanion(')
          ..write('key: $key, ')
          ..write('value: $value, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $MotoristasTable extends Motoristas
    with TableInfo<$MotoristasTable, MotoristaRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $MotoristasTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nomeMeta = const VerificationMeta('nome');
  @override
  late final GeneratedColumn<String> nome = GeneratedColumn<String>(
    'nome',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _cpfMeta = const VerificationMeta('cpf');
  @override
  late final GeneratedColumn<String> cpf = GeneratedColumn<String>(
    'cpf',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _matriculaMeta = const VerificationMeta(
    'matricula',
  );
  @override
  late final GeneratedColumn<String> matricula = GeneratedColumn<String>(
    'matricula',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _cnhMeta = const VerificationMeta('cnh');
  @override
  late final GeneratedColumn<String> cnh = GeneratedColumn<String>(
    'cnh',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _categoriaCnhMeta = const VerificationMeta(
    'categoriaCnh',
  );
  @override
  late final GeneratedColumn<String> categoriaCnh = GeneratedColumn<String>(
    'categoria_cnh',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _validadeCnhMeta = const VerificationMeta(
    'validadeCnh',
  );
  @override
  late final GeneratedColumn<DateTime> validadeCnh = GeneratedColumn<DateTime>(
    'validade_cnh',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _telefoneMeta = const VerificationMeta(
    'telefone',
  );
  @override
  late final GeneratedColumn<String> telefone = GeneratedColumn<String>(
    'telefone',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _totalViagensMeta = const VerificationMeta(
    'totalViagens',
  );
  @override
  late final GeneratedColumn<int> totalViagens = GeneratedColumn<int>(
    'total_viagens',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _totalKmRodadosMeta = const VerificationMeta(
    'totalKmRodados',
  );
  @override
  late final GeneratedColumn<int> totalKmRodados = GeneratedColumn<int>(
    'total_km_rodados',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _prefeituraNomeMeta = const VerificationMeta(
    'prefeituraNome',
  );
  @override
  late final GeneratedColumn<String> prefeituraNome = GeneratedColumn<String>(
    'prefeitura_nome',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _fotoUrlMeta = const VerificationMeta(
    'fotoUrl',
  );
  @override
  late final GeneratedColumn<String> fotoUrl = GeneratedColumn<String>(
    'foto_url',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _serverUpdatedAtMeta = const VerificationMeta(
    'serverUpdatedAt',
  );
  @override
  late final GeneratedColumn<DateTime> serverUpdatedAt =
      GeneratedColumn<DateTime>(
        'server_updated_at',
        aliasedName,
        true,
        type: DriftSqlType.dateTime,
        requiredDuringInsert: false,
      );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    nome,
    cpf,
    matricula,
    cnh,
    categoriaCnh,
    validadeCnh,
    telefone,
    status,
    totalViagens,
    totalKmRodados,
    prefeituraNome,
    fotoUrl,
    serverUpdatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'motoristas';
  @override
  VerificationContext validateIntegrity(
    Insertable<MotoristaRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('nome')) {
      context.handle(
        _nomeMeta,
        nome.isAcceptableOrUnknown(data['nome']!, _nomeMeta),
      );
    } else if (isInserting) {
      context.missing(_nomeMeta);
    }
    if (data.containsKey('cpf')) {
      context.handle(
        _cpfMeta,
        cpf.isAcceptableOrUnknown(data['cpf']!, _cpfMeta),
      );
    } else if (isInserting) {
      context.missing(_cpfMeta);
    }
    if (data.containsKey('matricula')) {
      context.handle(
        _matriculaMeta,
        matricula.isAcceptableOrUnknown(data['matricula']!, _matriculaMeta),
      );
    } else if (isInserting) {
      context.missing(_matriculaMeta);
    }
    if (data.containsKey('cnh')) {
      context.handle(
        _cnhMeta,
        cnh.isAcceptableOrUnknown(data['cnh']!, _cnhMeta),
      );
    } else if (isInserting) {
      context.missing(_cnhMeta);
    }
    if (data.containsKey('categoria_cnh')) {
      context.handle(
        _categoriaCnhMeta,
        categoriaCnh.isAcceptableOrUnknown(
          data['categoria_cnh']!,
          _categoriaCnhMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_categoriaCnhMeta);
    }
    if (data.containsKey('validade_cnh')) {
      context.handle(
        _validadeCnhMeta,
        validadeCnh.isAcceptableOrUnknown(
          data['validade_cnh']!,
          _validadeCnhMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_validadeCnhMeta);
    }
    if (data.containsKey('telefone')) {
      context.handle(
        _telefoneMeta,
        telefone.isAcceptableOrUnknown(data['telefone']!, _telefoneMeta),
      );
    } else if (isInserting) {
      context.missing(_telefoneMeta);
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    } else if (isInserting) {
      context.missing(_statusMeta);
    }
    if (data.containsKey('total_viagens')) {
      context.handle(
        _totalViagensMeta,
        totalViagens.isAcceptableOrUnknown(
          data['total_viagens']!,
          _totalViagensMeta,
        ),
      );
    }
    if (data.containsKey('total_km_rodados')) {
      context.handle(
        _totalKmRodadosMeta,
        totalKmRodados.isAcceptableOrUnknown(
          data['total_km_rodados']!,
          _totalKmRodadosMeta,
        ),
      );
    }
    if (data.containsKey('prefeitura_nome')) {
      context.handle(
        _prefeituraNomeMeta,
        prefeituraNome.isAcceptableOrUnknown(
          data['prefeitura_nome']!,
          _prefeituraNomeMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_prefeituraNomeMeta);
    }
    if (data.containsKey('foto_url')) {
      context.handle(
        _fotoUrlMeta,
        fotoUrl.isAcceptableOrUnknown(data['foto_url']!, _fotoUrlMeta),
      );
    }
    if (data.containsKey('server_updated_at')) {
      context.handle(
        _serverUpdatedAtMeta,
        serverUpdatedAt.isAcceptableOrUnknown(
          data['server_updated_at']!,
          _serverUpdatedAtMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  MotoristaRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return MotoristaRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      nome: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}nome'],
      )!,
      cpf: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}cpf'],
      )!,
      matricula: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}matricula'],
      )!,
      cnh: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}cnh'],
      )!,
      categoriaCnh: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}categoria_cnh'],
      )!,
      validadeCnh: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}validade_cnh'],
      )!,
      telefone: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}telefone'],
      )!,
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      totalViagens: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}total_viagens'],
      )!,
      totalKmRodados: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}total_km_rodados'],
      )!,
      prefeituraNome: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}prefeitura_nome'],
      )!,
      fotoUrl: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}foto_url'],
      ),
      serverUpdatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}server_updated_at'],
      ),
    );
  }

  @override
  $MotoristasTable createAlias(String alias) {
    return $MotoristasTable(attachedDatabase, alias);
  }
}

class MotoristaRow extends DataClass implements Insertable<MotoristaRow> {
  final String id;
  final String nome;
  final String cpf;
  final String matricula;
  final String cnh;
  final String categoriaCnh;
  final DateTime validadeCnh;
  final String telefone;
  final String status;
  final int totalViagens;
  final int totalKmRodados;
  final String prefeituraNome;
  final String? fotoUrl;
  final DateTime? serverUpdatedAt;
  const MotoristaRow({
    required this.id,
    required this.nome,
    required this.cpf,
    required this.matricula,
    required this.cnh,
    required this.categoriaCnh,
    required this.validadeCnh,
    required this.telefone,
    required this.status,
    required this.totalViagens,
    required this.totalKmRodados,
    required this.prefeituraNome,
    this.fotoUrl,
    this.serverUpdatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['nome'] = Variable<String>(nome);
    map['cpf'] = Variable<String>(cpf);
    map['matricula'] = Variable<String>(matricula);
    map['cnh'] = Variable<String>(cnh);
    map['categoria_cnh'] = Variable<String>(categoriaCnh);
    map['validade_cnh'] = Variable<DateTime>(validadeCnh);
    map['telefone'] = Variable<String>(telefone);
    map['status'] = Variable<String>(status);
    map['total_viagens'] = Variable<int>(totalViagens);
    map['total_km_rodados'] = Variable<int>(totalKmRodados);
    map['prefeitura_nome'] = Variable<String>(prefeituraNome);
    if (!nullToAbsent || fotoUrl != null) {
      map['foto_url'] = Variable<String>(fotoUrl);
    }
    if (!nullToAbsent || serverUpdatedAt != null) {
      map['server_updated_at'] = Variable<DateTime>(serverUpdatedAt);
    }
    return map;
  }

  MotoristasCompanion toCompanion(bool nullToAbsent) {
    return MotoristasCompanion(
      id: Value(id),
      nome: Value(nome),
      cpf: Value(cpf),
      matricula: Value(matricula),
      cnh: Value(cnh),
      categoriaCnh: Value(categoriaCnh),
      validadeCnh: Value(validadeCnh),
      telefone: Value(telefone),
      status: Value(status),
      totalViagens: Value(totalViagens),
      totalKmRodados: Value(totalKmRodados),
      prefeituraNome: Value(prefeituraNome),
      fotoUrl: fotoUrl == null && nullToAbsent
          ? const Value.absent()
          : Value(fotoUrl),
      serverUpdatedAt: serverUpdatedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(serverUpdatedAt),
    );
  }

  factory MotoristaRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return MotoristaRow(
      id: serializer.fromJson<String>(json['id']),
      nome: serializer.fromJson<String>(json['nome']),
      cpf: serializer.fromJson<String>(json['cpf']),
      matricula: serializer.fromJson<String>(json['matricula']),
      cnh: serializer.fromJson<String>(json['cnh']),
      categoriaCnh: serializer.fromJson<String>(json['categoriaCnh']),
      validadeCnh: serializer.fromJson<DateTime>(json['validadeCnh']),
      telefone: serializer.fromJson<String>(json['telefone']),
      status: serializer.fromJson<String>(json['status']),
      totalViagens: serializer.fromJson<int>(json['totalViagens']),
      totalKmRodados: serializer.fromJson<int>(json['totalKmRodados']),
      prefeituraNome: serializer.fromJson<String>(json['prefeituraNome']),
      fotoUrl: serializer.fromJson<String?>(json['fotoUrl']),
      serverUpdatedAt: serializer.fromJson<DateTime?>(json['serverUpdatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'nome': serializer.toJson<String>(nome),
      'cpf': serializer.toJson<String>(cpf),
      'matricula': serializer.toJson<String>(matricula),
      'cnh': serializer.toJson<String>(cnh),
      'categoriaCnh': serializer.toJson<String>(categoriaCnh),
      'validadeCnh': serializer.toJson<DateTime>(validadeCnh),
      'telefone': serializer.toJson<String>(telefone),
      'status': serializer.toJson<String>(status),
      'totalViagens': serializer.toJson<int>(totalViagens),
      'totalKmRodados': serializer.toJson<int>(totalKmRodados),
      'prefeituraNome': serializer.toJson<String>(prefeituraNome),
      'fotoUrl': serializer.toJson<String?>(fotoUrl),
      'serverUpdatedAt': serializer.toJson<DateTime?>(serverUpdatedAt),
    };
  }

  MotoristaRow copyWith({
    String? id,
    String? nome,
    String? cpf,
    String? matricula,
    String? cnh,
    String? categoriaCnh,
    DateTime? validadeCnh,
    String? telefone,
    String? status,
    int? totalViagens,
    int? totalKmRodados,
    String? prefeituraNome,
    Value<String?> fotoUrl = const Value.absent(),
    Value<DateTime?> serverUpdatedAt = const Value.absent(),
  }) => MotoristaRow(
    id: id ?? this.id,
    nome: nome ?? this.nome,
    cpf: cpf ?? this.cpf,
    matricula: matricula ?? this.matricula,
    cnh: cnh ?? this.cnh,
    categoriaCnh: categoriaCnh ?? this.categoriaCnh,
    validadeCnh: validadeCnh ?? this.validadeCnh,
    telefone: telefone ?? this.telefone,
    status: status ?? this.status,
    totalViagens: totalViagens ?? this.totalViagens,
    totalKmRodados: totalKmRodados ?? this.totalKmRodados,
    prefeituraNome: prefeituraNome ?? this.prefeituraNome,
    fotoUrl: fotoUrl.present ? fotoUrl.value : this.fotoUrl,
    serverUpdatedAt: serverUpdatedAt.present
        ? serverUpdatedAt.value
        : this.serverUpdatedAt,
  );
  MotoristaRow copyWithCompanion(MotoristasCompanion data) {
    return MotoristaRow(
      id: data.id.present ? data.id.value : this.id,
      nome: data.nome.present ? data.nome.value : this.nome,
      cpf: data.cpf.present ? data.cpf.value : this.cpf,
      matricula: data.matricula.present ? data.matricula.value : this.matricula,
      cnh: data.cnh.present ? data.cnh.value : this.cnh,
      categoriaCnh: data.categoriaCnh.present
          ? data.categoriaCnh.value
          : this.categoriaCnh,
      validadeCnh: data.validadeCnh.present
          ? data.validadeCnh.value
          : this.validadeCnh,
      telefone: data.telefone.present ? data.telefone.value : this.telefone,
      status: data.status.present ? data.status.value : this.status,
      totalViagens: data.totalViagens.present
          ? data.totalViagens.value
          : this.totalViagens,
      totalKmRodados: data.totalKmRodados.present
          ? data.totalKmRodados.value
          : this.totalKmRodados,
      prefeituraNome: data.prefeituraNome.present
          ? data.prefeituraNome.value
          : this.prefeituraNome,
      fotoUrl: data.fotoUrl.present ? data.fotoUrl.value : this.fotoUrl,
      serverUpdatedAt: data.serverUpdatedAt.present
          ? data.serverUpdatedAt.value
          : this.serverUpdatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('MotoristaRow(')
          ..write('id: $id, ')
          ..write('nome: $nome, ')
          ..write('cpf: $cpf, ')
          ..write('matricula: $matricula, ')
          ..write('cnh: $cnh, ')
          ..write('categoriaCnh: $categoriaCnh, ')
          ..write('validadeCnh: $validadeCnh, ')
          ..write('telefone: $telefone, ')
          ..write('status: $status, ')
          ..write('totalViagens: $totalViagens, ')
          ..write('totalKmRodados: $totalKmRodados, ')
          ..write('prefeituraNome: $prefeituraNome, ')
          ..write('fotoUrl: $fotoUrl, ')
          ..write('serverUpdatedAt: $serverUpdatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    nome,
    cpf,
    matricula,
    cnh,
    categoriaCnh,
    validadeCnh,
    telefone,
    status,
    totalViagens,
    totalKmRodados,
    prefeituraNome,
    fotoUrl,
    serverUpdatedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is MotoristaRow &&
          other.id == this.id &&
          other.nome == this.nome &&
          other.cpf == this.cpf &&
          other.matricula == this.matricula &&
          other.cnh == this.cnh &&
          other.categoriaCnh == this.categoriaCnh &&
          other.validadeCnh == this.validadeCnh &&
          other.telefone == this.telefone &&
          other.status == this.status &&
          other.totalViagens == this.totalViagens &&
          other.totalKmRodados == this.totalKmRodados &&
          other.prefeituraNome == this.prefeituraNome &&
          other.fotoUrl == this.fotoUrl &&
          other.serverUpdatedAt == this.serverUpdatedAt);
}

class MotoristasCompanion extends UpdateCompanion<MotoristaRow> {
  final Value<String> id;
  final Value<String> nome;
  final Value<String> cpf;
  final Value<String> matricula;
  final Value<String> cnh;
  final Value<String> categoriaCnh;
  final Value<DateTime> validadeCnh;
  final Value<String> telefone;
  final Value<String> status;
  final Value<int> totalViagens;
  final Value<int> totalKmRodados;
  final Value<String> prefeituraNome;
  final Value<String?> fotoUrl;
  final Value<DateTime?> serverUpdatedAt;
  final Value<int> rowid;
  const MotoristasCompanion({
    this.id = const Value.absent(),
    this.nome = const Value.absent(),
    this.cpf = const Value.absent(),
    this.matricula = const Value.absent(),
    this.cnh = const Value.absent(),
    this.categoriaCnh = const Value.absent(),
    this.validadeCnh = const Value.absent(),
    this.telefone = const Value.absent(),
    this.status = const Value.absent(),
    this.totalViagens = const Value.absent(),
    this.totalKmRodados = const Value.absent(),
    this.prefeituraNome = const Value.absent(),
    this.fotoUrl = const Value.absent(),
    this.serverUpdatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  MotoristasCompanion.insert({
    required String id,
    required String nome,
    required String cpf,
    required String matricula,
    required String cnh,
    required String categoriaCnh,
    required DateTime validadeCnh,
    required String telefone,
    required String status,
    this.totalViagens = const Value.absent(),
    this.totalKmRodados = const Value.absent(),
    required String prefeituraNome,
    this.fotoUrl = const Value.absent(),
    this.serverUpdatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       nome = Value(nome),
       cpf = Value(cpf),
       matricula = Value(matricula),
       cnh = Value(cnh),
       categoriaCnh = Value(categoriaCnh),
       validadeCnh = Value(validadeCnh),
       telefone = Value(telefone),
       status = Value(status),
       prefeituraNome = Value(prefeituraNome);
  static Insertable<MotoristaRow> custom({
    Expression<String>? id,
    Expression<String>? nome,
    Expression<String>? cpf,
    Expression<String>? matricula,
    Expression<String>? cnh,
    Expression<String>? categoriaCnh,
    Expression<DateTime>? validadeCnh,
    Expression<String>? telefone,
    Expression<String>? status,
    Expression<int>? totalViagens,
    Expression<int>? totalKmRodados,
    Expression<String>? prefeituraNome,
    Expression<String>? fotoUrl,
    Expression<DateTime>? serverUpdatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (nome != null) 'nome': nome,
      if (cpf != null) 'cpf': cpf,
      if (matricula != null) 'matricula': matricula,
      if (cnh != null) 'cnh': cnh,
      if (categoriaCnh != null) 'categoria_cnh': categoriaCnh,
      if (validadeCnh != null) 'validade_cnh': validadeCnh,
      if (telefone != null) 'telefone': telefone,
      if (status != null) 'status': status,
      if (totalViagens != null) 'total_viagens': totalViagens,
      if (totalKmRodados != null) 'total_km_rodados': totalKmRodados,
      if (prefeituraNome != null) 'prefeitura_nome': prefeituraNome,
      if (fotoUrl != null) 'foto_url': fotoUrl,
      if (serverUpdatedAt != null) 'server_updated_at': serverUpdatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  MotoristasCompanion copyWith({
    Value<String>? id,
    Value<String>? nome,
    Value<String>? cpf,
    Value<String>? matricula,
    Value<String>? cnh,
    Value<String>? categoriaCnh,
    Value<DateTime>? validadeCnh,
    Value<String>? telefone,
    Value<String>? status,
    Value<int>? totalViagens,
    Value<int>? totalKmRodados,
    Value<String>? prefeituraNome,
    Value<String?>? fotoUrl,
    Value<DateTime?>? serverUpdatedAt,
    Value<int>? rowid,
  }) {
    return MotoristasCompanion(
      id: id ?? this.id,
      nome: nome ?? this.nome,
      cpf: cpf ?? this.cpf,
      matricula: matricula ?? this.matricula,
      cnh: cnh ?? this.cnh,
      categoriaCnh: categoriaCnh ?? this.categoriaCnh,
      validadeCnh: validadeCnh ?? this.validadeCnh,
      telefone: telefone ?? this.telefone,
      status: status ?? this.status,
      totalViagens: totalViagens ?? this.totalViagens,
      totalKmRodados: totalKmRodados ?? this.totalKmRodados,
      prefeituraNome: prefeituraNome ?? this.prefeituraNome,
      fotoUrl: fotoUrl ?? this.fotoUrl,
      serverUpdatedAt: serverUpdatedAt ?? this.serverUpdatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (nome.present) {
      map['nome'] = Variable<String>(nome.value);
    }
    if (cpf.present) {
      map['cpf'] = Variable<String>(cpf.value);
    }
    if (matricula.present) {
      map['matricula'] = Variable<String>(matricula.value);
    }
    if (cnh.present) {
      map['cnh'] = Variable<String>(cnh.value);
    }
    if (categoriaCnh.present) {
      map['categoria_cnh'] = Variable<String>(categoriaCnh.value);
    }
    if (validadeCnh.present) {
      map['validade_cnh'] = Variable<DateTime>(validadeCnh.value);
    }
    if (telefone.present) {
      map['telefone'] = Variable<String>(telefone.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (totalViagens.present) {
      map['total_viagens'] = Variable<int>(totalViagens.value);
    }
    if (totalKmRodados.present) {
      map['total_km_rodados'] = Variable<int>(totalKmRodados.value);
    }
    if (prefeituraNome.present) {
      map['prefeitura_nome'] = Variable<String>(prefeituraNome.value);
    }
    if (fotoUrl.present) {
      map['foto_url'] = Variable<String>(fotoUrl.value);
    }
    if (serverUpdatedAt.present) {
      map['server_updated_at'] = Variable<DateTime>(serverUpdatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('MotoristasCompanion(')
          ..write('id: $id, ')
          ..write('nome: $nome, ')
          ..write('cpf: $cpf, ')
          ..write('matricula: $matricula, ')
          ..write('cnh: $cnh, ')
          ..write('categoriaCnh: $categoriaCnh, ')
          ..write('validadeCnh: $validadeCnh, ')
          ..write('telefone: $telefone, ')
          ..write('status: $status, ')
          ..write('totalViagens: $totalViagens, ')
          ..write('totalKmRodados: $totalKmRodados, ')
          ..write('prefeituraNome: $prefeituraNome, ')
          ..write('fotoUrl: $fotoUrl, ')
          ..write('serverUpdatedAt: $serverUpdatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $ViagensTable viagens = $ViagensTable(this);
  late final $PassageirosTable passageiros = $PassageirosTable(this);
  late final $OutboxTable outbox = $OutboxTable(this);
  late final $SyncMetaTable syncMeta = $SyncMetaTable(this);
  late final $MotoristasTable motoristas = $MotoristasTable(this);
  late final ViagensDao viagensDao = ViagensDao(this as AppDatabase);
  late final OutboxDao outboxDao = OutboxDao(this as AppDatabase);
  late final SyncMetaDao syncMetaDao = SyncMetaDao(this as AppDatabase);
  late final MotoristasDao motoristasDao = MotoristasDao(this as AppDatabase);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    viagens,
    passageiros,
    outbox,
    syncMeta,
    motoristas,
  ];
  @override
  StreamQueryUpdateRules get streamUpdateRules => const StreamQueryUpdateRules([
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'viagens',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('passageiros', kind: UpdateKind.delete)],
    ),
  ]);
}

typedef $$ViagensTableCreateCompanionBuilder =
    ViagensCompanion Function({
      required String id,
      Value<String?> protocolo,
      required DateTime data,
      required String horaSaida,
      Value<String?> horaPrevistaRetorno,
      required String destino,
      Value<String?> unidadeDestino,
      required String veiculoId,
      required String veiculoPlaca,
      required String veiculoModelo,
      required String motoristaId,
      required int vagasTotais,
      Value<int?> kmInicialHodometro,
      Value<int?> kmFinalHodometro,
      required String status,
      Value<DateTime?> iniciadaEm,
      Value<DateTime?> concluidaEm,
      Value<DateTime?> serverUpdatedAt,
      Value<bool> dirty,
      required String rawJson,
      Value<int> rowid,
    });
typedef $$ViagensTableUpdateCompanionBuilder =
    ViagensCompanion Function({
      Value<String> id,
      Value<String?> protocolo,
      Value<DateTime> data,
      Value<String> horaSaida,
      Value<String?> horaPrevistaRetorno,
      Value<String> destino,
      Value<String?> unidadeDestino,
      Value<String> veiculoId,
      Value<String> veiculoPlaca,
      Value<String> veiculoModelo,
      Value<String> motoristaId,
      Value<int> vagasTotais,
      Value<int?> kmInicialHodometro,
      Value<int?> kmFinalHodometro,
      Value<String> status,
      Value<DateTime?> iniciadaEm,
      Value<DateTime?> concluidaEm,
      Value<DateTime?> serverUpdatedAt,
      Value<bool> dirty,
      Value<String> rawJson,
      Value<int> rowid,
    });

final class $$ViagensTableReferences
    extends BaseReferences<_$AppDatabase, $ViagensTable, ViagemRow> {
  $$ViagensTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static MultiTypedResultKey<$PassageirosTable, List<PassageiroRow>>
  _passageirosRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.passageiros,
    aliasName: $_aliasNameGenerator(db.viagens.id, db.passageiros.viagemId),
  );

  $$PassageirosTableProcessedTableManager get passageirosRefs {
    final manager = $$PassageirosTableTableManager(
      $_db,
      $_db.passageiros,
    ).filter((f) => f.viagemId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(_passageirosRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$ViagensTableFilterComposer
    extends Composer<_$AppDatabase, $ViagensTable> {
  $$ViagensTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get protocolo => $composableBuilder(
    column: $table.protocolo,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get data => $composableBuilder(
    column: $table.data,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get horaSaida => $composableBuilder(
    column: $table.horaSaida,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get horaPrevistaRetorno => $composableBuilder(
    column: $table.horaPrevistaRetorno,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get destino => $composableBuilder(
    column: $table.destino,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get unidadeDestino => $composableBuilder(
    column: $table.unidadeDestino,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get veiculoId => $composableBuilder(
    column: $table.veiculoId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get veiculoPlaca => $composableBuilder(
    column: $table.veiculoPlaca,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get veiculoModelo => $composableBuilder(
    column: $table.veiculoModelo,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get motoristaId => $composableBuilder(
    column: $table.motoristaId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get vagasTotais => $composableBuilder(
    column: $table.vagasTotais,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get kmInicialHodometro => $composableBuilder(
    column: $table.kmInicialHodometro,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get kmFinalHodometro => $composableBuilder(
    column: $table.kmFinalHodometro,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get iniciadaEm => $composableBuilder(
    column: $table.iniciadaEm,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get concluidaEm => $composableBuilder(
    column: $table.concluidaEm,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get serverUpdatedAt => $composableBuilder(
    column: $table.serverUpdatedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get rawJson => $composableBuilder(
    column: $table.rawJson,
    builder: (column) => ColumnFilters(column),
  );

  Expression<bool> passageirosRefs(
    Expression<bool> Function($$PassageirosTableFilterComposer f) f,
  ) {
    final $$PassageirosTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.passageiros,
      getReferencedColumn: (t) => t.viagemId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$PassageirosTableFilterComposer(
            $db: $db,
            $table: $db.passageiros,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$ViagensTableOrderingComposer
    extends Composer<_$AppDatabase, $ViagensTable> {
  $$ViagensTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get protocolo => $composableBuilder(
    column: $table.protocolo,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get data => $composableBuilder(
    column: $table.data,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get horaSaida => $composableBuilder(
    column: $table.horaSaida,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get horaPrevistaRetorno => $composableBuilder(
    column: $table.horaPrevistaRetorno,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get destino => $composableBuilder(
    column: $table.destino,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get unidadeDestino => $composableBuilder(
    column: $table.unidadeDestino,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get veiculoId => $composableBuilder(
    column: $table.veiculoId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get veiculoPlaca => $composableBuilder(
    column: $table.veiculoPlaca,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get veiculoModelo => $composableBuilder(
    column: $table.veiculoModelo,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get motoristaId => $composableBuilder(
    column: $table.motoristaId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get vagasTotais => $composableBuilder(
    column: $table.vagasTotais,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get kmInicialHodometro => $composableBuilder(
    column: $table.kmInicialHodometro,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get kmFinalHodometro => $composableBuilder(
    column: $table.kmFinalHodometro,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get iniciadaEm => $composableBuilder(
    column: $table.iniciadaEm,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get concluidaEm => $composableBuilder(
    column: $table.concluidaEm,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get serverUpdatedAt => $composableBuilder(
    column: $table.serverUpdatedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get rawJson => $composableBuilder(
    column: $table.rawJson,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ViagensTableAnnotationComposer
    extends Composer<_$AppDatabase, $ViagensTable> {
  $$ViagensTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get protocolo =>
      $composableBuilder(column: $table.protocolo, builder: (column) => column);

  GeneratedColumn<DateTime> get data =>
      $composableBuilder(column: $table.data, builder: (column) => column);

  GeneratedColumn<String> get horaSaida =>
      $composableBuilder(column: $table.horaSaida, builder: (column) => column);

  GeneratedColumn<String> get horaPrevistaRetorno => $composableBuilder(
    column: $table.horaPrevistaRetorno,
    builder: (column) => column,
  );

  GeneratedColumn<String> get destino =>
      $composableBuilder(column: $table.destino, builder: (column) => column);

  GeneratedColumn<String> get unidadeDestino => $composableBuilder(
    column: $table.unidadeDestino,
    builder: (column) => column,
  );

  GeneratedColumn<String> get veiculoId =>
      $composableBuilder(column: $table.veiculoId, builder: (column) => column);

  GeneratedColumn<String> get veiculoPlaca => $composableBuilder(
    column: $table.veiculoPlaca,
    builder: (column) => column,
  );

  GeneratedColumn<String> get veiculoModelo => $composableBuilder(
    column: $table.veiculoModelo,
    builder: (column) => column,
  );

  GeneratedColumn<String> get motoristaId => $composableBuilder(
    column: $table.motoristaId,
    builder: (column) => column,
  );

  GeneratedColumn<int> get vagasTotais => $composableBuilder(
    column: $table.vagasTotais,
    builder: (column) => column,
  );

  GeneratedColumn<int> get kmInicialHodometro => $composableBuilder(
    column: $table.kmInicialHodometro,
    builder: (column) => column,
  );

  GeneratedColumn<int> get kmFinalHodometro => $composableBuilder(
    column: $table.kmFinalHodometro,
    builder: (column) => column,
  );

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<DateTime> get iniciadaEm => $composableBuilder(
    column: $table.iniciadaEm,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get concluidaEm => $composableBuilder(
    column: $table.concluidaEm,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get serverUpdatedAt => $composableBuilder(
    column: $table.serverUpdatedAt,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get dirty =>
      $composableBuilder(column: $table.dirty, builder: (column) => column);

  GeneratedColumn<String> get rawJson =>
      $composableBuilder(column: $table.rawJson, builder: (column) => column);

  Expression<T> passageirosRefs<T extends Object>(
    Expression<T> Function($$PassageirosTableAnnotationComposer a) f,
  ) {
    final $$PassageirosTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.passageiros,
      getReferencedColumn: (t) => t.viagemId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$PassageirosTableAnnotationComposer(
            $db: $db,
            $table: $db.passageiros,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$ViagensTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ViagensTable,
          ViagemRow,
          $$ViagensTableFilterComposer,
          $$ViagensTableOrderingComposer,
          $$ViagensTableAnnotationComposer,
          $$ViagensTableCreateCompanionBuilder,
          $$ViagensTableUpdateCompanionBuilder,
          (ViagemRow, $$ViagensTableReferences),
          ViagemRow,
          PrefetchHooks Function({bool passageirosRefs})
        > {
  $$ViagensTableTableManager(_$AppDatabase db, $ViagensTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ViagensTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ViagensTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ViagensTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String?> protocolo = const Value.absent(),
                Value<DateTime> data = const Value.absent(),
                Value<String> horaSaida = const Value.absent(),
                Value<String?> horaPrevistaRetorno = const Value.absent(),
                Value<String> destino = const Value.absent(),
                Value<String?> unidadeDestino = const Value.absent(),
                Value<String> veiculoId = const Value.absent(),
                Value<String> veiculoPlaca = const Value.absent(),
                Value<String> veiculoModelo = const Value.absent(),
                Value<String> motoristaId = const Value.absent(),
                Value<int> vagasTotais = const Value.absent(),
                Value<int?> kmInicialHodometro = const Value.absent(),
                Value<int?> kmFinalHodometro = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<DateTime?> iniciadaEm = const Value.absent(),
                Value<DateTime?> concluidaEm = const Value.absent(),
                Value<DateTime?> serverUpdatedAt = const Value.absent(),
                Value<bool> dirty = const Value.absent(),
                Value<String> rawJson = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ViagensCompanion(
                id: id,
                protocolo: protocolo,
                data: data,
                horaSaida: horaSaida,
                horaPrevistaRetorno: horaPrevistaRetorno,
                destino: destino,
                unidadeDestino: unidadeDestino,
                veiculoId: veiculoId,
                veiculoPlaca: veiculoPlaca,
                veiculoModelo: veiculoModelo,
                motoristaId: motoristaId,
                vagasTotais: vagasTotais,
                kmInicialHodometro: kmInicialHodometro,
                kmFinalHodometro: kmFinalHodometro,
                status: status,
                iniciadaEm: iniciadaEm,
                concluidaEm: concluidaEm,
                serverUpdatedAt: serverUpdatedAt,
                dirty: dirty,
                rawJson: rawJson,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String?> protocolo = const Value.absent(),
                required DateTime data,
                required String horaSaida,
                Value<String?> horaPrevistaRetorno = const Value.absent(),
                required String destino,
                Value<String?> unidadeDestino = const Value.absent(),
                required String veiculoId,
                required String veiculoPlaca,
                required String veiculoModelo,
                required String motoristaId,
                required int vagasTotais,
                Value<int?> kmInicialHodometro = const Value.absent(),
                Value<int?> kmFinalHodometro = const Value.absent(),
                required String status,
                Value<DateTime?> iniciadaEm = const Value.absent(),
                Value<DateTime?> concluidaEm = const Value.absent(),
                Value<DateTime?> serverUpdatedAt = const Value.absent(),
                Value<bool> dirty = const Value.absent(),
                required String rawJson,
                Value<int> rowid = const Value.absent(),
              }) => ViagensCompanion.insert(
                id: id,
                protocolo: protocolo,
                data: data,
                horaSaida: horaSaida,
                horaPrevistaRetorno: horaPrevistaRetorno,
                destino: destino,
                unidadeDestino: unidadeDestino,
                veiculoId: veiculoId,
                veiculoPlaca: veiculoPlaca,
                veiculoModelo: veiculoModelo,
                motoristaId: motoristaId,
                vagasTotais: vagasTotais,
                kmInicialHodometro: kmInicialHodometro,
                kmFinalHodometro: kmFinalHodometro,
                status: status,
                iniciadaEm: iniciadaEm,
                concluidaEm: concluidaEm,
                serverUpdatedAt: serverUpdatedAt,
                dirty: dirty,
                rawJson: rawJson,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$ViagensTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({passageirosRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [if (passageirosRefs) db.passageiros],
              addJoins: null,
              getPrefetchedDataCallback: (items) async {
                return [
                  if (passageirosRefs)
                    await $_getPrefetchedData<
                      ViagemRow,
                      $ViagensTable,
                      PassageiroRow
                    >(
                      currentTable: table,
                      referencedTable: $$ViagensTableReferences
                          ._passageirosRefsTable(db),
                      managerFromTypedResult: (p0) => $$ViagensTableReferences(
                        db,
                        table,
                        p0,
                      ).passageirosRefs,
                      referencedItemsForCurrentItem: (item, referencedItems) =>
                          referencedItems.where((e) => e.viagemId == item.id),
                      typedResults: items,
                    ),
                ];
              },
            );
          },
        ),
      );
}

typedef $$ViagensTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ViagensTable,
      ViagemRow,
      $$ViagensTableFilterComposer,
      $$ViagensTableOrderingComposer,
      $$ViagensTableAnnotationComposer,
      $$ViagensTableCreateCompanionBuilder,
      $$ViagensTableUpdateCompanionBuilder,
      (ViagemRow, $$ViagensTableReferences),
      ViagemRow,
      PrefetchHooks Function({bool passageirosRefs})
    >;
typedef $$PassageirosTableCreateCompanionBuilder =
    PassageirosCompanion Function({
      required String id,
      required String viagemId,
      required String pacienteId,
      required String pacienteNome,
      required String pacienteCpf,
      required String solicitacaoProtocolo,
      required String solicitacaoPrioridade,
      Value<bool> acompanhante,
      required String presenca,
      Value<String?> observacao,
      Value<DateTime?> marcadoEm,
      Value<String?> marcadoPor,
      Value<bool> dirty,
      required String rawJson,
      Value<int> rowid,
    });
typedef $$PassageirosTableUpdateCompanionBuilder =
    PassageirosCompanion Function({
      Value<String> id,
      Value<String> viagemId,
      Value<String> pacienteId,
      Value<String> pacienteNome,
      Value<String> pacienteCpf,
      Value<String> solicitacaoProtocolo,
      Value<String> solicitacaoPrioridade,
      Value<bool> acompanhante,
      Value<String> presenca,
      Value<String?> observacao,
      Value<DateTime?> marcadoEm,
      Value<String?> marcadoPor,
      Value<bool> dirty,
      Value<String> rawJson,
      Value<int> rowid,
    });

final class $$PassageirosTableReferences
    extends BaseReferences<_$AppDatabase, $PassageirosTable, PassageiroRow> {
  $$PassageirosTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $ViagensTable _viagemIdTable(_$AppDatabase db) =>
      db.viagens.createAlias(
        $_aliasNameGenerator(db.passageiros.viagemId, db.viagens.id),
      );

  $$ViagensTableProcessedTableManager get viagemId {
    final $_column = $_itemColumn<String>('viagem_id')!;

    final manager = $$ViagensTableTableManager(
      $_db,
      $_db.viagens,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_viagemIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$PassageirosTableFilterComposer
    extends Composer<_$AppDatabase, $PassageirosTable> {
  $$PassageirosTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get pacienteId => $composableBuilder(
    column: $table.pacienteId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get pacienteNome => $composableBuilder(
    column: $table.pacienteNome,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get pacienteCpf => $composableBuilder(
    column: $table.pacienteCpf,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get solicitacaoProtocolo => $composableBuilder(
    column: $table.solicitacaoProtocolo,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get solicitacaoPrioridade => $composableBuilder(
    column: $table.solicitacaoPrioridade,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get acompanhante => $composableBuilder(
    column: $table.acompanhante,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get presenca => $composableBuilder(
    column: $table.presenca,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get observacao => $composableBuilder(
    column: $table.observacao,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get marcadoEm => $composableBuilder(
    column: $table.marcadoEm,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get marcadoPor => $composableBuilder(
    column: $table.marcadoPor,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get rawJson => $composableBuilder(
    column: $table.rawJson,
    builder: (column) => ColumnFilters(column),
  );

  $$ViagensTableFilterComposer get viagemId {
    final $$ViagensTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.viagemId,
      referencedTable: $db.viagens,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ViagensTableFilterComposer(
            $db: $db,
            $table: $db.viagens,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$PassageirosTableOrderingComposer
    extends Composer<_$AppDatabase, $PassageirosTable> {
  $$PassageirosTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get pacienteId => $composableBuilder(
    column: $table.pacienteId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get pacienteNome => $composableBuilder(
    column: $table.pacienteNome,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get pacienteCpf => $composableBuilder(
    column: $table.pacienteCpf,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get solicitacaoProtocolo => $composableBuilder(
    column: $table.solicitacaoProtocolo,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get solicitacaoPrioridade => $composableBuilder(
    column: $table.solicitacaoPrioridade,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get acompanhante => $composableBuilder(
    column: $table.acompanhante,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get presenca => $composableBuilder(
    column: $table.presenca,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get observacao => $composableBuilder(
    column: $table.observacao,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get marcadoEm => $composableBuilder(
    column: $table.marcadoEm,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get marcadoPor => $composableBuilder(
    column: $table.marcadoPor,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get dirty => $composableBuilder(
    column: $table.dirty,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get rawJson => $composableBuilder(
    column: $table.rawJson,
    builder: (column) => ColumnOrderings(column),
  );

  $$ViagensTableOrderingComposer get viagemId {
    final $$ViagensTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.viagemId,
      referencedTable: $db.viagens,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ViagensTableOrderingComposer(
            $db: $db,
            $table: $db.viagens,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$PassageirosTableAnnotationComposer
    extends Composer<_$AppDatabase, $PassageirosTable> {
  $$PassageirosTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get pacienteId => $composableBuilder(
    column: $table.pacienteId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get pacienteNome => $composableBuilder(
    column: $table.pacienteNome,
    builder: (column) => column,
  );

  GeneratedColumn<String> get pacienteCpf => $composableBuilder(
    column: $table.pacienteCpf,
    builder: (column) => column,
  );

  GeneratedColumn<String> get solicitacaoProtocolo => $composableBuilder(
    column: $table.solicitacaoProtocolo,
    builder: (column) => column,
  );

  GeneratedColumn<String> get solicitacaoPrioridade => $composableBuilder(
    column: $table.solicitacaoPrioridade,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get acompanhante => $composableBuilder(
    column: $table.acompanhante,
    builder: (column) => column,
  );

  GeneratedColumn<String> get presenca =>
      $composableBuilder(column: $table.presenca, builder: (column) => column);

  GeneratedColumn<String> get observacao => $composableBuilder(
    column: $table.observacao,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get marcadoEm =>
      $composableBuilder(column: $table.marcadoEm, builder: (column) => column);

  GeneratedColumn<String> get marcadoPor => $composableBuilder(
    column: $table.marcadoPor,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get dirty =>
      $composableBuilder(column: $table.dirty, builder: (column) => column);

  GeneratedColumn<String> get rawJson =>
      $composableBuilder(column: $table.rawJson, builder: (column) => column);

  $$ViagensTableAnnotationComposer get viagemId {
    final $$ViagensTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.viagemId,
      referencedTable: $db.viagens,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ViagensTableAnnotationComposer(
            $db: $db,
            $table: $db.viagens,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$PassageirosTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $PassageirosTable,
          PassageiroRow,
          $$PassageirosTableFilterComposer,
          $$PassageirosTableOrderingComposer,
          $$PassageirosTableAnnotationComposer,
          $$PassageirosTableCreateCompanionBuilder,
          $$PassageirosTableUpdateCompanionBuilder,
          (PassageiroRow, $$PassageirosTableReferences),
          PassageiroRow,
          PrefetchHooks Function({bool viagemId})
        > {
  $$PassageirosTableTableManager(_$AppDatabase db, $PassageirosTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$PassageirosTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$PassageirosTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$PassageirosTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> viagemId = const Value.absent(),
                Value<String> pacienteId = const Value.absent(),
                Value<String> pacienteNome = const Value.absent(),
                Value<String> pacienteCpf = const Value.absent(),
                Value<String> solicitacaoProtocolo = const Value.absent(),
                Value<String> solicitacaoPrioridade = const Value.absent(),
                Value<bool> acompanhante = const Value.absent(),
                Value<String> presenca = const Value.absent(),
                Value<String?> observacao = const Value.absent(),
                Value<DateTime?> marcadoEm = const Value.absent(),
                Value<String?> marcadoPor = const Value.absent(),
                Value<bool> dirty = const Value.absent(),
                Value<String> rawJson = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PassageirosCompanion(
                id: id,
                viagemId: viagemId,
                pacienteId: pacienteId,
                pacienteNome: pacienteNome,
                pacienteCpf: pacienteCpf,
                solicitacaoProtocolo: solicitacaoProtocolo,
                solicitacaoPrioridade: solicitacaoPrioridade,
                acompanhante: acompanhante,
                presenca: presenca,
                observacao: observacao,
                marcadoEm: marcadoEm,
                marcadoPor: marcadoPor,
                dirty: dirty,
                rawJson: rawJson,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String viagemId,
                required String pacienteId,
                required String pacienteNome,
                required String pacienteCpf,
                required String solicitacaoProtocolo,
                required String solicitacaoPrioridade,
                Value<bool> acompanhante = const Value.absent(),
                required String presenca,
                Value<String?> observacao = const Value.absent(),
                Value<DateTime?> marcadoEm = const Value.absent(),
                Value<String?> marcadoPor = const Value.absent(),
                Value<bool> dirty = const Value.absent(),
                required String rawJson,
                Value<int> rowid = const Value.absent(),
              }) => PassageirosCompanion.insert(
                id: id,
                viagemId: viagemId,
                pacienteId: pacienteId,
                pacienteNome: pacienteNome,
                pacienteCpf: pacienteCpf,
                solicitacaoProtocolo: solicitacaoProtocolo,
                solicitacaoPrioridade: solicitacaoPrioridade,
                acompanhante: acompanhante,
                presenca: presenca,
                observacao: observacao,
                marcadoEm: marcadoEm,
                marcadoPor: marcadoPor,
                dirty: dirty,
                rawJson: rawJson,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$PassageirosTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({viagemId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (viagemId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.viagemId,
                                referencedTable: $$PassageirosTableReferences
                                    ._viagemIdTable(db),
                                referencedColumn: $$PassageirosTableReferences
                                    ._viagemIdTable(db)
                                    .id,
                              )
                              as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$PassageirosTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $PassageirosTable,
      PassageiroRow,
      $$PassageirosTableFilterComposer,
      $$PassageirosTableOrderingComposer,
      $$PassageirosTableAnnotationComposer,
      $$PassageirosTableCreateCompanionBuilder,
      $$PassageirosTableUpdateCompanionBuilder,
      (PassageiroRow, $$PassageirosTableReferences),
      PassageiroRow,
      PrefetchHooks Function({bool viagemId})
    >;
typedef $$OutboxTableCreateCompanionBuilder =
    OutboxCompanion Function({
      Value<int> id,
      required String op,
      required String path,
      Value<String> bodyJson,
      Value<String?> entityKind,
      Value<String?> entityId,
      Value<int> attempts,
      required DateTime createdAt,
      Value<DateTime?> lastAttemptAt,
      Value<String?> lastError,
      Value<String> status,
    });
typedef $$OutboxTableUpdateCompanionBuilder =
    OutboxCompanion Function({
      Value<int> id,
      Value<String> op,
      Value<String> path,
      Value<String> bodyJson,
      Value<String?> entityKind,
      Value<String?> entityId,
      Value<int> attempts,
      Value<DateTime> createdAt,
      Value<DateTime?> lastAttemptAt,
      Value<String?> lastError,
      Value<String> status,
    });

class $$OutboxTableFilterComposer
    extends Composer<_$AppDatabase, $OutboxTable> {
  $$OutboxTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get op => $composableBuilder(
    column: $table.op,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get path => $composableBuilder(
    column: $table.path,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get bodyJson => $composableBuilder(
    column: $table.bodyJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get entityKind => $composableBuilder(
    column: $table.entityKind,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get entityId => $composableBuilder(
    column: $table.entityId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get attempts => $composableBuilder(
    column: $table.attempts,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get lastAttemptAt => $composableBuilder(
    column: $table.lastAttemptAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get lastError => $composableBuilder(
    column: $table.lastError,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );
}

class $$OutboxTableOrderingComposer
    extends Composer<_$AppDatabase, $OutboxTable> {
  $$OutboxTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get op => $composableBuilder(
    column: $table.op,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get path => $composableBuilder(
    column: $table.path,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get bodyJson => $composableBuilder(
    column: $table.bodyJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get entityKind => $composableBuilder(
    column: $table.entityKind,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get entityId => $composableBuilder(
    column: $table.entityId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get attempts => $composableBuilder(
    column: $table.attempts,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get lastAttemptAt => $composableBuilder(
    column: $table.lastAttemptAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get lastError => $composableBuilder(
    column: $table.lastError,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$OutboxTableAnnotationComposer
    extends Composer<_$AppDatabase, $OutboxTable> {
  $$OutboxTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get op =>
      $composableBuilder(column: $table.op, builder: (column) => column);

  GeneratedColumn<String> get path =>
      $composableBuilder(column: $table.path, builder: (column) => column);

  GeneratedColumn<String> get bodyJson =>
      $composableBuilder(column: $table.bodyJson, builder: (column) => column);

  GeneratedColumn<String> get entityKind => $composableBuilder(
    column: $table.entityKind,
    builder: (column) => column,
  );

  GeneratedColumn<String> get entityId =>
      $composableBuilder(column: $table.entityId, builder: (column) => column);

  GeneratedColumn<int> get attempts =>
      $composableBuilder(column: $table.attempts, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<DateTime> get lastAttemptAt => $composableBuilder(
    column: $table.lastAttemptAt,
    builder: (column) => column,
  );

  GeneratedColumn<String> get lastError =>
      $composableBuilder(column: $table.lastError, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);
}

class $$OutboxTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $OutboxTable,
          OutboxRow,
          $$OutboxTableFilterComposer,
          $$OutboxTableOrderingComposer,
          $$OutboxTableAnnotationComposer,
          $$OutboxTableCreateCompanionBuilder,
          $$OutboxTableUpdateCompanionBuilder,
          (OutboxRow, BaseReferences<_$AppDatabase, $OutboxTable, OutboxRow>),
          OutboxRow,
          PrefetchHooks Function()
        > {
  $$OutboxTableTableManager(_$AppDatabase db, $OutboxTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$OutboxTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$OutboxTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$OutboxTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> op = const Value.absent(),
                Value<String> path = const Value.absent(),
                Value<String> bodyJson = const Value.absent(),
                Value<String?> entityKind = const Value.absent(),
                Value<String?> entityId = const Value.absent(),
                Value<int> attempts = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
                Value<DateTime?> lastAttemptAt = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                Value<String> status = const Value.absent(),
              }) => OutboxCompanion(
                id: id,
                op: op,
                path: path,
                bodyJson: bodyJson,
                entityKind: entityKind,
                entityId: entityId,
                attempts: attempts,
                createdAt: createdAt,
                lastAttemptAt: lastAttemptAt,
                lastError: lastError,
                status: status,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String op,
                required String path,
                Value<String> bodyJson = const Value.absent(),
                Value<String?> entityKind = const Value.absent(),
                Value<String?> entityId = const Value.absent(),
                Value<int> attempts = const Value.absent(),
                required DateTime createdAt,
                Value<DateTime?> lastAttemptAt = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                Value<String> status = const Value.absent(),
              }) => OutboxCompanion.insert(
                id: id,
                op: op,
                path: path,
                bodyJson: bodyJson,
                entityKind: entityKind,
                entityId: entityId,
                attempts: attempts,
                createdAt: createdAt,
                lastAttemptAt: lastAttemptAt,
                lastError: lastError,
                status: status,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$OutboxTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $OutboxTable,
      OutboxRow,
      $$OutboxTableFilterComposer,
      $$OutboxTableOrderingComposer,
      $$OutboxTableAnnotationComposer,
      $$OutboxTableCreateCompanionBuilder,
      $$OutboxTableUpdateCompanionBuilder,
      (OutboxRow, BaseReferences<_$AppDatabase, $OutboxTable, OutboxRow>),
      OutboxRow,
      PrefetchHooks Function()
    >;
typedef $$SyncMetaTableCreateCompanionBuilder =
    SyncMetaCompanion Function({
      required String key,
      required String value,
      Value<int> rowid,
    });
typedef $$SyncMetaTableUpdateCompanionBuilder =
    SyncMetaCompanion Function({
      Value<String> key,
      Value<String> value,
      Value<int> rowid,
    });

class $$SyncMetaTableFilterComposer
    extends Composer<_$AppDatabase, $SyncMetaTable> {
  $$SyncMetaTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SyncMetaTableOrderingComposer
    extends Composer<_$AppDatabase, $SyncMetaTable> {
  $$SyncMetaTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SyncMetaTableAnnotationComposer
    extends Composer<_$AppDatabase, $SyncMetaTable> {
  $$SyncMetaTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get value =>
      $composableBuilder(column: $table.value, builder: (column) => column);
}

class $$SyncMetaTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SyncMetaTable,
          SyncMetaRow,
          $$SyncMetaTableFilterComposer,
          $$SyncMetaTableOrderingComposer,
          $$SyncMetaTableAnnotationComposer,
          $$SyncMetaTableCreateCompanionBuilder,
          $$SyncMetaTableUpdateCompanionBuilder,
          (
            SyncMetaRow,
            BaseReferences<_$AppDatabase, $SyncMetaTable, SyncMetaRow>,
          ),
          SyncMetaRow,
          PrefetchHooks Function()
        > {
  $$SyncMetaTableTableManager(_$AppDatabase db, $SyncMetaTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SyncMetaTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SyncMetaTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SyncMetaTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> key = const Value.absent(),
                Value<String> value = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SyncMetaCompanion(key: key, value: value, rowid: rowid),
          createCompanionCallback:
              ({
                required String key,
                required String value,
                Value<int> rowid = const Value.absent(),
              }) => SyncMetaCompanion.insert(
                key: key,
                value: value,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SyncMetaTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SyncMetaTable,
      SyncMetaRow,
      $$SyncMetaTableFilterComposer,
      $$SyncMetaTableOrderingComposer,
      $$SyncMetaTableAnnotationComposer,
      $$SyncMetaTableCreateCompanionBuilder,
      $$SyncMetaTableUpdateCompanionBuilder,
      (SyncMetaRow, BaseReferences<_$AppDatabase, $SyncMetaTable, SyncMetaRow>),
      SyncMetaRow,
      PrefetchHooks Function()
    >;
typedef $$MotoristasTableCreateCompanionBuilder =
    MotoristasCompanion Function({
      required String id,
      required String nome,
      required String cpf,
      required String matricula,
      required String cnh,
      required String categoriaCnh,
      required DateTime validadeCnh,
      required String telefone,
      required String status,
      Value<int> totalViagens,
      Value<int> totalKmRodados,
      required String prefeituraNome,
      Value<String?> fotoUrl,
      Value<DateTime?> serverUpdatedAt,
      Value<int> rowid,
    });
typedef $$MotoristasTableUpdateCompanionBuilder =
    MotoristasCompanion Function({
      Value<String> id,
      Value<String> nome,
      Value<String> cpf,
      Value<String> matricula,
      Value<String> cnh,
      Value<String> categoriaCnh,
      Value<DateTime> validadeCnh,
      Value<String> telefone,
      Value<String> status,
      Value<int> totalViagens,
      Value<int> totalKmRodados,
      Value<String> prefeituraNome,
      Value<String?> fotoUrl,
      Value<DateTime?> serverUpdatedAt,
      Value<int> rowid,
    });

class $$MotoristasTableFilterComposer
    extends Composer<_$AppDatabase, $MotoristasTable> {
  $$MotoristasTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nome => $composableBuilder(
    column: $table.nome,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get cpf => $composableBuilder(
    column: $table.cpf,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get matricula => $composableBuilder(
    column: $table.matricula,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get cnh => $composableBuilder(
    column: $table.cnh,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get categoriaCnh => $composableBuilder(
    column: $table.categoriaCnh,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get validadeCnh => $composableBuilder(
    column: $table.validadeCnh,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get telefone => $composableBuilder(
    column: $table.telefone,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get totalViagens => $composableBuilder(
    column: $table.totalViagens,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get totalKmRodados => $composableBuilder(
    column: $table.totalKmRodados,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get prefeituraNome => $composableBuilder(
    column: $table.prefeituraNome,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get fotoUrl => $composableBuilder(
    column: $table.fotoUrl,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get serverUpdatedAt => $composableBuilder(
    column: $table.serverUpdatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$MotoristasTableOrderingComposer
    extends Composer<_$AppDatabase, $MotoristasTable> {
  $$MotoristasTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nome => $composableBuilder(
    column: $table.nome,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get cpf => $composableBuilder(
    column: $table.cpf,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get matricula => $composableBuilder(
    column: $table.matricula,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get cnh => $composableBuilder(
    column: $table.cnh,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get categoriaCnh => $composableBuilder(
    column: $table.categoriaCnh,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get validadeCnh => $composableBuilder(
    column: $table.validadeCnh,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get telefone => $composableBuilder(
    column: $table.telefone,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get totalViagens => $composableBuilder(
    column: $table.totalViagens,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get totalKmRodados => $composableBuilder(
    column: $table.totalKmRodados,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get prefeituraNome => $composableBuilder(
    column: $table.prefeituraNome,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get fotoUrl => $composableBuilder(
    column: $table.fotoUrl,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get serverUpdatedAt => $composableBuilder(
    column: $table.serverUpdatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$MotoristasTableAnnotationComposer
    extends Composer<_$AppDatabase, $MotoristasTable> {
  $$MotoristasTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get nome =>
      $composableBuilder(column: $table.nome, builder: (column) => column);

  GeneratedColumn<String> get cpf =>
      $composableBuilder(column: $table.cpf, builder: (column) => column);

  GeneratedColumn<String> get matricula =>
      $composableBuilder(column: $table.matricula, builder: (column) => column);

  GeneratedColumn<String> get cnh =>
      $composableBuilder(column: $table.cnh, builder: (column) => column);

  GeneratedColumn<String> get categoriaCnh => $composableBuilder(
    column: $table.categoriaCnh,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get validadeCnh => $composableBuilder(
    column: $table.validadeCnh,
    builder: (column) => column,
  );

  GeneratedColumn<String> get telefone =>
      $composableBuilder(column: $table.telefone, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<int> get totalViagens => $composableBuilder(
    column: $table.totalViagens,
    builder: (column) => column,
  );

  GeneratedColumn<int> get totalKmRodados => $composableBuilder(
    column: $table.totalKmRodados,
    builder: (column) => column,
  );

  GeneratedColumn<String> get prefeituraNome => $composableBuilder(
    column: $table.prefeituraNome,
    builder: (column) => column,
  );

  GeneratedColumn<String> get fotoUrl =>
      $composableBuilder(column: $table.fotoUrl, builder: (column) => column);

  GeneratedColumn<DateTime> get serverUpdatedAt => $composableBuilder(
    column: $table.serverUpdatedAt,
    builder: (column) => column,
  );
}

class $$MotoristasTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $MotoristasTable,
          MotoristaRow,
          $$MotoristasTableFilterComposer,
          $$MotoristasTableOrderingComposer,
          $$MotoristasTableAnnotationComposer,
          $$MotoristasTableCreateCompanionBuilder,
          $$MotoristasTableUpdateCompanionBuilder,
          (
            MotoristaRow,
            BaseReferences<_$AppDatabase, $MotoristasTable, MotoristaRow>,
          ),
          MotoristaRow,
          PrefetchHooks Function()
        > {
  $$MotoristasTableTableManager(_$AppDatabase db, $MotoristasTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$MotoristasTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$MotoristasTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$MotoristasTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> nome = const Value.absent(),
                Value<String> cpf = const Value.absent(),
                Value<String> matricula = const Value.absent(),
                Value<String> cnh = const Value.absent(),
                Value<String> categoriaCnh = const Value.absent(),
                Value<DateTime> validadeCnh = const Value.absent(),
                Value<String> telefone = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<int> totalViagens = const Value.absent(),
                Value<int> totalKmRodados = const Value.absent(),
                Value<String> prefeituraNome = const Value.absent(),
                Value<String?> fotoUrl = const Value.absent(),
                Value<DateTime?> serverUpdatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => MotoristasCompanion(
                id: id,
                nome: nome,
                cpf: cpf,
                matricula: matricula,
                cnh: cnh,
                categoriaCnh: categoriaCnh,
                validadeCnh: validadeCnh,
                telefone: telefone,
                status: status,
                totalViagens: totalViagens,
                totalKmRodados: totalKmRodados,
                prefeituraNome: prefeituraNome,
                fotoUrl: fotoUrl,
                serverUpdatedAt: serverUpdatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String nome,
                required String cpf,
                required String matricula,
                required String cnh,
                required String categoriaCnh,
                required DateTime validadeCnh,
                required String telefone,
                required String status,
                Value<int> totalViagens = const Value.absent(),
                Value<int> totalKmRodados = const Value.absent(),
                required String prefeituraNome,
                Value<String?> fotoUrl = const Value.absent(),
                Value<DateTime?> serverUpdatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => MotoristasCompanion.insert(
                id: id,
                nome: nome,
                cpf: cpf,
                matricula: matricula,
                cnh: cnh,
                categoriaCnh: categoriaCnh,
                validadeCnh: validadeCnh,
                telefone: telefone,
                status: status,
                totalViagens: totalViagens,
                totalKmRodados: totalKmRodados,
                prefeituraNome: prefeituraNome,
                fotoUrl: fotoUrl,
                serverUpdatedAt: serverUpdatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$MotoristasTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $MotoristasTable,
      MotoristaRow,
      $$MotoristasTableFilterComposer,
      $$MotoristasTableOrderingComposer,
      $$MotoristasTableAnnotationComposer,
      $$MotoristasTableCreateCompanionBuilder,
      $$MotoristasTableUpdateCompanionBuilder,
      (
        MotoristaRow,
        BaseReferences<_$AppDatabase, $MotoristasTable, MotoristaRow>,
      ),
      MotoristaRow,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$ViagensTableTableManager get viagens =>
      $$ViagensTableTableManager(_db, _db.viagens);
  $$PassageirosTableTableManager get passageiros =>
      $$PassageirosTableTableManager(_db, _db.passageiros);
  $$OutboxTableTableManager get outbox =>
      $$OutboxTableTableManager(_db, _db.outbox);
  $$SyncMetaTableTableManager get syncMeta =>
      $$SyncMetaTableTableManager(_db, _db.syncMeta);
  $$MotoristasTableTableManager get motoristas =>
      $$MotoristasTableTableManager(_db, _db.motoristas);
}
