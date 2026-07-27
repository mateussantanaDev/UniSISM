import type { Request, Response } from 'express';
import { z } from 'zod';
import { paramString } from '../../../../shared/http';
import { scopeFromRequest } from '../../../../shared/requestScope';
import type { IAtendenteRepository } from '../../../../domain/repositories/IAtendenteRepository';
import type { ListarAgendaMedicoCentroUseCase } from '../../application/use-cases/ListarAgendaMedicoCentroUseCase';
import type { ChamarPacienteMedicoUseCase } from '../../application/use-cases/ChamarPacienteMedicoUseCase';
import type { ObterProntuarioPacienteMedicoUseCase } from '../../application/use-cases/ObterProntuarioPacienteMedicoUseCase';
import type { RegistrarConsultaSOAPMedicoUseCase } from '../../application/use-cases/RegistrarConsultaSOAPMedicoUseCase';
import type { EncaminhamentoIntermunicipalMedicoUseCase } from '../../application/use-cases/EncaminhamentoIntermunicipalMedicoUseCase';

const soapSchema = z.object({
  queixaPrincipal: z.string().optional(),
  exameFisico: z.string().optional(),
  subjetivo: z.string().optional(),
  objetivo: z.string().optional(),
  avaliacao: z.string().optional(),
  plano: z.string().optional(),
  cid10: z.string().min(1),
  diagnostico: z.string().min(1),
  conduta: z.string().min(1),
  prescricao: z.string().optional(),
  prescricaoResumo: z.string().optional(),
  pressaoArterial: z.string().optional(),
  frequenciaCardiaca: z.string().optional(),
  peso: z.string().optional(),
  unidade: z.string().optional(),
});

const intermunicipalSchema = z.object({
  encaminhamentoId: z.string().optional(),
  pacienteId: z.string().optional(),
  municipioDestino: z.string().optional(),
  especialidade: z.string().optional(),
  cid10: z.string().optional(),
  diagnostico: z.string().optional(),
  justificativa: z.string().optional(),
  prioridade: z.enum(['ELETIVA', 'PRIORITARIA', 'URGENTE', 'EMERGENCIA']).default('ELETIVA'),
  transporteRequerido: z.string().optional(),
  requerAcompanhante: z.boolean().optional(),
  solicitacao: z.object({
    especialidadeSolicitada: z.string().optional(),
    cid10: z.string().optional(),
    cidDescricao: z.string().optional(),
    justificativaClinica: z.string().optional(),
    prioridade: z.enum(['ELETIVA', 'PRIORITARIA', 'URGENTE', 'EMERGENCIA']).default('ELETIVA'),
  }).optional(),
});

export class CentroMedicoController {
  constructor(
    private readonly atendentes: IAtendenteRepository,
    private readonly agendaUC: ListarAgendaMedicoCentroUseCase,
    private readonly chamarUC: ChamarPacienteMedicoUseCase,
    private readonly prontuarioUC: ObterProntuarioPacienteMedicoUseCase,
    private readonly registrarSoapUC: RegistrarConsultaSOAPMedicoUseCase,
    private readonly intermunicipalUC: EncaminhamentoIntermunicipalMedicoUseCase,
  ) {}

  getAgenda = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const doctor = await this.atendentes.buscarPorId(req.auth!.sub);

    const data = (req.query.data as string | undefined) || new Date().toISOString().substring(0, 10);
    const especialidade = req.query.especialidade as string | undefined;
    const statusAtendimento = req.query.statusAtendimento as string | undefined;

    const agendaRaw = await this.agendaUC.exec(
      {
        doctorNome: doctor?.nome,
        doctorMatricula: doctor?.matricula,
        data,
        especialidade,
        statusAtendimento,
      },
      scope,
    );

    const agendaFormatted = agendaRaw.map((enc) => ({
      id: enc.id,
      protocolo: enc.protocolo,
      statusAtendimentoCentro: enc.statusAtendimentoCentro || 'AGUARDANDO',
      paciente: {
        id: enc.paciente?.nome ? enc.id : enc.id,
        nome: enc.paciente?.nome || 'Paciente Sem Nome',
        cpf: enc.paciente?.cpf || '',
        cartaoSus: enc.paciente?.cartaoSus || '',
        dataNascimento: enc.paciente?.dataNascimento || '',
        sexo: enc.paciente?.sexo || 'OUTRO',
        telefone: enc.paciente?.telefone || '',
        endereco: enc.paciente?.endereco || '',
      },
      solicitacao: {
        medicoSolicitante: enc.solicitacao?.medicoSolicitante || '',
        crm: enc.solicitacao?.crm || '',
        especialidadeSolicitada: enc.solicitacao?.especialidadeSolicitada || '',
        cid10: enc.solicitacao?.cid10 || '',
        cidDescricao: enc.solicitacao?.cidDescricao || '',
        justificativaClinica: enc.solicitacao?.justificativaClinica || '',
        prioridade: enc.solicitacao?.prioridade || 'ELETIVA',
        dataSolicitacao: enc.solicitacao?.dataSolicitacao || '',
      },
      unidadeOrigem: enc.unidadeOrigem || 'UBS Central',
      observacoesRegulacao: enc.observacoesRegulacao || null,
    }));

    res.json({
      data,
      agenda: agendaFormatted,
      total: agendaFormatted.length,
    });
  };

  postChamar = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const scope = scopeFromRequest(req);
    const doctor = await this.atendentes.buscarPorId(req.auth!.sub);

    const result = await this.chamarUC.exec(
      {
        encaminhamentoId: id,
        doctor: {
          id: doctor?.id || req.auth!.sub,
          nome: doctor?.nome || 'Médico Especialista',
        },
      },
      scope,
    );

    res.json({
      sucesso: true,
      status: result.statusAtendimentoCentro || 'EM_ATENDIMENTO',
      encaminhamento: result,
    });
  };

  getProntuario = async (req: Request, res: Response): Promise<void> => {
    const pacienteId = paramString(req, 'pacienteId');
    const scope = scopeFromRequest(req);

    const prontuario = await this.prontuarioUC.exec(pacienteId, scope);

    res.json({
      pacienteId: prontuario.paciente.id,
      paciente: prontuario.paciente,
      alergias: prontuario.alergias.map((a) => a.substancia),
      alergiasDetalhadas: prontuario.alergias,
      condicoesCronicas: prontuario.condicoesCronicas.map((c) => c.descricao || c.cid10),
      condicoesCronicasDetalhadas: prontuario.condicoesCronicas,
      medicamentosEmUso: prontuario.medicamentosEmUso.map((m) => ({
        nome: m.nome,
        dosagem: m.dosagem,
        frequencia: m.frequencia,
      })),
      historicoAtendimentos: prontuario.atendimentosAnteriores.map((at) => ({
        id: at.id,
        data: at.data.substring(0, 10),
        especialidade: at.especialidade,
        medicoNome: at.profissional,
        cid10: at.cid10,
        conduta: at.conduta,
      })),
      examesRealizados: prontuario.examesRealizados,
      vacinasAplicadas: prontuario.vacinasAplicadas,
    });
  };

  postRegistrarSOAP = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const scope = scopeFromRequest(req);
    const body = soapSchema.parse(req.body);

    const doctor = await this.atendentes.buscarPorId(req.auth!.sub);

    const queixa = body.queixaPrincipal || body.subjetivo || 'Atendimento em consultório médico especializado';
    const condutaStr = body.conduta || body.plano || 'Consulta concluída';

    const result = await this.registrarSoapUC.exec(
      {
        encaminhamentoId: id,
        doctor: {
          id: doctor?.id || req.auth!.sub,
          nome: doctor?.nome || 'Médico Especialista',
          matricula: doctor?.matricula || 'CRM 00000',
        },
        soap: {
          subjetivo: body.subjetivo || body.queixaPrincipal,
          objetivo: body.objetivo || body.exameFisico,
          avaliacao: body.avaliacao || body.diagnostico,
          plano: body.plano || body.conduta,
          queixaPrincipal: queixa,
          diagnostico: body.diagnostico,
          cid10: body.cid10,
          conduta: condutaStr,
          prescricaoResumo: body.prescricao || body.prescricaoResumo,
          unidade: body.unidade,
        },
      },
      scope,
    );

    res.json({
      sucesso: true,
      id: result.id,
      statusAtendimentoCentro: result.statusAtendimentoCentro || 'CONCLUIDO',
      concluidoEm: result.atendimentoConcluidoEm || new Date().toISOString(),
      encaminhamento: result,
    });
  };

  postEncaminhamentoIntermunicipal = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const body = intermunicipalSchema.parse(req.body);

    const doctor = await this.atendentes.buscarPorId(req.auth!.sub);

    const pacienteIdStr = body.pacienteId || body.encaminhamentoId || 'pac-default';
    const espSolicitada = body.especialidade || body.solicitacao?.especialidadeSolicitada || 'Oncologia';
    const cidStr = body.cid10 || body.solicitacao?.cid10 || 'Z00.0';
    const cidDesc = body.diagnostico || body.solicitacao?.cidDescricao || 'Encaminhamento TFD';
    const just = body.justificativa || body.solicitacao?.justificativaClinica || 'Necessidade de referência estadual';
    const prio = body.prioridade || body.solicitacao?.prioridade || 'URGENTE';

    const result = await this.intermunicipalUC.exec(
      {
        pacienteId: pacienteIdStr,
        solicitacao: {
          especialidadeSolicitada: espSolicitada,
          cid10: cidStr,
          cidDescricao: cidDesc,
          justificativaClinica: just,
          prioridade: prio,
        },
        doctor: {
          id: doctor?.id || req.auth!.sub,
          nome: doctor?.nome || 'Médico Especialista',
          matricula: doctor?.matricula || 'CRM 00000',
        },
      },
      scope,
    );

    const nowIso = new Date().toISOString();
    const proto = result.protocolo || `TFD${new Date().toISOString().substring(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

    res.status(201).json({
      protocolo: proto,
      criadoEm: nowIso,
      municipioDestino: body.municipioDestino || 'Porto Alegre',
      status: 'AGUARDANDO_VAGA_ESTADUAL',
      encaminhamento: result,
    });
  };
}
