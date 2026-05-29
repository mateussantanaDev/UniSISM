/**
 * Controller HTTP de Banners SMS (CMS admin).
 *
 * Rotas montadas sob `/v1/admin/sms-banners` em `routes/index.ts`.
 * RBAC: DEV, ADMIN, REGULADOR_SMS.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { paramString } from '../../shared/http';
import { scopeFromRequest } from '../../shared/requestScope';
import type {
  ListarBannersAdminUseCase,
  ObterBannerAdminUseCase,
  CriarBannerAdminUseCase,
  AtualizarBannerAdminUseCase,
  DeletarBannerAdminUseCase,
} from '../../application/admin/SmsBannerAdminUseCases';
import { LIMITES_BANNER } from '../../shared/bannerValidators';

const toneEnum = z.enum(['URGENTE', 'CAMPANHA', 'INFO', 'ATENCAO']);

const criarSchema = z.object({
  titulo: z.string().min(3).max(LIMITES_BANNER.TITULO_MAX),
  corpo: z.string().min(3).max(LIMITES_BANNER.CORPO_MAX),
  tone: toneEnum,
  publicadoEm: z.string().datetime({ offset: true }).optional(),
  expiraEm: z.string().datetime({ offset: true }).nullable().optional(),
  imagemUrl: z.string().max(LIMITES_BANNER.URL_MAX).nullable().optional(),
  ctaLabel: z.string().max(LIMITES_BANNER.CTA_LABEL_MAX).nullable().optional(),
  ctaUrl: z.string().max(LIMITES_BANNER.URL_MAX).nullable().optional(),
  prioridadeOrdem: z
    .number()
    .int()
    .min(LIMITES_BANNER.PRIORIDADE_MIN)
    .max(LIMITES_BANNER.PRIORIDADE_MAX)
    .optional(),
  prefeituraId: z.string().nullable().optional(),
});

const atualizarSchema = z.object({
  titulo: z.string().min(3).max(LIMITES_BANNER.TITULO_MAX).optional(),
  corpo: z.string().min(3).max(LIMITES_BANNER.CORPO_MAX).optional(),
  tone: toneEnum.optional(),
  publicadoEm: z.string().datetime({ offset: true }).optional(),
  expiraEm: z.string().datetime({ offset: true }).nullable().optional(),
  imagemUrl: z.string().max(LIMITES_BANNER.URL_MAX).nullable().optional(),
  ctaLabel: z.string().max(LIMITES_BANNER.CTA_LABEL_MAX).nullable().optional(),
  ctaUrl: z.string().max(LIMITES_BANNER.URL_MAX).nullable().optional(),
  prioridadeOrdem: z
    .number()
    .int()
    .min(LIMITES_BANNER.PRIORIDADE_MIN)
    .max(LIMITES_BANNER.PRIORIDADE_MAX)
    .optional(),
  ativo: z.boolean().optional(),
});

const listarQuerySchema = z.object({
  ativo: z.enum(['true', 'false']).optional().transform((v) =>
    v === undefined ? undefined : v === 'true',
  ),
  expirados: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export class SmsBannersAdminController {
  constructor(
    private readonly listar: ListarBannersAdminUseCase,
    private readonly obter: ObterBannerAdminUseCase,
    private readonly criar: CriarBannerAdminUseCase,
    private readonly atualizar: AtualizarBannerAdminUseCase,
    private readonly deletar: DeletarBannerAdminUseCase,
  ) {}

  getList = async (req: Request, res: Response): Promise<void> => {
    const q = listarQuerySchema.parse(req.query);
    const filtros: { ativo?: boolean; expirados?: boolean } = {};
    if (q.ativo !== undefined) filtros.ativo = q.ativo;
    if (q.expirados !== undefined) filtros.expirados = q.expirados;
    const out = await this.listar.exec(scopeFromRequest(req), filtros);
    res.json(out);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const out = await this.obter.exec(scopeFromRequest(req), paramString(req, 'id'));
    res.json(out);
  };

  post = async (req: Request, res: Response): Promise<void> => {
    const body = criarSchema.parse(req.body ?? {});
    const out = await this.criar.exec(scopeFromRequest(req), body, _auditCtx(req));
    res.status(201).json(out);
  };

  patch = async (req: Request, res: Response): Promise<void> => {
    const body = atualizarSchema.parse(req.body ?? {});
    const out = await this.atualizar.exec(
      scopeFromRequest(req),
      paramString(req, 'id'),
      body,
      _auditCtx(req),
    );
    res.json(out);
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    await this.deletar.exec(scopeFromRequest(req), paramString(req, 'id'), _auditCtx(req));
    res.status(204).send();
  };
}

function _auditCtx(req: Request): {
  atendenteId: string;
  ip?: string | null;
  userAgent?: string | null;
} {
  return {
    atendenteId: req.auth!.sub,
    ip: req.ip ?? null,
    userAgent: req.header('user-agent') ?? null,
  };
}
