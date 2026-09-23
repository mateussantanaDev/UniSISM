/**
 * Data sources por TipoRelatorio (§5 — minimização LGPD).
 *
 * Cada função recebe escopo + período + filtros e devolve **apenas** as colunas
 * declaradas em TipoRelatorioMeta. Zero SELECT *.
 */
import type { Prisma, StatusEncaminhamento } from '../../../../generated/prisma';
import { prisma } from '../../../infrastructure/database/prisma';

export interface EscopoData {
  prefeituraId: string;
  ubsId: string | null;     // null = toda a prefeitura
  atendenteId: string | null; // não-null só em SELF (PRODUCAO_INDIVIDUAL)
}

export interface JanelaPeriodo {
  inicio: Date; // 00:00:00
  fim: Date;    // 23:59:59
}

// ============================================================
// Helpers
// ============================================================

function mascararCpf(cpf: string): string {
  const d = cpf.replace(/\D+/g, '');
  if (d.length !== 11) return '***.***.***-**';
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}

function mascararCartaoSus(cns: string | null): string {
  if (!cns) return '****';
  const d = cns.replace(/\D+/g, '');
  if (d.length < 4) return '****';
  return `****${d.slice(-4)}`;
}

function mascararTelefone(t: string | null): string {
  if (!t) return '****';
  const d = t.replace(/\D+/g, '');
  if (d.length < 4) return '****';
  return `(${d.slice(0, 2)}) *****-${d.slice(-4)}`;
}

function horas(ms: number): number {
  return Math.round(ms / 3_600_000);
}

function slaStatus(horasFila: number, prioridade: string): string {
  // SLA simplificado: ELETIVA ≤ 720h (30d), PRIORITARIA ≤ 168h (7d),
  // URGENTE ≤ 48h, EMERGENCIA ≤ 12h.
  const limite =
    prioridade === 'EMERGENCIA' ? 12 :
    prioridade === 'URGENTE' ? 48 :
    prioridade === 'PRIORITARIA' ? 168 : 720;
  if (horasFila > limite) return 'ESTOURADO';
  if (horasFila > limite * 0.75) return 'EM_ATENCAO';
  return 'DENTRO_SLA';
}

function whereEscopo(escopo: EscopoData): Prisma.EncaminhamentoWhereInput {
  const w: Prisma.EncaminhamentoWhereInput = { ubs: { prefeituraId: escopo.prefeituraId } };
  if (escopo.ubsId) w.ubsId = escopo.ubsId;
  if (escopo.atendenteId) w.atendenteId = escopo.atendenteId;
  return w;
}

function wherePeriodo(janela: JanelaPeriodo): Prisma.DateTimeFilter {
  return { gte: janela.inicio, lte: janela.fim };
}

// ============================================================
// Data sources — um por tipo
// ============================================================

export interface LinhaDados {
  [col: string]: string | number | null;
}

export async function dadosFilaRegulacao(
  escopo: EscopoData,
  _janela: JanelaPeriodo,
): Promise<LinhaDados[]> {
  // FILA é sempre o estado atual ("quem está esperando agora"), independente de período
  const rows = await prisma.encaminhamento.findMany({
    where: {
      ...whereEscopo(escopo),
      status: 'AGUARDANDO_REGULACAO',
    },
    select: {
      protocolo: true,
      especialidadeSolicitada: true,
      prioridade: true,
      criadoEm: true,
      atualizadoEm: true,
      ubs: { select: { nome: true } },
    },
    orderBy: { criadoEm: 'asc' },
    take: 500_000,
  });
  const agora = Date.now();
  return rows.map((r) => {
    const h = horas(agora - r.criadoEm.getTime());
    return {
      protocolo: r.protocolo,
      especialidade: r.especialidadeSolicitada,
      prioridade: r.prioridade,
      ubs_origem: r.ubs.nome,
      data_entrada: r.criadoEm.toISOString(),
      tempo_em_fila_h: h,
      sla_status: slaStatus(h, r.prioridade),
    };
  });
}

export async function dadosEncaminhamentosPorEspecialidade(
  escopo: EscopoData,
  janela: JanelaPeriodo,
): Promise<LinhaDados[]> {
  // Agregado em SQL puro — mais eficiente que fazer findMany+agrupar em JS
  type Row = {
    especialidade: string;
    total: bigint;
    aprovados: bigint;
    rejeitados: bigint;
    pendencias: bigint;
    tempo_medio_dias: number | null;
  };
  // Constrói o fragmento de escopo inline (Prisma.sql)
  const ubsFiltro = escopo.ubsId ? `AND e."ubsId" = '${escopo.ubsId}'` : '';
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `
    SELECT
      e."especialidadeSolicitada" AS especialidade,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE e.status = 'APROVADO')::bigint AS aprovados,
      COUNT(*) FILTER (WHERE e.status = 'REJEITADO')::bigint AS rejeitados,
      COUNT(*) FILTER (WHERE e.status = 'PENDENCIA_DOCUMENTO')::bigint AS pendencias,
      AVG(
        CASE WHEN e.status = 'APROVADO'
        THEN EXTRACT(EPOCH FROM (e."atualizadoEm" - e."criadoEm")) / 86400.0
        ELSE NULL END
      ) AS tempo_medio_dias
    FROM encaminhamentos e
    INNER JOIN ubs u ON u.id = e."ubsId"
    WHERE u."prefeituraId" = $1
      AND e."criadoEm" BETWEEN $2 AND $3
      ${ubsFiltro}
    GROUP BY e."especialidadeSolicitada"
    ORDER BY total DESC
    `,
    escopo.prefeituraId,
    janela.inicio,
    janela.fim,
  );
  return rows.map((r) => ({
    especialidade: r.especialidade,
    total: Number(r.total),
    aprovados: Number(r.aprovados),
    rejeitados: Number(r.rejeitados),
    pendencias: Number(r.pendencias),
    tempo_medio_dias: r.tempo_medio_dias !== null ? Number(r.tempo_medio_dias.toFixed(1)) : 0,
  }));
}

export async function dadosPendenciasResolvidas(
  escopo: EscopoData,
  janela: JanelaPeriodo,
): Promise<LinhaDados[]> {
  // Encaminhamentos que saíram de PENDENCIA_DOCUMENTO pra AGUARDANDO_REGULACAO
  // ou APROVADO dentro do período. Heurística: evento PENDENCIA_REGISTRADA existente
  // + evento ENVIADO_REGULACAO/APROVADO depois.
  const rows = await prisma.encaminhamento.findMany({
    where: {
      ...whereEscopo(escopo),
      status: { in: ['AGUARDANDO_REGULACAO' as StatusEncaminhamento, 'APROVADO' as StatusEncaminhamento] },
    },
    select: {
      protocolo: true,
      ubs: { select: { nome: true } },
      timeline: {
        select: { tipo: true, em: true, descricao: true },
        orderBy: { em: 'asc' },
      },
    },
    take: 10_000,
  });

  const resultado: LinhaDados[] = [];
  for (const r of rows) {
    const pend = r.timeline.find((t) => t.tipo === 'PENDENCIA_REGISTRADA');
    if (!pend) continue;
    const resolvido = r.timeline.find((t) => t.em > pend.em && (t.tipo === 'ENVIADO_REGULACAO' || t.tipo === 'APROVADO'));
    if (!resolvido) continue;
    if (resolvido.em < janela.inicio || resolvido.em > janela.fim) continue;
    resultado.push({
      protocolo: r.protocolo,
      ubs_origem: r.ubs.nome,
      registrada_em: pend.em.toISOString(),
      resolvida_em: resolvido.em.toISOString(),
      tempo_resolucao_horas: horas(resolvido.em.getTime() - pend.em.getTime()),
      motivo_categoria: categorizarMotivo(pend.descricao),
    });
  }
  return resultado.sort((a, b) => String(a.resolvida_em).localeCompare(String(b.resolvida_em)));
}

function categorizarMotivo(descricao: string): string {
  const t = descricao.toUpperCase();
  if (/DOCUMENT|LAUDO|ANEXO|EXAME/.test(t)) return 'DOCUMENTO_AUSENTE';
  if (/DADO|CPF|CART[ÃA]O|DIVERG/.test(t)) return 'DADOS_DIVERGENTES';
  if (/JUSTIFIC|CLIN/.test(t)) return 'JUSTIFICATIVA_INSUFICIENTE';
  return 'OUTRO';
}

export async function dadosTfdCustos(
  escopo: EscopoData,
  janela: JanelaPeriodo,
): Promise<LinhaDados[]> {
  // ViagemTFD já existe no schema
  const whereV: Prisma.ViagemTFDWhereInput = {
    dataIda: wherePeriodo(janela),
    paciente: {
      ubs: { prefeituraId: escopo.prefeituraId },
      ...(escopo.ubsId ? { ubsId: escopo.ubsId } : {}),
    },
  };
  const rows = await prisma.viagemTFD.findMany({
    where: whereV,
    select: {
      protocolo: true,
      destino: true,
      especialidade: true,
      dataIda: true,
      custoEstimadoBRL: true,
      status: true,
    },
    take: 50_000,
  });
  return rows.map((r) => ({
    protocolo: r.protocolo,
    destino: r.destino,
    especialidade: r.especialidade,
    data_viagem: r.dataIda.toISOString().slice(0, 10),
    valor: r.custoEstimadoBRL,
    status: r.status,
  }));
}

export async function dadosVacinacaoUbs(
  escopo: EscopoData,
  janela: JanelaPeriodo,
): Promise<LinhaDados[]> {
  type Row = { ubs: string; vacina: string; campanha: string; doses: bigint; faixa_etaria: string };
  const ubsFiltro = escopo.ubsId ? `AND p."ubsId" = '${escopo.ubsId}'` : '';
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `
    SELECT
      u.nome AS ubs,
      v.vacina,
      COALESCE(v.dose, 'N/A') AS campanha,
      COUNT(*)::bigint AS doses,
      CASE
        WHEN EXTRACT(YEAR FROM AGE(v.data, p."dataNascimento")) < 6 THEN '0-5'
        WHEN EXTRACT(YEAR FROM AGE(v.data, p."dataNascimento")) < 18 THEN '6-17'
        WHEN EXTRACT(YEAR FROM AGE(v.data, p."dataNascimento")) < 60 THEN '18-59'
        ELSE '60+'
      END AS faixa_etaria
    FROM vacinas_aplicadas v
    INNER JOIN pacientes p ON p.id = v."pacienteId"
    INNER JOIN ubs u ON u.id = p."ubsId"
    WHERE u."prefeituraId" = $1
      AND v.data BETWEEN $2 AND $3
      ${ubsFiltro}
    GROUP BY u.nome, v.vacina, v.dose, faixa_etaria
    ORDER BY u.nome, v.vacina
    `,
    escopo.prefeituraId,
    janela.inicio,
    janela.fim,
  );
  return rows.map((r) => ({
    ubs: r.ubs,
    vacina: r.vacina,
    campanha: r.campanha,
    doses: Number(r.doses),
    faixa_etaria: r.faixa_etaria,
  }));
}

export async function dadosBuscaAtiva(
  escopo: EscopoData,
  _janela: JanelaPeriodo,
  opts: { incluirNomes?: boolean } = {},
): Promise<LinhaDados[]> {
  // Pacientes sem atendimento há > 90 dias
  const limite = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const where: Prisma.PacienteWhereInput = {
    ubs: { prefeituraId: escopo.prefeituraId },
    ...(escopo.ubsId ? { ubsId: escopo.ubsId } : {}),
    OR: [
      { atendimentos: { none: {} } },
      { atendimentos: { every: { data: { lt: limite } } } },
    ],
  };

  if (!opts.incluirNomes) {
    // Modo agregado (default)
    type Row = { bairro: string; microarea: string; quantidade: bigint };
    const ubsFiltro = escopo.ubsId ? `AND p."ubsId" = '${escopo.ubsId}'` : '';
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `
      SELECT
        COALESCE(p.bairro, 'SEM_BAIRRO') AS bairro,
        COALESCE(p.microarea, 'SEM_MICROAREA') AS microarea,
        COUNT(*)::bigint AS quantidade
      FROM pacientes p
      INNER JOIN ubs u ON u.id = p."ubsId"
      WHERE u."prefeituraId" = $1
        ${ubsFiltro}
        AND NOT EXISTS (
          SELECT 1 FROM atendimentos a
          WHERE a."pacienteId" = p.id AND a.data > $2
        )
      GROUP BY p.bairro, p.microarea
      ORDER BY quantidade DESC
      `,
      escopo.prefeituraId,
      limite,
    );
    return rows.map((r) => ({
      bairro: r.bairro,
      microarea: r.microarea,
      quantidade: Number(r.quantidade),
    }));
  }

  // Modo nominal (opt-in, já validado upstream)
  const rows = await prisma.paciente.findMany({
    where,
    select: {
      nome: true,
      cpf: true,
      cartaoSus: true,
      telefone: true,
      bairro: true,
      microarea: true,
    },
    orderBy: { nome: 'asc' },
    take: 5000,
  });
  return rows.map((p) => ({
    bairro: p.bairro ?? 'SEM_BAIRRO',
    microarea: p.microarea ?? 'SEM_MICROAREA',
    quantidade: 1, // mantém coluna pra paridade de shape
    nome: p.nome,
    cartao_sus_mascarado: mascararCartaoSus(p.cartaoSus),
    telefone_mascarado: mascararTelefone(p.telefone),
    endereco_bairro: p.bairro ?? '',
    // CPF nunca sai em claro — é lei
    cpf_mascarado: mascararCpf(p.cpf),
  }));
}

export async function dadosProducaoIndividual(
  escopo: EscopoData,
  janela: JanelaPeriodo,
): Promise<LinhaDados[]> {
  // Se SELF → apenas o próprio atendente; se UBS → toda a UBS; se PREFEITURA → toda a prefeitura
  const whereAtendente: Prisma.AtendenteWhereInput = {
    ...(escopo.atendenteId ? { id: escopo.atendenteId } : {}),
    ...(escopo.ubsId ? { ubsId: escopo.ubsId } : { OR: [{ prefeituraId: escopo.prefeituraId }, { ubs: { prefeituraId: escopo.prefeituraId } }] }),
    deletadoEm: null,
  };
  const atendentes = await prisma.atendente.findMany({
    where: whereAtendente,
    select: { id: true, nome: true, matricula: true },
  });

  const periodo = `${janela.inicio.toISOString().slice(0, 10)} → ${janela.fim.toISOString().slice(0, 10)}`;
  const linhas: LinhaDados[] = [];

  for (const a of atendentes) {
    const encs = await prisma.encaminhamento.findMany({
      where: {
        atendenteId: a.id,
        criadoEm: wherePeriodo(janela),
      },
      select: { status: true, criadoEm: true, atualizadoEm: true },
    });
    const total = encs.length;
    if (total === 0) continue;
    const aprovados = encs.filter((e) => e.status === 'APROVADO').length;
    const pendencias = encs.filter((e) => e.status === 'PENDENCIA_DOCUMENTO').length;
    const tempos = encs
      .filter((e) => e.status === 'APROVADO')
      .map((e) => (e.atualizadoEm.getTime() - e.criadoEm.getTime()) / 60_000);
    const tempoMedio = tempos.length ? tempos.reduce((x, y) => x + y, 0) / tempos.length : 0;

    const partes = a.nome.split(/\s+/).filter(Boolean);
    const nomeCurto = partes.length <= 1 ? a.nome : `${partes[0]} ${partes[partes.length - 1]}`;

    linhas.push({
      atendente_nome: nomeCurto.toUpperCase(),
      matricula: a.matricula,
      periodo,
      total_ingeridos: total,
      aprovados,
      pendencias,
      tempo_medio_m: Math.round(tempoMedio * 10) / 10,
    });
  }
  return linhas.sort((a, b) => Number(b.total_ingeridos ?? 0) - Number(a.total_ingeridos ?? 0));
}
