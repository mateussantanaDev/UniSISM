/**
 * Helpers compartilhados pelos use cases do módulo TFD.
 *
 * - `assertGestorTfd`: garante que o usuário tem prefeituraId resolvido (DEV
 *   pode passar ?prefeituraId, demais herdam do JWT).
 * - `resolverOperador`: snapshot do operador pra audit log.
 * - `proximoProtocolo`: gera TFD-AAAA-NNNNNN, ABT-AAAA-NNNNNN, AJC-AAAA-NNNNNN.
 */
import type { Request } from 'express';
import { Forbidden, NotFound } from '../../../shared/errors';
import { prisma } from '../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../shared/scope';
import type { IAtendenteRepository } from '../../../domain/repositories/IAtendenteRepository';

export interface OperadorTfd {
  id: string;
  nome: string;
  matricula: string;
  role: string;
  prefeituraId: string;
}

/**
 * Resolve a `prefeituraId` efetiva do usuário pra escopo TFD:
 *   - DEV (GLOBAL): exige `?prefeituraId=` na request OU body.prefeituraId
 *   - ADMIN/REGULADOR_SMS/GESTOR_TFD (PREFEITURA): usa scope.prefeituraId
 *   - UBS (COORDENADOR/ATENDENTE): usa a prefeitura da UBS via JWT
 *
 * Retorna 403 USUARIO_SEM_PREFEITURA se não conseguir resolver.
 */
export function resolverPrefeituraIdEfetiva(
  scope: AccessScope,
  req: Request,
): string {
  if (scope.kind === 'PREFEITURA') return scope.prefeituraId;
  if (scope.kind === 'UBS' && scope.prefeituraId) return scope.prefeituraId;
  // GLOBAL ou UBS sem prefeituraId → DEV precisa especificar
  const fromQuery = typeof req.query['prefeituraId'] === 'string'
    ? (req.query['prefeituraId'] as string)
    : null;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fromBody = typeof body['prefeituraId'] === 'string' ? (body['prefeituraId'] as string) : null;
  const id = fromQuery ?? fromBody;
  if (!id) {
    throw Forbidden(
      'PREFEITURA_REQUERIDA',
      'DEV deve informar prefeituraId via query (?prefeituraId=) ou no payload',
    );
  }
  return id;
}

/**
 * Garante isolation: recurso de outra prefeitura → 404 (não 403, pra não vazar
 * existência). DEV (GLOBAL) tem acesso a tudo.
 */
export function assertMesmaPrefeitura(
  scope: AccessScope,
  prefeituraIdRecurso: string,
): void {
  if (scope.kind === 'GLOBAL') return;
  if (scope.kind === 'PREFEITURA' && scope.prefeituraId === prefeituraIdRecurso) return;
  if (scope.kind === 'UBS' && scope.prefeituraId === prefeituraIdRecurso) return;
  throw NotFound('RECURSO_NAO_ENCONTRADO', 'Recurso não encontrado');
}

export async function resolverOperador(
  atendentes: IAtendenteRepository,
  atendenteId: string,
  prefeituraId: string,
): Promise<OperadorTfd> {
  const a = await atendentes.buscarPorId(atendenteId);
  if (!a) throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');
  return {
    id: a.id,
    nome: a.nome,
    matricula: a.matricula,
    role: a.role,
    prefeituraId,
  };
}

/** Gera próximo protocolo com prefixo + ano + sequencial 6 dígitos. */
export async function proximoProtocoloTfd(
  prefixo: 'TFD' | 'ABT' | 'AJC' | 'VTFD',
): Promise<string> {
  const ano = new Date().getUTCFullYear();
  const chave = `${prefixo}-${ano}`;
  const seq = await prisma.sequencialProtocolo.upsert({
    where: { chave },
    create: { chave, valor: 1 },
    update: { valor: { increment: 1 } },
  });
  return `${prefixo}-${ano}-${String(seq.valor).padStart(6, '0')}`;
}

export function ctxAudit(req: Request): { ip: string; userAgent: string } {
  return {
    ip: req.ip ?? '0.0.0.0',
    userAgent: req.header('user-agent') ?? 'unknown',
  };
}

export function mesAtualYmd(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Resolve `veiculoId` a partir de placa (UX BlaBlaCar — frontend digita placa).
 * Aceita formatado ou só dígitos/letras. Apenas veículos NÃO deletados da prefeitura.
 *
 * Retorna o ID. Se não encontrar → 404.
 */
export async function resolverVeiculoPorPlaca(
  placa: string,
  prefeituraId: string,
): Promise<string> {
  const placaNorm = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (placaNorm.length < 7) {
    throw NotFound('VEICULO_NAO_ENCONTRADO', `Placa "${placa}" inválida (mínimo 7 caracteres)`);
  }
  const v = await prisma.veiculoTFD.findFirst({
    where: {
      prefeituraId,
      deletadoEm: null,
      placa: placaNorm,
    },
    select: { id: true },
  });
  if (!v) {
    throw NotFound('VEICULO_NAO_ENCONTRADO', `Veículo com placa ${placaNorm} não encontrado`);
  }
  return v.id;
}
