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

export class MetricasDashboardDiretoriaUseCase {
  async exec(scope: AccessScope): Promise<DashboardDiretoriaDTO> {
    const now = new Date();
    const todayStr = now.toISOString().substring(0, 10);
    const startOfToday = new Date(`${todayStr}T00:00:00.000Z`);
    const endOfToday = new Date(`${todayStr}T23:59:59.999Z`);

    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();
    const startOfMonth = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0, 23, 59, 59, 999));

    const whereBase: any = {
      canalRoteamento: { in: [CanalRoteamento.CENTRO_ESPECIALIDADES, CanalRoteamento.CENTRO_ODONTOLOGICO] },
      deletadoEm: null,
    };

    if (scope.kind === 'PREFEITURA') {
      whereBase.ubs = { prefeituraId: scope.prefeituraId };
    }

    const [agendamentosHoje, agendamentosMes, escalasCount] = await Promise.all([
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
      prisma.escalaEspecialista.count({
        where: {
          ativo: true,
          ...(scope.kind === 'PREFEITURA' ? { prefeituraId: scope.prefeituraId } : {}),
        },
      }),
    ]);

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
      totalEscalasAtivas: escalasCount,
    };
  }
}
