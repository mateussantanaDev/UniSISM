import { StatusSalaConsultorio } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { NotFound } from '../../../../shared/errors';
import type { AccessScope } from '../../../../shared/scope';

export interface SalaConsultorioDTO {
  id?: string;
  codigo: string;
  nome: string;
  especialidadePrincipal: string;
  status: 'DISPONIVEL' | 'EM_ATENDIMENTO' | 'MANUTENCAO' | 'RESERVADA';
  equipamentos: string[];
  ala?: string | null;
}

export class GestaoSalasUseCase {
  async listarSalas(scope: AccessScope): Promise<SalaConsultorioDTO[]> {
    const where: any = {};
    if (scope.kind === 'PREFEITURA') {
      where.prefeituraId = scope.prefeituraId;
    }

    const salas = await prisma.salaConsultorio.findMany({
      where,
      orderBy: { codigo: 'asc' },
    });

    return salas.map((s) => ({
      id: s.id,
      codigo: s.codigo,
      nome: s.nome,
      especialidadePrincipal: s.especialidadePrincipal,
      status: s.status as any,
      equipamentos: s.equipamentos,
      ala: s.ala,
    }));
  }

  async criarSala(data: SalaConsultorioDTO, scope: AccessScope, atendenteId: string): Promise<SalaConsultorioDTO> {
    const prefeituraId = scope.kind === 'PREFEITURA' ? scope.prefeituraId : undefined;

    const res = await prisma.salaConsultorio.create({
      data: {
        codigo: data.codigo,
        nome: data.nome,
        especialidadePrincipal: data.especialidadePrincipal,
        status: (data.status as StatusSalaConsultorio) || StatusSalaConsultorio.DISPONIVEL,
        equipamentos: data.equipamentos || [],
        ala: data.ala || null,
        prefeituraId,
      },
    });

    await prisma.auditoriaLog.create({
      data: {
        acao: 'CENTRO_GESTAO_CRIAR_SALA',
        recurso: 'CENTRO_ESPECIALIDADES',
        recursoId: res.id,
        atendenteId,
        payload: data as any,
      },
    });

    return {
      id: res.id,
      codigo: res.codigo,
      nome: res.nome,
      especialidadePrincipal: res.especialidadePrincipal,
      status: res.status as any,
      equipamentos: res.equipamentos,
      ala: res.ala,
    };
  }

  async atualizarSala(id: string, data: Partial<SalaConsultorioDTO>, scope: AccessScope, atendenteId: string): Promise<SalaConsultorioDTO> {
    const existing = await prisma.salaConsultorio.findUnique({ where: { id } });
    if (!existing) {
      throw NotFound('SALA_NAO_ENCONTRADA', 'Sala não encontrada');
    }
    if (scope.kind === 'PREFEITURA' && existing.prefeituraId && existing.prefeituraId !== scope.prefeituraId) {
      throw NotFound('SALA_NAO_ENCONTRADA', 'Sala não encontrada');
    }

    const res = await prisma.salaConsultorio.update({
      where: { id },
      data: {
        ...(data.codigo && { codigo: data.codigo }),
        ...(data.nome && { nome: data.nome }),
        ...(data.especialidadePrincipal && { especialidadePrincipal: data.especialidadePrincipal }),
        ...(data.status && { status: data.status as StatusSalaConsultorio }),
        ...(data.equipamentos && { equipamentos: data.equipamentos }),
        ...(data.ala !== undefined && { ala: data.ala }),
      },
    });

    await prisma.auditoriaLog.create({
      data: {
        acao: 'CENTRO_GESTAO_ATUALIZAR_SALA',
        recurso: 'CENTRO_ESPECIALIDADES',
        recursoId: id,
        atendenteId,
        payload: data as any,
      },
    });

    return {
      id: res.id,
      codigo: res.codigo,
      nome: res.nome,
      especialidadePrincipal: res.especialidadePrincipal,
      status: res.status as any,
      equipamentos: res.equipamentos,
      ala: res.ala,
    };
  }

  async deletarSala(id: string, scope: AccessScope, atendenteId: string): Promise<void> {
    const existing = await prisma.salaConsultorio.findUnique({ where: { id } });
    if (!existing) {
      throw NotFound('SALA_NAO_ENCONTRADA', 'Sala não encontrada');
    }
    if (scope.kind === 'PREFEITURA' && existing.prefeituraId && existing.prefeituraId !== scope.prefeituraId) {
      throw NotFound('SALA_NAO_ENCONTRADA', 'Sala não encontrada');
    }

    await prisma.salaConsultorio.delete({
      where: { id },
    });

    await prisma.auditoriaLog.create({
      data: {
        acao: 'CENTRO_GESTAO_DELETAR_SALA',
        recurso: 'CENTRO_ESPECIALIDADES',
        recursoId: id,
        atendenteId,
      },
    });
  }
}
