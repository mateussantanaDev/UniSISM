/**
 * @deprecated v0.16+: use `PushDispositivoUseCases.ts` (provider-agnostic).
 *
 * Mantido apenas pra retrocompat de imports do container. Re-exporta
 * `RegistrarFcmPacienteUseCase` e `RevogarFcmPacienteUseCase` que delegam
 * pros novos use cases via adapter (forçando `provider: FCM`).
 */
export {
  RegistrarFcmPacienteUseCase,
  RevogarFcmPacienteUseCase,
} from './PushDispositivoUseCases';
