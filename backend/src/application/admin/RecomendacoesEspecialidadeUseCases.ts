/**
 * CRUD de recomendações por especialidade ("o que levar no dia").
 * Consumido pelo app paciente no detalhe do encaminhamento.
 *
 * RBAC: só DEV / ADMIN / REGULADOR_SMS via Face 2.
 * Não tem filtro de escopo — recomendações são globais (compartilhadas entre
 * prefeituras). Se evoluir pra `prefeituraId` no futuro, ajustar aqui.
 *
 * **Auditoria**: CREATE/UPDATE/DELETE gravam em `auditoria_logs` (PrismaAuditLogger).
 * Mutação no conteúdo afeta UX de paciente → precisa rastreabilidade administrativa.
 */
import { prisma } from '../../infrastructure/database/prisma';
import { Conflict, NotFound, Unprocessable } from '../../shared/errors';
import { Prisma } from '../../../generated/prisma';
import type { IAuditLogger } from '../../infrastructure/audit/PrismaAuditLogger';

/** Detecta erro UNIQUE violation do Prisma (P2002). */
function _isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

export interface AuditContext {
  atendenteId: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface RecomendacaoDto {
  id: string;
  especialidade: string;
  recomendacoes: string[];
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

function _toDto(r: {
  id: string;
  especialidade: string;
  recomendacoes: Prisma.JsonValue;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}): RecomendacaoDto {
  return {
    id: r.id,
    especialidade: r.especialidade,
    recomendacoes: Array.isArray(r.recomendacoes) ? (r.recomendacoes as string[]) : [],
    ativo: r.ativo,
    criadoEm: r.criadoEm.toISOString(),
    atualizadoEm: r.atualizadoEm.toISOString(),
  };
}

function _validar(recs: unknown): string[] {
  if (!Array.isArray(recs)) {
    throw Unprocessable('VALIDATION_ERROR', 'recomendacoes deve ser um array de strings');
  }
  const out: string[] = [];
  for (const item of recs) {
    if (typeof item !== 'string') {
      throw Unprocessable('VALIDATION_ERROR', 'Cada recomendação deve ser uma string');
    }
    const trimmed = item.trim();
    if (trimmed.length === 0) continue; // ignora linhas vazias
    if (trimmed.length > 200) {
      throw Unprocessable(
        'VALIDATION_ERROR',
        'Recomendação muito longa (máx 200 chars). Use frases curtas.',
      );
    }
    out.push(trimmed);
  }
  if (out.length === 0) {
    throw Unprocessable('VALIDATION_ERROR', 'Adicione ao menos uma recomendação');
  }
  if (out.length > 10) {
    throw Unprocessable(
      'VALIDATION_ERROR',
      'Limite de 10 recomendações por especialidade (atual: ' + out.length + ')',
    );
  }
  return out;
}

export class ListarRecomendacoesUseCase {
  async exec(filtros: { somenteAtivos?: boolean } = {}): Promise<RecomendacaoDto[]> {
    const rows = await prisma.especialidadeRecomendacao.findMany({
      where: filtros.somenteAtivos ? { ativo: true } : {},
      orderBy: { especialidade: 'asc' },
    });
    return rows.map(_toDto);
  }
}

export class ObterRecomendacaoUseCase {
  async exec(id: string): Promise<RecomendacaoDto> {
    const row = await prisma.especialidadeRecomendacao.findUnique({ where: { id } });
    if (!row) throw NotFound('RECOMENDACAO_NAO_ENCONTRADA', 'Recomendação não encontrada');
    return _toDto(row);
  }
}

export interface CriarRecomendacaoInput {
  especialidade: string;
  recomendacoes: string[];
}

export class CriarRecomendacaoUseCase {
  constructor(private readonly audit: IAuditLogger) {}

  async exec(input: CriarRecomendacaoInput, ctx: AuditContext): Promise<RecomendacaoDto> {
    const esp = input.especialidade.trim();
    if (esp.length < 3 || esp.length > 80) {
      throw Unprocessable(
        'VALIDATION_ERROR',
        'Especialidade deve ter entre 3 e 80 caracteres',
      );
    }
    const recs = _validar(input.recomendacoes);
    // Dedup por especialidade (case-sensitive — campo é UNIQUE).
    // Pre-check pra UX (mensagem amigável), mas o `create` é protegido por
    // catch de `P2002` (race: 2 admins criando "Cardiologia" simultâneos).
    const existente = await prisma.especialidadeRecomendacao.findUnique({
      where: { especialidade: esp },
    });
    if (existente) {
      throw Conflict(
        'ESPECIALIDADE_DUPLICADA',
        `Já existe recomendação para "${esp}". Use o PATCH para editar.`,
      );
    }
    let novo;
    try {
      novo = await prisma.especialidadeRecomendacao.create({
        data: {
          especialidade: esp,
          recomendacoes: recs,
          criadoPorId: ctx.atendenteId,
        },
      });
    } catch (err) {
      if (_isUniqueViolation(err)) {
        // Race: outro admin criou a mesma especialidade entre o findUnique e o create.
        throw Conflict(
          'ESPECIALIDADE_DUPLICADA',
          `Já existe recomendação para "${esp}". Use o PATCH para editar.`,
        );
      }
      throw err;
    }
    await this.audit.registrar({
      acao: 'CRIAR_RECOMENDACAO_ESPECIALIDADE',
      recurso: 'EspecialidadeRecomendacao',
      recursoId: novo.id,
      atendenteId: ctx.atendenteId,
      payload: {
        especialidade: esp,
        qtdRecomendacoes: recs.length,
        recomendacoes: recs,
      },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return _toDto(novo);
  }
}

export interface AtualizarRecomendacaoInput {
  especialidade?: string;
  recomendacoes?: string[];
  ativo?: boolean;
}

export class AtualizarRecomendacaoUseCase {
  constructor(private readonly audit: IAuditLogger) {}

  async exec(
    id: string,
    input: AtualizarRecomendacaoInput,
    ctx: AuditContext,
  ): Promise<RecomendacaoDto> {
    const existente = await prisma.especialidadeRecomendacao.findUnique({ where: { id } });
    if (!existente) throw NotFound('RECOMENDACAO_NAO_ENCONTRADA', 'Recomendação não encontrada');

    const data: Record<string, unknown> = {};
    if (input.especialidade !== undefined) {
      const esp = input.especialidade.trim();
      if (esp.length < 3 || esp.length > 80) {
        throw Unprocessable(
          'VALIDATION_ERROR',
          'Especialidade deve ter entre 3 e 80 caracteres',
        );
      }
      if (esp !== existente.especialidade) {
        const dup = await prisma.especialidadeRecomendacao.findUnique({
          where: { especialidade: esp },
        });
        if (dup) {
          throw Conflict(
            'ESPECIALIDADE_DUPLICADA',
            `Já existe recomendação para "${esp}".`,
          );
        }
      }
      data['especialidade'] = esp;
    }
    if (input.recomendacoes !== undefined) {
      data['recomendacoes'] = _validar(input.recomendacoes);
    }
    if (input.ativo !== undefined) {
      data['ativo'] = input.ativo;
    }
    if (Object.keys(data).length === 0) {
      throw Unprocessable('VALIDATION_ERROR', 'Nenhum campo para atualizar');
    }

    let upd;
    try {
      upd = await prisma.especialidadeRecomendacao.update({
        where: { id },
        data,
      });
    } catch (err) {
      if (_isUniqueViolation(err)) {
        // Race: outra request criou/renomeou pra a mesma especialidade entre o
        // pre-check e o update. Mensagem usuária amigável.
        throw Conflict(
          'ESPECIALIDADE_DUPLICADA',
          `Já existe recomendação para "${data['especialidade'] ?? '?'}".`,
        );
      }
      throw err;
    }
    await this.audit.registrar({
      acao: 'ATUALIZAR_RECOMENDACAO_ESPECIALIDADE',
      recurso: 'EspecialidadeRecomendacao',
      recursoId: id,
      atendenteId: ctx.atendenteId,
      payload: {
        antes: {
          especialidade: existente.especialidade,
          recomendacoes: Array.isArray(existente.recomendacoes)
            ? (existente.recomendacoes as string[])
            : [],
          ativo: existente.ativo,
        },
        depois: {
          especialidade: upd.especialidade,
          recomendacoes: Array.isArray(upd.recomendacoes)
            ? (upd.recomendacoes as string[])
            : [],
          ativo: upd.ativo,
        },
        camposAlterados: Object.keys(data),
      },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return _toDto(upd);
  }
}

export class DeletarRecomendacaoUseCase {
  constructor(private readonly audit: IAuditLogger) {}

  async exec(id: string, ctx: AuditContext): Promise<void> {
    const existente = await prisma.especialidadeRecomendacao.findUnique({ where: { id } });
    if (!existente) throw NotFound('RECOMENDACAO_NAO_ENCONTRADA', 'Recomendação não encontrada');
    await prisma.especialidadeRecomendacao.delete({ where: { id } });
    await this.audit.registrar({
      acao: 'DELETAR_RECOMENDACAO_ESPECIALIDADE',
      recurso: 'EspecialidadeRecomendacao',
      recursoId: id,
      atendenteId: ctx.atendenteId,
      payload: {
        especialidade: existente.especialidade,
        recomendacoes: Array.isArray(existente.recomendacoes)
          ? (existente.recomendacoes as string[])
          : [],
        ativo: existente.ativo,
      },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  }
}
