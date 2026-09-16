import { prisma } from '../../../../infrastructure/database/prisma';
import { NotFound } from '../../../../shared/errors';
import type { AccessScope } from '../../../../shared/scope';

import { filterEspecialidadesByCentro } from '../../shared/centroClassifier';

export interface EscalaEspecialistaDTO {
  id?: string;
  medicoId?: string;
  medicoNome: string;
  crm: string;
  especialidade: string;
  tipoServico?: 'CONSULTA' | 'PROCEDIMENTO';
  procedimentoId?: string;
  diasSemana?: string[];
  horarioInicio: string;
  horarioFim: string;
  duracaoMinutos: number;
  vagasPorTurno: number;
  status?: 'ATIVA' | 'FERIAS' | 'LICENCA' | 'BLOQUEADA';
  ativo?: boolean;
  tipoRecorrencia?: 'SEMANAL' | 'QUINZENAL' | 'DATAS_ESPECIFICAS' | 'MUTIRAO';
  datasEspecificas?: string[];
  isMutirao?: boolean;
  intervaloDias?: number;
  dataInicioRecorrencia?: string;
}

export class GestaoEscalasUseCase {
  async listarEscalas(scope: AccessScope, centro?: string): Promise<EscalaEspecialistaDTO[]> {
    const where: any = { ativo: true };
    if (scope.kind === 'PREFEITURA') {
      where.OR = [
        { prefeituraId: scope.prefeituraId },
        { prefeituraId: null }
      ];
    } else if (scope.kind === 'UBS' && scope.prefeituraId) {
      where.OR = [
        { prefeituraId: scope.prefeituraId },
        { prefeituraId: null }
      ];
    }

    const escalas = await prisma.escalaEspecialista.findMany({
      where,
      orderBy: { medicoNome: 'asc' },
    });

    const dtoArray: EscalaEspecialistaDTO[] = escalas.map((e) => ({
      id: e.id,
      medicoId: e.medicoId ?? undefined,
      medicoNome: e.medicoNome,
      crm: e.crm,
      especialidade: e.especialidade,
      tipoServico: (e.tipoServico as 'CONSULTA' | 'PROCEDIMENTO') || 'CONSULTA',
      procedimentoId: e.procedimentoId ?? undefined,
      diasSemana: e.diasSemana,
      horarioInicio: e.horarioInicio,
      horarioFim: e.horarioFim,
      duracaoMinutos: e.duracaoMinutos,
      vagasPorTurno: e.vagasPorTurno,
      status: (e.status as any) || 'ATIVA',
      ativo: e.ativo,
      tipoRecorrencia: (e.tipoRecorrencia as any) || 'SEMANAL',
      datasEspecificas: e.datasEspecificas || [],
      isMutirao: e.isMutirao || false,
      intervaloDias: e.intervaloDias ?? 7,
      dataInicioRecorrencia: e.dataInicioRecorrencia ?? undefined,
    }));

    return filterEspecialidadesByCentro(dtoArray, centro);
  }

  async criarEscala(data: EscalaEspecialistaDTO & { prefeituraId?: string }, scope: AccessScope, atendenteId: string): Promise<EscalaEspecialistaDTO> {
    let prefeituraId = data.prefeituraId;
    if (!prefeituraId) {
      if (scope.kind === 'PREFEITURA') prefeituraId = scope.prefeituraId;
      else if (scope.kind === 'UBS') prefeituraId = scope.prefeituraId;
    }
    if (!prefeituraId) {
      const pref = await prisma.prefeitura.findFirst({ where: { ativa: true } });
      if (pref) prefeituraId = pref.id;
    }

    const res = await prisma.escalaEspecialista.create({
      data: {
        medicoId: data.medicoId,
        medicoNome: data.medicoNome,
        crm: data.crm,
        especialidade: data.especialidade,
        tipoServico: data.tipoServico || 'CONSULTA',
        procedimentoId: data.procedimentoId,
        diasSemana: data.diasSemana || [],
        horarioInicio: data.horarioInicio,
        horarioFim: data.horarioFim,
        duracaoMinutos: data.duracaoMinutos || 20,
        vagasPorTurno: data.vagasPorTurno || 12,
        status: data.status || 'ATIVA',
        tipoRecorrencia: data.tipoRecorrencia || 'SEMANAL',
        datasEspecificas: data.datasEspecificas || [],
        isMutirao: data.isMutirao || false,
        intervaloDias: data.intervaloDias ?? 7,
        dataInicioRecorrencia: data.dataInicioRecorrencia || null,
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
      medicoId: res.medicoId ?? undefined,
      medicoNome: res.medicoNome,
      crm: res.crm,
      especialidade: res.especialidade,
      tipoServico: (res.tipoServico as 'CONSULTA' | 'PROCEDIMENTO') || 'CONSULTA',
      procedimentoId: res.procedimentoId ?? undefined,
      diasSemana: res.diasSemana,
      horarioInicio: res.horarioInicio,
      horarioFim: res.horarioFim,
      duracaoMinutos: res.duracaoMinutos,
      vagasPorTurno: res.vagasPorTurno,
      status: (res.status as any) || 'ATIVA',
      ativo: res.ativo,
      tipoRecorrencia: (res.tipoRecorrencia as any) || 'SEMANAL',
      datasEspecificas: res.datasEspecificas || [],
      isMutirao: res.isMutirao || false,
      intervaloDias: res.intervaloDias ?? 7,
      dataInicioRecorrencia: res.dataInicioRecorrencia ?? undefined,
    };
  }

  async atualizarEscala(id: string, data: Partial<EscalaEspecialistaDTO>, scope: AccessScope, atendenteId: string): Promise<EscalaEspecialistaDTO> {
    const existing = await prisma.escalaEspecialista.findUnique({ where: { id } });
    if (!existing || !existing.ativo) {
      throw NotFound('ESCALA_NAO_ENCONTRADA', 'Escala não encontrada');
    }
    if (scope.kind === 'PREFEITURA' && existing.prefeituraId && existing.prefeituraId !== scope.prefeituraId) {
      throw NotFound('ESCALA_NAO_ENCONTRADA', 'Escala não encontrada');
    }

    const res = await prisma.escalaEspecialista.update({
      where: { id },
      data: {
        ...(data.medicoId !== undefined && { medicoId: data.medicoId }),
        ...(data.medicoNome && { medicoNome: data.medicoNome }),
        ...(data.crm && { crm: data.crm }),
        ...(data.especialidade && { especialidade: data.especialidade }),
        ...(data.tipoServico && { tipoServico: data.tipoServico }),
        ...(data.procedimentoId !== undefined && { procedimentoId: data.procedimentoId }),
        ...(data.diasSemana && { diasSemana: data.diasSemana }),
        ...(data.horarioInicio && { horarioInicio: data.horarioInicio }),
        ...(data.horarioFim && { horarioFim: data.horarioFim }),
        ...(data.duracaoMinutos && { duracaoMinutos: data.duracaoMinutos }),
        ...(data.vagasPorTurno && { vagasPorTurno: data.vagasPorTurno }),
        ...(data.status && { status: data.status as any }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
        ...(data.tipoRecorrencia && { tipoRecorrencia: data.tipoRecorrencia }),
        ...(data.datasEspecificas !== undefined && { datasEspecificas: data.datasEspecificas }),
        ...(data.isMutirao !== undefined && { isMutirao: data.isMutirao }),
        ...(data.intervaloDias !== undefined && { intervaloDias: data.intervaloDias }),
        ...(data.dataInicioRecorrencia !== undefined && { dataInicioRecorrencia: data.dataInicioRecorrencia }),
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
      medicoId: res.medicoId ?? undefined,
      medicoNome: res.medicoNome,
      crm: res.crm,
      especialidade: res.especialidade,
      tipoServico: (res.tipoServico as 'CONSULTA' | 'PROCEDIMENTO') || 'CONSULTA',
      procedimentoId: res.procedimentoId ?? undefined,
      diasSemana: res.diasSemana,
      horarioInicio: res.horarioInicio,
      horarioFim: res.horarioFim,
      duracaoMinutos: res.duracaoMinutos,
      vagasPorTurno: res.vagasPorTurno,
      status: (res.status as any) || 'ATIVA',
      ativo: res.ativo,
      tipoRecorrencia: (res.tipoRecorrencia as any) || 'SEMANAL',
      datasEspecificas: res.datasEspecificas || [],
      isMutirao: res.isMutirao || false,
      intervaloDias: res.intervaloDias ?? 7,
      dataInicioRecorrencia: res.dataInicioRecorrencia ?? undefined,
    };
  }

  async deletarEscala(id: string, scope: AccessScope, atendenteId: string): Promise<void> {
    const existing = await prisma.escalaEspecialista.findUnique({ where: { id } });
    if (!existing || !existing.ativo) {
      throw NotFound('ESCALA_NAO_ENCONTRADA', 'Escala não encontrada');
    }
    if (scope.kind === 'PREFEITURA' && existing.prefeituraId && existing.prefeituraId !== scope.prefeituraId) {
      throw NotFound('ESCALA_NAO_ENCONTRADA', 'Escala não encontrada');
    }

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
