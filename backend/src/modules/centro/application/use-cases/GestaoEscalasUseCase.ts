import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';

export interface EscalaEspecialistaDTO {
  id?: string;
  medicoNome: string;
  crm: string;
  especialidade: string;
  diasSemana: string[];
  horarioInicio: string;
  horarioFim: string;
  duracaoMinutos: number;
  vagasPorTurno: number;
  ativo?: boolean;
}

export class GestaoEscalasUseCase {
  async listarEscalas(scope: AccessScope): Promise<EscalaEspecialistaDTO[]> {
    const where: any = { ativo: true };
    if (scope.kind === 'PREFEITURA') {
      where.prefeituraId = scope.prefeituraId;
    }

    const escalas = await prisma.escalaEspecialista.findMany({
      where,
      orderBy: { medicoNome: 'asc' },
    });

    return escalas.map((e) => ({
      id: e.id,
      medicoNome: e.medicoNome,
      crm: e.crm,
      especialidade: e.especialidade,
      diasSemana: e.diasSemana,
      horarioInicio: e.horarioInicio,
      horarioFim: e.horarioFim,
      duracaoMinutos: e.duracaoMinutos,
      vagasPorTurno: e.vagasPorTurno,
      ativo: e.ativo,
    }));
  }

  async criarEscala(data: EscalaEspecialistaDTO, scope: AccessScope, atendenteId: string): Promise<EscalaEspecialistaDTO> {
    const prefeituraId = scope.kind === 'PREFEITURA' ? scope.prefeituraId : undefined;

    const res = await prisma.escalaEspecialista.create({
      data: {
        medicoNome: data.medicoNome,
        crm: data.crm,
        especialidade: data.especialidade,
        diasSemana: data.diasSemana,
        horarioInicio: data.horarioInicio,
        horarioFim: data.horarioFim,
        duracaoMinutos: data.duracaoMinutos || 20,
        vagasPorTurno: data.vagasPorTurno || 12,
        prefeituraId,
      },
    });

    await prisma.auditoriaLog.create({
      data: {
        acao: 'CENTRO_GESTAO_CRIAR_ESCALA',
        recurso: 'CENTRO_ESPECIALIDADES',
        recursoId: res.id,
        atendenteId,
        payload: data as any,
      },
    });

    return {
      id: res.id,
      medicoNome: res.medicoNome,
      crm: res.crm,
      especialidade: res.especialidade,
      diasSemana: res.diasSemana,
      horarioInicio: res.horarioInicio,
      horarioFim: res.horarioFim,
      duracaoMinutos: res.duracaoMinutos,
      vagasPorTurno: res.vagasPorTurno,
      ativo: res.ativo,
    };
  }

  async atualizarEscala(id: string, data: Partial<EscalaEspecialistaDTO>, atendenteId: string): Promise<EscalaEspecialistaDTO> {
    const res = await prisma.escalaEspecialista.update({
      where: { id },
      data: {
        ...(data.medicoNome && { medicoNome: data.medicoNome }),
        ...(data.crm && { crm: data.crm }),
        ...(data.especialidade && { especialidade: data.especialidade }),
        ...(data.diasSemana && { diasSemana: data.diasSemana }),
        ...(data.horarioInicio && { horarioInicio: data.horarioInicio }),
        ...(data.horarioFim && { horarioFim: data.horarioFim }),
        ...(data.duracaoMinutos && { duracaoMinutos: data.duracaoMinutos }),
        ...(data.vagasPorTurno && { vagasPorTurno: data.vagasPorTurno }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
      },
    });

    await prisma.auditoriaLog.create({
      data: {
        acao: 'CENTRO_GESTAO_ATUALIZAR_ESCALA',
        recurso: 'CENTRO_ESPECIALIDADES',
        recursoId: id,
        atendenteId,
        payload: data as any,
      },
    });

    return {
      id: res.id,
      medicoNome: res.medicoNome,
      crm: res.crm,
      especialidade: res.especialidade,
      diasSemana: res.diasSemana,
      horarioInicio: res.horarioInicio,
      horarioFim: res.horarioFim,
      duracaoMinutos: res.duracaoMinutos,
      vagasPorTurno: res.vagasPorTurno,
      ativo: res.ativo,
    };
  }

  async deletarEscala(id: string, atendenteId: string): Promise<void> {
    await prisma.escalaEspecialista.update({
      where: { id },
      data: { ativo: false },
    });

    await prisma.auditoriaLog.create({
      data: {
        acao: 'CENTRO_GESTAO_DELETAR_ESCALA',
        recurso: 'CENTRO_ESPECIALIDADES',
        recursoId: id,
        atendenteId,
      },
    });
  }
}
