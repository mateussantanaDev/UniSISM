import type { ChamadaPainelUbs } from '../../domain/entities/AtendimentoUbsFila';
import { filaUbsRepository, FilaUbsRepository } from '../../infrastructure/repositories/FilaUbsRepository';
import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';

export interface ObterUltimasChamadasPainelUbsInput {
  ubsId?: string;
  limite?: number;
}

export interface ObterUltimasChamadasPainelUbsOutput {
  chamadaAtual: ChamadaPainelUbs | null;
  ultimasChamadas: ChamadaPainelUbs[];
  ubsNome?: string;
  prefeituraNome?: string;
}

export class ObterUltimasChamadasPainelUbsUseCase {
  constructor(private readonly repo: FilaUbsRepository = filaUbsRepository) {}

  async exec(input: ObterUltimasChamadasPainelUbsInput, scope: AccessScope): Promise<ObterUltimasChamadasPainelUbsOutput> {
    let ubsId = input.ubsId;
    let ubsNome = 'UBS Municipal';
    let prefeituraNome = 'Secretaria Municipal de Saúde';

    if (!ubsId && scope.kind === 'UBS') {
      ubsId = scope.ubsId;
    }

    if (!ubsId && scope.kind === 'PREFEITURA') {
      const ubs = await prisma.ubs.findFirst({
        where: { prefeituraId: scope.prefeituraId, ativa: true },
        include: { prefeitura: true },
      });
      if (ubs) {
        ubsId = ubs.id;
        ubsNome = ubs.nome;
        prefeituraNome = ubs.prefeitura?.nome || prefeituraNome;
      }
    }

    if (!ubsId) {
      const ubsDefault = await prisma.ubs.findFirst({
        where: { ativa: true },
        include: { prefeitura: true },
      });
      if (ubsDefault) {
        ubsId = ubsDefault.id;
        ubsNome = ubsDefault.nome;
        prefeituraNome = ubsDefault.prefeitura?.nome || prefeituraNome;
      }
    } else {
      const ubsDb = await prisma.ubs.findUnique({
        where: { id: ubsId },
        include: { prefeitura: true },
      });
      if (ubsDb) {
        ubsNome = ubsDb.nome;
        prefeituraNome = ubsDb.prefeitura?.nome || prefeituraNome;
      }
    }

    const { chamadaAtual, ultimasChamadas } = await this.repo.obterUltimasChamadas(ubsId || 'default', input.limite || 5);

    return {
      chamadaAtual,
      ultimasChamadas,
      ubsNome,
      prefeituraNome,
    };
  }
}
