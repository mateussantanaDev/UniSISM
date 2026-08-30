import { StatusEncaminhamento, CanalRoteamento } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { NotFound } from '../../../../shared/errors';
import type { AccessScope } from '../../../../shared/scope';

export interface CotaUbsDTO {
  ubsId: string;
  ubsNome: string;
  totalCotasMes: number;
  alocadas: number;
  disponiveis: number;
  status: 'NORMAL' | 'CRITICO' | 'ESGOTADO';
  especialidades: Record<string, number>;
}

export class GestaoCotasUseCase {
  async listarCotas(scope: AccessScope): Promise<CotaUbsDTO[]> {
    const whereUbs: any = { ativa: true };
    if (scope.kind === 'PREFEITURA') {
      whereUbs.prefeituraId = scope.prefeituraId;
    } else if (scope.kind === 'UBS') {
      whereUbs.id = scope.ubsId;
    }

    const ubsList = await prisma.ubs.findMany({
      where: whereUbs,
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    });

    if (ubsList.length === 0) return [];

    const ubsIds = ubsList.map((u) => u.id);
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    // Batch 1: Busca todas as cotas das UBSs de uma só vez
    const cotasRecords = await prisma.cotaUbs.findMany({
      where: { ubsId: { in: ubsIds } },
    });
    const cotasMap = new Map(cotasRecords.map((c) => [c.ubsId, c]));

    // Batch 2: Agrupa contagem de encaminhamentos aprovados por UBS
    const alocadasList = await prisma.encaminhamento.groupBy({
      by: ['ubsId'],
      _count: { _all: true },
      where: {
        ubsId: { in: ubsIds },
        status: StatusEncaminhamento.APROVADO,
        OR: [
          { canalRoteamento: CanalRoteamento.CENTRO_ESPECIALIDADES },
          { destinoRegulacao: 'CENTRO_ESPECIALIDADES' as any },
          { destinoRegulacao: 'CEM' as any },
        ],
        AND: [
          {
            OR: [
              { agendamentoPrevisto: { gte: startOfMonth, lte: endOfMonth } },
              {
                AND: [
                  { agendamentoPrevisto: null },
                  { criadoEm: { gte: startOfMonth, lte: endOfMonth } },
                ],
              },
            ],
          },
        ],
      },
    });
    const alocadasMap = new Map(alocadasList.map((a) => [a.ubsId, a._count._all]));

    return ubsList.map((ubs) => {
      const cotaRecord = cotasMap.get(ubs.id);
      const countAlocadas = alocadasMap.get(ubs.id) ?? 0;

      const totalCotasMes = cotaRecord?.totalCotasMes ?? 350;
      const especialidades = (cotaRecord?.especialidades as Record<string, number>) || {
        Cardiologia: 80,
        Oftalmologia: 100,
        Dermatologia: 50,
        Ortopedia: 70,
        Neurologia: 50,
      };

      const disponiveis = Math.max(0, totalCotasMes - countAlocadas);
      let status: 'NORMAL' | 'CRITICO' | 'ESGOTADO' = 'NORMAL';
      if (disponiveis === 0) status = 'ESGOTADO';
      else if (disponiveis < 30) status = 'CRITICO';

      return {
        ubsId: ubs.id,
        ubsNome: ubs.nome,
        totalCotasMes,
        alocadas: countAlocadas,
        disponiveis,
        status,
        especialidades,
      };
    });
  }

  async atualizarCota(
    ubsId: string,
    data: { totalCotasMes: number; especialidades: Record<string, number> },
    scope: AccessScope,
    atendenteId: string,
  ): Promise<CotaUbsDTO> {
    const ubs = await prisma.ubs.findUnique({
      where: { id: ubsId },
      select: { id: true, nome: true, prefeituraId: true },
    });
    if (!ubs) {
      throw NotFound('UBS_NAO_ENCONTRADA', 'UBS não encontrada');
    }
    if (scope.kind === 'PREFEITURA' && ubs.prefeituraId !== scope.prefeituraId) {
      throw NotFound('UBS_NAO_ENCONTRADA', 'UBS não encontrada');
    }
    if (scope.kind === 'UBS' && ubs.id !== scope.ubsId) {
      throw NotFound('UBS_NAO_ENCONTRADA', 'UBS não encontrada');
    }

    const res = await prisma.cotaUbs.upsert({
      where: { ubsId },
      create: {
        ubsId,
        totalCotasMes: data.totalCotasMes,
        especialidades: data.especialidades,
      },
      update: {
        totalCotasMes: data.totalCotasMes,
        especialidades: data.especialidades,
      },
    });

    await prisma.auditoriaLog.create({
      data: {
        acao: 'CENTRO_GESTAO_ATUALIZAR_COTAS',
        recurso: 'CENTRO_ESPECIALIDADES',
        recursoId: ubsId,
        atendenteId,
        payload: data,
      },
    });

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const countAlocadas = await prisma.encaminhamento.count({
      where: {
        ubsId,
        status: StatusEncaminhamento.APROVADO,
        OR: [
          { canalRoteamento: CanalRoteamento.CENTRO_ESPECIALIDADES },
          { destinoRegulacao: 'CENTRO_ESPECIALIDADES' as any },
          { destinoRegulacao: 'CEM' as any },
        ],
        AND: [
          {
            OR: [
              { agendamentoPrevisto: { gte: startOfMonth, lte: endOfMonth } },
              {
                AND: [
                  { agendamentoPrevisto: null },
                  { criadoEm: { gte: startOfMonth, lte: endOfMonth } },
                ],
              },
            ],
          },
        ],
      },
    });

    const disponiveis = Math.max(0, res.totalCotasMes - countAlocadas);
    let status: 'NORMAL' | 'CRITICO' | 'ESGOTADO' = 'NORMAL';
    if (disponiveis === 0) status = 'ESGOTADO';
    else if (disponiveis < 30) status = 'CRITICO';

    return {
      ubsId: res.ubsId,
      ubsNome: ubs?.nome || 'UBS',
      totalCotasMes: res.totalCotasMes,
      alocadas: countAlocadas,
      disponiveis,
      status,
      especialidades: (res.especialidades as Record<string, number>) || {},
    };
  }
}
