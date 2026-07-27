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
  router.get('/centro/recepcao/fila-espera', authenticate, recepcaoRoles, recepcaoController.getFilaEspera);
  router.post('/centro/recepcao/agendar/:id', authenticate, recepcaoRoles, recepcaoController.postAgendar);
  router.get('/centro/recepcao/agenda-dia', authenticate, recepcaoRoles, recepcaoController.getAgendaDia);
  router.post('/centro/recepcao/presenca/:id', authenticate, recepcaoRoles, recepcaoController.postPresenca);
  router.get('/centro/recepcao/pacientes/por-cpf/:cpf', authenticate, recepcaoRoles, recepcaoController.getPacientePorCpf);
  router.post('/centro/recepcao/balcao', authenticate, recepcaoRoles, recepcaoController.postBalcao);
  router.post('/centro/recepcao/desmarcar-reagendar/:id', authenticate, recepcaoRoles, recepcaoController.postDesmarcarReagendar);

  // ───── Médico Especialista (Fase 2) ─────
  router.get('/centro/medico/agenda', authenticate, medicoRoles, medicoController.getAgenda);
  router.post('/centro/medico/chamar/:id', authenticate, medicoRoles, medicoController.postChamar);
  router.get('/centro/medico/pacientes/:pacienteId/prontuario', authenticate, medicoRoles, medicoController.getProntuario);
  router.post('/centro/medico/atendimento/:id', authenticate, medicoRoles, medicoController.postRegistrarSOAP);
  router.post('/centro/medico/encaminhamento-intermunicipal', authenticate, medicoRoles, medicoController.postEncaminhamentoIntermunicipal);

  // ───── Gestão & Diretoria Executiva (Fase 3) ─────
  router.get('/centro/gestao/dashboard', authenticate, gestaoRoles, gestaoController.getDashboard);
  router.get('/centro/gestao/cotas', authenticate, gestaoRoles, gestaoController.getCotas);
  router.put('/centro/gestao/cotas/:ubsId', authenticate, gestaoRoles, gestaoController.putCota);
  router.get('/centro/gestao/escalas', authenticate, gestaoRoles, gestaoController.getEscalas);
  router.post('/centro/gestao/escalas', authenticate, gestaoRoles, gestaoController.postEscala);
  router.put('/centro/gestao/escalas/:id', authenticate, gestaoRoles, gestaoController.putEscala);
  router.delete('/centro/gestao/escalas/:id', authenticate, gestaoRoles, gestaoController.deleteEscala);
  router.post('/centro/gestao/remanejamento-lote', authenticate, gestaoRoles, gestaoController.postRemanejamentoLote);
  router.get('/centro/gestao/relatorios/bpa', authenticate, gestaoRoles, gestaoController.getRelatorioBpa);
  router.get('/centro/gestao/auditoria', authenticate, gestaoRoles, gestaoController.getAuditoria);

  return router;
}
