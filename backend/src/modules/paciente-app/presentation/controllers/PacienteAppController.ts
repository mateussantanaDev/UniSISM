import crypto from 'node:crypto';
import fs from 'node:fs';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { NotFound } from '../../../../shared/errors';
import { paramString } from '../../../../shared/http';
import { prisma } from '../../../../infrastructure/database/prisma';
import { buildContentDisposition } from '../../../../shared/contentDisposition';
import { logger } from '../../../../infrastructure/logger';
import type { DownloadAnexoPacienteUseCase } from '../../application/use-cases/DownloadAnexoPacienteUseCase';
import type { LoginPacienteUseCase } from '../../application/use-cases/LoginPacienteUseCase';
import type { RefreshTokenPacienteUseCase } from '../../application/use-cases/RefreshTokenPacienteUseCase';
import type { AtivarContaPacienteUseCase } from '../../application/use-cases/AtivarContaPacienteUseCase';
import type { ListarMeusEncaminhamentosUseCase } from '../../application/use-cases/ListarMeusEncaminhamentosUseCase';
import type { ListarNotificacoesUseCase } from '../../application/use-cases/ListarNotificacoesUseCase';
import type { TrocarSenhaPacienteUseCase } from '../../application/use-cases/TrocarSenhaPacienteUseCase';
import type { EsqueciSenhaPacienteUseCase } from '../../application/use-cases/EsqueciSenhaPacienteUseCase';
import type { RedefinirSenhaPacienteUseCase } from '../../application/use-cases/RedefinirSenhaPacienteUseCase';
import type { ObterMinhaUbsUseCase } from '../../application/use-cases/ObterMinhaUbsUseCase';
import type {
  RegistrarFcmPacienteUseCase,
  RevogarFcmPacienteUseCase,
  RegistrarPushDispositivoUseCase,
  RevogarPushDispositivoUseCase,
} from '../../application/use-cases/PushDispositivoUseCases';
import type {
  DossieResumoUseCase,
  DossieAtendimentosUseCase,
  DossieVacinacoesUseCase,
  DossieExamesUseCase,
  ObterAtendimentoUseCase,
  ObterVacinacaoUseCase,
  ObterExameUseCase,
} from '../../application/use-cases/DossieUseCases';
import type {
  ListarBannersAtivosUseCase,
  ObterBannerUseCase,
  MarcarBannerVistoUseCase,
} from '../../application/use-cases/BannersUseCases';
import type {
  ListarTfdViagensPacienteUseCase,
  ObterTfdViagemPacienteUseCase,
  ListarMinhasSolicitacoesTfdUseCase,
  ObterMinhaSolicitacaoTfdUseCase,
  CriarSolicitacaoTfdPacienteUseCase,
  CancelarSolicitacaoTfdPacienteUseCase,
} from '../../application/use-cases/TfdPacienteUseCases';
import {
  mapEncaminhamentoApp,
  type EncaminhamentoApp,
} from '../../application/adapters/encaminhamentoAppAdapter';
import { mapNotificacaoApp } from '../../application/adapters/notificacaoAppAdapter';

const loginSchema = z.object({
  cpf: z.string().min(11),
  senha: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().trim().min(32).max(256),
});

const ativarSchema = z.object({
  cpf: z.string().min(11),
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  senha: z.string().min(8),
  nome: z.string().optional(),
});

const trocarSenhaSchema = z.object({
  senhaAtual: z.string().min(1),
  novaSenha: z.string().min(8),
});

const esqueciSchema = z.object({
  // Aceita CPF formatado ou só dígitos. Validação de checksum + sanity é feita
  // no use case (silencioso pra anti-enumeration).
  cpf: z.string().trim().min(11).max(14),
});

const redefinirSchema = z.object({
  // Token = 64 hex chars (256 bits via crypto.randomBytes(32).toString('hex')).
  // Aceita range 32-128 pra tolerância. Validação rigorosa no use case.
  token: z.string().trim().min(32).max(128).regex(/^[a-f0-9]+$/i, 'Token inválido'),
  novaSenha: z.string().min(8).max(128),
});

const fcmRegistrarSchema = z.object({
  fcmToken: z.string().min(20),
  plataforma: z.enum(['android', 'ios']),
  appVersion: z.string().optional(),
});

const fcmRevogarSchema = z.object({
  fcmToken: z.string().optional(),
});

/** Schema do endpoint genérico `/me/push-token` (v0.16+, provider-agnostic). */
const pushRegistrarSchema = z.object({
  /** Para NTFY: opcional (backend gera). Para FCM/WEB_PUSH: obrigatório. */
  endpoint: z.string().max(2000).optional(),
  provider: z.enum(['NTFY', 'FCM', 'WEB_PUSH']),
  plataforma: z.enum(['android', 'ios']),
  appVersion: z.string().optional(),
});

const pushRevogarSchema = z.object({
  endpoint: z.string().optional(),
});

const criarTfdSolicSchema = z.object({
  viagemId: z.string().min(1),
  justificativa: z.string().min(10),
  encaminhamentoId: z.string().optional(),
  acompanhante: z.string().optional(),
});

/**
 * Payload canônico do paciente — usado em `login`, `refresh` e `me`.
 * Shape único pra garantir que o app não precise tratar 3 estruturas diferentes.
 *
 * Campos `null` quando o CPF ainda não tem PEC clínico (conta nova sem
 * encaminhamento) ou quando o operador UBS não preencheu na consolidação.
 */
export interface PacientePayload {
  // Identificação
  id: string;
  nome: string;
  nomeSocial: string | null;
  cpf: string;
  cpfFormatado: string;
  cartaoSus: string | null;
  dataNascimento: string | null;
  sexo: string | null;
  fotoUrl: string | null;

  // Filiação
  nomeMae: string | null;
  nomePai: string | null;

  // Perfil sócio-demográfico
  estadoCivil: string | null;
  escolaridade: string | null;
  profissao: string | null;
  racaCor: string | null;
  grupoSanguineo: string | null;

  // Contato
  email: string | null;
  telefone: string | null;
  telefoneSecundario: string | null;

  // Endereço
  endereco: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;

  // Atenção primária
  ubsVinculadaId: string | null;
  ubsVinculadaNome: string | null;
  agenteComunitario: string | null;
  microarea: string | null;
  equipeSaudeFamilia: string | null;

  // Sessão
  senhaProvisoria: boolean;
}

export interface PacienteAppDeps {
  login: LoginPacienteUseCase;
  refresh: RefreshTokenPacienteUseCase;
  ativar: AtivarContaPacienteUseCase;
  listEncs: ListarMeusEncaminhamentosUseCase;
  notifs: ListarNotificacoesUseCase;
  trocarSenha: TrocarSenhaPacienteUseCase;
  esqueciSenha: EsqueciSenhaPacienteUseCase;
  redefinirSenha: RedefinirSenhaPacienteUseCase;
  obterMinhaUbs: ObterMinhaUbsUseCase;
  fcmRegistrar: RegistrarFcmPacienteUseCase;
  fcmRevogar: RevogarFcmPacienteUseCase;
  pushRegistrar: RegistrarPushDispositivoUseCase;
  pushRevogar: RevogarPushDispositivoUseCase;
  dossieResumo: DossieResumoUseCase;
  dossieAtendimentos: DossieAtendimentosUseCase;
  dossieVacinacoes: DossieVacinacoesUseCase;
  dossieExames: DossieExamesUseCase;
  dossieObterAtendimento: ObterAtendimentoUseCase;
  dossieObterVacinacao: ObterVacinacaoUseCase;
  dossieObterExame: ObterExameUseCase;
  listarBanners: ListarBannersAtivosUseCase;
  obterBanner: ObterBannerUseCase;
  marcarBannerVisto: MarcarBannerVistoUseCase;
  listarTfdViagens: ListarTfdViagensPacienteUseCase;
  obterTfdViagem: ObterTfdViagemPacienteUseCase;
  listarMinhasSolicTfd: ListarMinhasSolicitacoesTfdUseCase;
  obterMinhaSolicTfd: ObterMinhaSolicitacaoTfdUseCase;
  criarSolicTfd: CriarSolicitacaoTfdPacienteUseCase;
  cancelarSolicTfd: CancelarSolicitacaoTfdPacienteUseCase;
  downloadAnexo: DownloadAnexoPacienteUseCase;
}

export class PacienteAppController {
  constructor(private readonly d: PacienteAppDeps) {}

  // ───────── auth ─────────

  postLogin = async (req: Request, res: Response): Promise<void> => {
    const b = loginSchema.parse(req.body);
    const out = await this.d.login.exec(
      b.cpf,
      b.senha,
      req.ip ?? '',
      req.header('user-agent') ?? '',
    );
    res.json(out);
  };

  postAtivar = async (req: Request, res: Response): Promise<void> => {
    const b = ativarSchema.parse(req.body);
    await this.d.ativar.exec(b.cpf, b.dataNascimento, b.senha, b.nome);
    res.status(204).send();
  };

  postRefresh = async (req: Request, res: Response): Promise<void> => {
    const b = refreshSchema.parse(req.body);
    const out = await this.d.refresh.exec({
      refreshToken: b.refreshToken,
      ip: req.ip ?? '',
      userAgent: req.header('user-agent') ?? '',
    });
    res.json(out);
  };

  postLogout = async (req: Request, res: Response): Promise<void> => {
    const auth = req.header('authorization') ?? '';
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (m && m[1]) {
      const accessHash = crypto.createHash('sha256').update(m[1]).digest('hex');
      // Revoga a sessão (access) E o refresh token vinculado (se existir)
      const sessao = await prisma.sessaoPaciente.findUnique({
        where: { tokenHash: accessHash },
        select: { contaId: true, refreshTokenId: true },
      });
      if (sessao) {
        await prisma.$transaction([
          prisma.sessaoPaciente.updateMany({
            where: { tokenHash: accessHash, revogadaEm: null },
            data: { revogadaEm: new Date() },
          }),
          // Revoga TODOS os refresh tokens vivos da conta (logout = sair de vez)
          prisma.pacienteRefreshToken.updateMany({
            where: { contaId: sessao.contaId, revogadoEm: null },
            data: { revogadoEm: new Date(), motivoRevogacao: 'LOGOUT' },
          }),
        ]);
      }
    }
    res.status(204).send();
  };

  postTrocarSenha = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const b = trocarSenhaSchema.parse(req.body);
    await this.d.trocarSenha.exec(a.contaId, b.senhaAtual, b.novaSenha);
    res.status(204).send();
  };

  postEsqueciSenha = async (req: Request, res: Response): Promise<void> => {
    const b = esqueciSchema.parse(req.body);
    await this.d.esqueciSenha.exec(b.cpf, {
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
    res.status(204).send();
  };

  postRedefinirSenha = async (req: Request, res: Response): Promise<void> => {
    const b = redefinirSchema.parse(req.body);
    await this.d.redefinirSenha.exec(b.token, b.novaSenha, {
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
    res.status(204).send();
  };

  // ───────── me / perfil ─────────
  //
  // Shape do payload `paciente` é **canônico** — usado em login, refresh e me.
  // CONTRATO_BACKEND.md §4.4 exige que /me retorne shape idêntico ao do login.
  // Campos extras vs versão antiga: dataNascimento, cartaoSus, fotoUrl,
  // ubsVinculadaId, ubsVinculadaNome.
  //

  getMe = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const payload = await this.buildPacientePayload(a.contaId, a.cpfDigits, a.cpfFormatado, a.nome);
    res.json(payload);
  };

  /**
   * Constrói o payload canônico de `paciente` (usado em login, refresh e me).
   *
   * v0.18.3+: payload **completo** — agora inclui filiação, perfil sócio-
   * demográfico, endereço estruturado, agente comunitário (ACS), microárea
   * e equipe Saúde da Família. O app renderiza tela de perfil rica sem
   * precisar de outros endpoints.
   *
   * Estratégia:
   *   - `PacienteConta` → contato (email, telefone), UBS vinculada, flag de senha
   *   - `Paciente` (PEC clínico, match por CPF) → tudo mais
   *
   * Quando o CPF não tem PEC ainda (conta nova sem encaminhamento), os
   * campos clínicos ficam `null`/default — o app trata com `??`.
   */
  private async buildPacientePayload(
    contaId: string,
    cpfDigits: string,
    cpfFormatado: string,
    nome: string,
  ): Promise<PacientePayload> {
    const [conta, pac] = await Promise.all([
      prisma.pacienteConta.findUnique({
        where: { id: contaId },
        select: {
          senhaProvisoria: true,
          email: true,
          telefone: true,
          ubsVinculadaId: true,
          ubsVinculada: { select: { nome: true } },
        },
      }),
      prisma.paciente.findUnique({
        where: { cpf: cpfDigits },
        select: {
          nomeSocial: true,
          dataNascimento: true,
          cartaoSus: true,
          sexo: true,
          telefoneSecundario: true,
          nomeMae: true,
          nomePai: true,
          estadoCivil: true,
          escolaridade: true,
          profissao: true,
          racaCor: true,
          grupoSanguineo: true,
          endereco: true,
          bairro: true,
          municipio: true,
          uf: true,
          cep: true,
          agenteComunitario: true,
          microarea: true,
          equipeSaudeFamilia: true,
        },
      }),
    ]);

    return {
      // ─── Identificação ─────────────────────────────────────────
      id: contaId,
      nome,
      nomeSocial: pac?.nomeSocial ?? null,
      cpf: cpfDigits,
      cpfFormatado,
      cartaoSus: pac?.cartaoSus ?? null,
      dataNascimento: pac?.dataNascimento
        ? pac.dataNascimento.toISOString().slice(0, 10)
        : null,
      sexo: pac?.sexo ?? null,
      fotoUrl: null, // reservado v0.19+ (upload de foto pelo paciente)

      // ─── Filiação ─────────────────────────────────────────────
      nomeMae: pac?.nomeMae ?? null,
      nomePai: pac?.nomePai ?? null,

      // ─── Perfil sócio-demográfico ─────────────────────────────
      estadoCivil: pac?.estadoCivil ?? null,
      escolaridade: pac?.escolaridade ?? null,
      profissao: pac?.profissao ?? null,
      racaCor: pac?.racaCor ?? null,
      grupoSanguineo:
        pac?.grupoSanguineo && pac.grupoSanguineo !== 'NAO_INFORMADO'
          ? pac.grupoSanguineo
          : null,

      // ─── Contato ──────────────────────────────────────────────
      email: conta?.email ?? null,
      telefone: conta?.telefone ?? null,
      telefoneSecundario: pac?.telefoneSecundario ?? null,

      // ─── Endereço ─────────────────────────────────────────────
      endereco: pac?.endereco ?? null,
      bairro: pac?.bairro ?? null,
      municipio: pac?.municipio ?? null,
      uf: pac?.uf ?? null,
      cep: pac?.cep ?? null,

      // ─── Atenção primária (UBS / ACS / eSF) ───────────────────
      ubsVinculadaId: conta?.ubsVinculadaId ?? null,
      ubsVinculadaNome: conta?.ubsVinculada?.nome ?? null,
      agenteComunitario: pac?.agenteComunitario ?? null,
      microarea: pac?.microarea ?? null,
      equipeSaudeFamilia: pac?.equipeSaudeFamilia ?? null,

      // ─── Sessão ───────────────────────────────────────────────
      senhaProvisoria: conta?.senhaProvisoria ?? false,
    };
  }

  // ───────── encaminhamentos ─────────

  /**
   * Helper: lista internamente + aplica adapter de app (shape FLAT mandado).
   */
  private async listEncsApp(cpfDigits: string, cpfFormatado: string): Promise<EncaminhamentoApp[]> {
    const lista = await this.d.listEncs.exec(cpfDigits, cpfFormatado);
    return lista.map(mapEncaminhamentoApp);
  }

  getMeusEncaminhamentos = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const lista = await this.listEncsApp(a.cpfDigits, a.cpfFormatado);
    res.json(lista);
  };

  /**
   * GET /encaminhamentos/ativo
   * MANDATO §5.2: retorna encaminhamento ativo (não terminal) OU `null` literal.
   */
  getEncaminhamentoAtivo = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const lista = await this.listEncsApp(a.cpfDigits, a.cpfFormatado);
    const STATUS_TERMINAIS = new Set(['CONCLUIDO', 'REJEITADO', 'CANCELADO']);
    const ativo = lista.find((e) => !STATUS_TERMINAIS.has(e.status)) ?? null;
    res.json(ativo);
  };

  /** GET /encaminhamentos/:id — 1 obj ou 404. */
  getEncaminhamentoById = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const id = paramString(req, 'id');
    const lista = await this.listEncsApp(a.cpfDigits, a.cpfFormatado);
    const item = lista.find((e) => e.id === id);
    if (!item) {
      throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    }
    res.json(item);
  };

  /** GET /encaminhamentos/:id/anexos — array shape app (tamanhoBytes + PDF/IMG/DOC). */
  getEncaminhamentoAnexos = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const id = paramString(req, 'id');
    const lista = await this.listEncsApp(a.cpfDigits, a.cpfFormatado);
    const item = lista.find((e) => e.id === id);
    if (!item) {
      throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    }
    res.json(item.anexos ?? []);
  };

  /** GET /encaminhamentos/:id/timeline — array ordenado em ASC, tipos do app. */
  getEncaminhamentoTimeline = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const id = paramString(req, 'id');
    const lista = await this.listEncsApp(a.cpfDigits, a.cpfFormatado);
    const item = lista.find((e) => e.id === id);
    if (!item) {
      throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    }
    res.json(item.timeline ?? []);
  };

  // ───────── notificações ─────────

  getNotificacoes = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const apenasNaoLidas = req.query['apenasNaoLidas'] === 'true';
    const lista = await this.d.notifs.exec(a.contaId, apenasNaoLidas);
    // MANDATO §6.1: shape app — em, lida bool, tone, deepLink
    res.json(lista.map(mapNotificacaoApp));
  };

  getNotificacoesCount = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const naoLidas = await this.d.notifs.countNaoLidas(a.contaId);
    // MANDATO §6.2: campo "count" obrigatório. Mantém "naoLidas" como compat retro.
    res.json({ count: naoLidas, naoLidas });
  };

  postMarcarLida = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    await this.d.notifs.marcarLida(a.contaId, paramString(req, 'id'));
    res.status(204).send();
  };

  postMarcarTodasLidas = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const r = await this.d.notifs.marcarTodasLidas(a.contaId);
    res.json(r);
  };

  // ───────── UBS ─────────

  getMinhaUbs = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const out = await this.d.obterMinhaUbs.exec(a.contaId);
    res.json(out);
  };

  // ───────── PUSH (genérico v0.16+) ─────────

  /**
   * POST /auth/paciente/registrar-dispositivo (CONTRATO_BACKEND.md §4.8)
   *
   * Shape do contrato: `{ fcmToken, plataforma }` — apesar do nome legado
   * "fcmToken", o backend trata como endpoint genérico (NTFY por default).
   *
   * Aceita também o shape v0.16+ `{ endpoint, provider, plataforma, appVersion }`
   * pra compat com clientes ntfy nativos.
   */
  postRegistrarDispositivo = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const body = (req.body ?? {}) as {
      fcmToken?: string;
      endpoint?: string;
      provider?: 'NTFY' | 'FCM' | 'WEB_PUSH';
      plataforma?: 'android' | 'ios';
      appVersion?: string;
    };
    // Normaliza shape do contrato (fcmToken) pro shape interno
    const plataforma = body.plataforma ?? 'android';
    const provider = body.provider ?? (body.fcmToken ? 'FCM' : 'NTFY');
    const endpoint = body.endpoint ?? body.fcmToken;

    const input: Parameters<typeof this.d.pushRegistrar.exec>[1] = {
      provider,
      plataforma,
      appVersion: body.appVersion ?? null,
    };
    if (endpoint !== undefined) input.endpoint = endpoint;

    const out = await this.d.pushRegistrar.exec(a.contaId, input, {
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
    res.status(201).json(out);
  };

  postPushToken = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const b = pushRegistrarSchema.parse(req.body);
    const ctx = { ip: req.ip ?? null, userAgent: req.header('user-agent') ?? null };
    const input: Parameters<typeof this.d.pushRegistrar.exec>[1] = {
      provider: b.provider,
      plataforma: b.plataforma,
      appVersion: b.appVersion ?? null,
    };
    if (b.endpoint !== undefined) input.endpoint = b.endpoint;
    const out = await this.d.pushRegistrar.exec(a.contaId, input, ctx);
    res.status(201).json(out);
  };

  deletePushToken = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const b = pushRevogarSchema.safeParse(req.body ?? {});
    const endpoint = b.success ? b.data.endpoint ?? null : null;
    const r = await this.d.pushRevogar.exec(a.contaId, endpoint, {
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
    res.json(r);
  };

  // ───────── FCM (legacy compat — chama o novo via adapter) ─────────

  postFcmToken = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const b = fcmRegistrarSchema.parse(req.body);
    await this.d.fcmRegistrar.exec(
      a.contaId,
      b.fcmToken,
      b.plataforma,
      b.appVersion ?? null,
    );
    res.status(204).send();
  };

  deleteFcmToken = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const b = fcmRevogarSchema.safeParse(req.body ?? {});
    const token = b.success ? b.data.fcmToken ?? null : null;
    await this.d.fcmRevogar.exec(a.contaId, token);
    res.status(204).send();
  };

  // ───────── dossiê ─────────

  getDossieResumo = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const ctx = {
      contaId: a.contaId,
      cpfDigits: a.cpfDigits,
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    };
    res.json(await this.d.dossieResumo.exec(ctx));
  };
  getDossieAtendimentos = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const ctx = {
      contaId: a.contaId,
      cpfDigits: a.cpfDigits,
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    };
    const pag = _parsePaginacao(req);
    res.json(await this.d.dossieAtendimentos.exec(ctx, pag));
  };
  getDossieVacinacoes = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const ctx = {
      contaId: a.contaId,
      cpfDigits: a.cpfDigits,
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    };
    const pag = _parsePaginacao(req);
    res.json(await this.d.dossieVacinacoes.exec(ctx, pag));
  };
  getDossieExames = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const ctx = {
      contaId: a.contaId,
      cpfDigits: a.cpfDigits,
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    };
    const pag = _parsePaginacao(req);
    res.json(await this.d.dossieExames.exec(ctx, pag));
  };

  // ───────── dossiê (detalhe — v0.18.2+) ─────────

  getDossieAtendimento = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const ctx = {
      contaId: a.contaId,
      cpfDigits: a.cpfDigits,
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    };
    res.json(await this.d.dossieObterAtendimento.exec(paramString(req, 'id'), ctx));
  };

  getDossieVacinacao = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const ctx = {
      contaId: a.contaId,
      cpfDigits: a.cpfDigits,
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    };
    res.json(await this.d.dossieObterVacinacao.exec(paramString(req, 'id'), ctx));
  };

  getDossieExame = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const ctx = {
      contaId: a.contaId,
      cpfDigits: a.cpfDigits,
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    };
    res.json(await this.d.dossieObterExame.exec(paramString(req, 'id'), ctx));
  };

  // ───────── banners ─────────

  getBanners = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    res.json(await this.d.listarBanners.exec(a.contaId));
  };

  getBanner = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    res.json(await this.d.obterBanner.exec(paramString(req, 'id'), a.contaId));
  };

  postBannerVisto = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    await this.d.marcarBannerVisto.exec(paramString(req, 'id'), a.contaId);
    res.status(204).send();
  };

  // ───────── TFD ─────────

  getTfdViagens = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    res.json(await this.d.listarTfdViagens.exec(a.contaId));
  };

  getTfdViagem = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    res.json(await this.d.obterTfdViagem.exec(a.contaId, paramString(req, 'viagemId')));
  };

  getTfdSolicitacoes = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    res.json(await this.d.listarMinhasSolicTfd.exec(a.contaId));
  };

  getTfdSolicitacao = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    res.json(await this.d.obterMinhaSolicTfd.exec(a.contaId, paramString(req, 'id')));
  };

  postTfdSolicitacao = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const b = criarTfdSolicSchema.parse(req.body);
    const out = await this.d.criarSolicTfd.exec(a.contaId, a.cpfDigits, a.cpfFormatado, b);
    res.status(201).json(out);
  };

  deleteTfdSolicitacao = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    await this.d.cancelarSolicTfd.exec(a.contaId, paramString(req, 'id'), {
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
    res.status(204).send();
  };

  // ───────── anexos ─────────

  /**
   * Download seguro de anexo médico — LGPD-compliant.
   *
   * Headers de segurança:
   *   - `Content-Type` do anexo
   *   - `Content-Disposition: attachment; filename="..."; filename*=UTF-8''...` (RFC 5987/6266)
   *   - `Content-Length` (cliente sabe progresso)
   *   - `Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0`
   *   - `Pragma: no-cache` + `Expires: 0` (proxies legados)
   *   - `X-Content-Type-Options: nosniff` (anti MIME sniffing)
   *   - `X-Robots-Tag: noindex, nofollow` (anti indexação acidental)
   *   - `ETag` = sha256 (cache-validation se disponível)
   *
   * Stream errors são tratados pra não deixar conexão num estado ruim.
   * Cliente pode usar o `Content-Length` pra mostrar progress bar.
   */
  getDownloadAnexo = async (req: Request, res: Response): Promise<void> => {
    const a = req.pacienteAuth!;
    const anexoId = paramString(req, 'id');

    const desc = await this.d.downloadAnexo.exec(anexoId, {
      cpfDigits: a.cpfDigits,
      contaId: a.contaId,
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });

    // Headers seguros — defesa em profundidade + LGPD
    res.set({
      'Content-Type': desc.mimeType,
      'Content-Length': String(desc.size),
      'Content-Disposition': buildContentDisposition(desc.filename, 'attachment'),
      'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    if (desc.sha256) {
      // ETag forte com sha256 do conteúdo (consistente entre downloads).
      res.set('ETag', `"sha256-${desc.sha256}"`);
    }

    // Stream com error handling completo.
    const stream = fs.createReadStream(desc.absolutePath);
    let errored = false;

    stream.on('error', (err) => {
      errored = true;
      logger.error({ err, anexoId, contaId: a.contaId }, '[download] stream error');
      if (!res.headersSent) {
        // Ainda podemos responder com erro JSON.
        res.status(500).json({
          error: {
            code: 'FALHA_LEITURA_ARQUIVO',
            message: 'Falha ao ler arquivo. Tente novamente.',
          },
        });
      } else {
        // Headers já foram. Só fecha brusco — cliente detecta conexão interrompida.
        res.destroy(err);
      }
    });

    // Cliente desconectou no meio do download → cleanup do stream.
    req.on('aborted', () => {
      logger.debug({ anexoId, contaId: a.contaId }, '[download] cliente abortou');
      stream.destroy();
    });

    res.on('close', () => {
      if (!errored && !res.writableFinished) {
        // Resposta fechou antes de terminar (cliente desconectou).
        stream.destroy();
      }
    });

    stream.pipe(res);
  };
}

/** Extrai `cursor` + `limit` da query string com defaults seguros. */
function _parsePaginacao(req: Request): { cursor?: string; limit?: number } {
  const out: { cursor?: string; limit?: number } = {};
  const cursorRaw = req.query['cursor'];
  if (typeof cursorRaw === 'string' && cursorRaw.length > 0 && cursorRaw.length <= 64) {
    out.cursor = cursorRaw;
  }
  const limitRaw = req.query['limit'];
  if (typeof limitRaw === 'string') {
    const n = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(n) && n > 0) out.limit = n;
  }
  return out;
}
