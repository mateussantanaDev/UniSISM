import { Router } from 'express';
import { makeAuthenticate } from '../../../../presentation/middlewares/authenticate';
import { requireRole } from '../../../../presentation/middlewares/requireRole';
import type { ITokenService } from '../../../../domain/services/ITokenService';
import type { UbsAtendimentoController } from '../controllers/UbsAtendimentoController';

export function buildUbsAtendimentoRoutes(
  tokens: ITokenService,
  controller: UbsAtendimentoController,
): Router {
  const router = Router();
  const authenticate = makeAuthenticate(tokens);

  const ubsRoles = requireRole(
    'COORDENADOR_UBS',
    'ATENDENTE_UBS',
    'MEDICO',
    'MEDICO_ESPECIALISTA',
    'REGULADOR_SMS',
    'ADMIN',
    'DESENVOLVEDOR',
  );

  // 1. Recepção / Balcão: Adicionar paciente à fila do dia
  router.post('/ubs/fila-dia', authenticate, ubsRoles, controller.postAdicionarFila);

  // 2. Fila do Dia (Recepção e Médico): Listar com filtros e métricas
  router.get('/ubs/fila-dia', authenticate, ubsRoles, controller.getListarFila);

  // 3. Médico / Profissional: Chamar paciente para o consultório (dispara no Painel TV)
  router.post('/ubs/fila-dia/:id/chamar', authenticate, ubsRoles, controller.postChamarPaciente);

  // 4. Médico / Atendente: Atualizar status (EM_ATENDIMENTO, CONCLUIDO, FALTOU, CANCELADO)
  router.post('/ubs/fila-dia/:id/status', authenticate, ubsRoles, controller.postAtualizarStatus);

  // 5. Painel de TV / Sala de Espera da UBS (Aberto / Polling)
  router.get('/ubs/painel/chamadas', authenticate, ubsRoles, controller.getPainelChamadas);

  return router;
}
