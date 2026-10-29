import type { Request } from 'express';
import { Forbidden } from './errors';
import { buildScope, type AccessScope } from './scope';
import type { RoleAtendente } from '../../generated/prisma';

export function scopeFromRequest(req: Request): AccessScope {
  const auth = req.auth;
  if (!auth) throw Forbidden('NAO_AUTENTICADO', 'Não autenticado');
  return buildScope({
    atendenteId: auth.sub,
    role: auth.role as RoleAtendente,
    ubsId: auth.ubsId ?? null,
    prefeituraId: auth.prefeituraId ?? null,
    tipoUnidade: auth.tipoUnidade ?? null,
    cargo: (auth as any).cargo ?? null,
    funcao: (auth as any).funcao ?? null,
    unidadeNome: (auth as any).unidadeNome ?? null,
  });
}
