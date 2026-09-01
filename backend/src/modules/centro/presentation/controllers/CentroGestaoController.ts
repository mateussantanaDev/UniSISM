import type { Request, Response } from 'express';
import { z } from 'zod';
import { paramString } from '../../../../shared/http';
import { scopeFromRequest } from '../../../../shared/requestScope';
import type { IAtendenteRepository } from '../../../../domain/repositories/IAtendenteRepository';
import type { GestaoCotasUseCase } from '../../application/use-cases/GestaoCotasUseCase';
import type { GestaoEscalasUseCase } from '../../application/use-cases/GestaoEscalasUseCase';
import type { RemanejamentoLoteUseCase } from '../../application/use-cases/RemanejamentoLoteUseCase';
import type { RelatorioBpaUseCase } from '../../application/use-cases/RelatorioBpaUseCase';
import type { AuditoriaCentroUseCase } from '../../application/use-cases/AuditoriaCentroUseCase';
import type { MetricasDashboardDiretoriaUseCase } from '../../application/use-cases/MetricasDashboardDiretoriaUseCase';
import type { GestaoSalasUseCase } from '../../application/use-cases/GestaoSalasUseCase';
import type { GestaoEspecialidadesCatalogoUseCase } from '../../application/use-cases/GestaoEspecialidadesCatalogoUseCase';
import { NotFound } from '../../../../shared/errors';

const putCotaSchema = z.object({
  totalCotasMes: z.number().int().min(1),
  especialidades: z.record(z.string(), z.number().int().min(0)),
});

const postEscalaSchema = z.object({
  medicoNome: z.string().min(2),
  crm: z.string().min(2),
  especialidade: z.string().min(2),
  diasSemana: z.array(z.string()).min(1),
  horarioInicio: z.string().regex(/^\d{2}:\d{2}$/),
  horarioFim: z.string().regex(/^\d{2}:\d{2}$/),
  duracaoMinutos: z.number().int().default(20),
  vagasPorTurno: z.number().int().default(12),
});

const putEscalaSchema = postEscalaSchema.partial();

const postSalaSchema = z.object({
  codigo: z.string().min(1),
  nome: z.string().min(2),
  especialidadePrincipal: z.string().min(2),
  status: z.enum(['DISPONIVEL', 'EM_ATENDIMENTO', 'MANUTENCAO', 'RESERVADA']).default('DISPONIVEL'),
  equipamentos: z.array(z.string()).default([]),
  ala: z.string().optional(),
});

const putSalaSchema = postSalaSchema.partial();

const postEspecialidadeSchema = z.object({
  nome: z.string().min(2),
  codigoSigtap: z.string().optional(),
  tempoPadraoMinutos: z.number().int().default(20),
  valorTabelaBrl: z.number().default(0),
  documentosObrigatorios: z.array(z.string()).default([]),
  preparoRequerido: z.string().optional(),
  ativa: z.boolean().default(true),
});

const putEspecialidadeSchema = postEspecialidadeSchema.partial();

const remanejamentoSchema = z.object({
  medicoOrigem: z.string().min(2),
  dataOrigem: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  medicoDestino: z.string().min(2),
  dataDestino: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notificarSms: z.boolean().optional(),
});

export class CentroGestaoController {
  constructor(
    private readonly atendentes: IAtendenteRepository,
    private readonly cotasUC: GestaoCotasUseCase,
    private readonly escalasUC: GestaoEscalasUseCase,
    private readonly remanejamentoUC: RemanejamentoLoteUseCase,
    private readonly relatorioBpaUC: RelatorioBpaUseCase,
    private readonly auditoriaUC: AuditoriaCentroUseCase,
    private readonly dashboardUC: MetricasDashboardDiretoriaUseCase,
    private readonly salasUC: GestaoSalasUseCase,
    private readonly especialidadesUC: GestaoEspecialidadesCatalogoUseCase,
  ) {}

  getDashboard = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const centro = req.query.centro as string | undefined;
    const metrics = await this.dashboardUC.exec(scope, centro);
    res.json(metrics);
  };

  getCotas = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const cotas = await this.cotasUC.listarCotas(scope);
    res.json(cotas);
  };

  putCota = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const ubsId = paramString(req, 'ubsId');
    const body = putCotaSchema.parse(req.body);
    const atendenteId = req.auth!.sub;

    const result = await this.cotasUC.atualizarCota(ubsId, body, scope, atendenteId);
    res.json(result);
  };

  getEscalas = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const centro = req.query.centro as string | undefined;
    const escalas = await this.escalasUC.listarEscalas(scope, centro);
    res.json(escalas);
  };

  postEscala = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const body = postEscalaSchema.parse(req.body);
    const atendenteId = req.auth!.sub;

    const result = await this.escalasUC.criarEscala(body, scope, atendenteId);
    res.status(201).json(result);
  };

  putEscala = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const id = paramString(req, 'id');
    const body = putEscalaSchema.parse(req.body);
    const atendenteId = req.auth!.sub;

    const result = await this.escalasUC.atualizarEscala(id, body, scope, atendenteId);
    res.json(result);
  };

  deleteEscala = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const id = paramString(req, 'id');
    const atendenteId = req.auth!.sub;

    await this.escalasUC.deletarEscala(id, scope, atendenteId);
    res.status(204).send();
  };

  getSalas = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const centro = req.query.centro as string | undefined;
    const salas = await this.salasUC.listarSalas(scope, centro);
    res.json(salas);
  };

  postSala = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const body = postSalaSchema.parse(req.body);
    const atendenteId = req.auth!.sub;

    const result = await this.salasUC.criarSala(body, scope, atendenteId);
    res.status(201).json(result);
  };

  putSala = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const id = paramString(req, 'id');
    const body = putSalaSchema.parse(req.body);
    const atendenteId = req.auth!.sub;

    const result = await this.salasUC.atualizarSala(id, body, scope, atendenteId);
    res.json(result);
  };

  deleteSala = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const id = paramString(req, 'id');
    const atendenteId = req.auth!.sub;

    await this.salasUC.deletarSala(id, scope, atendenteId);
    res.status(204).send();
  };

  getEspecialidades = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const lista = await this.especialidadesUC.listarEspecialidades(scope);
    res.json(lista);
  };

  postEspecialidade = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const body = postEspecialidadeSchema.parse(req.body);
    const atendenteId = req.auth!.sub;

    const result = await this.especialidadesUC.criarEspecialidade(body, scope, atendenteId);
    res.status(201).json(result);
  };

  putEspecialidade = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const id = paramString(req, 'id');
    const body = putEspecialidadeSchema.parse(req.body);
    const atendenteId = req.auth!.sub;

    const result = await this.especialidadesUC.atualizarEspecialidade(id, body, scope, atendenteId);
    res.json(result);
  };

  deleteEspecialidade = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const id = paramString(req, 'id');
    const atendenteId = req.auth!.sub;

    await this.especialidadesUC.deletarEspecialidade(id, scope, atendenteId);
    res.status(204).send();
  };

  postRemanejamentoLote = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const body = remanejamentoSchema.parse(req.body);
    const atendente = await this.atendentes.buscarPorId(req.auth!.sub);
    if (!atendente) throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');

    const result = await this.remanejamentoUC.exec(
      {
        medicoOrigem: body.medicoOrigem,
        dataOrigem: body.dataOrigem,
        medicoDestino: body.medicoDestino,
        dataDestino: body.dataDestino,
        notificarSms: body.notificarSms,
        atendenteId: atendente.id,
        atendenteNome: atendente.nome,
      },
      scope,
    );

    res.json(result);
  };

  getRelatorioBpa = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const periodo = req.query.periodo as string | undefined;

    const report = await this.relatorioBpaUC.exec({ periodo }, scope);
    res.json(report);
  };

  getAuditoria = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const acao = req.query.acao as string | undefined;

    const audit = await this.auditoriaUC.exec({ limit, offset, acao }, scope);
    res.json(audit);
  };
}
