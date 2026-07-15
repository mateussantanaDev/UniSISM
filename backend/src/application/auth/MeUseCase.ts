import { NotFound } from '../../shared/errors';
import type { IAtendenteRepository } from '../../domain/repositories/IAtendenteRepository';
import { iniciais } from '../utils/iniciais';

export interface MeOutput {
  id: string;
  nome: string;
  matricula: string;
  iniciais: string;
  role: string;
  unidade: string | null;
  prefeitura: string | null;
  prefeituraInfo?: {
    id: string;
    nome: string;
    municipio: string;
    uf: string;
  } | null;
  cargo: string;
  escopo: 'GLOBAL' | 'PREFEITURA' | 'UBS';
}

export class MeUseCase {
  constructor(private readonly atendentes: IAtendenteRepository) {}

  async exec(atendenteId: string): Promise<MeOutput> {
    const a = await this.atendentes.buscarPorId(atendenteId);
    if (!a) throw NotFound('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');

    const escopo: MeOutput['escopo'] =
      a.role === 'DESENVOLVEDOR'
        ? 'GLOBAL'
        : a.ubs
          ? 'UBS'
          : 'PREFEITURA';

    const prefObj = a.ubs?.prefeitura ?? a.prefeitura ?? null;
    const prefeitura = prefObj?.nome ?? null;
    const prefeituraInfo = prefObj
      ? {
          id: prefObj.id,
          nome: prefObj.nome,
          municipio: prefObj.municipio,
          uf: prefObj.uf,
        }
      : null;

    return {
      id: a.id,
      nome: a.nome,
      matricula: a.matricula,
      iniciais: iniciais(a.nome),
      role: a.role,
      unidade: a.ubs?.nome ?? null,
      prefeitura,
      prefeituraInfo,
      cargo: a.cargo,
      escopo,
    };
  }
}
