import { Router } from 'express';
import { makeAuthenticate } from '../../../../presentation/middlewares/authenticate';
import { requireRole } from '../../../../presentation/middlewares/requireRole';
import type { ITokenService } from '../../../../domain/services/ITokenService';
import type { CentroRecepcaoController } from '../controllers/CentroRecepcaoController';
import type { CentroGestaoController } from '../controllers/CentroGestaoController';
import type { CentroMedicoController } from '../controllers/CentroMedicoController';
import type { WhatsAppCrmController } from '../controllers/WhatsAppCrmController';

export function buildCentroRoutes(
  tokens: ITokenService,
  recepcaoController: CentroRecepcaoController,
  gestaoController: CentroGestaoController,
  medicoController: CentroMedicoController,
  whatsappController?: WhatsAppCrmController,
): Router {
  const router = Router();
  const authenticate = makeAuthenticate(tokens);

  const recepcaoRoles = requireRole(
    'ATENDENTE_CENTRO',
    'ENFERMEIRO',
    'REGULADOR_SMS',
    'COORDENADOR_UBS',
    'ATENDENTE_UBS',
    'ADMIN',
    'DESENVOLVEDOR',
  );

  const enfermagemRoles = requireRole(
    'ENFERMEIRO',
    'COORDENADOR_UBS',
    'REGULADOR_SMS',
    'ATENDENTE_CENTRO',
    'ADMIN',
    'DESENVOLVEDOR',
  );

  const medicoRoles = requireRole(
    'MEDICO',
    'MEDICO_ESPECIALISTA',
    'COORDENADOR_UBS',
    'REGULADOR_SMS',
    'ADMIN',
    'DESENVOLVEDOR',
  );

  const gestaoRoles = requireRole(
    'REGULADOR_SMS',
    'COORDENADOR_UBS',
    'ADMIN',
    'DESENVOLVEDOR',
    'ATENDENTE_CENTRO',
  );

  // ───── Terminal Smart TV (Sala de Espera) ─────
  router.get('/centro/tv/chamadas', recepcaoController.getTvChamadas);
  router.post('/centro/tv/parear', recepcaoController.postTvParear);

  // ───── Enfermagem & Triagem Clínica (CEM / CEO) ─────
  router.get('/centro/enfermagem/fila', authenticate, enfermagemRoles, recepcaoController.getFilaTriagem);
  router.post('/centro/enfermagem/chamar/:id', authenticate, enfermagemRoles, recepcaoController.postChamarTriagem);
  router.post('/centro/enfermagem/triagem/:id', authenticate, enfermagemRoles, recepcaoController.postRealizarTriagem);

  // ───── Recepção & Regulação do Centro (Fase 1) ─────
  router.get('/centro/escalas', authenticate, recepcaoRoles, recepcaoController.getEscalas);
  router.post('/centro/recepcao/calcular-slot', authenticate, recepcaoRoles, recepcaoController.postCalcularSlot);
  router.post('/centro/alocacao/calcular-slot', authenticate, recepcaoRoles, recepcaoController.postCalcularSlot);
  router.get('/centro/recepcao/fila-espera', authenticate, recepcaoRoles, recepcaoController.getFilaEspera);
  router.post('/centro/recepcao/agendar/:id', authenticate, recepcaoRoles, recepcaoController.postAgendar);
  router.get('/centro/recepcao/agenda-dia', authenticate, recepcaoRoles, recepcaoController.getAgendaDia);
  router.post('/centro/recepcao/presenca/:id', authenticate, recepcaoRoles, recepcaoController.postPresenca);
  router.get('/centro/recepcao/pacientes/por-cpf/:cpf', authenticate, recepcaoRoles, recepcaoController.getPacientePorCpf);
  router.post('/centro/recepcao/balcao', authenticate, recepcaoRoles, recepcaoController.postBalcao);
  router.post('/centro/balcao/agendar', authenticate, recepcaoRoles, recepcaoController.postBalcaoRetroativo);
  router.post('/centro/recepcao/desmarcar-reagendar/:id', authenticate, recepcaoRoles, recepcaoController.postDesmarcarReagendar);
  router.post('/encaminhamentos/:id/remarcar', authenticate, recepcaoRoles, recepcaoController.postRemarcar);
  router.post('/centro/notificacoes/ausencia-medica', authenticate, gestaoRoles, recepcaoController.postAusenciaMedica);
  router.post('/centro/gestao/notificacoes-ausencia', authenticate, gestaoRoles, recepcaoController.postAusenciaMedica);
  router.post('/centro/atendimentos/:id/procedimentos', authenticate, medicoRoles, recepcaoController.postProcedimentos);

  // ───── Médico Especialista & Consultório Digital ERP (Fase 2 / ERP v3.1.0) ─────
  router.get('/centro/medico/agenda', authenticate, medicoRoles, medicoController.getAgenda);
  
  router.post('/centro/medico/atendimentos/:id/chamar', authenticate, medicoRoles, medicoController.postChamar);
  router.post('/centro/medico/chamar/:id', authenticate, medicoRoles, medicoController.postChamar);
  
  router.get('/centro/medico/prontuario/:pacienteId', authenticate, medicoRoles, medicoController.getProntuario);
  router.get('/centro/medico/pacientes/:pacienteId/prontuario', authenticate, medicoRoles, medicoController.getProntuario);
  
  router.post('/centro/medico/atendimentos/:id/soap', authenticate, medicoRoles, medicoController.postRegistrarSOAP);
  router.post('/centro/medico/atendimento/:id', authenticate, medicoRoles, medicoController.postRegistrarSOAP);
  
  router.post('/centro/medico/encaminhamento-intermunicipal', authenticate, medicoRoles, medicoController.postEncaminhamentoIntermunicipal);
  router.post('/centro/medico/atendimentos/:id/encaminhamento', authenticate, medicoRoles, medicoController.postSolicitarEncaminhamento);
  router.post('/centro/medico/solicitar-encaminhamento', authenticate, medicoRoles, medicoController.postSolicitarEncaminhamento);
  router.post('/centro/medico/retorno', authenticate, medicoRoles, medicoController.postAgendarRetorno);

  // ───── Gestão & Diretoria Executiva (Fase 3 / ERP v3.1.0) ─────
  router.get('/centro/gestao/dashboard', authenticate, gestaoRoles, gestaoController.getDashboard);
  router.get('/centro/gestao/cotas', authenticate, gestaoRoles, gestaoController.getCotas);
  router.put('/centro/gestao/cotas/:ubsId', authenticate, gestaoRoles, gestaoController.putCota);

  router.get('/centro/gestao/profissionais', authenticate, gestaoRoles, gestaoController.getProfissionais);
  router.get('/centro/gestao/escalas', authenticate, gestaoRoles, gestaoController.getEscalas);
  router.post('/centro/gestao/escalas', authenticate, gestaoRoles, gestaoController.postEscala);
  router.put('/centro/gestao/escalas/:id', authenticate, gestaoRoles, gestaoController.putEscala);
  router.delete('/centro/gestao/escalas/:id', authenticate, gestaoRoles, gestaoController.deleteEscala);

  router.get('/centro/gestao/salas', authenticate, gestaoRoles, gestaoController.getSalas);
  router.post('/centro/gestao/salas', authenticate, gestaoRoles, gestaoController.postSala);
  router.put('/centro/gestao/salas/:id', authenticate, gestaoRoles, gestaoController.putSala);
  router.delete('/centro/gestao/salas/:id', authenticate, gestaoRoles, gestaoController.deleteSala);

  router.get('/centro/gestao/especialidades', authenticate, gestaoRoles, gestaoController.getEspecialidades);
  router.post('/centro/gestao/especialidades', authenticate, gestaoRoles, gestaoController.postEspecialidade);
  router.put('/centro/gestao/especialidades/:id', authenticate, gestaoRoles, gestaoController.putEspecialidade);
  router.delete('/centro/gestao/especialidades/:id', authenticate, gestaoRoles, gestaoController.deleteEspecialidade);

  router.post('/centro/gestao/remanejamento-lote', authenticate, gestaoRoles, gestaoController.postRemanejamentoLote);
  router.get('/centro/gestao/relatorios/bpa', authenticate, gestaoRoles, gestaoController.getRelatorioBpa);
  router.get('/centro/gestao/auditoria', authenticate, gestaoRoles, gestaoController.getAuditoria);

  // ───── CRM WhatsApp Multi-Atendentes & Meta Cloud API ─────
  if (whatsappController) {
    // Webhook público da Meta (handshake e eventos)
    router.get('/whatsapp/webhook', whatsappController.getWebhookVerification);
    router.post('/whatsapp/webhook', whatsappController.postWebhook);
    router.get('/centro/whatsapp/webhook', whatsappController.getWebhookVerification);
    router.post('/centro/whatsapp/webhook', whatsappController.postWebhook);

    // Configurações e Conectividade
    router.get('/centro/whatsapp/config', authenticate, gestaoRoles, whatsappController.getConfig);
    router.post('/centro/whatsapp/config', authenticate, gestaoRoles, whatsappController.saveConfig);
    router.post('/centro/whatsapp/config/testar', authenticate, gestaoRoles, whatsappController.testConnection);

    // Gestão de Conversas e Atendimento
    router.get('/centro/whatsapp/conversas', authenticate, recepcaoRoles, whatsappController.listConversas);
    router.get('/centro/whatsapp/conversas/:id', authenticate, recepcaoRoles, whatsappController.getConversa);
    router.post('/centro/whatsapp/conversas/:id/assumir', authenticate, recepcaoRoles, whatsappController.assumirConversa);
    router.post('/centro/whatsapp/conversas/:id/transferir', authenticate, recepcaoRoles, whatsappController.transferirConversa);
    router.post('/centro/whatsapp/conversas/:id/mensagens', authenticate, recepcaoRoles, whatsappController.enviarMensagem);
    router.post('/centro/whatsapp/conversas/:id/template', authenticate, recepcaoRoles, whatsappController.enviarTemplate);
    router.post('/centro/whatsapp/conversas/:id/finalizar', authenticate, recepcaoRoles, whatsappController.finalizarConversa);
    router.post('/centro/whatsapp/conversas/:id/tags', authenticate, recepcaoRoles, whatsappController.atualizarTags);
  }

  return router;
}
