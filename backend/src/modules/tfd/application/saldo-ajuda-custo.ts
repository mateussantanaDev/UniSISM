/**
 * Saldo orçamentário mensal global de Ajuda de Custo (único por prefeitura × mês).
 *
 * - `obter` retorna o saldo do mês (placeholder zero se não existir).
 * - `ajustar` SOBRESCREVE saldoMensal e tetos por categoria — ADMIN/DEV apenas.
 * - `aportar` SOMA ao saldoMensal — qualquer gestor TFD.
 * - `listarAportes` lê histórico do mês.
 *
 * Tetos: 0 = sem teto. Validação por item ocorre no use case de AjudaCusto.
 */
import type { Request } from 'express';
import { Forbidden, Unprocessable } from '../../../shared/errors';
import { prisma } from '../../../infrastructure/database/prisma';
import type {
  AporteSaldoAjudaCusto,
  FonteRecursoTFD,
  Prisma,
  SaldoAjudaCusto,
} from '../../../../generated/prisma';
import type { AccessScope } from '../../../shared/scope';
import type { IAtendenteRepository } from '../../../domain/repositories/IAtendenteRepository';
import type { ITfdAuditLogger } from '../infrastructure/TfdAuditLogger';
import {
  ctxAudit,
  mesAtualYmd,
  resolverOperador,
  resolverPrefeituraIdEfetiva,
} from './_helpers';

export interface AjustarSaldoAjudaInput {
  mes: string;
  novoSaldoMensal: number;
  tetoAlimentacao?: number;
  tetoHospedagem?: number;
  tetoDeslocamento?: number;
  justificativa: string;
}

export interface AporteSaldoAjudaInput {
  mes: string;
  valorBRL: number;
  fonte: FonteRecursoTFD;
  numeroDocumento?: string;
  descricaoFonte?: string;
  justificativa: string;
}

const FONTES_REQUER_DOC = new Set<FonteRecursoTFD>(['EMPENHO', 'PORTARIA']);

type SaldoAjudaLike = Partial<
  Pick<
    SaldoAjudaCusto,
    | 'saldoMensal'
    | 'saldoConsumido'
    | 'saldoReservado'
    | 'tetoAlimentacao'
    | 'tetoHospedagem'
    | 'tetoDeslocamento'
    | 'atualizadoEm'
  >
>;

function rowParaSaldo(prefeituraId: string, mes: string, s: SaldoAjudaLike) {
  const mensal = Number(s.saldoMensal ?? 0);
  const cons = Number(s.saldoConsumido ?? 0);
  const res = Number(s.saldoReservado ?? 0);
  return {
    prefeituraId,
    mes,
    saldoMensal: mensal,
    saldoConsumido: cons,
    saldoReservado: res,
    saldoDisponivel: +(mensal - cons - res).toFixed(2),
    tetoAlimentacao: Number(s.tetoAlimentacao ?? 0),
    tetoHospedagem: Number(s.tetoHospedagem ?? 0),
    tetoDeslocamento: Number(s.tetoDeslocamento ?? 0),
    atualizadoEm: s.atualizadoEm
      ? (s.atualizadoEm as Date).toISOString()
      : new Date(0).toISOString(),
  };
}

function rowParaAporte(a: AporteSaldoAjudaCusto) {
  return {
    id: a.id,
    mes: a.mes,
    valorBRL: Number(a.valorBRL),
    fonte: a.fonte,
    numeroDocumento: a.numeroDocumento,
    descricaoFonte: a.descricaoFonte,
    justificativa: a.justificativa,
    operadorId: a.operadorId,
    criadoEm: (a.criadoEm as Date).toISOString(),
    prefeituraId: a.prefeituraId,
  };
}

function validarFonte(input: AporteSaldoAjudaInput): void {
  if (FONTES_REQUER_DOC.has(input.fonte) && !input.numeroDocumento?.trim()) {
    throw Unprocessable(
      'APORTE_DOCUMENTO_OBRIGATORIO',
      `Fonte ${input.fonte} exige numeroDocumento (ex.: empenho, portaria)`,
    );
  }
  if (input.fonte === 'OUTRO' && !input.descricaoFonte?.trim()) {
    throw Unprocessable(
      'APORTE_FONTE_INVALIDA',
      'Fonte OUTRO exige descricaoFonte',
    );
  }
}

export class SaldoAjudaCustoUseCases {
  constructor(
    private readonly audit: ITfdAuditLogger,
    private readonly atendentes: IAtendenteRepository,
  ) {}

  async obter(scope: AccessScope, req: Request, mes?: string) {
    const prefeituraId = resolverPrefeituraIdEfetiva(scope, req);
    const mesEfetivo = mes ?? mesAtualYmd();
    const s = await prisma.saldoAjudaCusto.findUnique({
      where: { prefeituraId_mes: { prefeituraId, mes: mesEfetivo } },
    });
    return rowParaSaldo(prefeituraId, mesEfetivo, s ?? {});
  }

  async ajustar(scope: AccessScope, req: Request, autorId: string, input: AjustarSaldoAjudaInput) {
    if (input.justificativa.trim().length < 10) {
      throw Unprocessable('JUSTIFICATIVA_OBRIGATORIA', 'Justificativa deve ter ≥ 10 caracteres');
    }
    if (!Number.isFinite(input.novoSaldoMensal) || input.novoSaldoMensal < 0) {
      throw Unprocessable('SALDO_NEGATIVO', 'Saldo mensal não pode ser negativo');
    }
    if (!/^\d{4}-\d{2}$/.test(input.mes)) {
      throw Unprocessable('DATA_INVALIDA', 'mes deve estar em YYYY-MM');
    }
    if (scope.kind === 'UBS') {
      throw Forbidden('ROLE_NAO_PERMITIDO', 'Apenas ADMIN/DEV podem ajustar saldo de ajuda');
    }
    const tetoA = input.tetoAlimentacao ?? 0;
    const tetoH = input.tetoHospedagem ?? 0;
    const tetoD = input.tetoDeslocamento ?? 0;
    if ([tetoA, tetoH, tetoD].some((v) => !Number.isFinite(v) || v < 0)) {
      throw Unprocessable('VALOR_INVALIDO', 'Tetos devem ser ≥ 0');
    }
    const prefeituraId = resolverPrefeituraIdEfetiva(scope, req);
    const op = await resolverOperador(this.atendentes, autorId, prefeituraId);

    const atual = await prisma.saldoAjudaCusto.findUnique({
      where: { prefeituraId_mes: { prefeituraId, mes: input.mes } },
    });
    const antes = {
      saldoMensal: Number(atual?.saldoMensal ?? 0),
      tetoAlimentacao: Number(atual?.tetoAlimentacao ?? 0),
      tetoHospedagem: Number(atual?.tetoHospedagem ?? 0),
      tetoDeslocamento: Number(atual?.tetoDeslocamento ?? 0),
    };

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.saldoAjudaCusto.upsert({
        where: { prefeituraId_mes: { prefeituraId, mes: input.mes } },
        update: {
          saldoMensal: input.novoSaldoMensal,
          tetoAlimentacao: tetoA,
          tetoHospedagem: tetoH,
          tetoDeslocamento: tetoD,
        },
        create: {
          prefeituraId,
          mes: input.mes,
          saldoMensal: input.novoSaldoMensal,
          tetoAlimentacao: tetoA,
          tetoHospedagem: tetoH,
          tetoDeslocamento: tetoD,
        },
      });
      await tx.saldoAjudaCustoAjuste.create({
        data: {
          prefeituraId,
          mes: input.mes,
          saldoAnterior: antes.saldoMensal,
          saldoNovo: input.novoSaldoMensal,
          tetoAlimentacaoAnterior: antes.tetoAlimentacao,
          tetoAlimentacaoNovo: tetoA,
          tetoHospedagemAnterior: antes.tetoHospedagem,
          tetoHospedagemNovo: tetoH,
          tetoDeslocamentoAnterior: antes.tetoDeslocamento,
          tetoDeslocamentoNovo: tetoD,
          justificativa: input.justificativa.trim(),
          ajustadoPorId: autorId,
        },
      });
      return s;
    });

    await this.audit.registrar({
      prefeituraId,
      acao: 'SALDO_AJUDA_AJUSTADO',
      recursoTipo: 'SALDO_AJUDA_CUSTO',
      recursoId: `${prefeituraId}:${input.mes}`,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      antes,
      depois: {
        saldoMensal: input.novoSaldoMensal,
        tetoAlimentacao: tetoA,
        tetoHospedagem: tetoH,
        tetoDeslocamento: tetoD,
        justificativa: input.justificativa,
      },
    });
    return rowParaSaldo(prefeituraId, input.mes, updated);
  }

  async aportar(scope: AccessScope, req: Request, autorId: string, input: AporteSaldoAjudaInput) {
    if (input.justificativa.trim().length < 10) {
      throw Unprocessable('JUSTIFICATIVA_OBRIGATORIA', 'Justificativa deve ter ≥ 10 caracteres');
    }
    if (!Number.isFinite(input.valorBRL) || input.valorBRL <= 0) {
      throw Unprocessable('APORTE_INVALIDO', 'valorBRL deve ser > 0');
    }
    if (!/^\d{4}-\d{2}$/.test(input.mes)) {
      throw Unprocessable('DATA_INVALIDA', 'mes deve estar em YYYY-MM');
    }
    validarFonte(input);

    const prefeituraId = resolverPrefeituraIdEfetiva(scope, req);
    const op = await resolverOperador(this.atendentes, autorId, prefeituraId);

    const atual = await prisma.saldoAjudaCusto.findUnique({
      where: { prefeituraId_mes: { prefeituraId, mes: input.mes } },
      select: { saldoMensal: true },
    });
    const mensalAntes = Number(atual?.saldoMensal ?? 0);

    const aporte = await prisma.$transaction(async (tx) => {
      await tx.saldoAjudaCusto.upsert({
        where: { prefeituraId_mes: { prefeituraId, mes: input.mes } },
        update: { saldoMensal: { increment: input.valorBRL } },
        create: {
          prefeituraId,
          mes: input.mes,
          saldoMensal: input.valorBRL,
        },
      });
      return tx.aporteSaldoAjudaCusto.create({
        data: {
          prefeituraId,
          mes: input.mes,
          valorBRL: input.valorBRL,
          fonte: input.fonte,
          numeroDocumento: input.numeroDocumento ?? null,
          descricaoFonte: input.descricaoFonte ?? null,
          justificativa: input.justificativa.trim(),
          operadorId: autorId,
        },
      });
    });

    await this.audit.registrar({
      prefeituraId,
      acao: 'SALDO_AJUDA_APORTADO',
      recursoTipo: 'SALDO_AJUDA_CUSTO',
      recursoId: `${prefeituraId}:${input.mes}`,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      antes: { saldoMensal: mensalAntes },
      depois: {
        saldoMensal: +(mensalAntes + input.valorBRL).toFixed(2),
        valorBRL: input.valorBRL,
        fonte: input.fonte,
        numeroDocumento: input.numeroDocumento ?? null,
        justificativa: input.justificativa,
      },
    });
    return rowParaAporte(aporte);
  }

  async listarAportes(scope: AccessScope, req: Request, filtros: { mes?: string }) {
    const prefeituraId = resolverPrefeituraIdEfetiva(scope, req);
    const where: Prisma.AporteSaldoAjudaCustoWhereInput = { prefeituraId };
    if (filtros.mes) where.mes = filtros.mes;
    const aportes = await prisma.aporteSaldoAjudaCusto.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take: 500,
    });
    return aportes.map(rowParaAporte);
  }
}
