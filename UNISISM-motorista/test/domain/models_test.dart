import 'package:flutter_test/flutter_test.dart';
import 'package:unisism_motorista/domain/enums/categoria_cnh.dart';
import 'package:unisism_motorista/domain/enums/presenca_passageiro.dart';
import 'package:unisism_motorista/domain/enums/status_motorista.dart';
import 'package:unisism_motorista/domain/enums/status_viagem.dart';
import 'package:unisism_motorista/domain/enums/wire.dart';
import 'package:unisism_motorista/domain/models/motorista.dart';
import 'package:unisism_motorista/domain/models/viagem.dart';

void main() {
  group('Enums', () {
    test('StatusViagem — roundtrip wire ↔ enum', () {
      for (final s in StatusViagem.values) {
        expect(StatusViagem.fromWire(s.wire), s);
      }
    });

    test('PresencaPassageiro — roundtrip wire ↔ enum', () {
      for (final p in PresencaPassageiro.values) {
        expect(PresencaPassageiro.fromWire(p.wire), p);
      }
    });

    test('StatusViagem.fromWire — desconhecido lança WireException', () {
      expect(
        () => StatusViagem.fromWire('FANTASIA'),
        throwsA(isA<WireException>()),
      );
    });

    test('StatusViagem.terminal cobre CONCLUIDA e CANCELADA', () {
      expect(StatusViagem.concluida.terminal, isTrue);
      expect(StatusViagem.cancelada.terminal, isTrue);
      expect(StatusViagem.agendada.terminal, isFalse);
      expect(StatusViagem.emAndamento.terminal, isFalse);
    });
  });

  group('Motorista', () {
    Motorista build({DateTime? validade}) => Motorista(
      id: 'm1',
      nome: 'João da Silva',
      cpf: '12345678900',
      matricula: '12345',
      cnh: '99887766',
      categoriaCnh: CategoriaCnh.d,
      validadeCnh: validade ?? DateTime.now().add(const Duration(days: 365)),
      telefone: '75999990000',
      status: StatusMotorista.ativo,
      totalViagens: 42,
      totalKmRodados: 12345,
      prefeituraNome: 'Águas Belas',
    );

    test('cnhAVencer = true se vence em ≤ 30 dias', () {
      final m = build(validade: DateTime.now().add(const Duration(days: 15)));
      expect(m.cnhAVencer, isTrue);
      expect(m.cnhVencida, isFalse);
    });

    test('cnhVencida = true se já passou da validade', () {
      final m = build(validade: DateTime.now().subtract(const Duration(days: 1)));
      expect(m.cnhVencida, isTrue);
      expect(m.cnhAVencer, isTrue);
    });

    test('fromJson/toJson é roundtrip', () {
      final original = build();
      final json = original.toJson();
      final parsed = Motorista.fromJson(json);
      expect(parsed.id, original.id);
      expect(parsed.matricula, original.matricula);
      expect(parsed.categoriaCnh, CategoriaCnh.d);
      expect(parsed.status, StatusMotorista.ativo);
    });
  });

  group('Viagem', () {
    test('fromJson aceita passageiros vazios', () {
      final json = {
        'id': 'v1',
        'data': '2026-05-25T00:00:00Z',
        'horaSaida': '06:00',
        'destino': 'Salvador',
        'veiculo': {
          'id': 've1',
          'placa': 'ABC1D23',
          'modelo': 'Master',
          'tipo': 'VAN',
          'capacidade': 15,
          'status': 'ATIVO',
        },
        'motorista': {
          'id': 'm1',
          'nome': 'João',
          'matricula': '12345',
          'status': 'ATIVO',
        },
        'vagasTotais': 12,
        'status': 'AGENDADA',
        'passageiros': [],
      };
      final v = Viagem.fromJson(json);
      expect(v.id, 'v1');
      expect(v.status, StatusViagem.agendada);
      expect(v.vagasOcupadas, 0);
      expect(v.vagasLivres, 12);
      expect(v.podeIniciar, isTrue);
      expect(v.podeConcluir, isFalse);
    });

    test('copyWith preserva campos não passados', () {
      final json = {
        'id': 'v1',
        'data': '2026-05-25T00:00:00Z',
        'horaSaida': '06:00',
        'destino': 'Salvador',
        'veiculo': {
          'id': 've1',
          'placa': 'ABC1D23',
          'modelo': 'Master',
          'tipo': 'VAN',
          'capacidade': 15,
          'status': 'ATIVO',
        },
        'motorista': {
          'id': 'm1',
          'nome': 'João',
          'matricula': '12345',
          'status': 'ATIVO',
        },
        'vagasTotais': 12,
        'status': 'AGENDADA',
        'passageiros': [],
      };
      final v = Viagem.fromJson(json);
      final iniciada = v.copyWith(
        status: StatusViagem.emAndamento,
        kmInicialHodometro: 45200,
        iniciadaEm: DateTime(2026, 5, 25, 6),
      );
      expect(iniciada.status, StatusViagem.emAndamento);
      expect(iniciada.kmInicialHodometro, 45200);
      expect(iniciada.destino, 'Salvador'); // preservado
      expect(iniciada.id, 'v1'); // preservado
    });
  });
}
