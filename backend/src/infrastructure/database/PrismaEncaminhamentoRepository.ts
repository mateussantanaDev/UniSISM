import {
  type Prisma,
  StatusEncaminhamento as StatusPrisma,
} from '../../../generated/prisma';
import { prisma } from './prisma';
import type {
  CriarEncaminhamentoInput,
  IEncaminhamentoRepository,
  ListarEncaminhamentosFiltro,
  ResolverPendenciaInput,
} from '../../domain/repositories/IEncaminhamentoRepository';
import type {
  Encaminhamento,
  MetricasDashboard,
  StatusEncaminhamento,
  TipoEventoTimeline,
} from '../../domain/entities/Encaminhamento';
import { Conflict, NotFound, Unprocessable } from '../../shared/errors';
import type { AccessScope } from '../../shared/scope';
import { whereByScopeViaUbs } from './scopeWhere';
import { parseDataFlexivel } from '../../shared/dates';
import { normalizarCpf } from '../services/NotificacaoPacienteService';
import {
  INCLUDE_ENCAMINHAMENTO_FULL as INCLUDE_FULL,
  rowParaEncaminhamento as rowParaDominio,
} from './encaminhamentoMapper';
import { invalidarCacheArvorePorUbs } from '../cache/arvoreCacheInvalidator';


export class PrismaEncaminhamentoRepository implements IEncaminhamentoRepository {
  async proximoProtocolo(): Promise<string> {
    const ano = new Date().getUTCFullYear();
    const chave = `UBS-${ano}`;
    const seq = await prisma.sequencialProtocolo.upsert({
      where: { chave },
      create: { chave, valor: 1 },
      update: { valor: { increment: 1 } },
    });
    return `UBS-${ano}-${String(seq.valor).padStart(6, '0')}`;
  }

  async criar(input: CriarEncaminhamentoInput): Promise<Encaminhamento> {
    const protocolo = await this.proximoProtocolo();

    // Parser tolerante: aceita ISO (YYYY-MM-DD), BR (DD/MM/YYYY), com /-. e ano de 2 dígitos.
    const rawNasc = input.paciente.dataNascimento?.trim() ?? '';
    const rawSolic = input.solicitacao.dataSolicitacao?.trim() ?? '';

    let dataNascimento: Date;
    if (rawNasc) {
      const parsed = parseDataFlexivel(rawNasc);
      if (!parsed) {
        throw Unprocessable(
          'DATA_NASCIMENTO_INVALIDA',
          `Data de nascimento "${rawNasc}" inválida. Use formato YYYY-MM-DD ou DD/MM/YYYY.`,
        );
      }
      dataNascimento = parsed;
    } else {
      dataNascimento = new Date(0); // placeholder 1970-01-01 quando não informada
    }

    let dataSolicitacao: Date;
    if (rawSolic) {
      const parsed = parseDataFlexivel(rawSolic);
      if (!parsed) {
        throw Unprocessable(
          'DATA_SOLICITACAO_INVALIDA',
          `Data da solicitação "${rawSolic}" inválida. Use formato YYYY-MM-DD ou DD/MM/YYYY.`,
        );
      }
      dataSolicitacao = parsed;
    } else {
      dataSolicitacao = new Date();
    }

    // Normaliza CPF pra armazenar sempre só dígitos — evita duplicidade de
    // paciente quando o frontend envia "534.741.318-26" e "53474131826" em
    // encaminhamentos diferentes. Também casa com PacienteConta.cpf (login).
    const cpfDigits = normalizarCpf(input.paciente.cpf);
    if (cpfDigits.length !== 11) {
      throw Unprocessable(
        'CPF_INVALIDO',
        'CPF do paciente deve ter 11 dígitos',
      );
    }

    // Auto-cadastro / complemento de paciente por CPF:
    //   - se NÃO existe → cria com tudo que veio no payload (básico + complemento)
    //   - se JÁ existe → preenche APENAS os campos que estão vazios no banco
    //                    (preserva edições manuais do PEC; nunca sobrescreve)
    const cartaoSusTrim = input.paciente.cartaoSus?.trim() ? input.paciente.cartaoSus.trim() : null;
    const telefoneTrim = input.paciente.telefone?.trim() ? input.paciente.telefone.trim() : null;
    const enderecoTrim = input.paciente.endereco?.trim() ? input.paciente.endereco.trim() : null;
    const compl = input.pacienteComplemento ?? {};

    const enc = await prisma.$transaction(async (tx) => {
      const existente = await tx.paciente.findUnique({
        where: { cpf: cpfDigits },
        select: {
          id: true,
          deletadoEm: true,
          cartaoSus: true,
          telefone: true,
          endereco: true,
          dataNascimento: true,
          sexo: true,
          nomeSocial: true,
          telefoneSecundario: true,
          email: true,
          nomeMae: true,
          nomePai: true,
          estadoCivil: true,
          escolaridade: true,
          profissao: true,
          racaCor: true,
          bairro: true,
          municipio: true,
          uf: true,
          cep: true,
        },
      });

      let pacienteFK: { id: string };
      if (existente && !existente.deletadoEm) {
        // Já existe — preencher apenas campos vazios.
        const updateData: Prisma.PacienteUpdateInput = {};

        // Básicos
        if (!existente.cartaoSus && cartaoSusTrim) updateData.cartaoSus = cartaoSusTrim;
        if (!existente.telefone && telefoneTrim) updateData.telefone = telefoneTrim;
        if (!existente.endereco && enderecoTrim) updateData.endereco = enderecoTrim;
        if (existente.dataNascimento.getTime() === 0 && rawNasc) {
          updateData.dataNascimento = dataNascimento;
        }
        if (existente.sexo === 'OUTRO' && input.paciente.sexo !== 'OUTRO') {
          updateData.sexo = input.paciente.sexo;
        }

        // Complementares
        if (!existente.nomeSocial && compl.nomeSocial) updateData.nomeSocial = compl.nomeSocial;
        if (!existente.telefoneSecundario && compl.telefoneSecundario) updateData.telefoneSecundario = compl.telefoneSecundario;
        if (!existente.email && compl.email) updateData.email = compl.email.toLowerCase();
        if (!existente.nomeMae && compl.nomeMae) updateData.nomeMae = compl.nomeMae;
        if (!existente.nomePai && compl.nomePai) updateData.nomePai = compl.nomePai;
        if (existente.estadoCivil === 'OUTRO' && compl.estadoCivil) updateData.estadoCivil = compl.estadoCivil;
        if (!existente.escolaridade && compl.escolaridade) updateData.escolaridade = compl.escolaridade;
        if (!existente.profissao && compl.profissao) updateData.profissao = compl.profissao;
        if (existente.racaCor === 'NAO_INFORMADA' && compl.racaCor) updateData.racaCor = compl.racaCor;
        if (!existente.bairro && compl.bairro) updateData.bairro = compl.bairro;
        if (!existente.municipio && compl.municipio) updateData.municipio = compl.municipio;
        if (!existente.uf && compl.uf) updateData.uf = compl.uf;
        if (!existente.cep && compl.cep) updateData.cep = compl.cep;

        if (Object.keys(updateData).length > 0) {
          await tx.paciente.update({ where: { id: existente.id }, data: updateData });
        }
        pacienteFK = { id: existente.id };
      } else {
        // Não existe — cria com tudo que veio
        const novo = await tx.paciente.create({
          data: {
            nome: input.paciente.nome,
            cpf: cpfDigits,
            cartaoSus: cartaoSusTrim,
            dataNascimento,
            sexo: input.paciente.sexo,
            telefone: telefoneTrim,
            endereco: enderecoTrim,
            ubsId: input.ubsId,
            ...(compl.nomeSocial ? { nomeSocial: compl.nomeSocial } : {}),
            ...(compl.telefoneSecundario ? { telefoneSecundario: compl.telefoneSecundario } : {}),
            ...(compl.email ? { email: compl.email.toLowerCase() } : {}),
            ...(compl.nomeMae ? { nomeMae: compl.nomeMae } : {}),
            ...(compl.nomePai ? { nomePai: compl.nomePai } : {}),
            ...(compl.estadoCivil ? { estadoCivil: compl.estadoCivil } : {}),
            ...(compl.escolaridade ? { escolaridade: compl.escolaridade } : {}),
            ...(compl.profissao ? { profissao: compl.profissao } : {}),
            ...(compl.racaCor ? { racaCor: compl.racaCor } : {}),
            ...(compl.bairro ? { bairro: compl.bairro } : {}),
            ...(compl.municipio ? { municipio: compl.municipio } : {}),
            ...(compl.uf ? { uf: compl.uf } : {}),
            ...(compl.cep ? { cep: compl.cep } : {}),
          },
          select: { id: true },
        });
        pacienteFK = novo;
      }

      return tx.encaminhamento.create({
        data: {
          protocolo,
          status: StatusPrisma.AGUARDANDO_REGULACAO,
          ubsId: input.ubsId,
          atendenteId: input.atendenteId,
          atendenteResponsavel: input.atendenteResponsavel,
          unidadeOrigem: input.unidadeOrigem,
          pacienteId: pacienteFK.id,
          pacienteNome: input.paciente.nome,
          pacienteCpf: cpfDigits,
          pacienteCartaoSus: input.paciente.cartaoSus,
          pacienteDataNascimento: dataNascimento,
          pacienteSexo: input.paciente.sexo,
          pacienteTelefone: input.paciente.telefone,
          pacienteEndereco: input.paciente.endereco,
          medicoSolicitante: input.solicitacao.medicoSolicitante,
          crm: input.solicitacao.crm,
          especialidadeSolicitada: input.solicitacao.especialidadeSolicitada,
          cid10: input.solicitacao.cid10,
          cidDescricao: input.solicitacao.cidDescricao,
          justificativaClinica: input.solicitacao.justificativaClinica,
          prioridade: input.solicitacao.prioridade,
          dataSolicitacao,
          anexos: {
            create: input.anexos.map((a) => ({
              nome: a.nome,
              tipo: a.tipo,
              tamanhoKb: a.tamanhoKb,
              mimeType: a.mimeType,
              caminho: a.caminho,
            })),
          },
          timeline: {
            create: [
              {
                tipo: 'CRIADO',
                titulo: 'Encaminhamento criado',
                descricao: `Protocolo ${protocolo} aberto pelo atendente`,
                autor: input.atendenteResponsavel,
                autorPapel: `Atendente · ${input.unidadeOrigem}`,
              },
              ...input.anexos.map((a) => ({
                tipo: 'DOCUMENTO_ANEXADO' as TipoEventoTimeline,
                titulo: 'Documento anexado',
                descricao: `${a.tipo}: ${a.nome}`,
                autor: input.atendenteResponsavel,
                autorPapel: `Atendente · ${input.unidadeOrigem}`,
              })),
              {
                tipo: 'ENVIADO_REGULACAO',
                titulo: 'Enviado à Regulação',
                descricao: 'Encaminhamento entrou na fila de regulação',
                autor: 'SISTEMA',
                autorPapel: 'Sistema UNISISM',
              },
            ],
          },
        },
        include: INCLUDE_FULL,
      });
    });

    void invalidarCacheArvorePorUbs(enc.ubsId);
    return rowParaDominio(enc);
  }

  async buscarPorId(id: string, scope: AccessScope): Promise<Encaminhamento | null> {
    const r = await prisma.encaminhamento.findFirst({
      where: { id, ...whereByScopeViaUbs(scope) },
      include: INCLUDE_FULL,
    });
    return r ? rowParaDominio(r) : null;
  }

  async listar(filtro: ListarEncaminhamentosFiltro): Promise<Encaminhamento[]> {
    const where: Prisma.EncaminhamentoWhereInput = { ...whereByScopeViaUbs(filtro.scope) };
    if (filtro.status) where.status = filtro.status;
    if (filtro.pacienteId) where.pacienteId = filtro.pacienteId;
    if (filtro.desde || filtro.ate) {
      const range: Prisma.DateTimeFilter = {};
      if (filtro.desde) range.gte = filtro.desde;
      if (filtro.ate) range.lte = filtro.ate;
      
      if (filtro.respostaSUS === true) {
        where.respostaSusRegistradoEm = range;
      } else {
        where.criadoEm = range;
      }
    }
    if (filtro.respostaSUS === true) {
      where.respostaSusAnexoId = { not: null };
    } else if (filtro.respostaSUS === false) {
      where.respostaSusAnexoId = null;
    }
    const orderBy: Prisma.EncaminhamentoOrderByWithRelationInput =
      filtro.respostaSUS === true
        ? { respostaSusRegistradoEm: 'desc' }
        : { criadoEm: 'desc' };

    const rows = await prisma.encaminhamento.findMany({
      where,
      include: INCLUDE_FULL,
      orderBy,
      take: filtro.limit ?? 100,
    });
    return rows.map(rowParaDominio);
  }

  async resolverPendencia(
    id: string,
    scope: AccessScope,
    input: ResolverPendenciaInput,
  ): Promise<Encaminhamento> {
    const atual = await prisma.encaminhamento.findFirst({
      where: { id, ...whereByScopeViaUbs(scope) },
    });
    if (!atual) throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    if (atual.status !== StatusPrisma.PENDENCIA_DOCUMENTO) {
      throw Conflict(
        'ENCAMINHAMENTO_NAO_EM_PENDENCIA',
        'Encaminhamento não está em pendência e não pode ser readequado.',
        { statusAtual: atual.status },
      );
    }

    const resolvido = await prisma.$transaction(async (tx) => {
      await tx.eventoTimeline.create({
        data: {
          encaminhamentoId: id,
          tipo: 'OBSERVACAO',
          titulo: 'Pendência respondida pelo atendente',
          descricao: input.nota,
          autor: input.autor,
          autorPapel: input.autorPapel,
        },
      });
      for (const a of input.novosAnexos) {
        await tx.anexoDocumento.create({
          data: {
            encaminhamentoId: id,
            nome: a.nome,
            tipo: a.tipo,
            tamanhoKb: a.tamanhoKb,
            mimeType: a.mimeType,
            caminho: a.caminho,
          },
        });
        await tx.eventoTimeline.create({
          data: {
            encaminhamentoId: id,
            tipo: 'DOCUMENTO_ANEXADO',
            titulo: 'Documento anexado',
            descricao: `${a.tipo}: ${a.nome}`,
            autor: input.autor,
            autorPapel: input.autorPapel,
          },
        });
      }
      await tx.eventoTimeline.create({
        data: {
          encaminhamentoId: id,
          tipo: 'ENVIADO_REGULACAO',
          titulo: 'Reenviado à Regulação',
          descricao: 'Pendência respondida; encaminhamento retorna à fila',
          autor: 'SISTEMA',
          autorPapel: 'Sistema UNISISM',
        },
      });

      return tx.encaminhamento.update({
        where: { id },
        data: {
          status: StatusPrisma.AGUARDANDO_REGULACAO,
          observacoesRegulacao: '',
        },
        include: INCLUDE_FULL,
      });
    });

    void invalidarCacheArvorePorUbs(resolvido.ubsId);
    return rowParaDominio(resolvido);
  }

  async metricas(scope: AccessScope): Promise<MetricasDashboard> {
    const inicioHoje = new Date();
    inicioHoje.setHours(0, 0, 0, 0);
    const inicioSemana = new Date();
    inicioSemana.setHours(0, 0, 0, 0);
    inicioSemana.setDate(inicioSemana.getDate() - 7);

    const baseWhere = whereByScopeViaUbs(scope);

    const [hoje, aguardando, pendencias, aprovadosHoje, semana, todos, enviados, respondidos] = await Promise.all([
      prisma.encaminhamento.count({ where: { ...baseWhere, criadoEm: { gte: inicioHoje } } }),
      prisma.encaminhamento.count({
        where: { ...baseWhere, status: StatusPrisma.AGUARDANDO_REGULACAO },
      }),
      prisma.encaminhamento.count({
        where: { ...baseWhere, status: StatusPrisma.PENDENCIA_DOCUMENTO },
      }),
      prisma.encaminhamento.count({
        where: {
          ...baseWhere,
          status: StatusPrisma.APROVADO,
          atualizadoEm: { gte: inicioHoje },
        },
      }),
      prisma.encaminhamento.count({ where: { ...baseWhere, criadoEm: { gte: inicioSemana } } }),
      prisma.encaminhamento.findMany({
        where: {
          ...baseWhere,
          status: { not: StatusPrisma.RASCUNHO },
          criadoEm: { gte: inicioSemana },
        },
        select: {
          criadoEm: true,
          atualizadoEm: true,
          status: true,
          timeline: {
            select: { tipo: true, em: true },
            orderBy: { em: 'asc' },
          },
        },
        take: 200,
        orderBy: { criadoEm: 'desc' },
      }),
      prisma.encaminhamento.count({
        where: { ...baseWhere, status: StatusPrisma.APROVADO, respostaSusAnexoId: null },
      }),
      prisma.encaminhamento.count({
        where: { ...baseWhere, status: StatusPrisma.APROVADO, respostaSusAnexoId: { not: null } },
      }),
    ]);

    const agoraMs = Date.now();
    const tempos: number[] = [];
    const limiteSlaMs = 48 * 60 * 60 * 1000; // 48 horas
    let dentroSla = 0;
    let totalCasosValidos = 0;

    for (const e of todos) {
      let totalTime = 0;
      let lastEnterQueueTime: number | null = null;

      const enviadoEvt = e.timeline.find((t) => t.tipo === 'ENVIADO_REGULACAO');
      if (enviadoEvt) {
        lastEnterQueueTime = enviadoEvt.em.getTime();
      } else {
        lastEnterQueueTime = e.criadoEm.getTime();
      }

      for (const evt of e.timeline) {
        const tEvt = evt.em.getTime();
        if (evt.tipo === 'ENVIADO_REGULACAO') {
          lastEnterQueueTime = tEvt;
        } else if (
          evt.tipo === 'PENDENCIA_REGISTRADA' ||
          evt.tipo === 'APROVADO' ||
          evt.tipo === 'REJEITADO'
        ) {
          if (lastEnterQueueTime !== null) {
            totalTime += Math.max(0, tEvt - lastEnterQueueTime);
            lastEnterQueueTime = null;
          }
        }
      }

      if (e.status === StatusPrisma.AGUARDANDO_REGULACAO && lastEnterQueueTime !== null) {
        totalTime += Math.max(0, agoraMs - lastEnterQueueTime);
      }

      tempos.push(totalTime);
      totalCasosValidos++;
      if (totalTime <= limiteSlaMs) {
        dentroSla++;
      }
    }

    const tempoMedioMs = tempos.length
      ? tempos.reduce((a, b) => a + b, 0) / tempos.length
      : 180_000;
    const slaRegulacaoPorcento = totalCasosValidos > 0
      ? Math.round((dentroSla / totalCasosValidos) * 100)
      : 100;

    return {
      encaminhamentosHoje: hoje,
      aguardandoRegulacao: aguardando,
      pendenciasDocumento: pendencias,
      aprovadosHoje,
      tempoMedioConsolidacaoSegundos: Math.round(tempoMedioMs / 1000),
      encaminhamentosSemana: semana,
      enviadosAguardandoResposta: enviados,
      respondidosTotal: respondidos,
      slaRegulacaoPorcento,
    };
  }
}

export type { StatusEncaminhamento };
