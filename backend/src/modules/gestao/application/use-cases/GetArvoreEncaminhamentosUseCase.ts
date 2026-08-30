/**
 * Árvore hierárquica de encaminhamentos (Face 2 · file-manager da SMS).
 *
 *   nenhum param        → ArvoreUbsNode[]   (UBSs da prefeitura)
 *   ?ubsId=...          → ArvoreAnoNode[]   (anos daquela UBS)
 *   ?ubsId=...&ano=YYYY → ArvoreMesNode[]   (meses do ano)
 *   ?ubsId=...&ano=YYYY&mes=M → ArvoreDiaNode[] (dias do mês)
 *
 * Escopo: PREFEITURA (DESENVOLVEDOR vê tudo · ADMIN/REGULADOR_SMS vê sua prefeitura).
 *
 * Estratégia: raw SQL com agregações + GROUP BY por status — uma query por nível.
 * Indices necessários (definir em migration de produção):
 *   - (prefeitura_id, ubsId, EXTRACT(YEAR FROM criado_em), EXTRACT(MONTH FROM criado_em))
 */
import { prisma } from '../../../../infrastructure/database/prisma';
import { Prisma } from '../../../../../generated/prisma';
import { BadRequest, Forbidden, NotFound } from '../../../../shared/errors';
import type { AccessScope } from '../../../../shared/scope';
import { CACHE_TTL, getCache } from '../../../../infrastructure/cache/Cache';

// ---- Tipos de retorno ----

export interface StatusContagem {
  aguardando: number;
  pendencia: number;
  aprovado: number;
  rejeitado: number;
}

export interface ArvoreUbsNode {
  ubsId: string;
  nome: string;
  totalEncaminhamentos: number;
  anoMaisRecente: number | null;
  statusContagem: StatusContagem;
}

export interface ArvoreAnoNode {
  ano: number;
  totalEncaminhamentos: number;
  statusContagem: StatusContagem;
}

export interface ArvoreMesNode {
  mes: number;
  totalEncaminhamentos: number;
  statusContagem: StatusContagem;
}

export interface ArvoreDiaNode {
  dia: number;
  totalEncaminhamentos: number;
  statusContagem: StatusContagem;
}

export type ArvoreNode = ArvoreUbsNode | ArvoreAnoNode | ArvoreMesNode | ArvoreDiaNode;

// ---- Input ----

export interface GetArvoreInput {
  ubsId?: string;
  ano?: number;
  mes?: number;
  respostaSUS?: boolean;
  excluirRascunho?: boolean;
}

// ---- Helpers ----

function vazio(): StatusContagem {
  return { aguardando: 0, pendencia: 0, aprovado: 0, rejeitado: 0 };
}

function acumular(
  agg: StatusContagem,
  status: string,
  qtd: number,
): StatusContagem {
  switch (status) {
    case 'AGUARDANDO_REGULACAO':
      agg.aguardando += qtd;
      break;
    case 'PENDENCIA_DOCUMENTO':
      agg.pendencia += qtd;
      break;
    case 'APROVADO':
      agg.aprovado += qtd;
      break;
    case 'REJEITADO':
      agg.rejeitado += qtd;
      break;
  }
  return agg;
}

// ---- Use Case ----

export class GetArvoreEncaminhamentosUseCase {
  private readonly cache = getCache();

  async exec(scope: AccessScope, input: GetArvoreInput): Promise<ArvoreNode[]> {
    if (input.mes !== undefined && input.ano === undefined) {
      throw BadRequest('PARAMS_INCOMPATIVEIS', '`mes` exige `ano`');
    }
    if ((input.ano !== undefined || input.mes !== undefined) && !input.ubsId) {
      throw BadRequest('PARAMS_INCOMPATIVEIS', '`ano`/`mes` exige `ubsId`');
    }

    if (scope.kind === 'UBS') {
      throw Forbidden('PERMISSAO_INSUFICIENTE', 'Escopo UBS não pode usar a árvore');
    }

    const prefeituraFilter =
      scope.kind === 'GLOBAL' ? null : scope.prefeituraId;

    if (input.ubsId) {
      const ubs = await prisma.ubs.findUnique({
        where: { id: input.ubsId },
        select: { id: true, prefeituraId: true },
      });
      if (!ubs) throw NotFound('UBS_NAO_ENCONTRADA', 'UBS não encontrada');
      if (prefeituraFilter && ubs.prefeituraId !== prefeituraFilter) {
        throw NotFound('UBS_NAO_ENCONTRADA', 'UBS não encontrada');
      }
    }

    // chave de cache inclui todos os parâmetros do escopo + filtros
    const rKey = typeof input.respostaSUS === 'boolean' ? String(input.respostaSUS) : '*';
    const eKey = typeof input.excluirRascunho === 'boolean' ? String(input.excluirRascunho) : '*';
    const cacheKey = `arvore:${prefeituraFilter ?? 'GLOBAL'}:${input.ubsId ?? '*'}:${input.ano ?? '*'}:${input.mes ?? '*'}:${rKey}:${eKey}`;

    return this.cache.remember(cacheKey, CACHE_TTL.ARVORE, () => this.compute(prefeituraFilter, input));
  }

  private compute(prefeituraFilter: string | null, input: GetArvoreInput): Promise<ArvoreNode[]> {
    if (!input.ubsId) return this.nivelUbs(prefeituraFilter, input.respostaSUS, input.excluirRascunho);
    if (input.ano === undefined) return this.nivelAno(input.ubsId, input.respostaSUS, input.excluirRascunho);
    if (input.mes === undefined) return this.nivelMes(input.ubsId, input.ano, input.respostaSUS, input.excluirRascunho);
    return this.nivelDia(input.ubsId, input.ano, input.mes, input.respostaSUS, input.excluirRascunho);
  }

  /**
   * Invalidação: todo evento de transição de encaminhamento chama isto
   * para limpar as entradas da árvore da UBS afetada + GLOBAL.
   */
  async invalidarCachePorUbs(prefeituraId: string, _ubsId: string): Promise<void> {
    // Derrubamos toda a árvore — agregados são relativamente baratos de recalcular.
    await this.cache.delByPrefix(`arvore:${prefeituraId}:`);
    await this.cache.delByPrefix(`arvore:GLOBAL:`);
  }

  // ---- Nível 1: UBSs ----
  private async nivelUbs(
    prefeituraFilter: string | null,
    respostaSUS?: boolean,
    excluirRascunho?: boolean,
  ): Promise<ArvoreUbsNode[]> {
    const ubsList = await prisma.ubs.findMany({
      where: prefeituraFilter ? { prefeituraId: prefeituraFilter } : {},
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    });

    if (ubsList.length === 0) return [];

    const ids = ubsList.map((u) => u.id);

    type Row = { ubsId: string; status: string; qtd: bigint; max_ano: number | null };
    
    const conditions: Prisma.Sql[] = [
      Prisma.sql`"ubsId" = ANY(${ids})`,
      Prisma.sql`"deletadoEm" IS NULL`,
    ];

    if (respostaSUS === true) {
      conditions.push(Prisma.sql`"respostaSusAnexoId" IS NOT NULL`);
    } else if (respostaSUS === false) {
      conditions.push(Prisma.sql`"respostaSusAnexoId" IS NULL`);
    }

    if (excluirRascunho) {
      conditions.push(Prisma.sql`status <> 'RASCUNHO'`);
    }

    const whereClause = Prisma.join(conditions, ' AND ');
    const dateField = respostaSUS === true ? '"respostaSusRegistradoEm"' : '"criadoEm"';

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT "ubsId", status,
             COUNT(*)::bigint AS qtd,
             MAX(EXTRACT(YEAR FROM ${Prisma.raw(dateField)}))::int AS max_ano
      FROM encaminhamentos
      WHERE ${whereClause}
      GROUP BY "ubsId", status
    `;

    const mapaUbs = new Map<string, ArvoreUbsNode>();
    for (const u of ubsList) {
      mapaUbs.set(u.id, {
        ubsId: u.id,
        nome: u.nome,
        totalEncaminhamentos: 0,
        anoMaisRecente: null,
        statusContagem: vazio(),
      });
    }

    for (const r of rows) {
      const node = mapaUbs.get(r.ubsId);
      if (!node) continue;
      const qtd = Number(r.qtd);
      node.totalEncaminhamentos += qtd;
      acumular(node.statusContagem, r.status, qtd);
      if (r.max_ano !== null && (node.anoMaisRecente === null || r.max_ano > node.anoMaisRecente)) {
        node.anoMaisRecente = r.max_ano;
      }
    }

    return [...mapaUbs.values()].sort(
      (a, b) => b.totalEncaminhamentos - a.totalEncaminhamentos,
    );
  }

  // ---- Nível 2: anos ----
  private async nivelAno(
    ubsId: string,
    respostaSUS?: boolean,
    excluirRascunho?: boolean,
  ): Promise<ArvoreAnoNode[]> {
    type Row = { ano: number; status: string; qtd: bigint };
    
    const conditions: Prisma.Sql[] = [
      Prisma.sql`"ubsId" = ${ubsId}`,
      Prisma.sql`"deletadoEm" IS NULL`,
    ];

    if (respostaSUS === true) {
      conditions.push(Prisma.sql`"respostaSusAnexoId" IS NOT NULL`);
    } else if (respostaSUS === false) {
      conditions.push(Prisma.sql`"respostaSusAnexoId" IS NULL`);
    }

    if (excluirRascunho) {
      conditions.push(Prisma.sql`status <> 'RASCUNHO'`);
    }

    const whereClause = Prisma.join(conditions, ' AND ');
    const dateField = respostaSUS === true ? '"respostaSusRegistradoEm"' : '"criadoEm"';

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT EXTRACT(YEAR FROM ${Prisma.raw(dateField)})::int AS ano, status, COUNT(*)::bigint AS qtd
      FROM encaminhamentos
      WHERE ${whereClause}
      GROUP BY ano, status
      ORDER BY ano DESC
    `;
    return this.agruparPorChave(rows, (r) => r.ano).map(({ chave, total, sc }) => ({
      ano: chave,
      totalEncaminhamentos: total,
      statusContagem: sc,
    }));
  }

  // ---- Nível 3: meses ----
  private async nivelMes(
    ubsId: string,
    ano: number,
    respostaSUS?: boolean,
    excluirRascunho?: boolean,
  ): Promise<ArvoreMesNode[]> {
    type Row = { mes: number; status: string; qtd: bigint };
    
    const dateField = respostaSUS === true ? '"respostaSusRegistradoEm"' : '"criadoEm"';
    const conditions: Prisma.Sql[] = [
      Prisma.sql`"ubsId" = ${ubsId}`,
      Prisma.sql`"deletadoEm" IS NULL`,
      Prisma.sql`EXTRACT(YEAR FROM ${Prisma.raw(dateField)}) = ${ano}::int`
    ];

    if (respostaSUS === true) {
      conditions.push(Prisma.sql`"respostaSusAnexoId" IS NOT NULL`);
    } else if (respostaSUS === false) {
      conditions.push(Prisma.sql`"respostaSusAnexoId" IS NULL`);
    }

    if (excluirRascunho) {
      conditions.push(Prisma.sql`status <> 'RASCUNHO'`);
    }

    const whereClause = Prisma.join(conditions, ' AND ');

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT EXTRACT(MONTH FROM ${Prisma.raw(dateField)})::int AS mes, status, COUNT(*)::bigint AS qtd
      FROM encaminhamentos
      WHERE ${whereClause}
      GROUP BY mes, status
      ORDER BY mes DESC
    `;
    return this.agruparPorChave(rows, (r) => r.mes).map(({ chave, total, sc }) => ({
      mes: chave,
      totalEncaminhamentos: total,
      statusContagem: sc,
    }));
  }

  // ---- Nível 4: dias ----
  private async nivelDia(
    ubsId: string,
    ano: number,
    mes: number,
    respostaSUS?: boolean,
    excluirRascunho?: boolean,
  ): Promise<ArvoreDiaNode[]> {
    type Row = { dia: number; status: string; qtd: bigint };
    
    const dateField = respostaSUS === true ? '"respostaSusRegistradoEm"' : '"criadoEm"';
    const conditions: Prisma.Sql[] = [
      Prisma.sql`"ubsId" = ${ubsId}`,
      Prisma.sql`"deletadoEm" IS NULL`,
      Prisma.sql`EXTRACT(YEAR FROM ${Prisma.raw(dateField)}) = ${ano}::int`,
      Prisma.sql`EXTRACT(MONTH FROM ${Prisma.raw(dateField)}) = ${mes}::int`
    ];

    if (respostaSUS === true) {
      conditions.push(Prisma.sql`"respostaSusAnexoId" IS NOT NULL`);
    } else if (respostaSUS === false) {
      conditions.push(Prisma.sql`"respostaSusAnexoId" IS NULL`);
    }

    if (excluirRascunho) {
      conditions.push(Prisma.sql`status <> 'RASCUNHO'`);
    }

    const whereClause = Prisma.join(conditions, ' AND ');

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT EXTRACT(DAY FROM ${Prisma.raw(dateField)})::int AS dia, status, COUNT(*)::bigint AS qtd
      FROM encaminhamentos
      WHERE ${whereClause}
      GROUP BY dia, status
      ORDER BY dia DESC
    `;
    return this.agruparPorChave(rows, (r) => r.dia).map(({ chave, total, sc }) => ({
      dia: chave,
      totalEncaminhamentos: total,
      statusContagem: sc,
    }));
  }

  private agruparPorChave<R extends { status: string; qtd: bigint }>(
    rows: R[],
    keyOf: (r: R) => number,
  ): Array<{ chave: number; total: number; sc: StatusContagem }> {
    const agg = new Map<number, { total: number; sc: StatusContagem }>();
    for (const r of rows) {
      const k = keyOf(r);
      const qtd = Number(r.qtd);
      const slot = agg.get(k) ?? { total: 0, sc: vazio() };
      slot.total += qtd;
      acumular(slot.sc, r.status, qtd);
      agg.set(k, slot);
    }
    return [...agg.entries()]
      .map(([chave, v]) => ({ chave, total: v.total, sc: v.sc }))
      .sort((a, b) => b.chave - a.chave);
  }
}
