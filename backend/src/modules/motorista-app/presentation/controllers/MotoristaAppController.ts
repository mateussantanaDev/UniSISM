/**
 * Controller HTTP do app do motorista (Face 4 · mobile).
 * Spec completa: backend/docs/MOTORISTA_APP_API.md
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { paramString } from '../../../../shared/http';
import type { LoginMotoristaUseCase } from '../../application/use-cases/LoginMotoristaUseCase';
import type { TrocarSenhaMotoristaUseCase } from '../../application/use-cases/TrocarSenhaMotoristaUseCase';
import type { LogoutMotoristaUseCase } from '../../application/use-cases/LogoutMotoristaUseCase';
import type { MeMotoristaUseCase } from '../../application/use-cases/MeMotoristaUseCase';
import type { ListarMinhasViagensUseCase } from '../../application/use-cases/ListarMinhasViagensUseCase';
import type { ObterViagemMotoristaUseCase } from '../../application/use-cases/ObterViagemMotoristaUseCase';
import type { IniciarViagemMotoristaUseCase } from '../../application/use-cases/IniciarViagemMotoristaUseCase';
import type { ConcluirViagemMotoristaUseCase } from '../../application/use-cases/ConcluirViagemMotoristaUseCase';
import type { MarcarPresencaMotoristaUseCase } from '../../application/use-cases/MarcarPresencaMotoristaUseCase';
import type { ListarMinhasAjudasUseCase } from '../../application/use-cases/ListarMinhasAjudasUseCase';
import type {
  RegistrarFcmTokenUseCase,
  RevogarFcmTokenUseCase,
} from '../../application/use-cases/FcmTokenUseCases';

// ─── Schemas Zod ───
const loginSchema = z.object({
  matricula: z.string().min(3),
  senha: z.string().min(1),
});

const trocarSenhaSchema = z.object({
  senhaAtual: z.string().min(1),
  novaSenha: z.string().min(8),
});

const iniciarSchema = z.object({
  kmInicialHodometro: z.number().int().nonnegative(),
});

const concluirSchema = z.object({
  kmFinalHodometro: z.number().int().positive(),
});

const presencaSchema = z.object({
  presenca: z.enum(['AGUARDANDO', 'CONFIRMADO', 'EMBARCADO', 'AUSENTE', 'DESISTIU']),
  observacao: z.string().nullable().optional(),
});

const fcmSchema = z.object({
  fcmToken: z.string().min(20),
});

export class MotoristaAppController {
  constructor(
    private readonly loginUC: LoginMotoristaUseCase,
    private readonly trocarSenhaUC: TrocarSenhaMotoristaUseCase,
    private readonly logoutUC: LogoutMotoristaUseCase,
    private readonly meUC: MeMotoristaUseCase,
    private readonly listViagensUC: ListarMinhasViagensUseCase,
    private readonly obterViagemUC: ObterViagemMotoristaUseCase,
    private readonly iniciarUC: IniciarViagemMotoristaUseCase,
    private readonly concluirUC: ConcluirViagemMotoristaUseCase,
    private readonly presencaUC: MarcarPresencaMotoristaUseCase,
    private readonly listAjudasUC: ListarMinhasAjudasUseCase,
    private readonly fcmRegUC: RegistrarFcmTokenUseCase,
    private readonly fcmRevUC: RevogarFcmTokenUseCase,
  ) {}

  // ────────── auth ──────────

  postLogin = async (req: Request, res: Response): Promise<void> => {
    const b = loginSchema.parse(req.body);
    const out = await this.loginUC.exec(b.matricula, b.senha, req);
    res.json(out);
  };

  postTrocarSenha = async (req: Request, res: Response): Promise<void> => {
    const b = trocarSenhaSchema.parse(req.body);
    await this.trocarSenhaUC.exec(req.motoristaAuth!, b.senhaAtual, b.novaSenha, req);
    res.status(204).send();
  };

  postLogout = async (req: Request, res: Response): Promise<void> => {
    await this.logoutUC.exec(req.motoristaAuth!, req);
    res.status(204).send();
  };

  getMe = async (req: Request, res: Response): Promise<void> => {
    const out = await this.meUC.exec(req.motoristaAuth!);
    res.json(out);
  };

  // ────────── viagens ──────────

  getMinhasViagens = async (req: Request, res: Response): Promise<void> => {
    const desde = typeof req.query['desde'] === 'string' ? req.query['desde'] : undefined;
    const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
    const limitRaw = typeof req.query['limit'] === 'string' ? Number(req.query['limit']) : undefined;
    const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;
    const out = await this.listViagensUC.exec(req.motoristaAuth!, { desde, status, limit });
    res.json(out);
  };

  getViagem = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const out = await this.obterViagemUC.exec(req.motoristaAuth!, id);
    res.json(out);
  };

  postIniciar = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const b = iniciarSchema.parse(req.body);
    const out = await this.iniciarUC.exec(req.motoristaAuth!, req, id, b.kmInicialHodometro);
    res.json(out);
  };

  postConcluir = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const b = concluirSchema.parse(req.body);
    const out = await this.concluirUC.exec(req.motoristaAuth!, req, id, b.kmFinalHodometro);
    res.json(out);
  };

  postPresenca = async (req: Request, res: Response): Promise<void> => {
    const viagemId = paramString(req, 'id');
    const passageiroId = paramString(req, 'pid');
    const b = presencaSchema.parse(req.body);
    const out = await this.presencaUC.exec(
      req.motoristaAuth!,
      req,
      viagemId,
      passageiroId,
      b.presenca,
      b.observacao ?? null,
    );
    res.json(out);
  };

  // ────────── ajudas de custo ──────────

  getAjudas = async (req: Request, res: Response): Promise<void> => {
    const out = await this.listAjudasUC.exec(req.motoristaAuth!);
    res.json(out);
  };

  // ────────── FCM ──────────

  postFcmToken = async (req: Request, res: Response): Promise<void> => {
    const b = fcmSchema.parse(req.body);
    await this.fcmRegUC.exec(req.motoristaAuth!, b.fcmToken, req);
    res.status(204).send();
  };

  deleteFcmToken = async (req: Request, res: Response): Promise<void> => {
    await this.fcmRevUC.exec(req.motoristaAuth!, req);
    res.status(204).send();
  };
}
