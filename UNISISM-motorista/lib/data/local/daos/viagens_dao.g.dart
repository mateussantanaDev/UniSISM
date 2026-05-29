// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'viagens_dao.dart';

// ignore_for_file: type=lint
mixin _$ViagensDaoMixin on DatabaseAccessor<AppDatabase> {
  $ViagensTable get viagens => attachedDatabase.viagens;
  $PassageirosTable get passageiros => attachedDatabase.passageiros;
  ViagensDaoManager get managers => ViagensDaoManager(this);
}

class ViagensDaoManager {
  final _$ViagensDaoMixin _db;
  ViagensDaoManager(this._db);
  $$ViagensTableTableManager get viagens =>
      $$ViagensTableTableManager(_db.attachedDatabase, _db.viagens);
  $$PassageirosTableTableManager get passageiros =>
      $$PassageirosTableTableManager(_db.attachedDatabase, _db.passageiros);
}
