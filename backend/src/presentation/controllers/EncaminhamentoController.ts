import type { Request, Response } from 'express';
import {
  BadRequest,
  Forbidden,
  NotFound,
  PayloadTooLarge,
  UnsupportedMediaType,
} from '../../shared/errors';
import { paramString } from '../../shared/http';
import { scopeFromRequest } from '../../shared/requestScope';
import type { ExtractPdfUseCase } from '../../application/encaminhamentos/ExtractPdfUseCase';
import type {
  AnexoUpload,
  CreateEncaminhamentoUseCase,
} from '../../application/encaminhamentos/CreateEncaminhamentoUseCase';
import type { ListEncaminhamentosUseCase } from '../../application/encaminhamentos/ListEncaminhamentosUseCase';
import type { GetEncaminhamentoUseCase } from '../../application/encaminhamentos/GetEncaminhamentoUseCase';
import type { ResolverPendenciaUseCase } from '../../application/encaminhamentos/ResolverPendenciaUseCase';
import type { UpdateEncaminhamentoUseCase } from '../../application/encaminhamentos/UpdateEncaminhamentoUseCase';
import type { DeleteEncaminhamentoUseCase } from '../../application/encaminhamentos/DeleteEncaminhamentoUseCase';
import type { IAtendenteRepository } from '../../domain/repositories/IAtendenteRepository';
import { z } from 'zod';
import {
  consolidarPayloadSchema,
  listarQuerySchema,
  tipoAnexoSchema,
} from '../schemas/encaminhamentoSchemas';

const patchEncaminhamentoSchema = z.object({
  pacienteNome: z.string().optional(),
  pacienteTelefone: z.string().optional(),
  pacienteEndereco: z.string().optional(),
  justificativaClinica: z.string().optional(),
  prioridade: z.enum(['ELETIVA', 'PRIORITARIA', 'URGENTE', 'EMERGENCIA']).optional(),
  cidDescricao: z.string().optional(),
  especialidadeSolicitada: z.string().optional(),
  cid10: z.string().optional(),
});

const MIMES_ANEXO = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_BYTES = 10 * 1024 * 1024;

function getFiles(req: Request, field: string): Express.Multer.File[] {
  const files = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
  return files[field] ?? [];
}

export class EncaminhamentoController {
  constructor(
    private readonly extractPdf: ExtractPdfUseCase,
    private readonly create: CreateEncaminhamentoUseCase,
    private readonly list: ListEncaminhamentosUseCase,
    private readonly getOne: GetEncaminhamentoUseCase,
    private readonly resolver: ResolverPendenciaUseCase,
    private readonly update: UpdateEncaminhamentoUseCase,
    private readonly remove: DeleteEncaminhamentoUseCase,
    private readonly atendentes: IAtendenteRepository,
  ) {}

  postExtractPdf = async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    if (!file) throw BadRequest('ARQUIVO_INVALIDO', 'Arquivo PDF não enviado');
    if (file.mimetype !== 'application/pdf') {
      throw UnsupportedMediaType('MIME_NAO_SUPORTADO', 'Apenas PDF é aceito');
    }
    if (file.size > MAX_BYTES) {
      throw PayloadTooLarge('ARQUIVO_MUITO_GRANDE', 'PDF excede o limite de 10 MB');
    }
    const out = await this.extractPdf.exec(file.buffer);
    res.json(out);
  };

  postCreate = async (req: Request, res: Response): Promise<void> => {
    const payloadRaw = req.body?.payload;
    if (typeof payloadRaw !== 'string') {
      throw BadRequest('PAYLOAD_AUSENTE', 'Campo "payload" (JSON) é obrigatório');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadRaw);
    } catch {
      throw BadRequest('PAYLOAD_INVALIDO', 'Payload não é um JSON válido');
    }
    const payload = consolidarPayloadSchema.parse(parsed);

    const solicFile = getFiles(req, 'solicitacao')[0];
    const anexoFiles = getFiles(req, 'anexo');
    const tipoAnexoRaw = req.body?.tipoAnexo;
    const tiposAnexo: string[] = Array.isArray(tipoAnexoRaw)
      ? tiposAnexoRaw.map(String)
      : tipoAnexoRaw
        ? [String(tipoAnexoRaw)]
        : [];

    const anexos: AnexoUpload[] = anexoFiles.map((f, i) => {
      if (!MIMES_ANEXO.has(f.mimetype)) {
        throw UnsupportedMediaType('MIME_NAO_SUPORTADO', `Anexo ${f.originalname}: MIME inválido`);
      }
      const tipo = tipoAnexoSchema.safeParse(tiposAnexo[i] ?? 'OUTRO');
      return {
        nomeOriginal: f.originalname,
        mimeType: f.mimetype,
        buffer: f.buffer,
        tipo: tipo.success ? tipo.data : 'OUTRO',
      };
    });

    const atendente = await this.atendentes.buscarPorId(req.auth!.sub);
    if (!atendente) throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');

    // Separa campos essenciais (Paciente domínio) dos complementares.
    // Os complementares são opcionais e só entram quando presentes — assim
    // o repositório sabe que pode "preencher se vazio" no upsert.
    const {
      nome, cpf, cartaoSus, dataNascimento, sexo, telefone, endereco,
      ...complementoRaw
    } = payload.paciente;
    const complementoEntries = Object.entries(complementoRaw).filter(
      ([, v]) => v !== undefined && v !== '',
    );
    const pacienteComplemento = complementoEntries.length > 0
      ? Object.fromEntries(complementoEntries)
      : undefined;

    const enc = await this.create.exec({
      paciente: { nome, cpf, cartaoSus, dataNascimento, sexo, telefone, endereco },
      ...(pacienteComplemento ? { pacienteComplemento } : {}),
      solicitacao: payload.solicitacao,
      ubsId: atendente.ubsId || '',
      atendenteId: req.auth!.sub,
      unidadeOrigem: atendente.ubs ? `${atendente.ubs.nome} - ${atendente.ubs.municipio}` : '',
      atendenteResponsavel: atendente.nome,
      ...(solicFile
        ? {
            solicitacaoPdf: {
              nomeOriginal: solicFile.originalname,
              mimeType: solicFile.mimetype,
              buffer: solicFile.buffer,
              tipo: 'SOLICITACAO' as const,
            },
          }
        : {}),
      anexos,
    });

    await this.atendentes.registrarAtividade(
      req.auth!.sub,
      'Consolidou encaminhamento',
      enc.protocolo,
    );

    res.status(201).json({ id: enc.id, protocolo: enc.protocolo });
  };

  getList = async (req: Request, res: Response): Promise<void> => {
    const q = listarQuerySchema.parse(req.query);
    const scope = scopeFromRequest(req);

    let desde: Date | undefined;
    if (q.desde) {
      desde = new Date(q.desde);
    }
    let ate: Date | undefined;
    if (q.ate) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(q.ate)) {
        ate = new Date(`${q.ate}T23:59:59.999Z`);
      } else {
        ate = new Date(q.ate);
      }
    }

    const lista = await this.list.exec({
      scope,
      ...(q.status ? { status: q.status } : {}),
      ...(q.pacienteId ? { pacienteId: q.pacienteId } : {}),
      ...(desde ? { desde } : {}),
      ...(ate ? { ate } : {}),
      ...(q.limit ? { limit: q.limit } : {}),
      ...(q.respostaSUS !== undefined ? { respostaSUS: q.respostaSUS } : {}),
    });
    res.json(lista);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const enc = await this.getOne.exec(paramString(req, 'id'), scopeFromRequest(req));
    res.json(enc);
  };

  patch = async (req: Request, res: Response): Promise<void> => {
    const body = patchEncaminhamentoSchema.parse(req.body ?? {});
    const atendente = await this.atendentes.buscarPorId(req.auth!.sub);
    if (!atendente) throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');
    const papel = atendente.ubs
      ? `Atendente · ${atendente.ubs.nome}`
      : atendente.role === 'DESENVOLVEDOR'
        ? 'Desenvolvedor'
        : 'Admin';
    // ADMIN e DESENVOLVEDOR podem editar em qualquer status (edição administrativa/correcional).
    // ATENDENTE/COORDENADOR só em AGUARDANDO_REGULACAO (gate default).
    const bypassGate = atendente.role === 'ADMIN' || atendente.role === 'DESENVOLVEDOR';
    const enc = await this.update.exec(
      paramString(req, 'id'),
      scopeFromRequest(req),
      atendente.nome,
      papel,
      atendente.id,
      body,
      { bypassGateDeStatus: bypassGate },
    );
    res.json(enc);
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    const motivo = String(req.body?.motivo ?? '').trim();
    if (motivo.length < 10) {
      throw BadRequest(
        'MOTIVO_OBRIGATORIO',
        'Motivo da exclusão administrativa é obrigatório (mín. 10 caracteres)',
      );
    }
    await this.remove.exec(
      scopeFromRequest(req),
      req.auth!.sub,
      paramString(req, 'id'),
      motivo,
    );
    res.status(204).send();
  };

  postResolverPendencia = async (req: Request, res: Response): Promise<void> => {
    const nota = String(req.body?.nota ?? '');
    const anexoFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
    const tiposRaw = req.body?.tipoAnexo;
    const tipos: string[] = Array.isArray(tiposRaw)
      ? tiposRaw.map(String)
      : tiposRaw
        ? [String(tiposRaw)]
        : [];

    const anexos = anexoFiles.map((f, i) => {
      if (!MIMES_ANEXO.has(f.mimetype)) {
        throw UnsupportedMediaType('MIME_NAO_SUPORTADO', `Anexo ${f.originalname}: MIME inválido`);
      }
      const tipo = tipoAnexoSchema.safeParse(tipos[i] ?? 'OUTRO');
      return {
        nomeOriginal: f.originalname,
        mimeType: f.mimetype,
        buffer: f.buffer,
        tipo: tipo.success ? tipo.data : 'OUTRO',
      };
    });

    const atendente = await this.atendentes.buscarPorId(req.auth!.sub);
    if (!atendente) throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');

    const enc = await this.resolver.exec({
      id: paramString(req, 'id'),
      scope: scopeFromRequest(req),
      nota,
      autor: atendente.nome,
      autorPapel: `Atendente · ${atendente.ubs?.nome ?? 'sem UBS'}`,
      anexos,
    });

    await this.atendentes.registrarAtividade(
      req.auth!.sub,
      'Resolveu pendência',
      enc.protocolo,
    );

    res.json(enc);
  };
}
