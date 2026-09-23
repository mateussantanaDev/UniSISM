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
import type { CalcularAlocacaoVagaCentroUseCase } from '../../application/use-cases/CalcularAlocacaoVagaCentroUseCase';
import type { GestaoEscalasUseCase } from '../../application/use-cases/GestaoEscalasUseCase';
import type { TriagemEnfermagemUseCase } from '../../application/use-cases/TriagemEnfermagemUseCase';
import { NotFound } from '../../../../shared/errors';
import { prisma } from '../../../../infrastructure/database/prisma';
import { CanalRoteamento, DestinoRegulacao } from '../../../../../generated/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';

const chamarTriagemSchema = z.object({
  consultorio: z.string().optional(),
});

const realizarTriagemSchema = z.object({
  consultorio: z.string().optional(),
  sinaisVitais: z.object({
    pressaoArterial: z.string().optional(),
    frequenciaCardiaca: z.number().optional(),
    frequenciaRespiratoria: z.number().optional(),
    temperatura: z.number().optional(),
    glicemiaCapilar: z.number().optional(),
    saturacaoO2: z.number().optional(),
    peso: z.number().optional(),
    altura: z.number().optional(),
    imc: z.number().optional(),
    classificacaoImc: z.string().optional(),
    classificacaoRisco: z.enum(['VERMELHO', 'LARANJA', 'AMARELO', 'VERDE', 'AZUL']).optional(),
    queixaPrincipal: z.string().optional(),
    observacoes: z.string().optional(),
  }).optional(),
  pressaoArterial: z.string().optional(),
  frequenciaCardiaca: z.number().optional(),
  frequenciaRespiratoria: z.number().optional(),
  temperatura: z.number().optional(),
  glicemiaCapilar: z.number().optional(),
  saturacaoO2: z.number().optional(),
  pesoKg: z.number().optional(),
  alturaCm: z.number().optional(),
  imc: z.number().optional(),
  classificacaoRisco: z.enum(['VERMELHO', 'LARANJA', 'AMARELO', 'VERDE', 'AZUL']).optional(),
  queixaPrincipal: z.string().optional(),
  alergiasRelatadas: z.string().optional(),
  medicamentosEmUso: z.string().optional(),
  coren: z.string().optional(),
});

const agendarSchema = z.object({
  profissional: z.string().optional(),
  nota: z.string().optional(),
  localAgendamento: z.string().optional(),
  dataAgendada: z.string().optional(),
  horaAgendada: z.string().optional(),
});

const presencaSchema = z.object({
  status: z.enum(['AGUARDANDO_ATENDIMENTO', 'EM_ATENDIMENTO', 'CONCLUIDO', 'FALTOU']),
  observacao: z.string().optional(),
});

const calcularSlotSchema = z.object({
  centro: z.enum(['CEM', 'CEO', 'CENTRO_ESPECIALIDADES', 'CENTRO_ODONTOLOGICO']).optional(),
  especialidade: z.string().optional(),
  medicoNome: z.string().optional(),
  medicoId: z.string().optional(),
  prioridade: z.enum(['ELETIVA', 'PRIORITARIA', 'URGENTE', 'EMERGENCIA']).default('ELETIVA'),
  tipoServico: z.enum(['CONSULTA', 'PROCEDIMENTO']).optional(),
  procedimento: z.string().optional(),
  dataBase: z.string().optional(),
});

const balcaoSchema = z.object({
  paciente: z.object({
    nome: z.string().min(2),
    cpf: z.string().min(11),
    cartaoSus: z.string().optional(),
    dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sexo: z.enum(['M', 'F', 'OUTRO']),
    telefone: z.string().min(8),
    endereco: z.string().min(1),
    bairro: z.string().optional(),
    municipio: z.string().optional(),
    uf: z.string().optional(),
    cep: z.string().optional(),
    nomeMae: z.string().optional(),
    racaCor: z.string().optional(),
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
  dataAgendada: z.string().optional(),
  horaAgendada: z.string().optional(),
  consultorio: z.string().optional(),
  ubsId: z.string().optional(),
  centro: z.string().optional(),
  confirmarPresenca: z.boolean().optional(),
  statusAtendimento: z.string().optional(),
  agendarDireto: z.boolean().optional().default(false),
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
    private readonly calcularAlocacaoUC: CalcularAlocacaoVagaCentroUseCase,
    private readonly gestaoEscalasUC: GestaoEscalasUseCase,
    private readonly triagemUC: TriagemEnfermagemUseCase,
  ) {}

  postCalcularSlot = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const body = calcularSlotSchema.parse(req.body);
    const resultado = await this.calcularAlocacaoUC.exec(body, scope);
    res.json(resultado);
  };

  getEscalas = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const centro = req.query.centro as string | undefined;
    const escalas = await this.gestaoEscalasUC.listarEscalas(scope, centro);
    res.json(escalas);
  };

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
        dataAgendada: body.dataAgendada,
        horaAgendada: body.horaAgendada,
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
      include: { ubs: true },
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
        nomeMae: paciente.nomeMae,
        cartaoSus: paciente.cartaoSus,
        dataNascimento: paciente.dataNascimento.toISOString().substring(0, 10),
        sexo: paciente.sexo,
        telefone: paciente.telefone,
        endereco: paciente.endereco,
        bairro: paciente.bairro,
        municipio: paciente.municipio,
        uf: paciente.uf,
        cep: paciente.cep,
        racaCor: paciente.racaCor,
        ubsId: paciente.ubsId,
        ubsNome: paciente.ubs?.nome,
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
        centro: body.centro || (req.query.centro as string | undefined),
        confirmarPresenca: body.confirmarPresenca,
        statusAtendimento: body.statusAtendimento,
        paciente: body.paciente,
        solicitacao: body.solicitacao,
        nota: body.nota,
        medicoDesejado: body.medicoDesejado,
        dataAgendada: body.dataAgendada,
        horaAgendada: body.horaAgendada,
        consultorio: body.consultorio,
        ubsId: body.ubsId,
        agendarDireto: body.agendarDireto,
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

  getTvChamadas = async (req: Request, res: Response): Promise<void> => {
    try {
      const centroQuery = ((req.query.centro as string) || 'CEM').toUpperCase();
      const ehCeo = centroQuery === 'CEO';

      const rows = await prisma.encaminhamento.findMany({
        where: {
          status: 'APROVADO',
          statusAtendimentoCentro: {
            in: ['EM_ATENDIMENTO', 'AGUARDANDO_ATENDIMENTO'],
          },
          ...(ehCeo
            ? {
                OR: [
                  { canalRoteamento: CanalRoteamento.CENTRO_ODONTOLOGICO },
                  { destinoRegulacao: DestinoRegulacao.CENTRO_ODONTOLOGICO },
                  { localAgendamento: { contains: 'CEO', mode: 'insensitive' } },
                  { especialidadeSolicitada: { contains: 'Odonto', mode: 'insensitive' } },
                  { especialidadeSolicitada: { contains: 'Bucomaxilo', mode: 'insensitive' } },
                  { especialidadeSolicitada: { contains: 'Endodont', mode: 'insensitive' } },
                  { especialidadeSolicitada: { contains: 'Periodont', mode: 'insensitive' } },
                  { especialidadeSolicitada: { contains: 'Prótese', mode: 'insensitive' } },
                  { especialidadeSolicitada: { contains: 'Protese', mode: 'insensitive' } },
                  { especialidadeSolicitada: { contains: 'Estomatol', mode: 'insensitive' } },
                ],
              }
            : {
                OR: [
                  { canalRoteamento: CanalRoteamento.CENTRO_ESPECIALIDADES },
                  { destinoRegulacao: DestinoRegulacao.CENTRO_ESPECIALIDADES },
                  {
                    AND: [
                      { canalRoteamento: null, destinoRegulacao: null },
                      { NOT: { especialidadeSolicitada: { contains: 'Odonto', mode: 'insensitive' } } },
                      { NOT: { especialidadeSolicitada: { contains: 'Bucomaxilo', mode: 'insensitive' } } },
                      { NOT: { localAgendamento: { contains: 'CEO', mode: 'insensitive' } } },
                    ],
                  },
                ],
              }),
        },
        include: INCLUDE_ENCAMINHAMENTO_FULL,
        orderBy: { atualizadoEm: 'desc' },
        take: 30,
      });

      const fullList = rows.map((r) => rowParaEncaminhamento(r as any));

      const filtrados = fullList;

      const chamadas = filtrados.map((r, idx) => {
        const num = ((idx % 8) + 1).toString().padStart(2, '0');
        const ehChamadaTriagem = !!r.chamadaTriagemEm && (!r.atendimentoIniciadoEm || new Date(r.chamadaTriagemEm) > new Date(r.atendimentoIniciadoEm));
        const local = ehChamadaTriagem
          ? (r.consultorioTriagem || 'SALA DE TRIAGEM 01 — ENFERMAGEM')
          : (ehCeo ? `CADEIRA ODONTOLÓGICA ${num} — SETOR B` : `CONSULTÓRIO ${num} — ALA A`);
        const prof = ehChamadaTriagem
          ? (r.triagemPorNome ? `Enf. ${r.triagemPorNome}` : 'Equipe de Enfermagem')
          : (r.profissionalAgendado || (ehCeo ? 'Dr(a). Cirurgião-Dentista' : 'Dr(a). Médico Especialista'));
        const esp = ehChamadaTriagem
          ? 'Triagem Clínica & Sinais Vitais'
          : (r.solicitacao?.especialidadeSolicitada || (ehCeo ? 'Odontologia Especializada' : 'Clínica Especializada'));
        const chamadoEmData = (ehChamadaTriagem && r.chamadaTriagemEm) ? r.chamadaTriagemEm : (r.atendimentoIniciadoEm || r.atualizadoEm || r.criadoEm);

        return {
          id: r.id,
          protocolo: r.protocolo,
          pacienteNome: r.paciente?.nome || 'Paciente Identificado',
          consultorio: local,
          medicoNome: prof,
          especialidade: esp,
          tipo: (ehChamadaTriagem ? 'TRIAGEM' : 'CONSULTA') as 'CONSULTA' | 'TRIAGEM',
          horario: new Date(chamadoEmData).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          status: r.statusAtendimentoCentro,
          chamadoEm: chamadoEmData,
        };
      });

      chamadas.sort((a, b) => new Date(b.chamadoEm).getTime() - new Date(a.chamadoEm).getTime());

      const chamadaAtual = chamadas.length > 0 ? chamadas[0] : null;
      const ultimasChamadas = chamadas.slice(1, 6);

      res.json({
        centro: ehCeo ? 'CEO' : 'CEM',
        nomeCentro: ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro de Especialidades Médicas (CEM)',
        tipoLocal: ehCeo ? 'CADEIRA ODONTOLÓGICA' : 'CONSULTÓRIO',
        chamadaAtual,
        ultimasChamadas,
        totalChamadas: chamadas.length,
        servidorHorario: new Date().toISOString(),
      });
    } catch (_err) {
      res.status(500).json({ error: { code: 'ERRO_TV_CHAMADAS', message: 'Falha ao buscar chamadas da TV' } });
    }
  };

  getFilaTriagem = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const centro = req.query.centro as 'CEM' | 'CEO' | undefined;
    const status = req.query.status as 'PENDENTE' | 'CHAMADO' | 'CONCLUIDO' | 'TODOS' | undefined;
    const data = req.query.data as string | undefined;
    const result = await this.triagemUC.listarFilaTriagem({ centro, status, data }, scope);
    res.json(result);
  };

  postChamarTriagem = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const id = paramString(req, 'id');
    const body = chamarTriagemSchema.parse(req.body || {});
    const atendente = await this.atendentes.buscarPorId(req.auth!.sub);
    if (!atendente) throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');

    const result = await this.triagemUC.chamarTriagem(
      {
        encaminhamentoId: id,
        enfermeiro: {
          id: atendente.id,
          nome: atendente.nome,
          coren: (atendente as any).coren || (atendente as any).registroProfissional,
        },
        consultorio: body.consultorio,
      },
      scope,
    );
    res.json(result);
  };

  postRealizarTriagem = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const id = paramString(req, 'id');
    const body = realizarTriagemSchema.parse(req.body);
    const atendente = await this.atendentes.buscarPorId(req.auth!.sub);
    if (!atendente) throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');

    const sinaisVitaisFinal = body.sinaisVitais || {
      pressaoArterial: body.pressaoArterial,
      frequenciaCardiaca: body.frequenciaCardiaca,
      frequenciaRespiratoria: body.frequenciaRespiratoria,
      temperatura: body.temperatura,
      glicemiaCapilar: body.glicemiaCapilar,
      saturacaoO2: body.saturacaoO2,
      peso: body.pesoKg,
      altura: body.alturaCm,
      imc: body.imc,
      classificacaoRisco: body.classificacaoRisco,
      queixaPrincipal: body.queixaPrincipal,
    };

    const result = await this.triagemUC.realizarTriagem(
      {
        encaminhamentoId: id,
        enfermeiro: {
          id: atendente.id,
          nome: atendente.nome,
          coren: body.coren || (atendente as any).coren || (atendente as any).registroProfissional,
        },
        sinaisVitais: sinaisVitaisFinal as any,
        consultorio: body.consultorio,
      },
      scope,
    );
    res.json(result);
  };

  postTvParear = async (req: Request, res: Response): Promise<void> => {
    const pin = (req.body.pin || req.body.senha || '').trim().toUpperCase();
    if (pin === 'CEM' || pin === 'CEM-2026' || pin === '7492') {
      res.json({
        valido: true,
        centro: 'CEM',
        nome: 'CENTRO DE ESPECIALIDADES MÉDICAS (CEM)',
        subtitulo: 'AMBULATÓRIO DE ESPECIALIDADES MÉDICAS · SALA DE ESPERA',
        tipoLocal: 'CONSULTÓRIO',
        corTema: 'blue',
      });
      return;
    }
    if (pin === 'CEO' || pin === 'CEO-2026' || pin === '8301') {
      res.json({
        valido: true,
        centro: 'CEO',
        nome: 'CENTRO DE ESPECIALIDADES ODONTOLÓGICAS (CEO)',
        subtitulo: 'SAÚDE BUCAL ESPECIALIZADA · SALA DE ESPERA',
        tipoLocal: 'CADEIRA ODONTOLÓGICA',
        corTema: 'emerald',
      });
      return;
    }
    res.status(401).json({
      valido: false,
      error: { code: 'SENHA_INVALIDA', message: 'Senha ou código do centro incorreto.' },
    });
  };
}
