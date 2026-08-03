/**
 * Controller único do módulo TFD — agrupa as 47 handlers em uma classe.
 * Cada método chama o use case correspondente, autentica via req.auth,
 * passa o `scope` e o `req` (pra resolver prefeituraId + audit ip/UA).
 */
import type { Request, Response } from 'express';
import { paramString } from '../../../shared/http';
import { scopeFromRequest } from '../../../shared/requestScope';
import { BadRequest, UnsupportedMediaType } from '../../../shared/errors';
import type { VeiculosTfdUseCases } from '../application/veiculos';
import type { MotoristasTfdUseCases } from '../application/motoristas';
import type { SolicitacoesTfdUseCases } from '../application/solicitacoes';
import type { ViagensTfdUseCases } from '../application/viagens';
import type { AbastecimentosUseCases } from '../application/abastecimentos';
import type { SaldoUseCases } from '../application/saldo';
import type { AjudasCustoUseCases } from '../application/ajudas-custo';
import type { AuditoriaTfdUseCases } from '../application/auditoria';
import type {
  ListarTfdPacienteSolicAdminUseCase,
  ObterTfdPacienteSolicAdminUseCase,
  AprovarTfdPacienteSolicUseCase,
  RecusarTfdPacienteSolicUseCase,
  MarcarEmbarqueTfdPacUseCase,
  MarcarConclusaoTfdPacUseCase,
  ListarFiltrosAdmin,
} from '../application/tfd-paciente-solicitacoes';
import { z } from 'zod';
import {
  ajustarSaldoSchema,
  alocarPassageiroSchema,
  aprovarSolicitacaoSchema,
  atualizarMotoristaSchema,
  atualizarVeiculoSchema,
  atualizarViagemSchema,
  cancelarViagemSchema,
  concluirViagemSchema,
  criarMotoristaSchema,
  criarSolicitacaoSchema,
  criarVeiculoSchema,
  criarViagemSchema,
  iniciarViagemSchema,
  kmGestorSchema,
  liberarAbastecimentoSchema,
  marcarPresencaSchema,
  negarAbastecimentoSchema,
  negarAjudaSchema,
  negarSolicitacaoSchema,
  solicitarAbastecimentoSchema,
  solicitarAjudaSchema,
} from './schemas';

export interface TfdUseCases {
  veiculos: VeiculosTfdUseCases;
  motoristas: MotoristasTfdUseCases;
  solicitacoes: SolicitacoesTfdUseCases;
  viagens: ViagensTfdUseCases;
  abastecimentos: AbastecimentosUseCases;
  saldo: SaldoUseCases;
  ajudasCusto: AjudasCustoUseCases;
  auditoria: AuditoriaTfdUseCases;
  // v0.17+: solicitações vindas do APP PACIENTE (Face 3)
  solicPaciente: {
    listar: ListarTfdPacienteSolicAdminUseCase;
    obter: ObterTfdPacienteSolicAdminUseCase;
    aprovar: AprovarTfdPacienteSolicUseCase;
    recusar: RecusarTfdPacienteSolicUseCase;
    marcarEmbarque: MarcarEmbarqueTfdPacUseCase;
    marcarConclusao: MarcarConclusaoTfdPacUseCase;
  };
}

const aprovarSolicPacienteSchema = z.object({
  numeroAssento: z.string().trim().max(10).optional(),
});

const recusarSolicPacienteSchema = z.object({
  motivo: z.string().trim().min(5).max(500),
});

const listarSolicPacienteQuery = z.object({
  status: z
    .enum(['AGUARDANDO', 'APROVADA', 'RECUSADA', 'CANCELADA', 'EMBARCADA', 'CONCLUIDA'])
    .optional(),
  viagemId: z.string().optional(),
  prioridade: z.enum(['NORMAL', 'PRIORITARIA', 'URGENTE']).optional(),
});

export class TfdController {
  constructor(private readonly uc: TfdUseCases) {}

  // ==================== VEÍCULOS ====================
  getVeiculos = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.uc.veiculos.listar(scopeFromRequest(req), req));
  };
  postVeiculo = async (req: Request, res: Response): Promise<void> => {
    const body = criarVeiculoSchema.parse(req.body ?? {});
    res.status(201).json(
      await this.uc.veiculos.criar(scopeFromRequest(req), req, req.auth!.sub, body),
    );
  };
  getVeiculoById = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.uc.veiculos.porId(scopeFromRequest(req), paramString(req, 'id')));
  };
  patchVeiculo = async (req: Request, res: Response): Promise<void> => {
    const body = atualizarVeiculoSchema.parse(req.body ?? {});
    res.json(
      await this.uc.veiculos.atualizar(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'), body,
      ),
    );
  };
  postVeiculoManutencao = async (req: Request, res: Response): Promise<void> => {
    res.json(
      await this.uc.veiculos.setStatus(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'), 'EM_MANUTENCAO',
      ),
    );
  };
  postVeiculoReativar = async (req: Request, res: Response): Promise<void> => {
    res.json(
      await this.uc.veiculos.setStatus(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'), 'ATIVO',
      ),
    );
  };
  deleteVeiculo = async (req: Request, res: Response): Promise<void> => {
    await this.uc.veiculos.deletar(
      scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'),
    );
    res.status(204).send();
  };

  // ==================== MOTORISTAS ====================
  getMotoristas = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.uc.motoristas.listar(scopeFromRequest(req), req));
  };
  postMotorista = async (req: Request, res: Response): Promise<void> => {
    const body = criarMotoristaSchema.parse(req.body ?? {});
    res.status(201).json(
      await this.uc.motoristas.criar(scopeFromRequest(req), req, req.auth!.sub, body),
    );
  };
  getMotoristaById = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.uc.motoristas.porId(scopeFromRequest(req), paramString(req, 'id')));
  };
  patchMotorista = async (req: Request, res: Response): Promise<void> => {
    const body = atualizarMotoristaSchema.parse(req.body ?? {});
    res.json(
      await this.uc.motoristas.atualizar(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'), body,
      ),
    );
  };
  postMotoristaAfastar = async (req: Request, res: Response): Promise<void> => {
    res.json(
      await this.uc.motoristas.setStatus(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'), 'AFASTADO',
      ),
    );
  };
  postMotoristaReativar = async (req: Request, res: Response): Promise<void> => {
    res.json(
      await this.uc.motoristas.setStatus(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'), 'ATIVO',
      ),
    );
  };
  deleteMotorista = async (req: Request, res: Response): Promise<void> => {
    await this.uc.motoristas.deletar(
      scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'),
    );
    res.status(204).send();
  };

  // ==================== SOLICITAÇÕES ====================
  getSolicitacoes = async (req: Request, res: Response): Promise<void> => {
    const criadaPorMim = req.query['criadaPorMim'] === 'true' || req.query['criadaPorMim'] === '1';
    res.json(
      await this.uc.solicitacoes.listar(scopeFromRequest(req), req, {
        status: typeof req.query['status'] === 'string' ? req.query['status'] : undefined,
        prioridade: typeof req.query['prioridade'] === 'string' ? req.query['prioridade'] : undefined,
        q: typeof req.query['q'] === 'string' ? req.query['q'] : undefined,
        criadaPorMim,
      }),
    );
  };
  postSolicitacao = async (req: Request, res: Response): Promise<void> => {
    const body = criarSolicitacaoSchema.parse(req.body ?? {});
    res.status(201).json(
      await this.uc.solicitacoes.criar(scopeFromRequest(req), req, req.auth!.sub, body),
    );
  };
  getSolicitacaoById = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.uc.solicitacoes.porId(scopeFromRequest(req), paramString(req, 'id')));
  };
  postAprovarSolicitacao = async (req: Request, res: Response): Promise<void> => {
    const body = aprovarSolicitacaoSchema.parse(req.body ?? {});
    res.json(
      await this.uc.solicitacoes.aprovar(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'),
        body.observacoes, body.alocacao, body.modoAlocacao, body.dataManual,
      ),
    );
  };
  postNegarSolicitacao = async (req: Request, res: Response): Promise<void> => {
    const body = negarSolicitacaoSchema.parse(req.body ?? {});
    res.json(
      await this.uc.solicitacoes.negar(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'), body.motivo,
      ),
    );
  };
  postAnexarSolicitacao = async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    if (!file) throw BadRequest('ARQUIVO_OBRIGATORIO', 'Anexe um arquivo');
    const tipo = String(req.body?.tipo ?? 'OUTRO');
    const TIPOS = new Set([
      'ENCAMINHAMENTO',
      'COMPROVANTE_CONSULTA',
      'LAUDO_MEDICO',
      'DOCUMENTO_IDENTIDADE',
      'COMPROVANTE_ENCAMINHAMENTO',
      'EXAME',
      'LAUDO',
      'OUTRO',
    ]);
    if (!TIPOS.has(tipo)) throw BadRequest('TIPO_INVALIDO', 'Tipo de anexo inválido');
    res.status(201).json(
      await this.uc.solicitacoes.anexarComprovante(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'),
        {
          nomeOriginal: file.originalname,
          mimeType: file.mimetype,
          buffer: file.buffer,
          tipo: tipo as any,
        },
      ),
    );
  };
  getDownloadAnexo = async (req: Request, res: Response): Promise<void> => {
    const out = await this.uc.solicitacoes.getCaminhoAnexoLiberado(
      scopeFromRequest(req), paramString(req, 'id'),
    );
    res.set('Content-Type', out.mimeType);
    res.set('Content-Disposition', `attachment; filename="${out.nome}"`);
    const fs = await import('node:fs');
    fs.createReadStream(out.caminho).pipe(res);
  };

  // ==================== VIAGENS ====================
  getViagens = async (req: Request, res: Response): Promise<void> => {
    res.json(
      await this.uc.viagens.listar(scopeFromRequest(req), req, {
        status: typeof req.query['status'] === 'string' ? req.query['status'] : undefined,
        desde: typeof req.query['desde'] === 'string' ? req.query['desde'] : undefined,
        ate: typeof req.query['ate'] === 'string' ? req.query['ate'] : undefined,
      }),
    );
  };
  postViagem = async (req: Request, res: Response): Promise<void> => {
    const body = criarViagemSchema.parse(req.body ?? {});
    res.status(201).json(
      await this.uc.viagens.criar(scopeFromRequest(req), req, req.auth!.sub, body),
    );
  };
  getViagemById = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.uc.viagens.porId(scopeFromRequest(req), paramString(req, 'id')));
  };
  patchViagem = async (req: Request, res: Response): Promise<void> => {
    const body = atualizarViagemSchema.parse(req.body ?? {});
    res.json(
      await this.uc.viagens.atualizar(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'), body,
      ),
    );
  };
  postIniciarViagem = async (req: Request, res: Response): Promise<void> => {
    const body = iniciarViagemSchema.parse(req.body ?? {});
    res.json(
      await this.uc.viagens.iniciar(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'), body.kmInicialHodometro,
      ),
    );
  };
  postKmGestor = async (req: Request, res: Response): Promise<void> => {
    const body = kmGestorSchema.parse(req.body ?? {});
    res.json(
      await this.uc.viagens.registrarKmGestor(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'),
        body.kmInicialHodometro, body.kmFinalHodometro, body.justificativa,
      ),
    );
  };
  postConcluirViagem = async (req: Request, res: Response): Promise<void> => {
    const body = concluirViagemSchema.parse(req.body ?? {});
    res.json(
      await this.uc.viagens.concluir(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'),
        body,
      ),
    );
  };
  postCancelarViagem = async (req: Request, res: Response): Promise<void> => {
    const body = cancelarViagemSchema.parse(req.body ?? {});
    res.json(
      await this.uc.viagens.cancelar(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'), body.motivo,
      ),
    );
  };
  postAlocarPassageiro = async (req: Request, res: Response): Promise<void> => {
    const body = alocarPassageiroSchema.parse(req.body ?? {});
    res.status(201).json(
      await this.uc.viagens.alocarPassageiro(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'),
        body.solicitacaoId, body.numeroAssento,
      ),
    );
  };
  deletePassageiro = async (req: Request, res: Response): Promise<void> => {
    res.json(
      await this.uc.viagens.removerPassageiro(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'), paramString(req, 'pid'),
      ),
    );
  };
  postPresenca = async (req: Request, res: Response): Promise<void> => {
    const body = marcarPresencaSchema.parse(req.body ?? {});
    res.json(
      await this.uc.viagens.marcarPresenca(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'), paramString(req, 'pid'),
        body.presenca, body.observacao,
      ),
    );
  };

  // ==================== ABASTECIMENTO ====================
  getAbastecimentos = async (req: Request, res: Response): Promise<void> => {
    res.json(
      await this.uc.abastecimentos.listar(scopeFromRequest(req), req, {
        status: typeof req.query['status'] === 'string' ? req.query['status'] : undefined,
        veiculoId: typeof req.query['veiculoId'] === 'string' ? req.query['veiculoId'] : undefined,
        desde: typeof req.query['desde'] === 'string' ? req.query['desde'] : undefined,
        ate: typeof req.query['ate'] === 'string' ? req.query['ate'] : undefined,
      }),
    );
  };
  postSolicitarAbastecimento = async (req: Request, res: Response): Promise<void> => {
    const body = solicitarAbastecimentoSchema.parse(req.body ?? {});
    res.status(201).json(
      await this.uc.abastecimentos.solicitar(scopeFromRequest(req), req, req.auth!.sub, body),
    );
  };
  postLiberarAbastecimento = async (req: Request, res: Response): Promise<void> => {
    liberarAbastecimentoSchema.parse(req.body ?? {});
    res.json(
      await this.uc.abastecimentos.liberar(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'),
      ),
    );
  };
  postNegarAbastecimento = async (req: Request, res: Response): Promise<void> => {
    const body = negarAbastecimentoSchema.parse(req.body ?? {});
    res.json(
      await this.uc.abastecimentos.negar(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'), body.motivo,
      ),
    );
  };
  postComprovanteAbastecimento = async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    if (!file) throw BadRequest('ARQUIVO_OBRIGATORIO', 'Anexe o comprovante');
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)) {
      throw UnsupportedMediaType('MIME_NAO_SUPORTADO', 'Use PDF, JPEG ou PNG');
    }
    const litros = Number(req.body?.litros);
    const valorPorLitro = Number(req.body?.valorPorLitro);
    const valorTotal = Number(req.body?.valorTotal);
    const hodometroKm = Number(req.body?.hodometroKm);
    if ([litros, valorPorLitro, valorTotal, hodometroKm].some((n) => !Number.isFinite(n))) {
      throw BadRequest('CAMPOS_NUMERICOS_INVALIDOS', 'litros/valorPorLitro/valorTotal/hodometroKm são obrigatórios');
    }
    res.json(
      await this.uc.abastecimentos.registrarComprovante(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'),
        {
          litros, valorPorLitro, valorTotal, hodometroKm,
          comprovante: { nomeOriginal: file.originalname, mimeType: file.mimetype, buffer: file.buffer },
        },
      ),
    );
  };
  getComprovanteAbastecimento = async (req: Request, res: Response): Promise<void> => {
    const out = await this.uc.abastecimentos.getComprovantePath(
      scopeFromRequest(req), paramString(req, 'id'),
    );
    res.set('Content-Type', out.mimeType);
    res.set('Content-Disposition', `attachment; filename="${out.nome}"`);
    const fs = await import('node:fs');
    fs.createReadStream(out.caminho).pipe(res);
  };

  // ==================== SALDO ====================
  getSaldo = async (req: Request, res: Response): Promise<void> => {
    const mes = typeof req.query['mes'] === 'string' ? req.query['mes'] : undefined;
    res.json(await this.uc.saldo.listar(scopeFromRequest(req), req, mes));
  };
  postAjustarSaldo = async (req: Request, res: Response): Promise<void> => {
    const body = ajustarSaldoSchema.parse(req.body ?? {});
    res.json(await this.uc.saldo.ajustar(scopeFromRequest(req), req, req.auth!.sub, body));
  };

  // ==================== AJUDA DE CUSTO ====================
  getAjudas = async (req: Request, res: Response): Promise<void> => {
    res.json(
      await this.uc.ajudasCusto.listar(scopeFromRequest(req), req, {
        status: typeof req.query['status'] === 'string' ? req.query['status'] : undefined,
        pacienteId: typeof req.query['pacienteId'] === 'string' ? req.query['pacienteId'] : undefined,
      }),
    );
  };
  getAjudaById = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.uc.ajudasCusto.porId(scopeFromRequest(req), paramString(req, 'id')));
  };
  postSolicitarAjuda = async (req: Request, res: Response): Promise<void> => {
    const body = solicitarAjudaSchema.parse(req.body ?? {});
    res.status(201).json(
      await this.uc.ajudasCusto.solicitar(scopeFromRequest(req), req, req.auth!.sub, body),
    );
  };
  postAutorizarAjuda = async (req: Request, res: Response): Promise<void> => {
    res.json(
      await this.uc.ajudasCusto.autorizar(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'),
      ),
    );
  };
  postPagarAjuda = async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    if (!file) throw BadRequest('ARQUIVO_OBRIGATORIO', 'Anexe comprovante de pagamento');
    const metodo = String(req.body?.metodoPagamento ?? '');
    if (!['PIX', 'TRANSFERENCIA', 'DINHEIRO_RH'].includes(metodo)) {
      throw BadRequest('METODO_INVALIDO', 'metodoPagamento inválido');
    }
    res.json(
      await this.uc.ajudasCusto.pagar(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'),
        {
          metodoPagamento: metodo as any,
          comprovante: { nomeOriginal: file.originalname, mimeType: file.mimetype, buffer: file.buffer },
        },
      ),
    );
  };
  postNegarAjuda = async (req: Request, res: Response): Promise<void> => {
    const body = negarAjudaSchema.parse(req.body ?? {});
    res.json(
      await this.uc.ajudasCusto.negar(
        scopeFromRequest(req), req, req.auth!.sub, paramString(req, 'id'), body.motivo,
      ),
    );
  };

  // ==================== AUDITORIA ====================
  getAuditoria = async (req: Request, res: Response): Promise<void> => {
    res.json(
      await this.uc.auditoria.listar(scopeFromRequest(req), req, {
        recursoTipo: typeof req.query['recursoTipo'] === 'string' ? req.query['recursoTipo'] : undefined,
        recursoId: typeof req.query['recursoId'] === 'string' ? req.query['recursoId'] : undefined,
        desde: typeof req.query['desde'] === 'string' ? req.query['desde'] : undefined,
        ate: typeof req.query['ate'] === 'string' ? req.query['ate'] : undefined,
      }),
    );
  };
  getAuditoriaById = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.uc.auditoria.porId(scopeFromRequest(req), paramString(req, 'id')));
  };
  getVerificarIntegridade = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.uc.auditoria.verificarIntegridade(scopeFromRequest(req), req));
  };
  getExportarTJ = async (req: Request, res: Response): Promise<void> => {
    const mes = String(req.query['mes'] ?? '');
    const out = await this.uc.auditoria.exportarTJ(scopeFromRequest(req), req, mes);
    const m = out.manifest as Record<string, unknown>;
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${out.nomeArquivo}"`);
    res.set('X-Manifest-Hash', String(m['hashManifesto']));
    res.set('X-Modo-Assinatura', String(m['modoAssinatura']));
    res.set('X-Sha256-Conteudo', String(m['sha256Conteudo']));
    if (m['certSubject']) res.set('X-Cert-Subject', encodeURIComponent(String(m['certSubject'])));
    res.send(out.zip);
  };

  // ==================== SOLICITAÇÕES TFD DO APP PACIENTE (v0.17+) ====================
  /** Lista solicitações vindas do app paciente — ordenado por prioridade. */
  getSolicPacienteList = async (req: Request, res: Response): Promise<void> => {
    const q = listarSolicPacienteQuery.parse(req.query);
    const filtros: ListarFiltrosAdmin = {};
    if (q.status !== undefined) filtros.status = q.status;
    if (q.viagemId !== undefined) filtros.viagemId = q.viagemId;
    if (q.prioridade !== undefined) filtros.prioridade = q.prioridade;
    res.json(await this.uc.solicPaciente.listar.exec(scopeFromRequest(req), filtros));
  };

  getSolicPacienteById = async (req: Request, res: Response): Promise<void> => {
    res.json(
      await this.uc.solicPaciente.obter.exec(scopeFromRequest(req), paramString(req, 'id')),
    );
  };

  postAprovarSolicPaciente = async (req: Request, res: Response): Promise<void> => {
    const body = aprovarSolicPacienteSchema.parse(req.body ?? {});
    const operador = await this._operadorCtx(req);
    res.json(
      await this.uc.solicPaciente.aprovar.exec(
        scopeFromRequest(req),
        paramString(req, 'id'),
        operador,
        body,
      ),
    );
  };

  postRecusarSolicPaciente = async (req: Request, res: Response): Promise<void> => {
    const body = recusarSolicPacienteSchema.parse(req.body ?? {});
    const operador = await this._operadorCtx(req);
    res.json(
      await this.uc.solicPaciente.recusar.exec(
        scopeFromRequest(req),
        paramString(req, 'id'),
        operador,
        body,
      ),
    );
  };

  postEmbarqueSolicPaciente = async (req: Request, res: Response): Promise<void> => {
    const operador = await this._operadorCtx(req);
    res.json(
      await this.uc.solicPaciente.marcarEmbarque.exec(
        scopeFromRequest(req),
        paramString(req, 'id'),
        operador,
      ),
    );
  };

  postConclusaoSolicPaciente = async (req: Request, res: Response): Promise<void> => {
    const operador = await this._operadorCtx(req);
    res.json(
      await this.uc.solicPaciente.marcarConclusao.exec(
        scopeFromRequest(req),
        paramString(req, 'id'),
        operador,
      ),
    );
  };

  /** Resolve OperadorTfdCtx do req (snapshot do atendente autenticado). */
  private async _operadorCtx(req: Request): Promise<{
    operadorId: string;
    operadorNome: string;
    operadorMatricula: string;
    operadorRole: string;
    ip: string;
    userAgent: string;
  }> {
    // Snapshot do atendente vai pro hash chain (nome/matrícula).
    // Lê do DB pra ter nome/matrícula reais — JWT só tem `sub`+`role`.
    const at = await this.uc.solicitacoes['atendentes']?.buscarPorId?.(req.auth!.sub) ??
      (await import('../../../infrastructure/database/prisma')).prisma.atendente.findUnique({
        where: { id: req.auth!.sub },
        select: { nome: true, matricula: true },
      });
    const atendente = (await at) ?? null;
    return {
      operadorId: req.auth!.sub,
      operadorNome: atendente?.nome ?? 'OPERADOR',
      operadorMatricula: atendente?.matricula ?? '',
      operadorRole: req.auth!.role ?? '',
      ip: req.ip ?? '',
      userAgent: req.header('user-agent') ?? '',
    };
  }
}
