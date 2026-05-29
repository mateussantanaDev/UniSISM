import 'package:meta/meta.dart';

import '../../domain/enums/presenca_passageiro.dart';
import '../../domain/models/ajuda_custo.dart';
import '../../domain/models/auth_session.dart';
import '../../domain/models/motorista.dart';
import '../../domain/models/passageiro.dart';
import '../../domain/models/viagem.dart';

/// Resultado de um pull — vem com o `X-Server-Time` para o sync engine
/// usar como `lastSyncAt` na próxima chamada.
@immutable
class PullResult<T> {
  const PullResult({required this.data, required this.serverTime});
  final T data;
  final DateTime serverTime;
}

/// Contrato com o backend (módulo `/motorista-app/*` — ver
/// `BACKEND_REQUIREMENTS.md`). Tem 2 implementações: real (Dio) e mock
/// (em memória). O toggle é controlado por `--dart-define=USE_MOCK=true`.
abstract class TfdApi {
  // ── Auth ──────────────────────────────────────────────────────

  Future<AuthSession> login({
    required String matricula,
    required String senha,
  });

  Future<void> trocarSenha({
    required String senhaAtual,
    required String novaSenha,
  });

  Future<void> logout();

  Future<Motorista> me();

  // ── Viagens ───────────────────────────────────────────────────

  Future<PullResult<List<Viagem>>> minhasViagens({DateTime? desde});

  Future<Viagem> viagemPorId(String id);

  Future<Viagem> iniciarViagem({
    required String viagemId,
    required int kmInicialHodometro,
  });

  Future<Viagem> concluirViagem({
    required String viagemId,
    required int kmFinalHodometro,
  });

  Future<Passageiro> marcarPresenca({
    required String viagemId,
    required String passageiroId,
    required PresencaPassageiro presenca,
    String? observacao,
  });

  // ── Ajudas de custo ───────────────────────────────────────────

  Future<List<AjudaCusto>> minhasAjudasCusto();

  // ── Push (F15) ────────────────────────────────────────────────

  Future<void> registrarFcmToken(String token);
  Future<void> revogarFcmToken();
}
