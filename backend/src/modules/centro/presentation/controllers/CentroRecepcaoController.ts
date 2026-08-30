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
import type { AgendamentoBalcaoRetroativoUseCase } from '../../application/use-cases/AgendamentoBalcaoRetroativoUseCase';
import type { RemarcarEncaminhamentoRegulacaoUseCase } from '../../application/use-cases/RemarcarEncaminhamentoRegulacaoUseCase';
import type { RegistrarProcedimentosAtendimentoUseCase } from '../../application/use-cases/RegistrarProcedimentosAtendimentoUseCase';
import type { NotificacaoAusenciaMedicaUseCase } from '../../application/use-cases/NotificacaoAusenciaMedicaUseCase';
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

const balcaoRetroativoSchema = z.object({
  pacienteId: z.string().min(1),
  especialidade: z.string().min(2),
  tipoServico: z.enum(['CONSULTA', 'PROCEDIMENTO']).optional(),
  procedimentoSolicitado: z.string().optional(),
  modoData: z.enum(['AUTODATA', 'MANUAL', 'RETROATIVO']).optional(),
  dataRetroativa: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  horaRetroativa: z.string().min(2),
  statusRetroativo: z.enum(['CONCLUIDO', 'AGUARDANDO', 'FALTOU']).optional(),
  medicoId: z.string().optional(),
  medicoNome: z.string().optional(),
});

const remarcarSchema = z.object({
  novaData: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  novoHorario: z.string().min(2),
  unidadeDestino: z.string().optional(),
  motivo: z.string().min(5, 'Descreva o motivo da remarcação (mínimo 5 caracteres).'),
});

const procedimentosSchema = z.object({
  procedimentos: z.array(
    z.object({
      codigoSigtap: z.string().optional(),
      nome: z.string().min(2),
      quantidade: z.number().int().positive().optional(),
      valorUnitario: z.number().optional(),
      observacao: z.string().optional(),
    }),
  ).min(1),
});

const ausenciaMedicaSchema = z.object({
  medicoNome: z.string().min(2),
  dataAfetada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipoMotivo: z.enum(['FALTA_MEDICA', 'MUDANCA_DIA', 'FERIAS_LICENCA']),
  novaData: z.string().optional(),
  mensagem: z.string().min(5),
  canais: z
    .object({
      app: z.boolean().optional(),
      sms: z.boolean().optional(),
      whatsapp: z.boolean().optional(),
    })
    .optional(),
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
    private readonly balcaoRetroativoUC: AgendamentoBalcaoRetroativoUseCase,
    private readonly remarcarUC: RemarcarEncaminhamentoRegulacaoUseCase,
    private readonly procedimentosUC: RegistrarProcedimentosAtendimentoUseCase,
    private readonly ausenciaMedicaUC: NotificacaoAusenciaMedicaUseCase,
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
    const centro = req.query.centro as 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO' | undefined;
    const especialidade = req.query.especialidade as string | undefined;
    const medico = req.query.medico as string | undefined;
    const statusAtendimento = req.query.statusAtendimento as string | undefined;

    const agendamentos = await this.agendaDiaUC.exec(
      {
        data,
        centro,
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

    res.json({
      sucesso: true,
      mensagem: body.acao === 'DESMARCAR' ? 'Consulta desmarcada com sucesso.' : 'Consulta reagendada com sucesso.',
      encaminhamento: result,
    });
  };

  postBalcaoRetroativo = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const body = balcaoRetroativoSchema.parse(req.body);
    const result = await this.balcaoRetroativoUC.exec(body, scope, req.auth!.sub);
    res.status(201).json(result);
  };

  postRemarcar = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const scope = scopeFromRequest(req);
    const body = remarcarSchema.parse(req.body);

    const atendente = await this.atendentes.buscarPorId(req.auth!.sub);
    if (!atendente) throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');

    const result = await this.remarcarUC.exec(
      {
        encaminhamentoId: id,
        novaData: body.novaData,
        novoHorario: body.novoHorario,
        unidadeDestino: body.unidadeDestino,
        motivo: body.motivo,
        atendente: { id: atendente.id, nome: atendente.nome },
      },
      scope,
    );

    res.json({ encaminhamento: result });
  };

  postProcedimentos = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const scope = scopeFromRequest(req);
    const body = procedimentosSchema.parse(req.body);

    const result = await this.procedimentosUC.exec(
      {
        atendimentoId: id,
        procedimentos: body.procedimentos,
      },
      scope,
      req.auth!.sub,
    );

    res.status(201).json(result);
  };

  postAusenciaMedica = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const body = ausenciaMedicaSchema.parse(req.body);
    const result = await this.ausenciaMedicaUC.exec(body, req.auth!.sub, scope);
    res.json(result);
  };
}
