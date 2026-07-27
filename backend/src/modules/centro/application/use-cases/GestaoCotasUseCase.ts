import { StatusEncaminhamento, CanalRoteamento } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
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

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const result: CotaUbsDTO[] = [];

    for (const ubs of ubsList) {
      const [cotaRecord, countAlocadas] = await Promise.all([
        prisma.cotaUbs.findUnique({ where: { ubsId: ubs.id } }),
        prisma.encaminhamento.count({
          where: {
            ubsId: ubs.id,
            canalRoteamento: CanalRoteamento.CENTRO_ESPECIALIDADES,
            status: StatusEncaminhamento.APROVADO,
            agendamentoPrevisto: { gte: startOfMonth, lte: endOfMonth },
          },
        }),
      ]);

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

      result.push({
        ubsId: ubs.id,
        ubsNome: ubs.nome,
        totalCotasMes,
        alocadas: countAlocadas,
        disponiveis,
        status,
        especialidades,
      });
    }

    return result;
  }

  async atualizarCota(ubsId: string, data: { totalCotasMes: number; especialidades: Record<string, number> }, atendenteId: string): Promise<CotaUbsDTO> {
    const ubs = await prisma.ubs.findUnique({
      where: { id: ubsId },
      select: { id: true, nome: true },
    });

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
        canalRoteamento: CanalRoteamento.CENTRO_ESPECIALIDADES,
        status: StatusEncaminhamento.APROVADO,
        agendamentoPrevisto: { gte: startOfMonth, lte: endOfMonth },
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
