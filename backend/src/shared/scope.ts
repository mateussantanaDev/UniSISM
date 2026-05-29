/**
 * AccessScope determina QUE DADOS o usuário autenticado pode ver.
 *
 *   GLOBAL      → DESENVOLVEDOR (acesso a tudo)
 *   PREFEITURA  → ADMIN, REGULADOR_SMS (escopo: todos UBS daquela prefeitura)
 *   UBS         → COORDENADOR_UBS, ATENDENTE_UBS (escopo: apenas a UBS)
 */
import type { RoleAtendente } from '../../generated/prisma';
import { Forbidden } from './errors';

export type AccessScope =
  | { kind: 'GLOBAL' }
  | { kind: 'PREFEITURA'; prefeituraId: string }
  | { kind: 'UBS'; ubsId: string; prefeituraId?: string };

export interface AuthContext {
  atendenteId: string;
  role: RoleAtendente;
  ubsId?: string | null;
  prefeituraId?: string | null;
}

export function buildScope(ctx: AuthContext): AccessScope {
  switch (ctx.role) {
    case 'DESENVOLVEDOR':
      return { kind: 'GLOBAL' };
    case 'ADMIN':
    case 'REGULADOR_SMS':
    case 'GESTOR_TFD':
    case 'ATENDENTE_TFD':
    case 'MOTORISTA_TFD':
      if (!ctx.prefeituraId) {
        throw Forbidden('USUARIO_SEM_PREFEITURA', 'Usuário sem prefeitura vinculada');
      }
      return { kind: 'PREFEITURA', prefeituraId: ctx.prefeituraId };
    case 'COORDENADOR_UBS':
    case 'ATENDENTE_UBS':
      if (!ctx.ubsId) {
        throw Forbidden('USUARIO_SEM_UBS', 'Usuário sem UBS vinculada');
      }
      return ctx.prefeituraId
        ? { kind: 'UBS', ubsId: ctx.ubsId, prefeituraId: ctx.prefeituraId }
        : { kind: 'UBS', ubsId: ctx.ubsId };
  }
}

/**
 * Garante que o atendente pode acessar/escrever em uma UBS específica.
 * Use em endpoints que recebem ubsId no payload (ex.: criar atendente).
 */
export function ensureUbsAcessivel(scope: AccessScope, ubs: { id: string; prefeituraId: string }) {
  if (scope.kind === 'GLOBAL') return;
  if (scope.kind === 'PREFEITURA' && scope.prefeituraId === ubs.prefeituraId) return;
  if (scope.kind === 'UBS' && scope.ubsId === ubs.id) return;
  throw Forbidden('FORA_DO_ESCOPO', 'Recurso fora do escopo do usuário');
}

/**
 * Garante que o atendente pode acessar/escrever em uma prefeitura específica.
 */
export function ensurePrefeituraAcessivel(scope: AccessScope, prefeituraId: string) {
  if (scope.kind === 'GLOBAL') return;
  if (scope.kind === 'PREFEITURA' && scope.prefeituraId === prefeituraId) return;
  if (scope.kind === 'UBS' && scope.prefeituraId === prefeituraId) return;
  throw Forbidden('FORA_DO_ESCOPO', 'Recurso fora do escopo do usuário');
}
