/**
 * Relatórios analíticos TFD — Face 4 v0.10 §14.5.
 *
 * Hoje implementa apenas `relatórios/especialidades`, que agrega solicitações
 * por especialidade e estima o custo (rateio dos abastecimentos das viagens
 * vinculadas + ajudas de custo PAGAs). Janela default: últimos 12 meses.
 */
import type { Request } from 'express';
import { BadRequest, Forbidden } from '../../../shared/errors';
import { prisma } from '../../../infrastructure/database/prisma';
import type { Prisma } from '../../../../generated/prisma';
import type { AccessScope } from '../../../shared/scope';
import { resolverPrefeituraIdEfetiva } from './_helpers';

export interface RelatorioEspecialidadesQuery {
  desde?: string; // YYYY-MM-DD
  ate?: string;   // YYYY-MM-DD
}

export interface RelatorioEspecialidadeItem {
  especialidade: string;
  totalSolicitacoes: number;
  totalRealizadas: number;
  totalPendentes: number;
  totalNegadas: number;
  pacientesUnicos: number;
  destinosMaisFrequentes: string[];
  custoEstimadoBRL: number;
  custoMedioPorViagemBRL: number;
}

export interface RelatorioEspecialidadesOutput {
  periodo: { desde: string; ate: string };
  totalGeralSolicitacoes: number;
  totalGeralCustoBRL: number;
  itens: RelatorioEspecialidadeItem[];
}

const STATUS_REALIZADAS = new Set(['REALIZADA']);
const STATUS_PENDENTES = new Set(['PENDENTE', 'APROVADA', 'ALOCADA']);
const STATUS_NEGADAS = new Set(['NEGADA', 'CANCELADA']);

function parseYmd(s: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw BadRequest('DATA_INVALIDA', `${label} fora do formato YYYY-MM-DD`);
  }
  return new Date(`${s}T00:00:00.000Z`);
}

function fmtBRL(n: number): number {
  return Math.round(n * 100) / 100;
}

export class RelatoriosTfdUseCases {
  /**
   * RBAC: REGULADOR_TFD não vê relatórios. Bloqueia explicitamente o role
   * (gestor/admin/dev passam pelo route guard).
   */
  private assertNaoRegulador(req: Request) {
    if (req.auth?.role === 'REGULADOR_TFD') {
      throw Forbidden(
        'PERMISSAO_INSUFICIENTE',
        'REGULADOR_TFD não tem acesso a relatórios analíticos',
      );
    }
  }

  async porEspecialidade(
    scope: AccessScope,
    req: Request,
    q: RelatorioEspecialidadesQuery,
  ): Promise<RelatorioEspecialidadesOutput> {
    this.assertNaoRegulador(req);
    const prefeituraId = resolverPrefeituraIdEfetiva(scope, req);

    const hoje = new Date();
    const ate = q.ate ? parseYmd(q.ate, 'ate') : new Date(Date.UTC(
      hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(),
    ));
    const desde = q.desde
      ? parseYmd(q.desde, 'desde')
      : new Date(Date.UTC(ate.getUTCFullYear() - 1, ate.getUTCMonth(), ate.getUTCDate()));

    if (desde.getTime() > ate.getTime()) {
      throw BadRequest('JANELA_INVALIDA', '`desde` não pode ser maior que `ate`');
    }

    // 1) Solicitações da janela com viagens (passageiros) + abastecimentos
    const solicitacoes = await prisma.solicitacaoTFD.findMany({
      where: {
        prefeituraId,
        deletadaEm: null,
        criadaEm: { gte: desde, lte: ate },
      },
      select: {
        id: true,
        especialidade: true,
        status: true,
        destino: true,
        pacienteId: true,
        viagemId: true,
      },
    });

    if (solicitacoes.length === 0) {
      return {
        periodo: { desde: desde.toISOString().slice(0, 10), ate: ate.toISOString().slice(0, 10) },
        totalGeralSolicitacoes: 0,
        totalGeralCustoBRL: 0,
        itens: [],
      };
    }

    const viagemIds = Array.from(
      new Set(solicitacoes.map((s) => s.viagemId).filter((v): v is string => !!v)),
    );

    // 2) Map viagem → especialidades dos passageiros (via solicitação)
    //    Uma viagem pode misturar especialidades; rateamos por contagem.
    const passageirosPorViagem = viagemIds.length
      ? await prisma.viagemPassageiro.findMany({
          where: { viagemId: { in: viagemIds } },
          select: {
            viagemId: true,
            solicitacao: { select: { especialidade: true } },
          },
        })
      : [];

    const especialidadesPorViagem = new Map<string, Map<string, number>>();
    for (const p of passageirosPorViagem) {
      const esp = p.solicitacao?.especialidade ?? 'NAO_INFORMADO';
      if (!especialidadesPorViagem.has(p.viagemId)) {
        especialidadesPorViagem.set(p.viagemId, new Map());
      }
      const mp = especialidadesPorViagem.get(p.viagemId)!;
      mp.set(esp, (mp.get(esp) ?? 0) + 1);
    }

    // 3) Custo: abastecimentos REALIZADOS das viagens + ajudas PAGAS
    const [abastecimentos, ajudas] = await Promise.all([
      viagemIds.length
        ? prisma.abastecimento.findMany({
            where: { prefeituraId, viagemId: { in: viagemIds }, status: 'REALIZADO' },
            select: { viagemId: true, valorTotal: true },
          })
        : Promise.resolve([] as Array<{ viagemId: string | null; valorTotal: Prisma.Decimal | number }>),
      viagemIds.length
        ? prisma.ajudaCusto.findMany({
            where: { prefeituraId, viagemId: { in: viagemIds }, status: 'PAGA' },
            select: { viagemId: true, valorTotal: true },
          })
        : Promise.resolve([] as Array<{ viagemId: string; valorTotal: Prisma.Decimal | number }>),
    ]);

    // Custo bruto agregado por viagem
    const custoPorViagem = new Map<string, number>();
    for (const a of abastecimentos) {
      if (!a.viagemId) continue;
      const v = Number(a.valorTotal);
      custoPorViagem.set(a.viagemId, (custoPorViagem.get(a.viagemId) ?? 0) + v);
    }
    for (const a of ajudas) {
      const v = Number(a.valorTotal);
      custoPorViagem.set(a.viagemId, (custoPorViagem.get(a.viagemId) ?? 0) + v);
    }

    // Rateio: para cada viagem, divide o custo pelas especialidades
    // proporcionalmente ao nº de passageiros de cada especialidade.
    const custoPorEspecialidade = new Map<string, number>();
    for (const [viagemId, custo] of custoPorViagem.entries()) {
      const mp = especialidadesPorViagem.get(viagemId);
      if (!mp || mp.size === 0) continue;
      const total = Array.from(mp.values()).reduce((acc, v) => acc + v, 0);
      for (const [esp, cnt] of mp.entries()) {
        const fatia = (custo * cnt) / total;
        custoPorEspecialidade.set(esp, (custoPorEspecialidade.get(esp) ?? 0) + fatia);
      }
    }

    // 4) Agregação por especialidade
    interface Bucket {
      especialidade: string;
      total: number;
      realizadas: number;
      pendentes: number;
      negadas: number;
      pacientes: Set<string>;
      destinos: Map<string, number>;
    }
    const buckets = new Map<string, Bucket>();
    for (const s of solicitacoes) {
      const esp = s.especialidade.trim() || 'NAO_INFORMADO';
      if (!buckets.has(esp)) {
        buckets.set(esp, {
          especialidade: esp,
          total: 0,
          realizadas: 0,
          pendentes: 0,
          negadas: 0,
          pacientes: new Set(),
          destinos: new Map(),
        });
      }
      const b = buckets.get(esp)!;
      b.total += 1;
      if (STATUS_REALIZADAS.has(s.status)) b.realizadas += 1;
      else if (STATUS_PENDENTES.has(s.status)) b.pendentes += 1;
      else if (STATUS_NEGADAS.has(s.status)) b.negadas += 1;
      b.pacientes.add(s.pacienteId);
      const dest = s.destino?.trim();
      if (dest) b.destinos.set(dest, (b.destinos.get(dest) ?? 0) + 1);
    }

    const itens: RelatorioEspecialidadeItem[] = Array.from(buckets.values())
      .map((b) => {
        const custo = custoPorEspecialidade.get(b.especialidade) ?? 0;
        const top3 = Array.from(b.destinos.entries())
          .sort((a, c) => c[1] - a[1])
          .slice(0, 3)
          .map(([d]) => d);
        return {
          especialidade: b.especialidade,
          totalSolicitacoes: b.total,
          totalRealizadas: b.realizadas,
          totalPendentes: b.pendentes,
          totalNegadas: b.negadas,
          pacientesUnicos: b.pacientes.size,
          destinosMaisFrequentes: top3,
          custoEstimadoBRL: fmtBRL(custo),
          custoMedioPorViagemBRL: b.realizadas > 0 ? fmtBRL(custo / b.realizadas) : 0,
        };
      })
      .sort((a, b) => b.totalSolicitacoes - a.totalSolicitacoes);

    const totalGeralCustoBRL = fmtBRL(
      itens.reduce((acc, it) => acc + it.custoEstimadoBRL, 0),
    );

    return {
      periodo: { desde: desde.toISOString().slice(0, 10), ate: ate.toISOString().slice(0, 10) },
      totalGeralSolicitacoes: solicitacoes.length,
      totalGeralCustoBRL,
      itens,
    };
  }
}
