import type { Request, Response } from 'express';
import type { LoginUseCase } from '../../application/auth/LoginUseCase';
import type { LogoutUseCase } from '../../application/auth/LogoutUseCase';
import type { ForgotPasswordUseCase } from '../../application/auth/ForgotPasswordUseCase';
import type { VerifyCodeUseCase } from '../../application/auth/VerifyCodeUseCase';
import type { ResetPasswordUseCase } from '../../application/auth/ResetPasswordUseCase';
import type { MeUseCase } from '../../application/auth/MeUseCase';

export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly logout: LogoutUseCase,
    private readonly forgot: ForgotPasswordUseCase,
    private readonly verify: VerifyCodeUseCase,
    private readonly reset: ResetPasswordUseCase,
    private readonly me: MeUseCase,
  ) {}

  postLogin = async (req: Request, res: Response): Promise<void> => {
    const loginValue = (req.body.login ?? req.body.matricula ?? req.body.email ?? '').toString();
    const out = await this.login.exec({
      login: loginValue,
      senha: req.body.senha,
      lembrar: req.body.lembrar,
      ip: req.ip ?? '',
      userAgent: req.header('user-agent') ?? '',
    });
    res.status(200).json(out);
  };

  postLogout = async (req: Request, res: Response): Promise<void> => {
    const refreshFromBody = (req.body?.refreshToken as string | undefined) ?? null;
    await this.logout.exec(refreshFromBody, req.auth?.sid ?? null);
    res.status(204).send();
  };

  postForgot = async (req: Request, res: Response): Promise<void> => {
    const out = await this.forgot.exec(req.body.login);
    res.status(200).json(out);
  };

  postVerify = async (req: Request, res: Response): Promise<void> => {
    const out = await this.verify.exec(req.body.login, req.body.codigo);
    res.status(200).json(out);
  };

  postReset = async (req: Request, res: Response): Promise<void> => {
    const out = await this.reset.exec(req.body.resetToken, req.body.novaSenha);
    res.status(200).json(out);
  };

  getMe = async (req: Request, res: Response): Promise<void> => {
    const out = await this.me.exec(req.auth!.sub);
    res.status(200).json(out);
  };
}
