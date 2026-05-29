// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'motoristas_dao.dart';

// ignore_for_file: type=lint
mixin _$MotoristasDaoMixin on DatabaseAccessor<AppDatabase> {
  $MotoristasTable get motoristas => attachedDatabase.motoristas;
  MotoristasDaoManager get managers => MotoristasDaoManager(this);
}

class MotoristasDaoManager {
  final _$MotoristasDaoMixin _db;
  MotoristasDaoManager(this._db);
  $$MotoristasTableTableManager get motoristas =>
      $$MotoristasTableTableManager(_db.attachedDatabase, _db.motoristas);
}
