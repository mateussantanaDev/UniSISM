import { prisma } from '../../infrastructure/database/prisma';
import { NotFound } from '../../shared/errors';
import { iniciais } from '../utils/iniciais';
import { ymd } from '../../infrastructure/database/mappers';
import type { AtendentePerfil } from '../../domain/entities/Atendente';
import { StatusEncaminhamento } from '../../../generated/prisma';

const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'] as const;

function fmtDuracao(ms: number): string {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

function fmtBR(d: Date): string {
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour12: false })}`;
}

export class GetProfileUseCase {
  async exec(atendenteId: string): Promise<AtendentePerfil> {
    const a = await prisma.atendente.findUnique({
      where: { id: atendenteId },
      include: { ubs: { include: { prefeitura: true } }, prefeitura: true },
    });
    if (!a) throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');

    const inicioHoje = new Date();
    inicioHoje.setHours(0, 0, 0, 0);
    const inicioSemana = new Date(inicioHoje);
    inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
    const inicioMes = new Date(inicioHoje.getFullYear(), inicioHoje.getMonth(), 1);
    const inicioAno = new Date(inicioHoje.getFullYear(), 0, 1);

    const ubsParaRanking = a.ubsId ?? '__sem_ubs__';

    const [hoje, semana, mes, ano, total, aprovados, todosUbs, ultimas, sessaoAtiva, falhasSemana, atividades] =
      await Promise.all([
        prisma.encaminhamento.count({
          where: { atendenteId, criadoEm: { gte: inicioHoje } },
        }),
        prisma.encaminhamento.count({
          where: { atendenteId, criadoEm: { gte: inicioSemana } },
        }),
        prisma.encaminhamento.count({
          where: { atendenteId, criadoEm: { gte: inicioMes } },
        }),
        prisma.encaminhamento.count({
          where: { atendenteId, criadoEm: { gte: inicioAno } },
        }),
        prisma.encaminhamento.count({ where: { atendenteId } }),
        prisma.encaminhamento.count({
          where: { atendenteId, status: StatusEncaminhamento.APROVADO },
        }),
        prisma.atendente.findMany({
          where: { ubsId: ubsParaRanking },
          include: { _count: { select: { encaminhamentos: { where: { criadoEm: { gte: inicioMes } } } } } },
        }),
        prisma.encaminhamento.findMany({
          where: { atendenteId },
          select: { criadoEm: true, atualizadoEm: true, especialidadeSolicitada: true },
          take: 200,
          orderBy: { criadoEm: 'desc' },
        }),
        prisma.sessao.findFirst({
          where: { atendenteId, revogadaEm: null, expiraEm: { gt: new Date() } },
          orderBy: { ultimoUsoEm: 'desc' },
        }),
        prisma.tentativaLogin.count({
          where: {
            atendenteId,
            sucesso: false,
            criadoEm: { gte: inicioSemana },
          },
        }),
        prisma.atividadeAtendente.findMany({
          where: { atendenteId },
          orderBy: { em: 'desc' },
          take: 20,
        }),
      ]);

    // Ranking pelo total de encaminhamentos do mês na UBS
    const ranking =
      todosUbs
        .sort((x, y) => y._count.encaminhamentos - x._count.encaminhamentos)
        .findIndex((x) => x.id === atendenteId) + 1;

    // Produção por dia da semana
    const porDiaMap = new Map<string, number>();
    for (const d of DIAS) porDiaMap.set(d, 0);
    for (const e of ultimas) {
      const idx = e.criadoEm.getDay();
      const label = DIAS[idx] ?? 'DOM';
      porDiaMap.set(label, (porDiaMap.get(label) ?? 0) + 1);
    }
    const porDia = DIAS.map((d) => ({ dia: d, volume: porDiaMap.get(d) ?? 0 }));

    // Produção por especialidade
    const espMap = new Map<string, number>();
    for (const e of ultimas) {
      const k = e.especialidadeSolicitada || 'N/D';
      espMap.set(k, (espMap.get(k) ?? 0) + 1);
    }
    const porEspecialidade = [...espMap.entries()]
      .map(([nome, volume]) => ({ nome, volume }))
      .sort((x, y) => y.volume - x.volume)
      .slice(0, 5);

    // Tempo médio
    const tempos = ultimas
      .map((e) => Math.max(0, e.atualizadoEm.getTime() - e.criadoEm.getTime()))
      .filter((t) => t > 0);
    const tempoMedioMs = tempos.length ? tempos.reduce((x, y) => x + y, 0) / tempos.length : 0;

    const taxa = total > 0 ? Number(((aprovados / total) * 100).toFixed(1)) : 0;

    const agora = new Date();

    return {
      nome: a.nome,
      iniciais: iniciais(a.nome),
      matricula: a.matricula,
      email: a.email,
      cpf: a.cpf,
      telefone: a.telefone ?? '',
      dataNascimento: ymd(a.dataNascimento),
      cargo:
        a.tipoUnidade === 'SMS' || a.role === 'REGULADOR_SMS'
          ? a.role === 'ADMIN'
            ? 'Diretor(a) / Gestor(a) da SMS'
            : (a.cargo || '').toUpperCase().includes('REGULADOR') || a.role === 'REGULADOR_SMS'
              ? 'Regulador(a) da SMS'
              : 'Gestor(a) da SMS'
          : a.cargo ?? 'Profissional da Saúde',
      funcao: a.funcao ?? 'Regulação e Gestão',
      role: a.role,
      tipoUnidade: a.tipoUnidade ?? undefined,
      lotacao: a.ubs
        ? `${a.ubs.nome} · ${a.ubs.municipio} / ${a.ubs.uf}`
        : a.prefeitura
          ? `${a.prefeitura.nome} · ${a.prefeitura.municipio} / ${a.prefeitura.uf}`
          : 'Acesso global · DESENVOLVEDOR',
      unidade: a.ubs?.nome ?? a.prefeitura?.nome ?? 'GLOBAL',
      dataAdmissao: ymd(a.dataAdmissao),
      producao: {
        hoje,
        semana,
        mes,
        ano,
        tempoMedio: fmtDuracao(tempoMedioMs),
        taxaAprovacao: taxa,
        ranking: Math.max(ranking, 1),
        totalAtendentes: todosUbs.length,
        metaMes: 970,
        porDia,
        porEspecialidade,
      },
      seguranca: {
        senhaAlteradaEm: ymd(a.senhaAlteradaEm),
        twoFAAtivo: a.twoFAAtivo,
        metodoTwoFA: a.metodoTwoFA ?? 'Nenhum',
        ultimoAcesso: sessaoAtiva ? fmtBR(sessaoAtiva.ultimoUsoEm) : '—',
        ipUltimoAcesso: sessaoAtiva?.ip ?? '—',
        dispositivo: sessaoAtiva?.dispositivo ?? sessaoAtiva?.userAgent ?? '—',
        localUltimoAcesso: sessaoAtiva?.local ?? '—',
        tentativasFalhasSemana: falhasSemana,
        sessoesAtivas: sessaoAtiva ? 1 : 0,
        sessaoInatividade: sessaoAtiva
          ? fmtDuracao(agora.getTime() - sessaoAtiva.ultimoUsoEm.getTime())
          : '0s',
        sessaoExpiraEm: sessaoAtiva
          ? fmtDuracao(sessaoAtiva.expiraEm.getTime() - agora.getTime())
          : '0s',
      },
      atividadeRecente: atividades.map((x) => ({
        em: fmtBR(x.em),
        acao: x.acao,
        ...(x.alvo ? { alvo: x.alvo } : {}),
      })),
    };
  }
}
