/**
 * Rotas TFD — montadas sob `/v1/tfd`. RBAC alinhada com TFD_API.md §3.
 *
 * Convenção de roles aceitas:
 *   - rwGestor: GESTOR_TFD, ADMIN, DEV (operações do dia-a-dia)
 *   - rwAdmin:  ADMIN, DEV apenas (saldo, exportação TJ, verificação)
 *   - rwSolic:  rwGestor + UBS (COORDENADOR_UBS, ATENDENTE_UBS) + ATENDENTE_TFD
 *               (terminal rodoviário) — criar/listar/anexar solicitações. NÃO inclui
 *               aprovar/negar (essas continuam só com rwGestor).
 *   - rwUbsView: rwGestor + ATENDENTE_TFD — endpoints de apoio (listar UBSs)
 */
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { requireRole } from '../../../presentation/middlewares/requireRole';
import type { TfdController } from './TfdController';

const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const single = memoryUpload.single('file');

export function buildTfdRoutes(c: TfdController, authenticate: RequestHandler): Router {
  const router = Router();
  const rwGestor = [authenticate, requireRole('GESTOR_TFD', 'ADMIN', 'DESENVOLVEDOR')];
  const rwAdmin = [authenticate, requireRole('ADMIN', 'DESENVOLVEDOR')];
  const rwSolic = [
    authenticate,
    requireRole(
      'GESTOR_TFD',
      'ADMIN',
      'DESENVOLVEDOR',
      'COORDENADOR_UBS',
      'ATENDENTE_UBS',
      'ATENDENTE_TFD',
    ),
  ];

  // ----- Frota (7) -----
  router.get('/veiculos', ...rwGestor, c.getVeiculos);
  router.post('/veiculos', ...rwGestor, c.postVeiculo);
  router.get('/veiculos/:id', ...rwGestor, c.getVeiculoById);
  router.patch('/veiculos/:id', ...rwGestor, c.patchVeiculo);
  router.post('/veiculos/:id/manutencao', ...rwGestor, c.postVeiculoManutencao);
  router.post('/veiculos/:id/reativar', ...rwGestor, c.postVeiculoReativar);
  router.delete('/veiculos/:id', ...rwAdmin, c.deleteVeiculo);

  // ----- Motoristas (7) -----
  router.get('/motoristas', ...rwGestor, c.getMotoristas);
  router.post('/motoristas', ...rwGestor, c.postMotorista);
  router.get('/motoristas/:id', ...rwGestor, c.getMotoristaById);
  router.patch('/motoristas/:id', ...rwGestor, c.patchMotorista);
  router.post('/motoristas/:id/afastar', ...rwGestor, c.postMotoristaAfastar);
  router.post('/motoristas/:id/reativar', ...rwGestor, c.postMotoristaReativar);
  router.delete('/motoristas/:id', ...rwAdmin, c.deleteMotorista);

  // ----- Solicitações (7) -----
  router.get('/solicitacoes', ...rwSolic, c.getSolicitacoes);
  router.post('/solicitacoes', ...rwSolic, c.postSolicitacao);
  router.get('/solicitacoes/:id', ...rwSolic, c.getSolicitacaoById);
  router.post('/solicitacoes/:id/aprovar', ...rwGestor, c.postAprovarSolicitacao);
  router.post('/solicitacoes/:id/negar', ...rwGestor, c.postNegarSolicitacao);
  router.post('/solicitacoes/:id/anexos', ...rwSolic, single, c.postAnexarSolicitacao);
  router.get('/anexos/:id/download', ...rwSolic, c.getDownloadAnexo);

  // ----- Viagens (10) -----
  router.get('/viagens', ...rwGestor, c.getViagens);
  router.post('/viagens', ...rwGestor, c.postViagem);
  router.get('/viagens/:id', ...rwGestor, c.getViagemById);
  router.patch('/viagens/:id', ...rwGestor, c.patchViagem);
  router.post('/viagens/:id/iniciar', ...rwGestor, c.postIniciarViagem);
  router.post('/viagens/:id/concluir', ...rwGestor, c.postConcluirViagem);
  router.post('/viagens/:id/cancelar', ...rwGestor, c.postCancelarViagem);
  router.post('/viagens/:id/passageiros', ...rwGestor, c.postAlocarPassageiro);
  router.delete('/viagens/:id/passageiros/:pid', ...rwGestor, c.deletePassageiro);
  router.post('/viagens/:id/passageiros/:pid/presenca', ...rwGestor, c.postPresenca);

  // ----- Abastecimento (6) -----
  router.get('/abastecimentos', ...rwGestor, c.getAbastecimentos);
  router.post('/abastecimentos', ...rwGestor, c.postSolicitarAbastecimento);
  router.post('/abastecimentos/:id/liberar', ...rwGestor, c.postLiberarAbastecimento);
  router.post('/abastecimentos/:id/negar', ...rwGestor, c.postNegarAbastecimento);
  router.post('/abastecimentos/:id/comprovante', ...rwGestor, single, c.postComprovanteAbastecimento);
  router.get('/abastecimentos/:id/comprovante', ...rwGestor, c.getComprovanteAbastecimento);

  // ----- Saldo (2) -----
  router.get('/saldo', ...rwGestor, c.getSaldo);
  router.post('/saldo/ajustar', ...rwAdmin, c.postAjustarSaldo);

  // ----- Ajuda de Custo (5) -----
  router.get('/ajudas-custo', ...rwGestor, c.getAjudas);
  router.get('/ajudas-custo/:id', ...rwGestor, c.getAjudaById);
  router.post('/ajudas-custo', ...rwGestor, c.postSolicitarAjuda);
  router.post('/ajudas-custo/:id/autorizar', ...rwGestor, c.postAutorizarAjuda);
  router.post('/ajudas-custo/:id/pagar', ...rwAdmin, single, c.postPagarAjuda);
  router.post('/ajudas-custo/:id/negar', ...rwGestor, c.postNegarAjuda);

  // ----- Auditoria (3) -----
  // ⚠️  Ordem importa: rotas específicas ANTES de /:id, senão Express casa /:id primeiro.
  router.get('/auditoria', ...rwAdmin, c.getAuditoria);
  router.get('/auditoria/exportar-tj', ...rwAdmin, c.getExportarTJ);
  router.get('/auditoria/verificar', ...rwAdmin, c.getVerificarIntegridade);
  router.get('/auditoria/:id', ...rwAdmin, c.getAuditoriaById);

  // ──── Solicitações vindas do APP PACIENTE (v0.17+) ────
  // RBAC: rwGestor — só GESTOR/ADMIN/DEV gerenciam aprovação
  router.get('/solicitacoes-paciente', ...rwGestor, c.getSolicPacienteList);
  router.get('/solicitacoes-paciente/:id', ...rwGestor, c.getSolicPacienteById);
  router.post('/solicitacoes-paciente/:id/aprovar', ...rwGestor, c.postAprovarSolicPaciente);
  router.post('/solicitacoes-paciente/:id/recusar', ...rwGestor, c.postRecusarSolicPaciente);
  router.post('/solicitacoes-paciente/:id/embarque', ...rwGestor, c.postEmbarqueSolicPaciente);
  router.post('/solicitacoes-paciente/:id/concluir', ...rwGestor, c.postConclusaoSolicPaciente);

  return router;
}
