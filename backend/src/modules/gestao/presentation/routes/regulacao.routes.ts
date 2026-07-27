/**
 * Rotas da Face 2 (Regulação · SMS).
 *
 * Decisão: REGULADOR_SMS ou DESENVOLVEDOR
 * Leitura agregada (árvore): REGULADOR_SMS, ADMIN ou DESENVOLVEDOR
 *
 * Isolation por prefeitura aplicado dentro dos use cases via AccessScope.
 */
import { Router } from 'express';
import { makeAuthenticate } from '../../../../presentation/middlewares/authenticate';
import { requireRole } from '../../../../presentation/middlewares/requireRole';
import { memoryUpload } from '../../../../presentation/middlewares/uploads';
import type { ITokenService } from '../../../../domain/services/ITokenService';
import type { RegulacaoController } from '../controllers/RegulacaoController';

export function buildRegulacaoRoutes(
  tokens: ITokenService,
  controller: RegulacaoController,
): Router {
  const router = Router();
  const authenticate = makeAuthenticate(tokens);
  const onlyRegulador = requireRole('REGULADOR_SMS', 'DESENVOLVEDOR');
  const reguladorOuAdmin = requireRole('REGULADOR_SMS', 'ADMIN', 'DESENVOLVEDOR');
  const reguladorOuAdminOuCentro = requireRole('REGULADOR_SMS', 'ADMIN', 'DESENVOLVEDOR', 'ATENDENTE_CENTRO');

  // árvore (file-manager) — antes de :id pra não conflitar
  router.get(
    '/encaminhamentos/arvore',
    authenticate,
    reguladorOuAdmin,
    controller.getArvore,
  );

  router.get(
    '/centros/:centro/fila-espera',
    authenticate,
    reguladorOuAdminOuCentro,
    controller.getFilaEsperaCentro,
  );

  // Regulacao em lote / avaliacao SMS (Guia v4.0.0 § 5.2)
  router.patch('/sms/regulacao/lote', authenticate, onlyRegulador, controller.aprovarLote);
  router.patch('/sms/regulacao/avaliar', authenticate, onlyRegulador, controller.aprovarLote);
  router.post('/sms/regulacao/lote', authenticate, onlyRegulador, controller.aprovarLote);
  router.post('/sms/regulacao/avaliar', authenticate, onlyRegulador, controller.aprovarLote);

  router.post(
    '/encaminhamentos/:id/aprovar',
    authenticate,
    onlyRegulador,
    controller.aprovar,
  );

  router.post(
    '/encaminhamentos/:id/agendar',
    authenticate,
    reguladorOuAdminOuCentro,
    controller.agendar,
  );

  router.post(
    '/encaminhamentos/:id/registrar-pendencia',
    authenticate,
    onlyRegulador,
    controller.registrarPendencia,
  );

  router.post(
    '/encaminhamentos/:id/rejeitar',
    authenticate,
    onlyRegulador,
    controller.rejeitar,
  );

  router.post(
    '/encaminhamentos/:id/resposta-sus',
    authenticate,
    onlyRegulador,
    memoryUpload.single('file'),
    controller.registrarRespostaSus,
  );

  return router;
}
