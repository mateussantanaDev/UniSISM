import { NotFound } from '../../shared/errors';
import type { IAtendenteRepository } from '../../domain/repositories/IAtendenteRepository';
import { prisma } from '../../infrastructure/database/prisma';
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

    let prefObj = a.ubs?.prefeitura ?? a.prefeitura ?? null;
    if (!prefObj && a.role !== 'DESENVOLVEDOR') {
      prefObj = await prisma.prefeitura.findFirst({
        where: { ativa: true },
        orderBy: { criadoEm: 'asc' },
      });
    }

    const prefeitura = prefObj?.nome ?? 'Prefeitura Municipal de Águas Belas';
    const prefeituraInfo = prefObj
      ? {
          id: prefObj.id,
          nome: prefObj.nome,
          municipio: prefObj.municipio,
          uf: prefObj.uf,
        }
      : {
          id: 'b2ca1b67-3b6b-4a52-adbe-01df1d64cae6',
          nome: 'Prefeitura Municipal de Águas Belas',
          municipio: 'Águas Belas',
          uf: 'PE',
        };

    const cargoUpper = (a.cargo || '').toUpperCase();
    const funcaoUpper = (a.funcao || '').toUpperCase();

    const tipoUnidade =
      a.tipoUnidade ??
      (cargoUpper.includes('CEO') || cargoUpper.includes('DENTIST') || cargoUpper.includes('ODONTOL') || funcaoUpper.includes('CEO') || funcaoUpper.includes('ODONTOL')
        ? 'CEO'
        : cargoUpper.includes('CEM') || cargoUpper.includes('MÉDIC') || cargoUpper.includes('MEDIC') || funcaoUpper.includes('CEM')
          ? 'CEM'
          : a.ubs
            ? 'UBS'
            : ['GESTOR_TFD', 'ATENDENTE_TFD', 'REGULADOR_TFD', 'MOTORISTA_TFD'].includes(a.role)
              ? 'TFD'
              : ['MEDICO', 'MEDICO_ESPECIALISTA', 'ATENDENTE_CENTRO'].includes(a.role)
                ? 'CEO'
                : a.role === 'DESENVOLVEDOR'
                  ? null
                  : 'SMS');

    let cargo = a.cargo;
    if (a.role === 'REGULADOR_SMS') {
      cargo = 'Regulador(a) da SMS';
    } else if (!cargo || cargoUpper.includes('ATENDENTE DE REGULAÇÃO') || cargoUpper.includes('REGULADOR(A) DO CEO')) {
      if (tipoUnidade === 'CEO') {
        if (a.role === 'COORDENADOR_UBS') cargo = 'Coordenador(a) do CEO';
        else if (a.role === 'ADMIN') cargo = 'Diretor(a) / Gestor Geral do CEO';
        else if (a.role === 'MEDICO') cargo = 'Cirurgião-Dentista Especialista';
        else if (a.role === 'MEDICO_ESPECIALISTA') cargo = 'Cirurgião-Dentista Plantonista';
        else if (a.role === 'ATENDENTE_CENTRO' || a.role === 'ATENDENTE_UBS') cargo = 'Atendente / Recepção CEO';
      } else if (tipoUnidade === 'CEM') {
        if (a.role === 'COORDENADOR_UBS') cargo = 'Coordenador(a) do CEM';
        else if (a.role === 'ADMIN') cargo = 'Diretor(a) / Gestor Geral do CEM';
        else if (a.role === 'MEDICO') cargo = 'Médico(a) Especialista';
        else if (a.role === 'MEDICO_ESPECIALISTA') cargo = 'Médico(a) Plantonista';
        else if (a.role === 'ATENDENTE_CENTRO' || a.role === 'ATENDENTE_UBS') cargo = 'Atendente / Recepção CEM';
      }
    }

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
      cargo,
      escopo,
    };
  }
}
