import { Router } from 'express';
import { makeAuthenticate } from '../../../../presentation/middlewares/authenticate';
import { requireRole } from '../../../../presentation/middlewares/requireRole';
import type { ITokenService } from '../../../../domain/services/ITokenService';
import type { CentroRecepcaoController } from '../controllers/CentroRecepcaoController';
import type { CentroGestaoController } from '../controllers/CentroGestaoController';
import type { CentroMedicoController } from '../controllers/CentroMedicoController';

export function buildCentroRoutes(
  tokens: ITokenService,
  recepcaoController: CentroRecepcaoController,
  gestaoController: CentroGestaoController,
  medicoController: CentroMedicoController,
): Router {
  const router = Router();
  const authenticate = makeAuthenticate(tokens);

  const recepcaoRoles = requireRole(
    'ATENDENTE_CENTRO',
    'REGULADOR_SMS',
    'COORDENADOR_UBS',
    'ATENDENTE_UBS',
    'ADMIN',
    'DESENVOLVEDOR',
  );

  const medicoRoles = requireRole(
    'MEDICO_ESPECIALISTA',
    'COORDENADOR_UBS',
    'REGULADOR_SMS',
    'ADMIN',
    'DESENVOLVEDOR',
  );

  const gestaoRoles = requireRole(
    'REGULADOR_SMS',
    'ADMIN',
    'DESENVOLVEDOR',
    'ATENDENTE_CENTRO',
  );

  // ───── Recepção & Regulação do Centro (Fase 1) ─────
  router.get('/v1/centro/recepcao/fila-espera', authenticate, recepcaoRoles, recepcaoController.getFilaEspera);
  router.post('/v1/centro/recepcao/agendar/:id', authenticate, recepcaoRoles, recepcaoController.postAgendar);
  router.get('/v1/centro/recepcao/agenda-dia', authenticate, recepcaoRoles, recepcaoController.getAgendaDia);
  router.post('/v1/centro/recepcao/presenca/:id', authenticate, recepcaoRoles, recepcaoController.postPresenca);
  router.get('/v1/centro/recepcao/pacientes/por-cpf/:cpf', authenticate, recepcaoRoles, recepcaoController.getPacientePorCpf);
  router.post('/v1/centro/recepcao/balcao', authenticate, recepcaoRoles, recepcaoController.postBalcao);
  router.post('/v1/centro/recepcao/desmarcar-reagendar/:id', authenticate, recepcaoRoles, recepcaoController.postDesmarcarReagendar);

  // ───── Médico Especialista (Fase 2) ─────
  router.get('/v1/centro/medico/agenda', authenticate, medicoRoles, medicoController.getAgenda);
  router.post('/v1/centro/medico/chamar/:id', authenticate, medicoRoles, medicoController.postChamar);
  router.get('/v1/centro/medico/pacientes/:pacienteId/prontuario', authenticate, medicoRoles, medicoController.getProntuario);
  router.post('/v1/centro/medico/atendimento/:id', authenticate, medicoRoles, medicoController.postRegistrarSOAP);
  router.post('/v1/centro/medico/encaminhamento-intermunicipal', authenticate, medicoRoles, medicoController.postEncaminhamentoIntermunicipal);

  // ───── Gestão & Diretoria Executiva (Fase 3) ─────
  router.get('/v1/centro/gestao/dashboard', authenticate, gestaoRoles, gestaoController.getDashboard);
  router.get('/v1/centro/gestao/cotas', authenticate, gestaoRoles, gestaoController.getCotas);
  router.put('/v1/centro/gestao/cotas/:ubsId', authenticate, gestaoRoles, gestaoController.putCota);
  router.get('/v1/centro/gestao/escalas', authenticate, gestaoRoles, gestaoController.getEscalas);
  router.post('/v1/centro/gestao/escalas', authenticate, gestaoRoles, gestaoController.postEscala);
  router.put('/v1/centro/gestao/escalas/:id', authenticate, gestaoRoles, gestaoController.putEscala);
  router.delete('/v1/centro/gestao/escalas/:id', authenticate, gestaoRoles, gestaoController.deleteEscala);
  router.post('/v1/centro/gestao/remanejamento-lote', authenticate, gestaoRoles, gestaoController.postRemanejamentoLote);
  router.get('/v1/centro/gestao/relatorios/bpa', authenticate, gestaoRoles, gestaoController.getRelatorioBpa);
  router.get('/v1/centro/gestao/auditoria', authenticate, gestaoRoles, gestaoController.getAuditoria);

  return router;
}
