/**
 * Controller HTTP de recomendações por especialidade.
 *
 * Rotas montadas sob `/v1/admin/recomendacoes-especialidade` em `routes/index.ts`.
 * RBAC: DEV, ADMIN, REGULADOR_SMS.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { paramString } from '../../shared/http';
import type {
  ListarRecomendacoesUseCase,
  ObterRecomendacaoUseCase,
  CriarRecomendacaoUseCase,
  AtualizarRecomendacaoUseCase,
  DeletarRecomendacaoUseCase,
} from '../../application/admin/RecomendacoesEspecialidadeUseCases';

const criarSchema = z.object({
  especialidade: z.string().min(3).max(80),
  recomendacoes: z.array(z.string()).min(1).max(10),
});

const atualizarSchema = z.object({
  especialidade: z.string().min(3).max(80).optional(),
  recomendacoes: z.array(z.string()).min(1).max(10).optional(),
  ativo: z.boolean().optional(),
});

const listarQuerySchema = z.object({
  somenteAtivos: z.coerce.boolean().optional(),
});

export class RecomendacoesController {
  constructor(
    private readonly listar: ListarRecomendacoesUseCase,
    private readonly obter: ObterRecomendacaoUseCase,
    private readonly criar: CriarRecomendacaoUseCase,
    private readonly atualizar: AtualizarRecomendacaoUseCase,
    private readonly deletar: DeletarRecomendacaoUseCase,
  ) {}

  getList = async (req: Request, res: Response): Promise<void> => {
    const q = listarQuerySchema.parse(req.query);
    const out = await this.listar.exec({
      ...(q.somenteAtivos !== undefined ? { somenteAtivos: q.somenteAtivos } : {}),
    });
    res.json(out);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const out = await this.obter.exec(paramString(req, 'id'));
    res.json(out);
  };

  post = async (req: Request, res: Response): Promise<void> => {
    const body = criarSchema.parse(req.body ?? {});
    const out = await this.criar.exec(body, _auditCtx(req));
    res.status(201).json(out);
  };

  patch = async (req: Request, res: Response): Promise<void> => {
    const body = atualizarSchema.parse(req.body ?? {});
    const out = await this.atualizar.exec(paramString(req, 'id'), body, _auditCtx(req));
    res.json(out);
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    await this.deletar.exec(paramString(req, 'id'), _auditCtx(req));
    res.status(204).send();
  };
}

/** Constrói contexto de audit a partir do req (autenticado). */
function _auditCtx(req: Request): { atendenteId: string; ip?: string | null; userAgent?: string | null } {
  return {
    atendenteId: req.auth!.sub,
    ip: req.ip ?? null,
    userAgent: req.header('user-agent') ?? null,
  };
}
