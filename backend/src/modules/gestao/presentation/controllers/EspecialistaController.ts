import type { Request, Response } from 'express';
import { z } from 'zod';
import { NotFound } from '../../../../shared/errors';
import { paramString } from '../../../../shared/http';
import { scopeFromRequest } from '../../../../shared/requestScope';
import type { IAtendenteRepository } from '../../../../domain/repositories/IAtendenteRepository';
import type { ListarAgendaEspecialistaUseCase } from '../../application/use-cases/ListarAgendaEspecialistaUseCase';
import type { RegistrarAtendimentoEspecialistaUseCase } from '../../application/use-cases/RegistrarAtendimentoEspecialistaUseCase';

const registrarAtendimentoSchema = z.object({
  queixaPrincipal: z.string().trim().min(5),
  diagnostico: z.string().trim().min(5),
  cid10: z.string().trim().toUpperCase(),
  conduta: z.string().trim().min(5),
  prescricaoResumo: z.string().trim().optional(),
  tipoAtendimento: z.enum(['CONSULTA_MEDICA', 'ODONTOLOGICO']).optional(),
  unidade: z.string().trim().optional(),
});

export class EspecialistaController {
  constructor(
    private readonly atendentes: IAtendenteRepository,
    private readonly agendaUC: ListarAgendaEspecialistaUseCase,
    private readonly registrarUC: RegistrarAtendimentoEspecialistaUseCase,
  ) {}

  private async resolverMedico(req: Request) {
    const sub = req.auth!.sub;
    const a = await this.atendentes.buscarPorId(sub);
    if (!a) throw NotFound('MEDICO_NAO_ENCONTRADO', 'Atendente/Médico não encontrado');
    return a;
  }

  getAgenda = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const medico = await this.resolverMedico(req);
    const dateQuery = typeof req.query.data === 'string' ? req.query.data : undefined;
    
    const agenda = await this.agendaUC.exec(
      scope,
      medico.nome,
      medico.matricula,
      dateQuery
    );
    res.json(agenda);
  };

  registrarAtendimento = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const body = registrarAtendimentoSchema.parse(req.body ?? {});
    const scope = scopeFromRequest(req);
    const medico = await this.resolverMedico(req);

    await this.registrarUC.exec(id, scope, { nome: medico.nome, matricula: medico.matricula }, body);
    res.status(201).json({ ok: true, mensagem: 'Atendimento registrado com sucesso' });
  };
}
