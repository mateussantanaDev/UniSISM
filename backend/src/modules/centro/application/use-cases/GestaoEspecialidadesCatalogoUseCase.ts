import { prisma } from '../../../../infrastructure/database/prisma';
import { NotFound } from '../../../../shared/errors';
import type { AccessScope } from '../../../../shared/scope';

export interface EspecialidadeCatalogoDTO {
  id?: string;
  nome: string;
  codigoSigtap?: string | null;
  tempoPadraoMinutos: number;
  valorTabelaBrl: number;
  documentosObrigatorios: string[];
  preparoRequerido?: string | null;
  ativa?: boolean;
}

export class GestaoEspecialidadesCatalogoUseCase {
  async listarEspecialidades(scope: AccessScope): Promise<EspecialidadeCatalogoDTO[]> {
    const where: any = { ativa: true };
    if (scope.kind === 'PREFEITURA') {
      where.prefeituraId = scope.prefeituraId;
    }

    const lista = await prisma.especialidadeCatalogo.findMany({
      where,
      orderBy: { nome: 'asc' },
    });

    return lista.map((e) => ({
      id: e.id,
      nome: e.nome,
      codigoSigtap: e.codigoSigtap,
      tempoPadraoMinutos: e.tempoPadraoMinutos,
      valorTabelaBrl: e.valorTabelaBrl,
      documentosObrigatorios: e.documentosObrigatorios,
      preparoRequerido: e.preparoRequerido,
      ativa: e.ativa,
    }));
  }

  async criarEspecialidade(data: EspecialidadeCatalogoDTO, scope: AccessScope, atendenteId: string): Promise<EspecialidadeCatalogoDTO> {
    const prefeituraId = scope.kind === 'PREFEITURA' ? scope.prefeituraId : undefined;

    const res = await prisma.especialidadeCatalogo.create({
      data: {
        nome: data.nome,
        codigoSigtap: data.codigoSigtap || null,
        tempoPadraoMinutos: data.tempoPadraoMinutos || 20,
        valorTabelaBrl: data.valorTabelaBrl || 0,
        documentosObrigatorios: data.documentosObrigatorios || [],
        preparoRequerido: data.preparoRequerido || null,
        ativa: data.ativa !== undefined ? data.ativa : true,
        prefeituraId,
      },
    });

    await prisma.auditoriaLog.create({
      data: {
        acao: 'CENTRO_GESTAO_CRIAR_ESPECIALIDADE',
        recurso: 'CENTRO_ESPECIALIDADES',
        recursoId: res.id,
        atendenteId,
        payload: data as any,
      },
    });

    return {
      id: res.id,
      nome: res.nome,
      codigoSigtap: res.codigoSigtap,
      tempoPadraoMinutos: res.tempoPadraoMinutos,
      valorTabelaBrl: res.valorTabelaBrl,
      documentosObrigatorios: res.documentosObrigatorios,
      preparoRequerido: res.preparoRequerido,
      ativa: res.ativa,
    };
  }

  async atualizarEspecialidade(id: string, data: Partial<EspecialidadeCatalogoDTO>, scope: AccessScope, atendenteId: string): Promise<EspecialidadeCatalogoDTO> {
    const existing = await prisma.especialidadeCatalogo.findUnique({ where: { id } });
    if (!existing || !existing.ativa) {
      throw NotFound('ESPECIALIDADE_NAO_ENCONTRADA', 'Especialidade não encontrada');
    }
    if (scope.kind === 'PREFEITURA' && existing.prefeituraId && existing.prefeituraId !== scope.prefeituraId) {
      throw NotFound('ESPECIALIDADE_NAO_ENCONTRADA', 'Especialidade não encontrada');
    }

    const res = await prisma.especialidadeCatalogo.update({
      where: { id },
      data: {
        ...(data.nome && { nome: data.nome }),
        ...(data.codigoSigtap !== undefined && { codigoSigtap: data.codigoSigtap }),
        ...(data.tempoPadraoMinutos && { tempoPadraoMinutos: data.tempoPadraoMinutos }),
        ...(data.valorTabelaBrl !== undefined && { valorTabelaBrl: data.valorTabelaBrl }),
        ...(data.documentosObrigatorios && { documentosObrigatorios: data.documentosObrigatorios }),
        ...(data.preparoRequerido !== undefined && { preparoRequerido: data.preparoRequerido }),
        ...(data.ativa !== undefined && { ativa: data.ativa }),
      },
    });

    await prisma.auditoriaLog.create({
      data: {
        acao: 'CENTRO_GESTAO_ATUALIZAR_ESPECIALIDADE',
        recurso: 'CENTRO_ESPECIALIDADES',
        recursoId: id,
        atendenteId,
        payload: data as any,
      },
    });

    return {
      id: res.id,
      nome: res.nome,
      codigoSigtap: res.codigoSigtap,
      tempoPadraoMinutos: res.tempoPadraoMinutos,
      valorTabelaBrl: res.valorTabelaBrl,
      documentosObrigatorios: res.documentosObrigatorios,
      preparoRequerido: res.preparoRequerido,
      ativa: res.ativa,
    };
  }

  async deletarEspecialidade(id: string, scope: AccessScope, atendenteId: string): Promise<void> {
    const existing = await prisma.especialidadeCatalogo.findUnique({ where: { id } });
    if (!existing || !existing.ativa) {
      throw NotFound('ESPECIALIDADE_NAO_ENCONTRADA', 'Especialidade não encontrada');
    }
    if (scope.kind === 'PREFEITURA' && existing.prefeituraId && existing.prefeituraId !== scope.prefeituraId) {
      throw NotFound('ESPECIALIDADE_NAO_ENCONTRADA', 'Especialidade não encontrada');
    }

    await prisma.especialidadeCatalogo.update({
      where: { id },
      data: { ativa: false },
    });

    await prisma.auditoriaLog.create({
      data: {
        acao: 'CENTRO_GESTAO_DELETAR_ESPECIALIDADE',
        recurso: 'CENTRO_ESPECIALIDADES',
        recursoId: id,
        atendenteId,
      },
    });
  }
}
