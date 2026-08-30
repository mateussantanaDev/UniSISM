import { StatusEncaminhamento, CanalRoteamento, StatusAgendamentoCentro } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';

export interface RelatorioBpaInput {
  periodo?: string; // YYYY-MM (e.g. 2026-07)
}

export interface RelatorioBpaItemDTO {
  protocolo: string;
  pacienteNome: string;
  pacienteCpf: string;
  pacienteCartaoSus: string;
  especialidade: string;
  codigoSigtap?: string;
  procedimentoNome?: string;
  quantidade: number;
  cid10: string;
  profissional: string;
  dataAgendada: string;
  origem: 'ENCAMINHAMENTO' | 'BALCAO_CENTRO';
}

export interface RelatorioBpaDTO {
  periodo: string;
  totalAtendimentos: number;
  totalProcedimentos: number;
  porEspecialidade: Record<string, number>;
  porPrioridade: Record<string, number>;
  porProcedimentoSigtap: Record<string, number>;
  itens: RelatorioBpaItemDTO[];
}

export class RelatorioBpaUseCase {
  async exec(input: RelatorioBpaInput, scope: AccessScope): Promise<RelatorioBpaDTO> {
    const periodo = input.periodo || new Date().toISOString().substring(0, 7);
    const [year, month] = periodo.split('-').map(Number);

    const startOfMonth = new Date(Date.UTC(year!, month! - 1, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year!, month!, 0, 23, 59, 59, 999));

    // 1. Encaminhamentos aprovados / agendados para o Centro
    const whereEnc: any = {
      canalRoteamento: { in: [CanalRoteamento.CENTRO_ESPECIALIDADES, CanalRoteamento.CENTRO_ODONTOLOGICO] },
      status: StatusEncaminhamento.APROVADO,
      agendamentoPrevisto: { gte: startOfMonth, lte: endOfMonth },
      deletadoEm: null,
    };

    if (scope.kind === 'PREFEITURA') {
      whereEnc.ubs = { prefeituraId: scope.prefeituraId };
    } else if (scope.kind === 'UBS') {
      whereEnc.ubsId = scope.ubsId;
    }

    // 2. Agendamentos diretos do Balcão do Centro de Especialidades
    const whereCentro: any = {
      dataAgendamento: { gte: startOfMonth, lte: endOfMonth },
      status: { not: StatusAgendamentoCentro.CANCELADO },
    };

    if (scope.kind === 'PREFEITURA') {
      whereCentro.prefeituraId = scope.prefeituraId;
    }

    const [encRows, centroRows] = await Promise.all([
      prisma.encaminhamento.findMany({
        where: whereEnc,
        orderBy: { agendamentoPrevisto: 'asc' },
      }),
      prisma.agendamentoCentro.findMany({
        where: whereCentro,
        include: {
          paciente: { select: { nome: true, cpf: true, cartaoSus: true } },
          procedimentos: true,
        },
        orderBy: { dataAgendamento: 'asc' },
      }),
    ]);

    const porEspecialidade: Record<string, number> = {};
    const porPrioridade: Record<string, number> = {};
    const porProcedimentoSigtap: Record<string, number> = {};
    const itens: RelatorioBpaItemDTO[] = [];

    // Processa encaminhamentos
    for (const r of encRows) {
      const esp = r.especialidadeSolicitada || 'Clínica Geral';
      porEspecialidade[esp] = (porEspecialidade[esp] || 0) + 1;

      const prio = r.prioridade || 'ELETIVA';
      porPrioridade[prio] = (porPrioridade[prio] || 0) + 1;

      itens.push({
        protocolo: r.protocolo,
        pacienteNome: r.pacienteNome,
        pacienteCpf: r.pacienteCpf,
        pacienteCartaoSus: r.pacienteCartaoSus || '',
        especialidade: esp,
        quantidade: 1,
        cid10: r.cid10 || '',
        profissional: r.profissionalAgendado || 'A definir',
        dataAgendada: r.agendamentoPrevisto ? r.agendamentoPrevisto.toISOString().substring(0, 10) : '',
        origem: 'ENCAMINHAMENTO',
      });
    }

    // Processa agendamentos diretos e procedimentos realizados
    let countProcedimentosRealizados = 0;
    for (const c of centroRows) {
      const esp = c.especialidade || 'Consulta Especializada';
      porEspecialidade[esp] = (porEspecialidade[esp] || 0) + 1;

      if (c.procedimentos && c.procedimentos.length > 0) {
        for (const proc of c.procedimentos) {
          countProcedimentosRealizados += proc.quantidade;
          const sigtapKey = proc.codigoSigtap ? `${proc.codigoSigtap} - ${proc.nome}` : proc.nome;
          porProcedimentoSigtap[sigtapKey] = (porProcedimentoSigtap[sigtapKey] || 0) + proc.quantidade;

          itens.push({
            protocolo: c.protocolo,
            pacienteNome: c.paciente.nome,
            pacienteCpf: c.paciente.cpf,
            pacienteCartaoSus: c.paciente.cartaoSus || '',
            especialidade: esp,
            codigoSigtap: proc.codigoSigtap || undefined,
            procedimentoNome: proc.nome,
            quantidade: proc.quantidade,
            cid10: '',
            profissional: c.medicoNome || 'A definir',
            dataAgendada: c.dataAgendamento.toISOString().substring(0, 10),
            origem: 'BALCAO_CENTRO',
          });
        }
      } else {
        itens.push({
          protocolo: c.protocolo,
          pacienteNome: c.paciente.nome,
          pacienteCpf: c.paciente.cpf,
          pacienteCartaoSus: c.paciente.cartaoSus || '',
          especialidade: esp,
          procedimentoNome: c.procedimentoNome || undefined,
          quantidade: 1,
          cid10: '',
          profissional: c.medicoNome || 'A definir',
          dataAgendada: c.dataAgendamento.toISOString().substring(0, 10),
          origem: 'BALCAO_CENTRO',
        });
      }
    }

    return {
      periodo,
      totalAtendimentos: encRows.length + centroRows.length,
      totalProcedimentos: encRows.length + Math.max(centroRows.length, countProcedimentosRealizados),
      porEspecialidade,
      porPrioridade,
      porProcedimentoSigtap,
      itens,
    };
  }
}
