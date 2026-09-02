import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ListPacientesUseCase } from '../../application/pacientes/ListPacientesUseCase';
import type { GetPacienteUseCase } from '../../application/pacientes/GetPacienteUseCase';
import type { UpdatePacienteUseCase } from '../../application/pacientes/UpdatePacienteUseCase';
import type { DeletePacienteUseCase } from '../../application/pacientes/DeletePacienteUseCase';
import type { BuscarPacientePorCpfUseCase } from '../../application/pacientes/BuscarPacientePorCpfUseCase';
import { paramString } from '../../shared/http';
import { scopeFromRequest } from '../../shared/requestScope';

const patchPacienteSchema = z.object({
  nome: z.string().min(2).optional(),
  nomeSocial: z.string().nullable().optional(),
  cartaoSus: z.string().nullable().optional(),
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sexo: z.enum(['M', 'F', 'OUTRO']).optional(),
  telefone: z.string().nullable().optional(),
  telefoneSecundario: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  nomeMae: z.string().nullable().optional(),
  nomePai: z.string().nullable().optional(),
  estadoCivil: z.enum(['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL', 'OUTRO']).optional(),
  escolaridade: z.string().nullable().optional(),
  profissao: z.string().nullable().optional(),
  racaCor: z.enum(['BRANCA', 'PRETA', 'PARDA', 'AMARELA', 'INDIGENA', 'NAO_INFORMADA']).optional(),
  endereco: z.string().nullable().optional(),
  bairro: z.string().nullable().optional(),
  municipio: z.string().nullable().optional(),
  uf: z.string().nullable().optional(),
  cep: z.string().nullable().optional(),
  grupoSanguineo: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'NAO_INFORMADO']).optional(),
  historicoFamiliar: z.array(z.string()).optional(),
  agenteComunitario: z.string().nullable().optional(),
  microarea: z.string().nullable().optional(),
  equipeSaudeFamilia: z.string().nullable().optional(),
});

const listarSchema = z.object({
  q: z.string().optional(),
  filtro: z.enum(['COM_CRONICAS', 'COM_ENCAMINHAMENTOS', 'SEM_ATENDIMENTO_90D']).optional(),
  equipeId: z.string().optional(),
  microarea: z.string().optional(),
  ubsId: z.string().optional(),
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(500).default(50).optional(),
  paginado: z.enum(['true', 'false']).optional(),
});

export class PacienteController {
  constructor(
    private readonly list: ListPacientesUseCase,
    private readonly getOne: GetPacienteUseCase,
    private readonly update: UpdatePacienteUseCase,
    private readonly remove: DeletePacienteUseCase,
    private readonly buscarPorCpf: BuscarPacientePorCpfUseCase,
  ) {}

  getPorCpf = async (req: Request, res: Response): Promise<void> => {
    const cpf = paramString(req, 'cpf');
    const out = await this.buscarPorCpf.exec(cpf, scopeFromRequest(req));
    res.json(out);
  };

  getMetricas = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const m = await this.list.metricas(scope);
    res.json(m);
  };

  getList = async (req: Request, res: Response): Promise<void> => {
    const q = listarSchema.parse(req.query);
    const scope = scopeFromRequest(req);
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;

    const paginado = await this.list.execPaginado({
      scope,
      page,
      limit,
      ...(q.q ? { q: q.q } : {}),
      ...(q.filtro ? { filtro: q.filtro } : {}),
      ...(q.equipeId ? { equipeId: q.equipeId } : {}),
      ...(q.microarea ? { microarea: q.microarea } : {}),
      ...(q.ubsId ? { ubsId: q.ubsId } : {}),
    });

    res.setHeader('x-total-count', paginado.total.toString());
    res.setHeader('x-page', paginado.page.toString());
    res.setHeader('x-limit', paginado.limit.toString());
    res.setHeader('x-total-pages', paginado.totalPages.toString());

    if (q.paginado === 'true' || req.query.page !== undefined || req.query.limit !== undefined) {
      res.json(paginado);
    } else {
      res.json(paginado.itens);
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const p = await this.getOne.exec(paramString(req, 'id'), scopeFromRequest(req));
    res.json(p);
  };

  patch = async (req: Request, res: Response): Promise<void> => {
    const body = patchPacienteSchema.parse(req.body ?? {});
    const out = await this.update.exec(
      scopeFromRequest(req),
      req.auth!.sub,
      paramString(req, 'id'),
      body,
    );
    res.json(out);
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    await this.remove.exec(scopeFromRequest(req), req.auth!.sub, paramString(req, 'id'));
    res.status(204).send();
  };
}
