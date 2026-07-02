import { Router } from 'express';
import { authenticatePaciente } from '../middlewares/authenticatePaciente';
import {
  buildFace3RateLimitMiddlewares,
  buildDownloadAnexoRateLimitMiddleware,
  buildDossieRateLimitMiddleware,
  buildBannersRateLimitMiddleware,
} from '../middlewares/rateLimitFace3';
import type { PacienteAppController } from '../controllers/PacienteAppController';
import type { PasswordRecoveryRateLimiter } from '../../infrastructure/PasswordRecoveryRateLimiter';
import type { DownloadAnexoRateLimiter } from '../../infrastructure/DownloadAnexoRateLimiter';
import type { DossieRateLimiter } from '../../infrastructure/DossieRateLimiter';
import type { BannersRateLimiter } from '../../infrastructure/BannersRateLimiter';

/**
 * Rotas Face 3 · App Paciente · v0.18.1+
 *
 * Arquitetura em 3 builders:
 *
 *   buildPacienteAppRoutes        → legacy "/paciente-app/*"     (compat retro)
 *   buildPacienteAuthRoutes       → novo    "/auth/paciente/*"   (auth e perfil)
 *   buildPacienteResourcesRoutes  → novo    "/paciente/*"        (recursos)
 *
 * Todos os 3 routers usam os MESMOS handlers do PacienteAppController e os
 * MESMOS rate limiters. Só muda o agrupamento de paths pra bater com o
 * CONTRATO_BACKEND.md do app Flutter.
 *
 * **Endpoints públicos** (sem JWT paciente) levam camadas adicionais de
 * rate limit por IP (anti DDoS + anti brute force + anti enumeration):
 *
 *   POST /auth/login           → 30 req/15min/IP (genérico)
 *   POST /auth/ativar-conta    → 30 req/15min/IP (genérico)
 *   POST /auth/esqueci-senha   → 5 req/15min/IP + 100 req/1h/IP + 3 req/1h/CPF
 *   POST /auth/redefinir-senha → 10 req/15min/IP + 30 req/1h/IP
 */
export function buildPacienteAppRoutes(
  controller: PacienteAppController,
  rateLimiter: PasswordRecoveryRateLimiter,
  downloadRateLimiter: DownloadAnexoRateLimiter,
  dossieRateLimiter: DossieRateLimiter,
  bannersRateLimiter: BannersRateLimiter,
): Router {
  const router = Router();
  const rl = buildFace3RateLimitMiddlewares(rateLimiter);
  const rlDownload = buildDownloadAnexoRateLimitMiddleware(downloadRateLimiter);
  const rlDossie = buildDossieRateLimitMiddleware(dossieRateLimiter);
  const rlBanners = buildBannersRateLimitMiddleware(bannersRateLimiter);

  // ─────────── públicas (rate-limited por IP) ───────────
  router.post('/auth/login', rl.generico('login'), controller.postLogin);
  router.post('/auth/refresh', rl.generico('refresh'), controller.postRefresh);
  router.post('/auth/ativar-conta', rl.generico('ativar'), controller.postAtivar);
  router.post('/auth/esqueci-senha', rl.esqueciSenha, controller.postEsqueciSenha);
  router.post('/auth/redefinir-senha', rl.redefinirSenha, controller.postRedefinirSenha);

  // ─────────── autenticadas ───────────
  router.post('/auth/logout', authenticatePaciente, controller.postLogout);
  router.post('/auth/trocar-senha', authenticatePaciente, controller.postTrocarSenha);
  router.get('/me', authenticatePaciente, controller.getMe);

  // Push (v0.16+: endpoint genérico /me/push-token)
  router.post('/me/push-token', authenticatePaciente, controller.postPushToken);
  router.delete('/me/push-token', authenticatePaciente, controller.deletePushToken);
  router.post('/me/fcm-token', authenticatePaciente, controller.postFcmToken);
  router.delete('/me/fcm-token', authenticatePaciente, controller.deleteFcmToken);

  // Encaminhamentos
  router.get('/meus-encaminhamentos', authenticatePaciente, controller.getMeusEncaminhamentos);
  router.get('/encaminhamentos/ativo', authenticatePaciente, controller.getEncaminhamentoAtivo);
  router.get('/encaminhamentos/:id', authenticatePaciente, controller.getEncaminhamentoById);
  router.get('/encaminhamentos/:id/anexos', authenticatePaciente, controller.getEncaminhamentoAnexos);
  router.get('/encaminhamentos/:id/timeline', authenticatePaciente, controller.getEncaminhamentoTimeline);

  // Notificações
  router.get('/notificacoes', authenticatePaciente, controller.getNotificacoes);
  router.get('/notificacoes/count', authenticatePaciente, controller.getNotificacoesCount);
  router.get('/notificacoes/contagem-nao-lidas', authenticatePaciente, controller.getNotificacoesCount); // alias contrato
  router.post('/notificacoes/:id/lida', authenticatePaciente, controller.postMarcarLida);
  router.post('/notificacoes/:id/marcar-lida', authenticatePaciente, controller.postMarcarLida); // alias contrato
  router.post('/notificacoes/marcar-todas-lidas', authenticatePaciente, controller.postMarcarTodasLidas);

  // UBS
  router.get('/ubs/minha', authenticatePaciente, controller.getMinhaUbs);

  // Dossiê (rate-limited: 120/15min/conta + 600/1h/conta + 1000/15min/IP)
  router.get('/dossie/resumo', authenticatePaciente, rlDossie, controller.getDossieResumo);
  router.get('/dossie/atendimentos', authenticatePaciente, rlDossie, controller.getDossieAtendimentos);
  router.get('/dossie/vacinacoes', authenticatePaciente, rlDossie, controller.getDossieVacinacoes);
  router.get('/dossie/exames', authenticatePaciente, rlDossie, controller.getDossieExames);
  // Detalhe (v0.18.2+) — mesmo rate-limit do dossiê
  router.get('/dossie/atendimentos/:id', authenticatePaciente, rlDossie, controller.getDossieAtendimento);
  router.get('/dossie/vacinacoes/:id', authenticatePaciente, rlDossie, controller.getDossieVacinacao);
  router.get('/dossie/exames/:id', authenticatePaciente, rlDossie, controller.getDossieExame);

  // Banners
  router.get('/banners', authenticatePaciente, rlBanners, controller.getBanners);
  router.get('/banners/:id', authenticatePaciente, rlBanners, controller.getBanner);
  router.post('/banners/:id/visto', authenticatePaciente, rlBanners, controller.postBannerVisto);

  // TFD
  router.get('/tfd/viagens', authenticatePaciente, controller.getTfdViagens);
  router.get('/tfd/viagens/:viagemId', authenticatePaciente, controller.getTfdViagem);
  router.get('/tfd/solicitacoes', authenticatePaciente, controller.getTfdSolicitacoes);
  router.get('/tfd/solicitacoes/:id', authenticatePaciente, controller.getTfdSolicitacao);
  router.post('/tfd/solicitacoes', authenticatePaciente, controller.postTfdSolicitacao);
  router.delete('/tfd/solicitacoes/:id', authenticatePaciente, controller.deleteTfdSolicitacao);

  // Anexos download
  router.get('/anexos/:id/download', authenticatePaciente, rlDownload, controller.getDownloadAnexo);

  return router;
}

/**
 * Router de auth + perfil — montado sob `/auth/paciente/*`.
 * Espelha CONTRATO_BACKEND.md §4.
 */
export function buildPacienteAuthRoutes(
  controller: PacienteAppController,
  rateLimiter: PasswordRecoveryRateLimiter,
): Router {
  const router = Router();
  const rl = buildFace3RateLimitMiddlewares(rateLimiter);

  // ─────────── públicas ───────────
  router.post('/login', rl.generico('login'), controller.postLogin);
  router.post('/refresh', rl.generico('refresh'), controller.postRefresh);
  router.post('/esqueci-senha', rl.esqueciSenha, controller.postEsqueciSenha);
  router.post('/redefinir-senha', rl.redefinirSenha, controller.postRedefinirSenha);
  router.post('/ativar-conta', rl.generico('ativar'), controller.postAtivar);

  // ─────────── autenticadas ───────────
  router.post('/logout', authenticatePaciente, controller.postLogout);
  router.post('/trocar-senha', authenticatePaciente, controller.postTrocarSenha);
  router.get('/me', authenticatePaciente, controller.getMe);

  // Push (contrato §4.8): `/registrar-dispositivo` é o nome esperado
  router.post('/registrar-dispositivo', authenticatePaciente, controller.postRegistrarDispositivo);

  return router;
}

/**
 * Router de recursos — montado sob `/paciente/*`.
 * Espelha CONTRATO_BACKEND.md §5-10.
 */
export function buildPacienteResourcesRoutes(
  controller: PacienteAppController,
  downloadRateLimiter: DownloadAnexoRateLimiter,
  dossieRateLimiter: DossieRateLimiter,
  bannersRateLimiter: BannersRateLimiter,
): Router {
  const router = Router();
  const rlDownload = buildDownloadAnexoRateLimitMiddleware(downloadRateLimiter);
  const rlDossie = buildDossieRateLimitMiddleware(dossieRateLimiter);
  const rlBanners = buildBannersRateLimitMiddleware(bannersRateLimiter);

  // ─────────── Encaminhamentos ───────────
  router.get('/encaminhamentos', authenticatePaciente, controller.getMeusEncaminhamentos);
  router.get('/encaminhamentos/ativo', authenticatePaciente, controller.getEncaminhamentoAtivo);
  router.get('/encaminhamentos/:id', authenticatePaciente, controller.getEncaminhamentoById);
  router.get('/encaminhamentos/:id/anexos', authenticatePaciente, controller.getEncaminhamentoAnexos);
  router.get('/encaminhamentos/:id/timeline', authenticatePaciente, controller.getEncaminhamentoTimeline);

  // Anexo download (paths globais — fora de encaminhamentos)
  router.get('/anexos/:id/download', authenticatePaciente, rlDownload, controller.getDownloadAnexo);

  // ─────────── Notificações ───────────
  router.get('/notificacoes', authenticatePaciente, controller.getNotificacoes);
  router.get('/notificacoes/contagem-nao-lidas', authenticatePaciente, controller.getNotificacoesCount);
  router.get('/notificacoes/count', authenticatePaciente, controller.getNotificacoesCount); // alias
  router.post('/notificacoes/:id/marcar-lida', authenticatePaciente, controller.postMarcarLida);
  router.post('/notificacoes/:id/lida', authenticatePaciente, controller.postMarcarLida); // alias
  router.post('/notificacoes/marcar-todas-lidas', authenticatePaciente, controller.postMarcarTodasLidas);

  // ─────────── UBS ───────────
  router.get('/ubs/minha', authenticatePaciente, controller.getMinhaUbs);

  // ─────────── Dossiê ───────────
  router.get('/dossie/resumo', authenticatePaciente, rlDossie, controller.getDossieResumo);
  router.get('/dossie/atendimentos', authenticatePaciente, rlDossie, controller.getDossieAtendimentos);
  router.get('/dossie/vacinacoes', authenticatePaciente, rlDossie, controller.getDossieVacinacoes);
  router.get('/dossie/exames', authenticatePaciente, rlDossie, controller.getDossieExames);
  // Detalhe (v0.18.2+)
  router.get('/dossie/atendimentos/:id', authenticatePaciente, rlDossie, controller.getDossieAtendimento);
  router.get('/dossie/vacinacoes/:id', authenticatePaciente, rlDossie, controller.getDossieVacinacao);
  router.get('/dossie/exames/:id', authenticatePaciente, rlDossie, controller.getDossieExame);

  // ─────────── Banners ───────────
  router.get('/banners', authenticatePaciente, rlBanners, controller.getBanners);
  router.get('/banners/:id', authenticatePaciente, rlBanners, controller.getBanner);
  router.post('/banners/:id/visto', authenticatePaciente, rlBanners, controller.postBannerVisto);

  // ─────────── TFD ───────────
  router.get('/tfd/viagens', authenticatePaciente, controller.getTfdViagens);
  router.get('/tfd/viagens/:viagemId', authenticatePaciente, controller.getTfdViagem);
  router.get('/tfd/solicitacoes', authenticatePaciente, controller.getTfdSolicitacoes);
  router.get('/tfd/solicitacoes/:id', authenticatePaciente, controller.getTfdSolicitacao);
  router.post('/tfd/solicitacoes', authenticatePaciente, controller.postTfdSolicitacao);
  router.delete('/tfd/solicitacoes/:id', authenticatePaciente, controller.deleteTfdSolicitacao);

  return router;
}
