/**
 * RegulacaoController — entry HTTP da Face 2 (SMS).
 *
 * Endpoints exigem token + role REGULADOR_SMS|DESENVOLVEDOR (ADMIN também na árvore).
 * O escopo (filtro automático por prefeitura) vem via scopeFromRequest.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  NotFound,
  PayloadTooLarge,
  Unprocessable,
  UnsupportedMediaType,
} from '../../../../shared/errors';
import { paramString } from '../../../../shared/http';
import { scopeFromRequest } from '../../../../shared/requestScope';
import type { IAtendenteRepository } from '../../../../domain/repositories/IAtendenteRepository';
import type {
  AprovarEncaminhamentoUseCase,
  AutorRegulacao,
} from '../../application/use-cases/AprovarEncaminhamentoUseCase';
import type { RegistrarPendenciaUseCase } from '../../application/use-cases/RegistrarPendenciaUseCase';
import type { RejeitarEncaminhamentoUseCase } from '../../application/use-cases/RejeitarEncaminhamentoUseCase';
import type {
  RegistrarRespostaSusUseCase,
  ReguladorContext,
} from '../../application/use-cases/RegistrarRespostaSusUseCase';
import type { GetArvoreEncaminhamentosUseCase } from '../../application/use-cases/GetArvoreEncaminhamentosUseCase';
import type { ListarFilaEsperaCentroUseCase } from '../../application/use-cases/ListarFilaEsperaCentroUseCase';
import type { AgendarEncaminhamentoUseCase } from '../../application/use-cases/AgendarEncaminhamentoUseCase';

const aprovarSchema = z.object({
  nota: z.string().optional(),
  agendamentoPrevisto: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /**
   * Local físico (endereço + sala). Recomendado quando `agendamentoPrevisto`
   * presente — sem isso o app mostra apenas a data.
   */
  localAgendamento: z.string().trim().max(300).optional(),
  /**
   * Profissional + CRM. Sugestão de formato: "Dra. Beatriz Lima · CRM-PE 22189".
   */
  profissionalAgendado: z.string().trim().max(200).optional(),
  /**
   * Cidade da consulta. EXPLÍCITA (não derivada). Usada para `podeSolicitarTfd`
   * (compara com município da UBS de origem). UI sugere municipio da UBS como
   * default; regulador altera quando a consulta é em outra cidade.
   */
  cidadeAgendamento: z.string().trim().max(100).optional(),
  /** UF do agendamento. 2 chars maiúsculos (ex.: BA, SP). */
  ufAgendamento: z.string().trim().length(2).optional(),
  canalRoteamento: z.enum(['SUS', 'CENTRO_ESPECIALIDADES', 'CENTRO_ODONTOLOGICO']).optional().nullable(),
  filaDestino: z.enum(['SUS', 'CENTRO_ESPECIALIDADES', 'CEO']).optional().nullable(),
  destinoRegulacao: z.enum(['SUS', 'CENTRO_ESPECIALIDADES', 'CENTRO_ODONTOLOGICO']).optional().nullable(),
  dataDisponibilidade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

const pendenciaSchema = z.object({
  observacao: z.string(),
});

const rejeitarSchema = z.object({
  motivo: z.string(),
});

const arvoreQuerySchema = z.object({
  ubsId: z.string().optional(),
  ano: z.coerce.number().int().min(1900).max(9999).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  respostaSUS: z.preprocess((val) => {
    if (val === 'true') return true;
    if (val === 'false') return false;
    return val;
  }, z.boolean().optional()),
  excluirRascunho: z.preprocess((val) => {
    if (val === 'true') return true;
    if (val === 'false') return false;
    return val;
  }, z.boolean().optional()),
});

const MAX_PDF_BYTES = 10 * 1024 * 1024;

export class RegulacaoController {
  constructor(
    private readonly atendentes: IAtendenteRepository,
    private readonly aprovarUC: AprovarEncaminhamentoUseCase,
    private readonly pendenciaUC: RegistrarPendenciaUseCase,
    private readonly rejeitarUC: RejeitarEncaminhamentoUseCase,
    private readonly respostaSusUC: RegistrarRespostaSusUseCase,
    private readonly arvoreUC: GetArvoreEncaminhamentosUseCase,
    private readonly filaCentroUC: ListarFilaEsperaCentroUseCase,
    private readonly agendarUC: AgendarEncaminhamentoUseCase,
  ) {}

  private async resolverAutor(req: Request): Promise<AutorRegulacao> {
    const sub = req.auth!.sub;
    const a = await this.atendentes.buscarPorId(sub);
    if (!a) throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');
    const prefeituraNome = a.prefeitura?.nome ?? a.ubs?.prefeitura?.nome ?? null;
    const papel = prefeituraNome
      ? `Regulação SMS · ${prefeituraNome}`
      : 'Regulação · SMS';
    return { nome: a.nome, papel };
  }

  private async resolverRegulador(req: Request): Promise<ReguladorContext> {
    const sub = req.auth!.sub;
    const a = await this.atendentes.buscarPorId(sub);
    if (!a) throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');
    const prefeituraNome = a.prefeitura?.nome ?? a.ubs?.prefeitura?.nome ?? null;
    const papel = prefeituraNome
      ? `Regulação SMS · ${prefeituraNome}`
      : 'Regulação · SMS';
    return { id: a.id, nome: a.nome, matricula: a.matricula, papel };
  }

  aprovar = async (req: Request, res: Response): Promise<void> => {
    const body = aprovarSchema.parse(req.body ?? {});
    const id = paramString(req, 'id');
    const scope = scopeFromRequest(req);
    const autor = await this.resolverAutor(req);
    const enc = await this.aprovarUC.exec(id, scope, autor, {
      ...(body.nota !== undefined ? { nota: body.nota } : {}),
      ...(body.agendamentoPrevisto !== undefined
        ? { agendamentoPrevisto: body.agendamentoPrevisto }
        : {}),
      ...(body.localAgendamento !== undefined
        ? { localAgendamento: body.localAgendamento }
        : {}),
      ...(body.profissionalAgendado !== undefined
        ? { profissionalAgendado: body.profissionalAgendado }
        : {}),
      ...(body.cidadeAgendamento !== undefined
        ? { cidadeAgendamento: body.cidadeAgendamento }
        : {}),
      ...(body.ufAgendamento !== undefined
        ? { ufAgendamento: body.ufAgendamento }
        : {}),
      ...(body.canalRoteamento !== undefined
        ? { canalRoteamento: body.canalRoteamento }
        : {}),
      ...(body.filaDestino !== undefined
        ? { filaDestino: body.filaDestino }
        : {}),
      ...(body.destinoRegulacao !== undefined
        ? { destinoRegulacao: body.destinoRegulacao }
        : {}),
      ...(body.dataDisponibilidade !== undefined
        ? { dataDisponibilidade: body.dataDisponibilidade }
        : {}),
    });
    res.status(200).json(enc);
  };

  registrarPendencia = async (req: Request, res: Response): Promise<void> => {
    const body = pendenciaSchema.parse(req.body ?? {});
    const id = paramString(req, 'id');
    const scope = scopeFromRequest(req);
    const autor = await this.resolverAutor(req);
    const enc = await this.pendenciaUC.exec(id, scope, autor, {
      observacao: body.observacao,
    });
    res.status(200).json(enc);
  };

  rejeitar = async (req: Request, res: Response): Promise<void> => {
    const body = rejeitarSchema.parse(req.body ?? {});
    const id = paramString(req, 'id');
    const scope = scopeFromRequest(req);
    const autor = await this.resolverAutor(req);
    const enc = await this.rejeitarUC.exec(id, scope, autor, {
      motivo: body.motivo,
    });
    res.status(200).json(enc);
  };

  registrarRespostaSus = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const file = req.file;
    if (!file) throw Unprocessable('PDF_RESPOSTA_OBRIGATORIO', 'PDF da resposta SUS é obrigatório');
    if (file.mimetype !== 'application/pdf') {
      throw UnsupportedMediaType('MIME_NAO_SUPORTADO', 'Apenas PDF é aceito');
    }
    if (file.size > MAX_PDF_BYTES) {
      throw PayloadTooLarge('ARQUIVO_MUITO_GRANDE', 'PDF excede o limite de 10 MB');
    }
    const observacao = String(req.body?.observacao ?? '');
    const scope = scopeFromRequest(req);
    const regulador = await this.resolverRegulador(req);
    const enc = await this.respostaSusUC.exec(id, scope, regulador, {
      observacao,
      pdf: {
        nomeOriginal: file.originalname,
        mimeType: file.mimetype,
        buffer: file.buffer,
      },
    });
    res.status(200).json(enc);
  };

  getArvore = async (req: Request, res: Response): Promise<void> => {
    const q = arvoreQuerySchema.parse(req.query);
    const scope = scopeFromRequest(req);
    const lista = await this.arvoreUC.exec(scope, {
      ...(q.ubsId !== undefined ? { ubsId: q.ubsId } : {}),
      ...(q.ano !== undefined ? { ano: q.ano } : {}),
      ...(q.mes !== undefined ? { mes: q.mes } : {}),
      ...(q.respostaSUS !== undefined ? { respostaSUS: q.respostaSUS } : {}),
      ...(q.excluirRascunho !== undefined ? { excluirRascunho: q.excluirRascunho } : {}),
    });
    res.json(lista);
  };

  getFilaEsperaCentro = async (req: Request, res: Response): Promise<void> => {
    const centroParam = paramString(req, 'centro');
    if (centroParam !== 'CENTRO_ESPECIALIDADES' && centroParam !== 'CENTRO_ODONTOLOGICO') {
      throw Unprocessable('CENTRO_INVALIDO', 'Centro deve ser CENTRO_ESPECIALIDADES ou CENTRO_ODONTOLOGICO');
    }
    const scope = scopeFromRequest(req);
    const fila = await this.filaCentroUC.exec(centroParam, scope);
    res.json(fila);
  };

  agendar = async (req: Request, res: Response): Promise<void> => {
    const agendarSchema = z.object({
      agendamentoPrevisto: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      localAgendamento: z.string().trim().max(300).optional(),
      profissionalAgendado: z.string().trim().max(200).optional(),
      cidadeAgendamento: z.string().trim().max(100).optional(),
      ufAgendamento: z.string().trim().length(2).optional(),
    });

    const body = agendarSchema.parse(req.body ?? {});
    const id = paramString(req, 'id');
    const scope = scopeFromRequest(req);
    const autor = await this.resolverAutor(req);

    const enc = await this.agendarUC.exec(id, scope, autor, body);
    res.status(200).json(enc);
  };
}
