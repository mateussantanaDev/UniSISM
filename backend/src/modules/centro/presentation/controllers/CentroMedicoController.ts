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
import { NotFound } from '../../../../shared/errors';

const soapSchema = z.object({
  subjetivo: z.string().optional(),
  objetivo: z.string().optional(),
  avaliacao: z.string().optional(),
  plano: z.string().optional(),
  queixaPrincipal: z.string().min(2),
  diagnostico: z.string().min(2),
  cid10: z.string().min(2),
  conduta: z.string().min(2),
  prescricaoResumo: z.string().optional(),
  unidade: z.string().optional(),
});

const intermunicipalSchema = z.object({
  pacienteId: z.string().uuid(),
  solicitacao: z.object({
    especialidadeSolicitada: z.string().min(2),
    cid10: z.string().min(2),
    cidDescricao: z.string().min(2),
    justificativaClinica: z.string().min(3),
    prioridade: z.enum(['ELETIVA', 'PRIORITARIA', 'URGENTE', 'EMERGENCIA']).default('ELETIVA'),
  }),
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
    if (!doctor) throw NotFound('MEDICO_NAO_ENCONTRADO', 'Médico não encontrado');

    const data = req.query.data as string | undefined;
    const especialidade = req.query.especialidade as string | undefined;
    const statusAtendimento = req.query.statusAtendimento as string | undefined;

    const agenda = await this.agendaUC.exec(
      {
        doctorNome: doctor.nome,
        doctorMatricula: doctor.matricula,
        data,
        especialidade,
        statusAtendimento,
      },
      scope,
    );

    res.json({ agenda, total: agenda.length });
  };

  postChamar = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const scope = scopeFromRequest(req);
    const doctor = await this.atendentes.buscarPorId(req.auth!.sub);
    if (!doctor) throw NotFound('MEDICO_NAO_ENCONTRADO', 'Médico não encontrado');

    const result = await this.chamarUC.exec(
      {
        encaminhamentoId: id,
        doctor: {
          id: doctor.id,
          nome: doctor.nome,
        },
      },
      scope,
    );

    res.json({ encaminhamento: result });
  };

  getProntuario = async (req: Request, res: Response): Promise<void> => {
    const pacienteId = paramString(req, 'pacienteId');
    const scope = scopeFromRequest(req);

    const prontuario = await this.prontuarioUC.exec(pacienteId, scope);
    res.json(prontuario);
  };

  postRegistrarSOAP = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const scope = scopeFromRequest(req);
    const body = soapSchema.parse(req.body);

    const doctor = await this.atendentes.buscarPorId(req.auth!.sub);
    if (!doctor) throw NotFound('MEDICO_NAO_ENCONTRADO', 'Médico não encontrado');

    const result = await this.registrarSoapUC.exec(
      {
        encaminhamentoId: id,
        doctor: {
          id: doctor.id,
          nome: doctor.nome,
          matricula: doctor.matricula,
        },
        soap: body,
      },
      scope,
    );

    res.json({ encaminhamento: result });
  };

  postEncaminhamentoIntermunicipal = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const body = intermunicipalSchema.parse(req.body);

    const doctor = await this.atendentes.buscarPorId(req.auth!.sub);
    if (!doctor) throw NotFound('MEDICO_NAO_ENCONTRADO', 'Médico não encontrado');

    const result = await this.intermunicipalUC.exec(
      {
        pacienteId: body.pacienteId,
        solicitacao: body.solicitacao,
        doctor: {
          id: doctor.id,
          nome: doctor.nome,
          matricula: doctor.matricula,
        },
      },
      scope,
    );

    res.status(201).json({ encaminhamento: result });
  };
}
