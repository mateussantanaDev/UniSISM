/**
 * Rotas do app do motorista. Montadas sob `/v1/motorista-app`.
 *
 * Spec: backend/docs/MOTORISTA_APP_API.md
 *
 * Camadas de auth:
 *   - Públicas: /auth/login
 *   - Autenticadas (sem checar primeiroLogin): /auth/me, /auth/trocar-senha, /auth/logout
 *   - Autenticadas + bloqueio primeiro login: todas as outras
 */
import { Router } from 'express';
import {
  makeAuthenticateMotorista,
  bloquearPrimeiroLogin,
} from '../middlewares/authenticateMotorista';
import type { ITokenService } from '../../../../domain/services/ITokenService';
import type { MotoristaAppController } from '../controllers/MotoristaAppController';

export function buildMotoristaAppRoutes(
  tokens: ITokenService,
  controller: MotoristaAppController,
): Router {
  const router = Router();
  const auth = makeAuthenticateMotorista(tokens);

  // Público
  router.post('/auth/login', controller.postLogin);

  // Autenticadas — não checam primeiroLogin (precisam funcionar antes da troca).
  router.get('/auth/me', auth, controller.getMe);
  router.post('/auth/trocar-senha', auth, controller.postTrocarSenha);
  router.post('/auth/logout', auth, controller.postLogout);

  // Autenticadas + bloqueio primeiro login.
  router.get('/minhas-viagens', auth, bloquearPrimeiroLogin, controller.getMinhasViagens);
  router.get('/viagens/:id', auth, bloquearPrimeiroLogin, controller.getViagem);
  router.post('/viagens/:id/iniciar', auth, bloquearPrimeiroLogin, controller.postIniciar);
  router.post('/viagens/:id/concluir', auth, bloquearPrimeiroLogin, controller.postConcluir);
  router.post(
    '/viagens/:id/passageiros/:pid/presenca',
    auth,
    bloquearPrimeiroLogin,
    controller.postPresenca,
  );

  router.get('/ajudas-custo', auth, bloquearPrimeiroLogin, controller.getAjudas);

  router.post('/me/fcm-token', auth, bloquearPrimeiroLogin, controller.postFcmToken);
  router.delete('/me/fcm-token', auth, controller.deleteFcmToken); // funciona até no logout

  return router;
}
