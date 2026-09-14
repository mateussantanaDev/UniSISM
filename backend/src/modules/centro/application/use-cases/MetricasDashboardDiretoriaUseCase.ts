import { StatusEncaminhamento, StatusAtendimentoCentro, CanalRoteamento } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';

export interface DashboardDiretoriaDTO {
  hoje: {
    totalAgendados: number;
    aguardandoAtendimento: number;
    emAtendimento: number;
    concluidos: number;
    faltas: number;
  };
  mesAtual: {
    periodo: string;
    totalAgendados: number;
    totalConcluidos: number;
    totalFaltas: number;
    taxaAbsenteismoPorcento: number;
  };
  distribuicaoPorEspecialidade: Record<string, number>;
  distribuicaoPorUbs: Record<string, number>;
  totalEscalasAtivas: number;
}

const ESPECIALIDADES_ODONTO = [
  'endodontia',
  'periodontia',
  'cirurgia bucomaxilofacial',
  'bucomaxilo',
  'odontopediatria',
  'pacientes com necessidades especiais (pne)',
  'pne',
  'prótese dentária',
  'protese dentaria',
  'estomatologia',
  'ortodontia preventiva',
  'odontologia',
  'saúde bucal',
  'saude bucal',
];

export class MetricasDashboardDiretoriaUseCase {
  async exec(scope: AccessScope, centro?: string): Promise<DashboardDiretoriaDTO> {
    const now = new Date();
    const todayStr = now.toISOString().substring(0, 10);
    const startOfToday = new Date(`${todayStr}T00:00:00.000Z`);
    const endOfToday = new Date(`${todayStr}T23:59:59.999Z`);

    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();
    const startOfMonth = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0, 23, 59, 59, 999));

    const centroNorm = centro ? centro.toUpperCase() : undefined;
    const ehCeo = centroNorm === 'CEO' || centroNorm === 'CENTRO_ODONTOLOGICO';

    const whereBase: any = {
      deletadoEm: null,
      ...(centro
        ? ehCeo
          ? {
              OR: [
                { canalRoteamento: CanalRoteamento.CENTRO_ODONTOLOGICO },
                { destinoRegulacao: 'CENTRO_ODONTOLOGICO' as any },
                { localAgendamento: { contains: 'CEO', mode: 'insensitive' } },
                { especialidadeSolicitada: { contains: 'Odonto', mode: 'insensitive' } },
                { especialidadeSolicitada: { contains: 'Bucomaxilo', mode: 'insensitive' } },
                { especialidadeSolicitada: { contains: 'Endodont', mode: 'insensitive' } },
                { especialidadeSolicitada: { contains: 'Periodont', mode: 'insensitive' } },
                { especialidadeSolicitada: { contains: 'Prótese', mode: 'insensitive' } },
                { especialidadeSolicitada: { contains: 'Protese', mode: 'insensitive' } },
                { especialidadeSolicitada: { contains: 'Estomatol', mode: 'insensitive' } },
              ],
            }
          : {
              OR: [
                { canalRoteamento: CanalRoteamento.CENTRO_ESPECIALIDADES },
                { destinoRegulacao: 'CENTRO_ESPECIALIDADES' as any },
                {
                  AND: [
                    { canalRoteamento: null, destinoRegulacao: null },
                    { NOT: { especialidadeSolicitada: { contains: 'Odonto', mode: 'insensitive' } } },
                    { NOT: { especialidadeSolicitada: { contains: 'Bucomaxilo', mode: 'insensitive' } } },
                    { NOT: { localAgendamento: { contains: 'CEO', mode: 'insensitive' } } },
                  ],
                },
              ],
            }
        : {
            canalRoteamento: { in: [CanalRoteamento.CENTRO_ESPECIALIDADES, CanalRoteamento.CENTRO_ODONTOLOGICO] },
          }),
    };

    if (scope.kind === 'PREFEITURA') {
      whereBase.ubs = { prefeituraId: scope.prefeituraId };
    }

    const [agendamentosHoje, agendamentosMes, escalas] = await Promise.all([
      prisma.encaminhamento.findMany({
        where: {
          ...whereBase,
          status: StatusEncaminhamento.APROVADO,
          agendamentoPrevisto: { gte: startOfToday, lte: endOfToday },
        },
        select: { statusAtendimentoCentro: true },
      }),
      prisma.encaminhamento.findMany({
        where: {
          ...whereBase,
          status: StatusEncaminhamento.APROVADO,
          agendamentoPrevisto: { gte: startOfMonth, lte: endOfMonth },
        },
        select: {
          especialidadeSolicitada: true,
          statusAtendimentoCentro: true,
          ubs: { select: { nome: true } },
        },
      }),
      prisma.escalaEspecialista.findMany({
        where: {
          ativo: true,
          ...((scope.kind === 'PREFEITURA' || scope.kind === 'UBS') && scope.prefeituraId
            ? { OR: [{ prefeituraId: scope.prefeituraId }, { prefeituraId: null }] }
            : {}),
        },
        select: { especialidade: true },
      }),
    ]);

    const totalEscalasAtivas = centro
      ? escalas.filter((e) => {
          const esp = e.especialidade.toLowerCase();
          const eOdonto = ESPECIALIDADES_ODONTO.some((o) => esp.includes(o));
          return ehCeo ? eOdonto : !eOdonto;
        }).length
      : escalas.length;

    // Calculate Today metrics
    let aguardando = 0;
    let emAtendimento = 0;
    let concluidosHoje = 0;
    let faltasHoje = 0;

    for (const item of agendamentosHoje) {
      if (item.statusAtendimentoCentro === StatusAtendimentoCentro.AGUARDANDO_ATENDIMENTO) aguardando++;
      else if (item.statusAtendimentoCentro === StatusAtendimentoCentro.EM_ATENDIMENTO) emAtendimento++;
      else if (item.statusAtendimentoCentro === StatusAtendimentoCentro.CONCLUIDO) concluidosHoje++;
      else if (item.statusAtendimentoCentro === StatusAtendimentoCentro.FALTOU) faltasHoje++;
    }

    // Calculate Month metrics
    let concluidosMes = 0;
    let faltasMes = 0;
    const distEspecialidade: Record<string, number> = {};
    const distUbs: Record<string, number> = {};

    for (const item of agendamentosMes) {
      if (item.statusAtendimentoCentro === StatusAtendimentoCentro.CONCLUIDO) concluidosMes++;
      else if (item.statusAtendimentoCentro === StatusAtendimentoCentro.FALTOU) faltasMes++;

      const esp = item.especialidadeSolicitada || 'Geral';
      distEspecialidade[esp] = (distEspecialidade[esp] || 0) + 1;

      const ubsNome = item.ubs?.nome || 'Não informada';
      distUbs[ubsNome] = (distUbs[ubsNome] || 0) + 1;
    }

    const totalMes = agendamentosMes.length;
    const taxaAbsenteismo = totalMes > 0 ? Number(((faltasMes / totalMes) * 100).toFixed(1)) : 0;
    const periodoStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

    return {
      hoje: {
        totalAgendados: agendamentosHoje.length,
        aguardandoAtendimento: aguardando,
        emAtendimento,
        concluidos: concluidosHoje,
        faltas: faltasHoje,
      },
      mesAtual: {
        periodo: periodoStr,
        totalAgendados: totalMes,
        totalConcluidos: concluidosMes,
        totalFaltas: faltasMes,
        taxaAbsenteismoPorcento: taxaAbsenteismo,
      },
      distribuicaoPorEspecialidade: distEspecialidade,
      distribuicaoPorUbs: distUbs,
      totalEscalasAtivas,
    };
  }
}
