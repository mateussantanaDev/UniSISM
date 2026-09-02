import {
  type Prisma,
  type Paciente as PacienteRow,
  StatusEncaminhamento as StatusPrisma,
} from '../../../generated/prisma';
import { prisma } from './prisma';
import type {
  IPacienteRepository,
  ListarPacientesFiltro,
  PacientesMetricas,
  ResultadoPaginadoPacientes,
} from '../../domain/repositories/IPacienteRepository';
import type { PacienteCompleto, PacienteResumo } from '../../domain/entities/Paciente';
import { grupoSanguineoToDominio, ymd } from './mappers';
import type { AccessScope } from '../../shared/scope';
import { whereByScopePaciente } from './scopeWhere';

function rowParaResumo(
  r: PacienteRow & {
    ubs: { nome: string };
    _count: { condicoesCronicas: number; encaminhamentos: number };
    atendimentos: { data: Date }[];
  },
): PacienteResumo {
  const ultimoAt = r.atendimentos[0]?.data;
  const resumo: PacienteResumo = {
    id: r.id,
    nome: r.nome,
    cpf: r.cpf,
    cartaoSus: r.cartaoSus ?? '',
    dataNascimento: ymd(r.dataNascimento),
    sexo: r.sexo,
    telefone: r.telefone ?? '',
    unidadeVinculada: r.ubs.nome,
    condicoesCronicasAtivas: r._count.condicoesCronicas,
    encaminhamentosAtivos: r._count.encaminhamentos,
    cadastradoEm: ymd(r.cadastradoEm),
  };
  if (r.nomeSocial) resumo.nomeSocial = r.nomeSocial;
  if (r.equipeSaudeFamilia) resumo.equipeSaudeFamilia = r.equipeSaudeFamilia;
  if (ultimoAt) resumo.ultimoAtendimento = ultimoAt.toISOString();
  return resumo;
}

export class PrismaPacienteRepository implements IPacienteRepository {
  private buildWhere(filtro: ListarPacientesFiltro): Prisma.PacienteWhereInput {
    const where: Prisma.PacienteWhereInput = { ...whereByScopePaciente(filtro.scope) };

    if (filtro.ubsId && filtro.ubsId !== 'TODAS') {
      where.ubsId = filtro.ubsId;
    }

    if (filtro.q && filtro.q.trim().length > 0) {
      const q = filtro.q.trim();
      where.OR = [
        { nome: { contains: q, mode: 'insensitive' } },
        { nomeSocial: { contains: q, mode: 'insensitive' } },
        { cpf: { contains: q } },
        { cartaoSus: { contains: q } },
        { nomeMae: { contains: q, mode: 'insensitive' } },
        { equipeSaudeFamilia: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (filtro.equipeId) where.equipeSaudeFamilia = filtro.equipeId;
    if (filtro.microarea) where.microarea = filtro.microarea;

    if (filtro.filtro === 'COM_CRONICAS') {
      where.condicoesCronicas = { some: { ativo: true } };
    } else if (filtro.filtro === 'COM_ENCAMINHAMENTOS') {
      where.encaminhamentos = {
        some: {
          status: { in: [StatusPrisma.AGUARDANDO_REGULACAO, StatusPrisma.PENDENCIA_DOCUMENTO] },
        },
      };
    } else if (filtro.filtro === 'SEM_ATENDIMENTO_90D') {
      const limite = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      where.OR = [
        { atendimentos: { none: {} } },
        { atendimentos: { every: { data: { lt: limite } } } },
      ];
    }

    return where;
  }

  async listar(filtro: ListarPacientesFiltro): Promise<PacienteResumo[]> {
    const where = this.buildWhere(filtro);
    const limit = filtro.limit ?? 200;
    const page = filtro.page ?? 1;
    const skip = (page - 1) * limit;

    const rows = await prisma.paciente.findMany({
      where,
      include: {
        ubs: { select: { nome: true } },
        _count: {
          select: {
            condicoesCronicas: { where: { ativo: true } },
            encaminhamentos: {
              where: {
                status: {
                  in: [StatusPrisma.AGUARDANDO_REGULACAO, StatusPrisma.PENDENCIA_DOCUMENTO],
                },
              },
            },
          },
        },
        atendimentos: { orderBy: { data: 'desc' }, take: 1, select: { data: true } },
      },
      orderBy: { nome: 'asc' },
      skip,
      take: limit,
    });

    return rows.map(rowParaResumo);
  }

  async listarPaginado(filtro: ListarPacientesFiltro): Promise<ResultadoPaginadoPacientes> {
    const where = this.buildWhere(filtro);
    const page = Math.max(1, filtro.page ?? 1);
    const limit = Math.min(200, Math.max(1, filtro.limit ?? 50));
    const skip = (page - 1) * limit;

    const [total, rows] = await Promise.all([
      prisma.paciente.count({ where }),
      prisma.paciente.findMany({
        where,
        include: {
          ubs: { select: { nome: true } },
          _count: {
            select: {
              condicoesCronicas: { where: { ativo: true } },
              encaminhamentos: {
                where: {
                  status: {
                    in: [StatusPrisma.AGUARDANDO_REGULACAO, StatusPrisma.PENDENCIA_DOCUMENTO],
                  },
                },
              },
            },
          },
          atendimentos: { orderBy: { data: 'desc' }, take: 1, select: { data: true } },
        },
        orderBy: { nome: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      itens: rows.map(rowParaResumo),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async contarMetricas(scope: AccessScope): Promise<PacientesMetricas> {
    const baseWhere = whereByScopePaciente(scope);
    const limite90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [totalCadastrados, totalCronicos, totalEncAtivos, totalSemAtendimento90d] = await Promise.all([
      prisma.paciente.count({ where: baseWhere }),
      prisma.paciente.count({
        where: {
          ...baseWhere,
          condicoesCronicas: { some: { ativo: true } },
        },
      }),
      prisma.encaminhamento.count({
        where: {
          paciente: baseWhere,
          status: { in: [StatusPrisma.AGUARDANDO_REGULACAO, StatusPrisma.PENDENCIA_DOCUMENTO] },
        },
      }),
      prisma.paciente.count({
        where: {
          ...baseWhere,
          OR: [
            { atendimentos: { none: {} } },
            { atendimentos: { every: { data: { lt: limite90d } } } },
          ],
        },
      }),
    ]);

    return {
      totalCadastrados,
      totalCronicos,
      totalEncAtivos,
      totalSemAtendimento90d,
    };
  }

  async buscarPorId(id: string, scope: AccessScope): Promise<PacienteCompleto | null> {
    const r = await prisma.paciente.findFirst({
      where: { id, ...whereByScopePaciente(scope) },
      include: {
        ubs: { select: { nome: true } },
        alergias: true,
        condicoesCronicas: true,
        medicamentosEmUso: true,
        atendimentos: { orderBy: { data: 'desc' }, take: 50 },
        viagensTFD: { orderBy: { dataIda: 'desc' }, take: 50 },
        exames: { orderBy: { data: 'desc' }, take: 50 },
        vacinacoes: { orderBy: { data: 'desc' }, take: 50 },
        medicosAtendentes: { orderBy: { ultimaConsulta: 'desc' } },
        encaminhamentos: { select: { id: true } },
        _count: {
          select: {
            condicoesCronicas: { where: { ativo: true } },
            encaminhamentos: {
              where: {
                status: {
                  in: [StatusPrisma.AGUARDANDO_REGULACAO, StatusPrisma.PENDENCIA_DOCUMENTO],
                },
              },
            },
          },
        },
      },
    });

    if (!r) return null;

    const ultimoAt = r.atendimentos[0]?.data;

    const completo: PacienteCompleto = {
      id: r.id,
      nome: r.nome,
      cpf: r.cpf,
      cartaoSus: r.cartaoSus ?? '',
      dataNascimento: ymd(r.dataNascimento),
      sexo: r.sexo,
      telefone: r.telefone ?? '',
      unidadeVinculada: r.ubs.nome,
      condicoesCronicasAtivas: r._count.condicoesCronicas,
      encaminhamentosAtivos: r._count.encaminhamentos,
      cadastradoEm: ymd(r.cadastradoEm),
      nomeMae: r.nomeMae ?? '',
      estadoCivil: r.estadoCivil,
      escolaridade: r.escolaridade ?? '',
      racaCor: r.racaCor,
      endereco: r.endereco ?? '',
      bairro: r.bairro ?? '',
      municipio: r.municipio ?? '',
      uf: r.uf ?? '',
      cep: r.cep ?? '',
      grupoSanguineo: grupoSanguineoToDominio(r.grupoSanguineo),
      historicoFamiliar: r.historicoFamiliar,
      alergias: r.alergias.map((a) => ({
        id: a.id,
        substancia: a.substancia,
        tipo: a.tipo,
        gravidade: a.gravidade,
        ...(a.observacao ? { observacao: a.observacao } : {}),
      })),
      condicoesCronicas: r.condicoesCronicas.map((c) => ({
        id: c.id,
        cid10: c.cid10,
        descricao: c.descricao,
        desde: ymd(c.desde),
        ativo: c.ativo,
        ...(c.observacao ? { observacao: c.observacao } : {}),
      })),
      medicamentosEmUso: r.medicamentosEmUso.map((m) => ({
        id: m.id,
        nome: m.nome,
        dosagem: m.dosagem,
        frequencia: m.frequencia,
        desde: ymd(m.desde),
        prescritor: m.prescritor,
        ativo: m.ativo,
      })),
      atendimentos: r.atendimentos.map((a) => ({
        id: a.id,
        data: a.data.toISOString(),
        tipo: a.tipo,
        profissional: a.profissional,
        registroProfissional: a.registroProfissional,
        especialidade: a.especialidade,
        unidade: a.unidade,
        queixaPrincipal: a.queixaPrincipal,
        diagnostico: a.diagnostico,
        cid10: a.cid10,
        conduta: a.conduta,
        ...(a.prescricaoResumo ? { prescricaoResumo: a.prescricaoResumo } : {}),
      })),
      viagensTFD: r.viagensTFD.map((v) => ({
        id: v.id,
        protocolo: v.protocolo,
        dataIda: v.dataIda.toISOString(),
        dataVolta: v.dataVolta.toISOString(),
        destino: v.destino,
        unidadeDestino: v.unidadeDestino,
        motivo: v.motivo,
        especialidade: v.especialidade,
        acompanhante: v.acompanhante,
        transporte: v.transporte,
        status: v.status,
        custoEstimadoBRL: v.custoEstimadoBRL,
      })),
      exames: r.exames.map((e) => ({
        id: e.id,
        data: e.data.toISOString(),
        tipo: e.tipo,
        categoria: e.categoria,
        solicitante: e.solicitante,
        unidadeExecutora: e.unidadeExecutora,
        resultado: e.resultado,
        ...(e.observacao ? { observacao: e.observacao } : {}),
      })),
      vacinacoes: r.vacinacoes.map((v) => ({
        id: v.id,
        data: v.data.toISOString(),
        vacina: v.vacina,
        dose: v.dose,
        lote: v.lote,
        aplicador: v.aplicador,
        unidade: v.unidade,
        via: v.via,
      })),
      medicosAtendentes: r.medicosAtendentes.map((m) => ({
        nome: m.nome,
        registro: m.registro,
        especialidade: m.especialidade,
        unidade: m.unidade,
        ultimaConsulta: m.ultimaConsulta.toISOString(),
        totalConsultas: m.totalConsultas,
      })),
      encaminhamentosIds: r.encaminhamentos.map((e) => e.id),
    };

    if (r.nomeSocial) completo.nomeSocial = r.nomeSocial;
    if (r.equipeSaudeFamilia) completo.equipeSaudeFamilia = r.equipeSaudeFamilia;
    if (ultimoAt) completo.ultimoAtendimento = ultimoAt.toISOString();
    if (r.nomePai) completo.nomePai = r.nomePai;
    if (r.profissao) completo.profissao = r.profissao;
    if (r.telefoneSecundario) completo.telefoneSecundario = r.telefoneSecundario;
    if (r.email) completo.email = r.email;
    if (r.agenteComunitario) completo.agenteComunitario = r.agenteComunitario;
    if (r.microarea) completo.microarea = r.microarea;

    return completo;
  }
}
