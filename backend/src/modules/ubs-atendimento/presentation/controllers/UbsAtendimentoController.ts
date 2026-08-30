import type { Request, Response } from 'express';
import { z } from 'zod';
import { scopeFromRequest } from '../../../../shared/requestScope';
import { paramString } from '../../../../shared/http';
import type { AdicionarFilaUbsUseCase } from '../../application/use-cases/AdicionarFilaUbsUseCase';
import type { ListarFilaDiaUbsUseCase } from '../../application/use-cases/ListarFilaDiaUbsUseCase';
import type { ChamarPacienteUbsUseCase } from '../../application/use-cases/ChamarPacienteUbsUseCase';
import type { AtualizarStatusAtendimentoUbsUseCase } from '../../application/use-cases/AtualizarStatusAtendimentoUbsUseCase';
import type { ObterUltimasChamadasPainelUbsUseCase } from '../../application/use-cases/ObterUltimasChamadasPainelUbsUseCase';
import type { IAtendenteRepository } from '../../../../domain/repositories/IAtendenteRepository';

const adicionarSchema = z.object({
  pacienteId: z.string().optional(),
  paciente: z
    .object({
      nome: z.string().min(2),
      cpf: z.string().min(11),
      cartaoSus: z.string().optional(),
      dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      sexo: z.enum(['M', 'F', 'OUTRO']).optional(),
      telefone: z.string().optional(),
      endereco: z.string().optional(),
    })
    .optional(),
  tipoAtendimento: z.enum([
    'CONSULTA_MEDICA',
    'ENFERMAGEM',
    'ACOLHIMENTO_TRIAGEM',
    'PRE_NATAL',
    'HIPERDIA',
    'PUERICULTURA',
    'VACINACAO',
    'CURATIVO',
    'ODONTOLOGIA',
  ]),
  prioridade: z.enum([
    'URGENCIA',
    'SUPER_PRIORIDADE_80',
    'GESTANTE_LACTANTE',
    'PCD',
    'TEA',
    'IDOSO_60',
    'NORMAL',
  ]),
  medicoId: z.string().optional(),
  medicoNome: z.string().optional(),
  crm: z.string().optional(),
  consultorio: z.string().optional(),
  queixaBreve: z.string().optional(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ubsId: z.string().optional(),
});

const chamarSchema = z.object({
  consultorio: z.string().optional(),
  crm: z.string().optional(),
});

const statusSchema = z.object({
  status: z.enum(['AGUARDANDO', 'CHAMADO', 'EM_ATENDIMENTO', 'CONCLUIDO', 'FALTOU', 'CANCELADO']),
  observacao: z.string().optional(),
  consultorio: z.string().optional(),
});

export class UbsAtendimentoController {
  constructor(
    private readonly adicionarUC: AdicionarFilaUbsUseCase,
    private readonly listarUC: ListarFilaDiaUbsUseCase,
    private readonly chamarUC: ChamarPacienteUbsUseCase,
    private readonly statusUC: AtualizarStatusAtendimentoUbsUseCase,
    private readonly painelUC: ObterUltimasChamadasPainelUbsUseCase,
    private readonly atendentes: IAtendenteRepository,
  ) {}

  postAdicionarFila = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const body = adicionarSchema.parse(req.body);
    const userId = req.auth?.sub ?? '';
    const operador = await this.atendentes.buscarPorId(userId);

    const result = await this.adicionarUC.exec(
      {
        ...body,
        operador: {
          id: userId,
          nome: operador?.nome ?? 'Atendente UBS',
          ubsId: operador?.ubsId ?? null,
          prefeituraId: operador?.prefeituraId ?? null,
        },
      },
      scope,
    );

    res.status(201).json(result);
  };

  getListarFila = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const data = req.query.data as string | undefined;
    const ubsId = req.query.ubsId as string | undefined;
    const medicoId = req.query.medicoId as string | undefined;
    const status = req.query.status as any;
    const busca = req.query.busca as string | undefined;

    const result = await this.listarUC.exec(
      {
        data,
        ubsId,
        medicoId,
        status,
        busca,
      },
      scope,
    );

    res.json(result);
  };

  postChamarPaciente = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const id = paramString(req, 'id');
    const body = chamarSchema.parse(req.body || {});
    const userId = req.auth?.sub ?? '';
    const doctor = await this.atendentes.buscarPorId(userId);

    const result = await this.chamarUC.exec(
      {
        atendimentoId: id,
        doctor: {
          id: userId,
          nome: doctor?.nome ?? 'Médico / Profissional',
          crm: body.crm || (doctor as any)?.crm || undefined,
        },
        consultorio: body.consultorio,
      },
      scope,
    );

    res.json(result);
  };

  postAtualizarStatus = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const id = paramString(req, 'id');
    const body = statusSchema.parse(req.body);
    const userId = req.auth?.sub ?? '';
    const doctor = await this.atendentes.buscarPorId(userId);

    const result = await this.statusUC.exec(
      {
        atendimentoId: id,
        status: body.status,
        observacao: body.observacao,
        doctor: doctor
          ? {
              id: doctor.id,
              nome: doctor.nome,
              crm: (doctor as any)?.crm || undefined,
            }
          : undefined,
      },
      scope,
    );

    res.json(result);
  };

  getPainelChamadas = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const ubsId = req.query.ubsId as string | undefined;
    const limite = req.query.limite ? Number(req.query.limite) : 5;

    const result = await this.painelUC.exec({ ubsId, limite }, scope);
    res.json(result);
  };
}
