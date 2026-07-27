import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';
import { NotFound } from '../../../../shared/errors';

export interface CotaUbsDTO {
  ubsId: string;
  totalCotasMes: number;
  especialidades: Record<string, number>;
}

export class GestaoCotasUseCase {
  async listarCotas(scope: AccessScope): Promise<CotaUbsDTO[]> {
    const where: any = {};
    if (scope.kind === 'PREFEITURA') {
      where.ubs = { prefeituraId: scope.prefeituraId };
    } else if (scope.kind === 'UBS') {
      where.ubsId = scope.ubsId;
    }

    const cotas = await prisma.cotaUbs.findMany({
      where,
    });

    return cotas.map((c) => ({
      ubsId: c.ubsId,
      totalCotasMes: c.totalCotasMes,
      especialidades: (c.especialidades as Record<string, number>) || {},
    }));
  }

  async atualizarCota(ubsId: string, data: { totalCotasMes: number; especialidades: Record<string, number> }, atendenteId: string): Promise<CotaUbsDTO> {
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

    return {
      ubsId: res.ubsId,
      totalCotasMes: res.totalCotasMes,
      especialidades: (res.especialidades as Record<string, number>) || {},
    };
  }
}
