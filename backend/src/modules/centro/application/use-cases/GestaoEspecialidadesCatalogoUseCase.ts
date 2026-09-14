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

const ESPECIALIDADES_ODONTO = [
  'endodontia',
  'endo',
  'periodontia',
  'perio',
  'cirurgia bucomaxilofacial',
  'bucomaxilofacial',
  'bucomaxilo',
  'odontopediatria',
  'pacientes com necessidades especiais',
  'pne',
  'prótese dentária',
  'protese dentaria',
  'prótese',
  'protese',
  'estomatologia',
  'ortodontia',
  'odontologia',
  'saúde bucal',
  'saude bucal',
  'dentística',
  'dentistica',
  'cirurgia oral',
  'implante',
  'implantodontia',
  'radiologia odontológica',
  'traumatologia bucomaxilofacial',
  'ceo'
];

export class GestaoEspecialidadesCatalogoUseCase {
  async listarEspecialidades(scope: AccessScope, centro?: string): Promise<EspecialidadeCatalogoDTO[]> {
    const where: any = { ativa: true };
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

    const lista = await prisma.especialidadeCatalogo.findMany({
      where,
      orderBy: { nome: 'asc' },
    });

    const dtoArray = lista.map((e) => ({
      id: e.id,
      nome: e.nome,
      codigoSigtap: e.codigoSigtap,
      tempoPadraoMinutos: e.tempoPadraoMinutos,
      valorTabelaBrl: e.valorTabelaBrl,
      documentosObrigatorios: e.documentosObrigatorios,
      preparoRequerido: e.preparoRequerido,
      ativa: e.ativa,
    }));

    if (!centro) return dtoArray;

    const centroNorm = centro.toUpperCase();
    const ehCeo = centroNorm === 'CEO' || centroNorm === 'CENTRO_ODONTOLOGICO';

    return dtoArray.filter((e) => {
      const esp = e.nome.toLowerCase();
      const eOdonto = ESPECIALIDADES_ODONTO.some((o) => o === 'pne' ? /\bpne\b/i.test(esp) : esp.includes(o));
      return ehCeo ? eOdonto : !eOdonto;
    });
  }

  async criarEspecialidade(data: EspecialidadeCatalogoDTO & { prefeituraId?: string }, scope: AccessScope, atendenteId: string): Promise<EspecialidadeCatalogoDTO> {
    let prefeituraId = data.prefeituraId;
    if (!prefeituraId) {
      if (scope.kind === 'PREFEITURA') prefeituraId = scope.prefeituraId;
      else if (scope.kind === 'UBS') prefeituraId = scope.prefeituraId;
    }
    if (!prefeituraId) {
      const pref = await prisma.prefeitura.findFirst({ where: { ativa: true } });
      if (pref) prefeituraId = pref.id;
    }

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
