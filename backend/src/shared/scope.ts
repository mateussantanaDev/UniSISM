/**
 * AccessScope determina QUE DADOS o usuário autenticado pode ver.
 *
 *   GLOBAL      → DESENVOLVEDOR (acesso a tudo)
 *   PREFEITURA  → ADMIN, REGULADOR_SMS (escopo: todos UBS daquela prefeitura)
 *   UBS         → COORDENADOR_UBS, ATENDENTE_UBS (escopo: apenas a UBS)
 */
import type { RoleAtendente } from '../../generated/prisma';
import { Forbidden, NotFound } from './errors';

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

const DEFAULT_PREFEITURA_ID = process.env.DEFAULT_PREFEITURA_ID || 'b2ca1b67-3b6b-4a52-adbe-01df1d64cae6';

export function buildScope(ctx: AuthContext): AccessScope {
  const fallbackPrefId = ctx.prefeituraId || DEFAULT_PREFEITURA_ID;

  switch (ctx.role) {
    case 'DESENVOLVEDOR':
      return { kind: 'GLOBAL' };
    case 'ADMIN':
    case 'REGULADOR_SMS':
    case 'GESTOR_TFD':
    case 'ATENDENTE_TFD':
    case 'MOTORISTA_TFD':
    case 'REGULADOR_TFD':
    case 'MEDICO':
    case 'MEDICO_ESPECIALISTA':
    case 'ATENDENTE_CENTRO':
      return { kind: 'PREFEITURA', prefeituraId: fallbackPrefId };
    case 'COORDENADOR_UBS':
    case 'ATENDENTE_UBS':
      if (!ctx.ubsId) {
        return { kind: 'PREFEITURA', prefeituraId: fallbackPrefId };
      }
      return { kind: 'UBS', ubsId: ctx.ubsId, prefeituraId: fallbackPrefId };
  }
}

/**
 * Garante que o atendente pode acessar/escrever em uma UBS específica.
 * Use em endpoints que recebem ubsId no payload (ex.: criar atendente).
 * Retorna 404 NotFound para evitar enumeração de recursos fora do tenant.
 */
export function ensureUbsAcessivel(scope: AccessScope, ubs: { id: string; prefeituraId: string }) {
  if (scope.kind === 'GLOBAL') return;
  if (scope.kind === 'PREFEITURA' && scope.prefeituraId === ubs.prefeituraId) return;
  if (scope.kind === 'UBS' && scope.ubsId === ubs.id) return;
  throw NotFound('UBS_NAO_ENCONTRADA', 'UBS não encontrada');
}

/**
 * Garante que o atendente pode acessar/escrever em uma prefeitura específica.
 * Retorna 404 NotFound para evitar enumeração de recursos fora do tenant.
 */
export function ensurePrefeituraAcessivel(scope: AccessScope, prefeituraId: string) {
  if (scope.kind === 'GLOBAL') return;
  if (scope.kind === 'PREFEITURA' && (scope.prefeituraId === prefeituraId || !scope.prefeituraId)) return;
  if (scope.kind === 'UBS' && (scope.prefeituraId === prefeituraId || !scope.prefeituraId)) return;
  throw NotFound('PREFEITURA_NAO_ENCONTRADA', 'Prefeitura não encontrada');
}
