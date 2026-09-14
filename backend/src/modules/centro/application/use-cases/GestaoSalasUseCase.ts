import { StatusSalaConsultorio } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { NotFound } from '../../../../shared/errors';
import type { AccessScope } from '../../../../shared/scope';

export interface SalaConsultorioDTO {
  id?: string;
  codigo: string;
  nome: string;
  especialidadePrincipal: string;
  medicoAlocado?: string;
  medicoCrm?: string;
  status: 'DISPONIVEL' | 'EM_ATENDIMENTO' | 'MANUTENCAO' | 'RESERVADA';
  equipamentos: string[];
  ala?: string | null;
}

const ESPECIALIDADES_ODONTO = [
  'endodontia',
  'periodontia',
  'cirurgia bucomaxilofacial',
  'bucomaxilo',
  'odontopediatria',
  'pacientes com necessidades especiais (pne)',
  'pne',
  'prótese dentária',
  'protese dentaria',
  'estomatologia',
  'ortodontia preventiva',
  'odontologia',
  'saúde bucal',
  'saude bucal',
];

export class GestaoSalasUseCase {
  async listarSalas(scope: AccessScope, centro?: string): Promise<SalaConsultorioDTO[]> {
    const where: any = {};
    if (scope.kind === 'PREFEITURA') {
      where.prefeituraId = scope.prefeituraId;
    }

    const [salas, escalas] = await Promise.all([
      prisma.salaConsultorio.findMany({
        where,
        orderBy: { codigo: 'asc' },
      }),
      prisma.escalaEspecialista.findMany({
        where: {
          ativo: true,
          ...((scope.kind === 'PREFEITURA' || scope.kind === 'UBS') && scope.prefeituraId
            ? { OR: [{ prefeituraId: scope.prefeituraId }, { prefeituraId: null }] }
            : {}),
        },
      }),
    ]);

    const diaSemanaHojeMap = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
    const diaHoje = diaSemanaHojeMap[new Date().getDay()] ?? 'SEG';

    let salasDTO = salas.map((s) => {
      const escalaHoje = escalas.find(
        (e) =>
          e.especialidade.toLowerCase() === s.especialidadePrincipal.toLowerCase() &&
          e.diasSemana.some((d) => d && d.toUpperCase().includes(diaHoje)),
      ) || escalas.find(
        (e) => e.especialidade.toLowerCase() === s.especialidadePrincipal.toLowerCase(),
      );

      return {
        id: s.id,
        codigo: s.codigo,
        nome: s.nome,
        especialidadePrincipal: s.especialidadePrincipal,
        medicoAlocado: escalaHoje?.medicoNome,
        medicoCrm: escalaHoje?.crm,
        status: s.status as any,
        equipamentos: s.equipamentos,
        ala: s.ala,
      };
    });

    if (centro) {
      const centroNorm = centro.toUpperCase();
      const ehCeo = centroNorm === 'CEO' || centroNorm === 'CENTRO_ODONTOLOGICO';

      salasDTO = salasDTO.filter((s) => {
        const esp = s.especialidadePrincipal.toLowerCase();
        const cod = s.codigo.toLowerCase();
        const nom = s.nome.toLowerCase();
        const eOdonto =
          ESPECIALIDADES_ODONTO.some((o) => esp.includes(o)) ||
          cod.startsWith('cad') ||
          nom.includes('cadeira') ||
          nom.includes('odonto');

        return ehCeo ? eOdonto : !eOdonto;
      });
    }

    return salasDTO;
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
