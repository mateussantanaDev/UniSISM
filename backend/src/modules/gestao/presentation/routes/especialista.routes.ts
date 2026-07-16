import { Router } from 'express';
import { makeAuthenticate } from '../../../../presentation/middlewares/authenticate';
import { requireRole } from '../../../../presentation/middlewares/requireRole';
import type { ITokenService } from '../../../../domain/services/ITokenService';
import type { EspecialistaController } from '../controllers/EspecialistaController';

export function buildEspecialistaRoutes(
  tokens: ITokenService,
  controller: EspecialistaController,
): Router {
  const router = Router();
  const authenticate = makeAuthenticate(tokens);
  const onlyEspecialistaOrDev = requireRole('MEDICO_ESPECIALISTA', 'DESENVOLVEDOR');

  router.get(
    '/especialista/agenda',
    authenticate,
    onlyEspecialistaOrDev,
    controller.getAgenda,
  );

  router.post(
    '/especialista/atendimento/:id',
    authenticate,
    onlyEspecialistaOrDev,
    controller.registrarAtendimento,
  );

  return router;
}
