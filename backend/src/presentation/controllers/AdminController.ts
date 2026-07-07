import type { Request, Response } from 'express';
import type { CreatePrefeituraUseCase } from '../../application/admin/CreatePrefeituraUseCase';
import type { ListPrefeiturasUseCase } from '../../application/admin/ListPrefeiturasUseCase';
import type { CreateUbsUseCase } from '../../application/admin/CreateUbsUseCase';
import type { ListUbsUseCase } from '../../application/admin/ListUbsUseCase';
import type { CreateUsuarioUseCase } from '../../application/admin/CreateUsuarioUseCase';
import type { ListUsuariosUseCase } from '../../application/admin/ListUsuariosUseCase';
import type { UpdateUsuarioUseCase } from '../../application/admin/UpdateUsuarioUseCase';
import type { DeleteUsuarioUseCase } from '../../application/admin/DeleteUsuarioUseCase';
import type { AlterarAtivoUsuarioUseCase } from '../../application/admin/AlterarAtivoUsuarioUseCase';
import type { ResetarSenhaUsuarioUseCase } from '../../application/admin/ResetarSenhaUsuarioUseCase';
import type { UpdatePrefeituraUseCase } from '../../application/admin/UpdatePrefeituraUseCase';
import type { DeletePrefeituraUseCase } from '../../application/admin/DeletePrefeituraUseCase';
import type { UpdateUbsUseCase } from '../../application/admin/UpdateUbsUseCase';
import type { DeleteUbsUseCase } from '../../application/admin/DeleteUbsUseCase';
import type { GetIntegracoesUseCase } from '../../application/admin/GetIntegracoesUseCase';
import { scopeFromRequest } from '../../shared/requestScope';
import { paramString } from '../../shared/http';
import { getAdminConfiguracoes } from '../../shared/adminConfig';
import {
  alterarAtivoSchema,
  atualizarPrefeituraSchema,
  atualizarUbsSchema,
  atualizarUsuarioSchema,
  criarPrefeituraSchema,
  criarUbsSchema,
  criarUsuarioSchema,
  listarUbsQuerySchema,
  listarUsuariosQuerySchema,
  resetarSenhaSchema,
} from '../schemas/adminSchemas';

export class AdminController {
  constructor(
    private readonly createPrefeitura: CreatePrefeituraUseCase,
    private readonly listPrefeituras: ListPrefeiturasUseCase,
    private readonly createUbs: CreateUbsUseCase,
    private readonly listUbsUC: ListUbsUseCase,
    private readonly createUsuario: CreateUsuarioUseCase,
    private readonly listUsuarios: ListUsuariosUseCase,
    private readonly updateUsuarioUC: UpdateUsuarioUseCase,
    private readonly deleteUsuarioUC: DeleteUsuarioUseCase,
    private readonly alterarAtivoUC: AlterarAtivoUsuarioUseCase,
    private readonly resetarSenhaUC: ResetarSenhaUsuarioUseCase,
    private readonly updatePrefeituraUC: UpdatePrefeituraUseCase,
    private readonly deletePrefeituraUC: DeletePrefeituraUseCase,
    private readonly updateUbsUC: UpdateUbsUseCase,
    private readonly deleteUbsUC: DeleteUbsUseCase,
    private readonly getIntegracoesUC: GetIntegracoesUseCase,
  ) {}

  // ---- Prefeituras ----
  postPrefeitura = async (req: Request, res: Response): Promise<void> => {
    const body = criarPrefeituraSchema.parse(req.body);
    const p = await this.createPrefeitura.exec(body);
    res.status(201).json(p);
  };

  getPrefeituras = async (req: Request, res: Response): Promise<void> => {
    const lista = await this.listPrefeituras.exec(scopeFromRequest(req));
    res.json(lista);
  };

  // ---- UBSs ----
  postUbs = async (req: Request, res: Response): Promise<void> => {
    const body = criarUbsSchema.parse(req.body);
    const ubs = await this.createUbs.exec(scopeFromRequest(req), body, {
      atendenteId: req.auth!.sub,
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
    res.status(201).json(ubs);
  };

  getUbs = async (req: Request, res: Response): Promise<void> => {
    const q = listarUbsQuerySchema.parse(req.query);
    const lista = await this.listUbsUC.exec(scopeFromRequest(req), q.prefeituraId);
    res.json(lista);
  };

  getConfiguracoes = async (_req: Request, res: Response): Promise<void> => {
    res.json(getAdminConfiguracoes());
  };

  getIntegracoes = async (_req: Request, res: Response): Promise<void> => {
    const out = await this.getIntegracoesUC.exec();
    res.json(out);
  };

  // ---- Usuários ----
  postUsuario = async (req: Request, res: Response): Promise<void> => {
    const body = criarUsuarioSchema.parse(req.body);
    const u = await this.createUsuario.exec(scopeFromRequest(req), req.auth!.sub, body);
    res.status(201).json(u);
  };

  getUsuarios = async (req: Request, res: Response): Promise<void> => {
    const q = listarUsuariosQuerySchema.parse(req.query);
    const filtro = {
      scope: scopeFromRequest(req),
      ...(q.q ? { q: q.q } : {}),
      ...(q.role ? { role: q.role } : {}),
      ...(q.ubsId ? { ubsId: q.ubsId } : {}),
      ...(q.prefeituraId ? { prefeituraId: q.prefeituraId } : {}),
      ...(typeof q.ativo === 'boolean' ? { ativo: q.ativo } : {}),
    };
    const lista = await this.listUsuarios.exec(filtro);
    res.json(lista);
  };

  patchUsuario = async (req: Request, res: Response): Promise<void> => {
    const body = atualizarUsuarioSchema.parse(req.body);
    const alvoId = paramString(req, 'id');
    const out = await this.updateUsuarioUC.exec(
      scopeFromRequest(req),
      req.auth!.sub,
      alvoId,
      body,
    );
    res.json(out);
  };

  deleteUsuario = async (req: Request, res: Response): Promise<void> => {
    const alvoId = paramString(req, 'id');
    await this.deleteUsuarioUC.exec(scopeFromRequest(req), req.auth!.sub, alvoId);
    res.status(204).send();
  };

  postAtivarUsuario = async (req: Request, res: Response): Promise<void> => {
    const body = alterarAtivoSchema.parse(req.body);
    const alvoId = paramString(req, 'id');
    const out = await this.alterarAtivoUC.exec(
      scopeFromRequest(req),
      req.auth!.sub,
      alvoId,
      body.ativo,
    );
    res.json(out);
  };

  postResetSenhaUsuario = async (req: Request, res: Response): Promise<void> => {
    const body = resetarSenhaSchema.parse(req.body);
    const alvoId = paramString(req, 'id');
    await this.resetarSenhaUC.exec(
      scopeFromRequest(req),
      req.auth!.sub,
      alvoId,
      body.novaSenha,
    );
    res.status(204).send();
  };

  // ---- Prefeituras: editar / excluir ----
  patchPrefeitura = async (req: Request, res: Response): Promise<void> => {
    const body = atualizarPrefeituraSchema.parse(req.body);
    const id = paramString(req, 'id');
    const out = await this.updatePrefeituraUC.exec(
      scopeFromRequest(req),
      req.auth!.sub,
      id,
      body,
    );
    res.json(out);
  };

  deletePrefeitura = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    await this.deletePrefeituraUC.exec(scopeFromRequest(req), req.auth!.sub, id);
    res.status(204).send();
  };

  // ---- UBSs: editar / excluir ----
  patchUbs = async (req: Request, res: Response): Promise<void> => {
    const body = atualizarUbsSchema.parse(req.body);
    const id = paramString(req, 'id');
    const out = await this.updateUbsUC.exec(
      scopeFromRequest(req),
      req.auth!.sub,
      id,
      body,
      { ip: req.ip ?? null, userAgent: req.header('user-agent') ?? null },
    );
    res.json(out);
  };

  deleteUbs = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    await this.deleteUbsUC.exec(scopeFromRequest(req), req.auth!.sub, id);
    res.status(204).send();
  };
}
