import type { Request, Response } from 'express';
import { z } from 'zod';
import { paramString } from '../../../../shared/http';
import { scopeFromRequest } from '../../../../shared/requestScope';
import type { IAtendenteRepository } from '../../../../domain/repositories/IAtendenteRepository';
import type { ListarFilaEsperaCentroRecepcaoUseCase } from '../../application/use-cases/ListarFilaEsperaCentroRecepcaoUseCase';
import type { AgendarConsultaCentroUseCase } from '../../application/use-cases/AgendarConsultaCentroUseCase';
import type { ObterAgendaDiaRecepcaoUseCase } from '../../application/use-cases/ObterAgendaDiaRecepcaoUseCase';
import type { RegistrarPresencaPacienteUseCase } from '../../application/use-cases/RegistrarPresencaPacienteUseCase';
import type { AgendamentoBalcaoRecepcaoUseCase } from '../../application/use-cases/AgendamentoBalcaoRecepcaoUseCase';
import type { DesmarcarReagendarConsultaUseCase } from '../../application/use-cases/DesmarcarReagendarConsultaUseCase';
import { NotFound } from '../../../../shared/errors';
import { prisma } from '../../../../infrastructure/database/prisma';

const agendarSchema = z.object({
  profissional: z.string().optional(),
  nota: z.string().optional(),
  localAgendamento: z.string().optional(),
});

const presencaSchema = z.object({
  status: z.enum(['AGUARDANDO_ATENDIMENTO', 'EM_ATENDIMENTO', 'CONCLUIDO', 'FALTOU']),
  observacao: z.string().optional(),
});

const balcaoSchema = z.object({
  paciente: z.object({
    nome: z.string().min(2),
    cpf: z.string().min(11),
    cartaoSus: z.string().optional(),
    dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sexo: z.enum(['M', 'F', 'OUTRO']),
    telefone: z.string().min(8),
    endereco: z.string().min(3),
  }),
  solicitacao: z.object({
    medicoSolicitante: z.string().default('Médico de Balcão'),
    crm: z.string().default('000000'),
    especialidadeSolicitada: z.string().min(2),
    cid10: z.string().min(2),
    cidDescricao: z.string().default('Solicitação direta de balcão'),
    justificativaClinica: z.string().min(3),
    prioridade: z.enum(['ELETIVA', 'PRIORITARIA', 'URGENTE', 'EMERGENCIA']).default('ELETIVA'),
    dataSolicitacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  nota: z.string().optional(),
  medicoDesejado: z.string().optional(),
  ubsId: z.string().optional(),
});

const desmarcarReagendarSchema = z.object({
  acao: z.enum(['DESMARCAR', 'REAGENDAR']),
  motivo: z.string().min(1),
});

export class CentroRecepcaoController {
  constructor(
    private readonly atendentes: IAtendenteRepository,
    private readonly listarFilaUC: ListarFilaEsperaCentroRecepcaoUseCase,
    private readonly agendarUC: AgendarConsultaCentroUseCase,
    private readonly agendaDiaUC: ObterAgendaDiaRecepcaoUseCase,
    private readonly presencaUC: RegistrarPresencaPacienteUseCase,
    private readonly balcaoUC: AgendamentoBalcaoRecepcaoUseCase,
    private readonly desmarcarReagendarUC: DesmarcarReagendarConsultaUseCase,
  ) {}

  getFilaEspera = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const centroParam = req.query.centro as 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO' | undefined;
    const statusParam = req.query.status as 'APROVADO' | 'AGUARDANDO_REGULACAO' | 'TODOS' | undefined;
    const agendadoParam = req.query.agendado !== undefined ? req.query.agendado === 'true' : undefined;
    const especialidade = req.query.especialidade as string | undefined;
    const prioridade = req.query.prioridade as string | undefined;
    const busca = req.query.busca as string | undefined;

    const fila = await this.listarFilaUC.exec(
      {
        centro: centroParam,
        status: statusParam,
        agendado: agendadoParam,
        especialidade,
        prioridade,
        busca,
      },
      scope,
    );

    res.json({ encaminhamentos: fila, total: fila.length });
  };

  postAgendar = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const scope = scopeFromRequest(req);
    const body = agendarSchema.parse(req.body);

    const atendente = await this.atendentes.buscarPorId(req.auth!.sub);
    if (!atendente) throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');

    const result = await this.agendarUC.exec(
      {
        id,
        profissional: body.profissional,
        nota: body.nota,
        localAgendamento: body.localAgendamento,
        atendente: {
          id: atendente.id,
          nome: atendente.nome,
          role: atendente.role,
        },
      },
      scope,
    );

    res.json({ encaminhamento: result });
  };

  getAgendaDia = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const data = req.query.data as string | undefined;
    const especialidade = req.query.especialidade as string | undefined;
    const medico = req.query.medico as string | undefined;
    const statusAtendimento = req.query.statusAtendimento as string | undefined;

    const agendamentos = await this.agendaDiaUC.exec(
      {
        data,
        especialidade,
        medico,
        statusAtendimento,
      },
      scope,
    );

    res.json({ agendamentos, total: agendamentos.length });
  };

  postPresenca = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const scope = scopeFromRequest(req);
    const body = presencaSchema.parse(req.body);

    const atendente = await this.atendentes.buscarPorId(req.auth!.sub);
    if (!atendente) throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');

    const result = await this.presencaUC.exec(
      {
        encaminhamentoId: id,
        status: body.status,
        observacao: body.observacao,
        atendente: {
          id: atendente.id,
          nome: atendente.nome,
        },
      },
      scope,
    );

    res.json({ encaminhamento: result });
  };

  getPacientePorCpf = async (req: Request, res: Response): Promise<void> => {
    const cpfParam = paramString(req, 'cpf').replace(/\D/g, '');
    const paciente = await prisma.paciente.findUnique({
      where: { cpf: cpfParam },
    });

    if (!paciente) {
      res.json({ existe: false, paciente: null });
      return;
    }

    res.json({
      existe: true,
      paciente: {
        id: paciente.id,
        nome: paciente.nome,
        cartaoSus: paciente.cartaoSus,
        dataNascimento: paciente.dataNascimento.toISOString().substring(0, 10),
        sexo: paciente.sexo,
        telefone: paciente.telefone,
        endereco: paciente.endereco,
      },
    });
  };

  postBalcao = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const body = balcaoSchema.parse(req.body);

    const atendente = await this.atendentes.buscarPorId(req.auth!.sub);
    if (!atendente) throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');

    const result = await this.balcaoUC.exec(
      {
        paciente: body.paciente,
        solicitacao: body.solicitacao,
        nota: body.nota,
        medicoDesejado: body.medicoDesejado,
        ubsId: body.ubsId,
        atendente: {
          id: atendente.id,
          nome: atendente.nome,
          ubsId: atendente.ubsId,
          prefeituraId: atendente.prefeituraId,
        },
      },
      scope,
    );

    res.status(201).json({ encaminhamento: result });
  };

  postDesmarcarReagendar = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const scope = scopeFromRequest(req);
    const body = desmarcarReagendarSchema.parse(req.body);

    const atendente = await this.atendentes.buscarPorId(req.auth!.sub);
    if (!atendente) throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');

    const result = await this.desmarcarReagendarUC.exec(
      {
        encaminhamentoId: id,
        acao: body.acao,
        motivo: body.motivo,
        atendente: {
          id: atendente.id,
          nome: atendente.nome,
        },
      },
      scope,
    );

    res.json({ encaminhamento: result });
  };
}
