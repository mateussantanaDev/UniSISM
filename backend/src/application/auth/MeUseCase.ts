import { NotFound } from '../../shared/errors';
import type { IAtendenteRepository } from '../../domain/repositories/IAtendenteRepository';
import { iniciais } from '../utils/iniciais';

export interface MeOutput {
  id: string;
  nome: string;
  email: string;
  matricula: string;
  iniciais: string;
  role: string;
  tipoUnidade: string | null;
  unidade: string | null;
  unidadeId: string | null;
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

    const tipoUnidade =
      a.tipoUnidade ??
      (a.ubs
        ? 'UBS'
        : ['GESTOR_TFD', 'ATENDENTE_TFD', 'REGULADOR_TFD', 'MOTORISTA_TFD'].includes(a.role)
          ? 'TFD'
          : ['MEDICO', 'MEDICO_ESPECIALISTA', 'ATENDENTE_CENTRO'].includes(a.role)
            ? 'CEO'
            : a.role === 'DESENVOLVEDOR'
              ? null
              : 'SMS');

    const unidadeId = a.unidadeId ?? a.ubsId ?? null;

    return {
      id: a.id,
      nome: a.nome,
      email: a.email,
      matricula: a.matricula,
      iniciais: iniciais(a.nome),
      role: a.role,
      tipoUnidade,
      unidade: a.ubs?.nome ?? null,
      unidadeId,
      prefeitura,
      prefeituraInfo,
      cargo: a.cargo,
      escopo,
    };
  }
}
