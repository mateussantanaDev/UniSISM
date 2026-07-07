import { Router } from 'express';
import type { AuthController } from '../controllers/AuthController';
import type { PerfilController } from '../controllers/PerfilController';
import type { DashboardController } from '../controllers/DashboardController';
import type { EncaminhamentoController } from '../controllers/EncaminhamentoController';
import type { AnexosController } from '../controllers/AnexosController';
import type { PacienteController } from '../controllers/PacienteController';
import type { RelatoriosController as RelatorioController } from '../../modules/relatorios/presentation/RelatoriosController';
import type { AdminController } from '../controllers/AdminController';
import type { RecomendacoesController } from '../controllers/RecomendacoesController';
import type { SmsBannersAdminController } from '../controllers/SmsBannersAdminController';
import type { RegulacaoController } from '../../modules/gestao/presentation/controllers/RegulacaoController';
import { buildRegulacaoRoutes } from '../../modules/gestao/presentation/routes/regulacao.routes';
import type { PacienteAppController } from '../../modules/paciente-app/presentation/controllers/PacienteAppController';
import {
  buildPacienteAppRoutes,
  buildPacienteAuthRoutes,
  buildPacienteResourcesRoutes,
} from '../../modules/paciente-app/presentation/routes/paciente-app.routes';
import type { PasswordRecoveryRateLimiter } from '../../modules/paciente-app/infrastructure/PasswordRecoveryRateLimiter';
import type { DownloadAnexoRateLimiter } from '../../modules/paciente-app/infrastructure/DownloadAnexoRateLimiter';
import type { DossieRateLimiter } from '../../modules/paciente-app/infrastructure/DossieRateLimiter';
import type { BannersRateLimiter } from '../../modules/paciente-app/infrastructure/BannersRateLimiter';
import type { MotoristaAppController } from '../../modules/motorista-app/presentation/controllers/MotoristaAppController';
import { buildMotoristaAppRoutes } from '../../modules/motorista-app/presentation/routes/motorista-app.routes';
import type { ProntuarioController } from '../../modules/prontuario/presentation/ProntuarioController';
import { buildProntuarioRoutes } from '../../modules/prontuario/presentation/prontuario.routes';
import type { TfdController } from '../../modules/tfd/presentation/TfdController';
import { buildTfdRoutes } from '../../modules/tfd/presentation/tfd.routes';
import { validateBody } from '../middlewares/validate';
import { makeAuthenticate } from '../middlewares/authenticate';
import { memoryUpload } from '../middlewares/uploads';
import { requireRole } from '../middlewares/requireRole';
import {
  changePasswordSchema,
  forgotSchema,
  loginSchema,
  resetPasswordSchema,
  verifyCodeSchema,
} from '../schemas/authSchemas';
import type { ITokenService } from '../../domain/services/ITokenService';

interface Deps {
  tokens: ITokenService;
  auth: AuthController;
  perfil: PerfilController;
  dashboard: DashboardController;
  encaminhamentos: EncaminhamentoController;
  anexos: AnexosController;
  pacientes: PacienteController;
  relatorios: RelatorioController;
  admin: AdminController;
  recomendacoes: RecomendacoesController;
  smsBannersAdmin: SmsBannersAdminController;
  regulacao: RegulacaoController;
  pacienteApp: PacienteAppController;
  passwordRecoveryRateLimiter: PasswordRecoveryRateLimiter;
  downloadAnexoRateLimiter: DownloadAnexoRateLimiter;
  dossieRateLimiter: DossieRateLimiter;
  bannersRateLimiter: BannersRateLimiter;
  prontuario: ProntuarioController;
  tfd: TfdController;
  motoristaApp: MotoristaAppController;
}

export function buildRoutes(deps: Deps): Router {
  const router = Router();
  const authenticate = makeAuthenticate(deps.tokens);

  // ----- Auth (público) -----
  router.post('/auth/login', validateBody(loginSchema), deps.auth.postLogin);
  router.post('/auth/forgot-password', validateBody(forgotSchema), deps.auth.postForgot);
  router.post('/auth/verify-code', validateBody(verifyCodeSchema), deps.auth.postVerify);
  router.post('/auth/reset-password', validateBody(resetPasswordSchema), deps.auth.postReset);
  router.post('/auth/logout', authenticate, deps.auth.postLogout);
  router.get('/auth/me', authenticate, deps.auth.getMe);

  // ----- Perfil -----
  router.get('/me/profile', authenticate, deps.perfil.get);
  router.post(
    '/me/password',
    authenticate,
    validateBody(changePasswordSchema),
    deps.perfil.postChangePassword,
  );
  router.post('/me/sessions/revoke-others', authenticate, deps.perfil.postRevokeOthers);

  // ----- Dashboard (escopo automático via scope) -----
  router.get('/dashboard/metrics', authenticate, deps.dashboard.get);

  // ----- Face 2 · SMS (módulo Gestão / Regulação) -----
  // IMPORTANTE: registrar antes das rotas /encaminhamentos/:id pra evitar
  // que Express trate "/encaminhamentos/arvore" como :id="arvore".
  router.use(buildRegulacaoRoutes(deps.tokens, deps.regulacao));

  // ----- Encaminhamentos -----
  // consolidar/resolver requer UBS — DESENVOLVEDOR e ADMIN não podem (eles não são de uma UBS)
  router.post(
    '/encaminhamentos/extract-pdf',
    authenticate,
    memoryUpload.single('file'),
    deps.encaminhamentos.postExtractPdf,
  );
  router.post(
    '/encaminhamentos',
    authenticate,
    requireRole('ATENDENTE_UBS', 'COORDENADOR_UBS', 'DESENVOLVEDOR'),
    memoryUpload.fields([
      { name: 'solicitacao', maxCount: 1 },
      { name: 'anexo', maxCount: 10 },
    ]),
    deps.encaminhamentos.postCreate,
  );
  router.get('/encaminhamentos', authenticate, deps.encaminhamentos.getList);
  router.get('/encaminhamentos/:id', authenticate, deps.encaminhamentos.getById);
  router.patch(
    '/encaminhamentos/:id',
    authenticate,
    requireRole('ATENDENTE_UBS', 'COORDENADOR_UBS', 'ADMIN', 'DESENVOLVEDOR'),
    deps.encaminhamentos.patch,
  );
  router.delete(
    '/encaminhamentos/:id',
    authenticate,
    requireRole('ADMIN', 'DESENVOLVEDOR'),
    deps.encaminhamentos.delete,
  );
  router.post(
    '/encaminhamentos/:id/resolve-pendencia',
    authenticate,
    requireRole('ATENDENTE_UBS', 'COORDENADOR_UBS', 'DESENVOLVEDOR'),
    memoryUpload.array('anexo', 10),
    deps.encaminhamentos.postResolverPendencia,
  );

  // ----- Anexos -----
  router.get('/anexos/:id/download', authenticate, deps.anexos.getDownload);

  // ----- Pacientes -----
  router.get('/pacientes', authenticate, deps.pacientes.getList);
  // Busca por CPF — usado no fluxo de consolidação do encaminhamento
  // pra pré-preencher o form e listar campos faltantes.
  // DEVE vir ANTES de /:id pra não colidir (/:id pega qualquer string).
  router.get('/pacientes/por-cpf/:cpf', authenticate, deps.pacientes.getPorCpf);
  router.get('/pacientes/:id', authenticate, deps.pacientes.getById);
  router.patch(
    '/pacientes/:id',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN', 'COORDENADOR_UBS', 'ATENDENTE_UBS'),
    deps.pacientes.patch,
  );
  router.delete(
    '/pacientes/:id',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN', 'COORDENADOR_UBS'),
    deps.pacientes.delete,
  );

  // ----- Relatórios -----
  router.get('/relatorios', authenticate, deps.relatorios.getListar);
  router.post('/relatorios', authenticate, deps.relatorios.postCriar);
  router.get('/relatorios/:id/download', authenticate, deps.relatorios.getDownload);

  // ----- Admin (DESENVOLVEDOR / ADMIN) -----
  // prefeituras: apenas DESENVOLVEDOR pode criar.
  router.post(
    '/admin/prefeituras',
    authenticate,
    requireRole('DESENVOLVEDOR'),
    deps.admin.postPrefeitura,
  );
  router.get(
    '/admin/prefeituras',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN'),
    deps.admin.getPrefeituras,
  );

  // UBS: DESENVOLVEDOR (qualquer prefeitura) ou ADMIN (própria prefeitura)
  router.post(
    '/admin/ubs',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN'),
    deps.admin.postUbs,
  );
  router.get(
    '/admin/ubs',
    authenticate,
    requireRole(
      'DESENVOLVEDOR',
      'ADMIN',
      'COORDENADOR_UBS',
      'REGULADOR_SMS',
      'GESTOR_TFD',
      'ATENDENTE_TFD',
    ),
    deps.admin.getUbs,
  );
  router.get(
    '/admin/configuracoes',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN'),
    deps.admin.getConfiguracoes,
  );

  // usuários: DESENVOLVEDOR (qualquer) ou ADMIN (própria prefeitura)
  router.post(
    '/admin/usuarios',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN'),
    deps.admin.postUsuario,
  );
  router.get(
    '/admin/usuarios',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN', 'COORDENADOR_UBS'),
    deps.admin.getUsuarios,
  );
  router.patch(
    '/admin/usuarios/:id',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN'),
    deps.admin.patchUsuario,
  );
  router.delete(
    '/admin/usuarios/:id',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN'),
    deps.admin.deleteUsuario,
  );
  router.post(
    '/admin/usuarios/:id/ativo',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN'),
    deps.admin.postAtivarUsuario,
  );
  router.post(
    '/admin/usuarios/:id/reset-senha',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN'),
    deps.admin.postResetSenhaUsuario,
  );

  // Prefeituras — editar/excluir
  router.patch(
    '/admin/prefeituras/:id',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN'),
    deps.admin.patchPrefeitura,
  );
  router.delete(
    '/admin/prefeituras/:id',
    authenticate,
    requireRole('DESENVOLVEDOR'),
    deps.admin.deletePrefeitura,
  );

  // UBSs — editar/excluir
  router.patch(
    '/admin/ubs/:id',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN'),
    deps.admin.patchUbs,
  );
  router.delete(
    '/admin/ubs/:id',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN'),
    deps.admin.deleteUbs,
  );

  // ----- Recomendações por especialidade (CRUD admin) -----
  // Consumidas pelo app paciente no detalhe do encaminhamento ("o que levar no dia").
  router.get(
    '/admin/recomendacoes-especialidade',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN', 'REGULADOR_SMS'),
    deps.recomendacoes.getList,
  );
  router.get(
    '/admin/recomendacoes-especialidade/:id',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN', 'REGULADOR_SMS'),
    deps.recomendacoes.getById,
  );
  router.post(
    '/admin/recomendacoes-especialidade',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN', 'REGULADOR_SMS'),
    deps.recomendacoes.post,
  );
  router.patch(
    '/admin/recomendacoes-especialidade/:id',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN', 'REGULADOR_SMS'),
    deps.recomendacoes.patch,
  );
  router.delete(
    '/admin/recomendacoes-especialidade/:id',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN'),
    deps.recomendacoes.delete,
  );

  // ----- Banners SMS (CMS admin · 5 endpoints) -----
  // Consumido pelo carrossel "Avisos da Secretaria" no app paciente.
  // DEV: global. ADMIN/REGULADOR_SMS: somente própria prefeitura.
  router.get(
    '/admin/sms-banners',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN', 'REGULADOR_SMS'),
    deps.smsBannersAdmin.getList,
  );
  router.get(
    '/admin/sms-banners/:id',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN', 'REGULADOR_SMS'),
    deps.smsBannersAdmin.getById,
  );
  router.post(
    '/admin/sms-banners',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN', 'REGULADOR_SMS'),
    deps.smsBannersAdmin.post,
  );
  router.patch(
    '/admin/sms-banners/:id',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN', 'REGULADOR_SMS'),
    deps.smsBannersAdmin.patch,
  );
  router.delete(
    '/admin/sms-banners/:id',
    authenticate,
    requireRole('DESENVOLVEDOR', 'ADMIN'),
    deps.smsBannersAdmin.delete,
  );

  // ----- Face 3 · App do Paciente -----
  //
  // 3 prefixos montados pra mesmo controller:
  //   /paciente-app/*    → legado v0.17.x (compat retro · será deprecado)
  //   /auth/paciente/*   → auth + perfil (CONTRATO_BACKEND.md §4)
  //   /paciente/*        → recursos (CONTRATO_BACKEND.md §5-10)
  //
  router.use(
    '/paciente-app',
    buildPacienteAppRoutes(
      deps.pacienteApp,
      deps.passwordRecoveryRateLimiter,
      deps.downloadAnexoRateLimiter,
      deps.dossieRateLimiter,
      deps.bannersRateLimiter,
    ),
  );
  router.use(
    '/auth/paciente',
    buildPacienteAuthRoutes(deps.pacienteApp, deps.passwordRecoveryRateLimiter),
  );
  router.use(
    '/paciente',
    buildPacienteResourcesRoutes(
      deps.pacienteApp,
      deps.downloadAnexoRateLimiter,
      deps.dossieRateLimiter,
      deps.bannersRateLimiter,
    ),
  );

  // ----- Prontuário (CRUD de sub-documentos de paciente) -----
  // Montado sob /pacientes pra bater com o contrato do frontend:
  //   POST /pacientes/:pacienteId/alergias, etc.
  router.use('/pacientes', buildProntuarioRoutes(deps.prontuario, authenticate));

  // ----- Face 4 · TFD (Tratamento Fora do Domicílio) -----
  // Spec: docs/TFD_API.md · 47 rotas com cadeia hash de auditoria
  router.use('/tfd', buildTfdRoutes(deps.tfd, authenticate));

  // ----- Face 4 · App do Motorista (mobile) -----
  // Spec: docs/MOTORISTA_APP_API.md
  router.use('/motorista-app', buildMotoristaAppRoutes(deps.tokens, deps.motoristaApp));

  router.get('/health', (_req, res) => res.json({ ok: true }));

  return router;
}
