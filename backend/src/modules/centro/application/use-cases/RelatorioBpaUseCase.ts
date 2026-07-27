import { StatusEncaminhamento, CanalRoteamento } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';

export interface RelatorioBpaInput {
  periodo?: string; // YYYY-MM (e.g. 2026-07)
}

export interface RelatorioBpaDTO {
  periodo: string;
  totalAtendimentos: number;
  porEspecialidade: Record<string, number>;
  porPrioridade: Record<string, number>;
  itens: Array<{
    protocolo: string;
    pacienteNome: string;
    pacienteCpf: string;
    pacienteCartaoSus: string;
    especialidade: string;
    cid10: string;
    profissional: string;
    dataAgendada: string;
  }>;
}

export class RelatorioBpaUseCase {
  async exec(input: RelatorioBpaInput, scope: AccessScope): Promise<RelatorioBpaDTO> {
    const periodo = input.periodo || new Date().toISOString().substring(0, 7);
    const [year, month] = periodo.split('-').map(Number);
    
    const startOfMonth = new Date(Date.UTC(year!, month! - 1, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year!, month!, 0, 23, 59, 59, 999));

    const where: any = {
      canalRoteamento: CanalRoteamento.CENTRO_ESPECIALIDADES,
      status: StatusEncaminhamento.APROVADO,
      agendamentoPrevisto: { gte: startOfMonth, lte: endOfMonth },
    };

    if (scope.kind === 'PREFEITURA') {
      where.ubs = { prefeituraId: scope.prefeituraId };
    }

    const rows = await prisma.encaminhamento.findMany({
      where,
      orderBy: { agendamentoPrevisto: 'asc' },
    });

    const porEspecialidade: Record<string, number> = {};
    const porPrioridade: Record<string, number> = {};

    const itens = rows.map((r) => {
      const esp = r.especialidadeSolicitada || 'Geral';
      porEspecialidade[esp] = (porEspecialidade[esp] || 0) + 1;

      const prio = r.prioridade || 'ELETIVA';
      porPrioridade[prio] = (porPrioridade[prio] || 0) + 1;

      return {
        protocolo: r.protocolo,
        pacienteNome: r.pacienteNome,
        pacienteCpf: r.pacienteCpf,
        pacienteCartaoSus: r.pacienteCartaoSus,
        especialidade: esp,
        cid10: r.cid10,
        profissional: r.profissionalAgendado || 'A definir',
        dataAgendada: r.agendamentoPrevisto ? r.agendamentoPrevisto.toISOString().substring(0, 10) : '',
      };
    });

    return {
      periodo,
      totalAtendimentos: rows.length,
      porEspecialidade,
      porPrioridade,
      itens,
    };
  }
}
