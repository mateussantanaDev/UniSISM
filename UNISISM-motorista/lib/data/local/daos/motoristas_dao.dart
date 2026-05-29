import 'package:drift/drift.dart';

import '../../../domain/enums/categoria_cnh.dart';
import '../../../domain/enums/status_motorista.dart';
import '../../../domain/models/motorista.dart';
import '../database.dart';
import '../tables/motoristas_table.dart';

part 'motoristas_dao.g.dart';

@DriftAccessor(tables: [Motoristas])
class MotoristasDao extends DatabaseAccessor<AppDatabase>
    with _$MotoristasDaoMixin {
  MotoristasDao(super.db);

  Future<Motorista?> getById(String id) async {
    final row = await (select(motoristas)..where((m) => m.id.equals(id)))
        .getSingleOrNull();
    return row == null ? null : _toDomain(row);
  }

  Stream<Motorista?> watchById(String id) {
    return (select(motoristas)..where((m) => m.id.equals(id)))
        .watchSingleOrNull()
        .map((row) => row == null ? null : _toDomain(row));
  }

  Future<void> upsert(Motorista m, {DateTime? serverUpdatedAt}) async {
    await into(motoristas).insertOnConflictUpdate(
      MotoristasCompanion.insert(
        id: m.id,
        nome: m.nome,
        cpf: m.cpf,
        matricula: m.matricula,
        cnh: m.cnh,
        categoriaCnh: m.categoriaCnh.wire,
        validadeCnh: m.validadeCnh,
        telefone: m.telefone,
        status: m.status.wire,
        totalViagens: Value(m.totalViagens),
        totalKmRodados: Value(m.totalKmRodados),
        prefeituraNome: m.prefeituraNome,
        fotoUrl: Value(m.fotoUrl),
        serverUpdatedAt: Value(serverUpdatedAt ?? DateTime.now()),
      ),
    );
  }

  Motorista _toDomain(MotoristaRow row) => Motorista(
    id: row.id,
    nome: row.nome,
    cpf: row.cpf,
    matricula: row.matricula,
    cnh: row.cnh,
    categoriaCnh: CategoriaCnh.fromWire(row.categoriaCnh),
    validadeCnh: row.validadeCnh,
    telefone: row.telefone,
    status: StatusMotorista.fromWire(row.status),
    totalViagens: row.totalViagens,
    totalKmRodados: row.totalKmRodados,
    prefeituraNome: row.prefeituraNome,
    fotoUrl: row.fotoUrl,
  );
}
