/**
 * Saldo orçamentário mensal por veículo.
 *
 * - Listagem retorna registros do mês (cria placeholder zero se não existe).
 * - Ajuste exige justificativa ≥ 10 chars + auditoria.
 */
import type { Request } from 'express';
import { Forbidden, NotFound, Unprocessable } from '../../../shared/errors';
import { prisma } from '../../../infrastructure/database/prisma';
import type { SaldoVeiculo, VeiculoTFD } from '../../../../generated/prisma';
import type { AccessScope } from '../../../shared/scope';
import type { IAtendenteRepository } from '../../../domain/repositories/IAtendenteRepository';
import type { ITfdAuditLogger } from '../infrastructure/TfdAuditLogger';
import {
  assertMesmaPrefeitura,
  ctxAudit,
  mesAtualYmd,
  resolverOperador,
  resolverPrefeituraIdEfetiva,
} from './_helpers';

export interface AjustarSaldoInput {
  veiculoId: string;
  mes: string; // YYYY-MM
  novoSaldoMensal: number;
  justificativa: string;
}

type SaldoVeiculoLike =
  | Pick<SaldoVeiculo, 'veiculoId' | 'prefeituraId' | 'mes' | 'saldoMensal' | 'saldoConsumido' | 'saldoReservado'>
  | {
      veiculoId: string;
      prefeituraId: string;
      mes: string;
      saldoMensal: number;
      saldoConsumido: number;
      saldoReservado: number;
    };

function rowParaSaldo(
  s: SaldoVeiculoLike,
  veiculo?: Pick<VeiculoTFD, 'placa' | 'modelo'>,
) {
  const mensal = Number(s.saldoMensal);
  const consumido = Number(s.saldoConsumido);
  const reservado = Number(s.saldoReservado);
  return {
    veiculoId: s.veiculoId,
    veiculoPlaca: veiculo?.placa ?? null,
    veiculoModelo: veiculo?.modelo ?? null,
    mes: s.mes,
    saldoMensal: mensal,
    saldoConsumido: consumido,
    saldoReservado: reservado,
    saldoDisponivel: +(mensal - consumido - reservado).toFixed(2),
    prefeituraId: s.prefeituraId,
  };
}

export class SaldoUseCases {
  constructor(
    private readonly audit: ITfdAuditLogger,
    private readonly atendentes: IAtendenteRepository,
  ) {}

  async listar(scope: AccessScope, req: Request, mes?: string) {
    const prefeituraId = resolverPrefeituraIdEfetiva(scope, req);
    const mesEfetivo = mes ?? mesAtualYmd();

    // Garante saldo placeholder pra todo veículo ativo
    const veiculos = await prisma.veiculoTFD.findMany({
      where: { prefeituraId, deletadoEm: null },
      select: { id: true, placa: true, modelo: true },
    });

    const saldos = await prisma.saldoVeiculo.findMany({
      where: { prefeituraId, mes: mesEfetivo },
    });
    const map = new Map(saldos.map((s) => [s.veiculoId, s]));

    return veiculos.map((v) => {
      const s = map.get(v.id) ?? {
        veiculoId: v.id,
        prefeituraId,
        mes: mesEfetivo,
        saldoMensal: 0,
        saldoConsumido: 0,
        saldoReservado: 0,
      };
      return rowParaSaldo(s, v);
    });
  }

  async ajustar(scope: AccessScope, req: Request, autorId: string, input: AjustarSaldoInput) {
    if (input.justificativa.trim().length < 10) {
      throw Unprocessable('JUSTIFICATIVA_OBRIGATORIA', 'Justificativa deve ter ≥ 10 caracteres');
    }
    if (input.novoSaldoMensal < 0) {
      throw Unprocessable('SALDO_NEGATIVO', 'Saldo mensal não pode ser negativo');
    }
    // Apenas ADMIN/DEV
    if (scope.kind !== 'GLOBAL' && scope.kind === 'UBS') {
      throw Forbidden('ROLE_NAO_PERMITIDO', 'Apenas ADMIN/DEV podem ajustar saldo');
    }

    const veiculo = await prisma.veiculoTFD.findUnique({ where: { id: input.veiculoId } });
    if (!veiculo || veiculo.deletadoEm) {
      throw NotFound('VEICULO_NAO_ENCONTRADO', 'Veículo não encontrado');
    }
    assertMesmaPrefeitura(scope, veiculo.prefeituraId);
    const op = await resolverOperador(this.atendentes, autorId, veiculo.prefeituraId);

    const atual = await prisma.saldoVeiculo.findUnique({
      where: { veiculoId_mes: { veiculoId: input.veiculoId, mes: input.mes } },
    });
    const saldoAnterior = atual ? Number(atual.saldoMensal) : 0;

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.saldoVeiculo.upsert({
        where: { veiculoId_mes: { veiculoId: input.veiculoId, mes: input.mes } },
        update: { saldoMensal: input.novoSaldoMensal },
        create: {
          veiculoId: input.veiculoId,
          prefeituraId: veiculo.prefeituraId,
          mes: input.mes,
          saldoMensal: input.novoSaldoMensal,
        },
      });
      await tx.saldoAjuste.create({
        data: {
          veiculoId: input.veiculoId,
          prefeituraId: veiculo.prefeituraId,
          mes: input.mes,
          saldoAnterior,
          saldoNovo: input.novoSaldoMensal,
          justificativa: input.justificativa.trim(),
          ajustadoPorId: autorId,
        },
      });
      return s;
    });

    await this.audit.registrar({
      prefeituraId: veiculo.prefeituraId,
      acao: 'SALDO_AJUSTADO',
      recursoTipo: 'SALDO_VEICULO',
      recursoId: `${input.veiculoId}:${input.mes}`,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      antes: { saldoMensal: saldoAnterior },
      depois: {
        saldoMensal: input.novoSaldoMensal,
        justificativa: input.justificativa,
      },
    });
    return rowParaSaldo(updated, veiculo);
  }
}
