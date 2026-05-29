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
 * Rotas Face 3 · App Paciente.
 *
 * **Endpoints públicos** (sem JWT paciente) levam camadas adicionais de
 * rate limit por IP (anti DDoS + anti brute force + anti enumeration):
 *
 *   POST /auth/login           → 30 req/15min/IP (genérico)
 *   POST /auth/ativar-conta    → 30 req/15min/IP (genérico)
 *   POST /auth/esqueci-senha   → 5 req/15min/IP + 100 req/1h/IP + 3 req/1h/CPF
 *   POST /auth/redefinir-senha → 10 req/15min/IP + 30 req/1h/IP
 *
 * Use case ainda aplica suas próprias defesas (anti-enumeration silenciosa
 * no esqueci-senha, audit log em todos os caminhos, etc.) — defesa em
 * profundidade.
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
  router.post('/auth/ativar-conta', rl.generico('ativar'), controller.postAtivar);
  router.post('/auth/esqueci-senha', rl.esqueciSenha, controller.postEsqueciSenha);
  router.post('/auth/redefinir-senha', rl.redefinirSenha, controller.postRedefinirSenha);

  // ─────────── autenticadas ───────────
  router.post('/auth/logout', authenticatePaciente, controller.postLogout);
  router.post('/auth/trocar-senha', authenticatePaciente, controller.postTrocarSenha);
  router.get('/me', authenticatePaciente, controller.getMe);

  // Push notifications (v0.16+: endpoint genérico /me/push-token)
  router.post('/me/push-token', authenticatePaciente, controller.postPushToken);
  router.delete('/me/push-token', authenticatePaciente, controller.deletePushToken);
  // Legacy FCM (mantém por retrocompat — delega pro novo via adapter)
  router.post('/me/fcm-token', authenticatePaciente, controller.postFcmToken);
  router.delete('/me/fcm-token', authenticatePaciente, controller.deleteFcmToken);

  // Encaminhamentos
  router.get('/meus-encaminhamentos', authenticatePaciente, controller.getMeusEncaminhamentos);

  // Notificações
  router.get('/notificacoes', authenticatePaciente, controller.getNotificacoes);
  router.get('/notificacoes/count', authenticatePaciente, controller.getNotificacoesCount);
  router.post('/notificacoes/:id/lida', authenticatePaciente, controller.postMarcarLida);
  router.post(
    '/notificacoes/marcar-todas-lidas',
    authenticatePaciente,
    controller.postMarcarTodasLidas,
  );

  // UBS
  router.get('/ubs/minha', authenticatePaciente, controller.getMinhaUbs);

  // Dossiê médico (rate-limited: 120/15min/conta + 600/1h/conta + 1000/15min/IP)
  router.get('/dossie/resumo', authenticatePaciente, rlDossie, controller.getDossieResumo);
  router.get('/dossie/atendimentos', authenticatePaciente, rlDossie, controller.getDossieAtendimentos);
  router.get('/dossie/vacinacoes', authenticatePaciente, rlDossie, controller.getDossieVacinacoes);
  router.get('/dossie/exames', authenticatePaciente, rlDossie, controller.getDossieExames);

  // Banners (rate-limited: 240/15min/conta + 1200/1h/conta + 2000/15min/IP)
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

  // Anexos (rate-limited: 60 req/15min/conta + 200 req/1h/conta + 300 req/15min/IP)
  router.get(
    '/anexos/:id/download',
    authenticatePaciente,
    rlDownload,
    controller.getDownloadAnexo,
  );

  return router;
}
