/**
 * Rotas de CRUD do prontuário — montadas sob `/v1/pacientes/:pacienteId`.
 *
 * RBAC:
 *   - DESENVOLVEDOR, ADMIN              → escopo global / prefeitura
 *   - COORDENADOR_UBS, ATENDENTE_UBS    → escopo UBS (valida via scope)
 *   - REGULADOR_SMS                     → não edita (regra do frontend, mas
 *                                         backend também nega via requireRole)
 */
import { Router, type RequestHandler } from 'express';
import { requireRole } from '../../../presentation/middlewares/requireRole';
import type { ProntuarioController } from './ProntuarioController';

export function buildProntuarioRoutes(
  c: ProntuarioController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  const canEdit = requireRole(
    'DESENVOLVEDOR',
    'ADMIN',
    'COORDENADOR_UBS',
    'ATENDENTE_UBS',
  );
  const guards = [authenticate, canEdit];

  // Alergias
  router.post('/:pacienteId/alergias', ...guards, c.postAddAlergia);
  router.delete('/:pacienteId/alergias/:id', ...guards, c.deleteAlergia);

  // Condições crônicas
  router.post('/:pacienteId/condicoes-cronicas', ...guards, c.postAddCondicao);
  router.patch('/:pacienteId/condicoes-cronicas/:id', ...guards, c.patchCondicao);
  router.delete('/:pacienteId/condicoes-cronicas/:id', ...guards, c.deleteCondicao);

  // Medicamentos
  router.post('/:pacienteId/medicamentos', ...guards, c.postAddMedicamento);
  router.patch('/:pacienteId/medicamentos/:id', ...guards, c.patchMedicamento);
  router.delete('/:pacienteId/medicamentos/:id', ...guards, c.deleteMedicamento);

  // Histórico familiar (substituição total)
  router.put('/:pacienteId/historico-familiar', ...guards, c.putHistoricoFamiliar);

  // Atendimentos (SOAP)
  router.post('/:pacienteId/atendimentos', ...guards, c.postAddAtendimento);
  router.delete('/:pacienteId/atendimentos/:id', ...guards, c.deleteAtendimento);

  // Exames
  router.post('/:pacienteId/exames', ...guards, c.postAddExame);
  router.delete('/:pacienteId/exames/:id', ...guards, c.deleteExame);

  // Vacinação
  router.post('/:pacienteId/vacinacoes', ...guards, c.postAddVacina);
  router.delete('/:pacienteId/vacinacoes/:id', ...guards, c.deleteVacina);

  // Viagens TFD
  router.post('/:pacienteId/viagens', ...guards, c.postAddViagem);
  router.patch('/:pacienteId/viagens/:id', ...guards, c.patchViagem);
  router.delete('/:pacienteId/viagens/:id', ...guards, c.deleteViagem);

  return router;
}
