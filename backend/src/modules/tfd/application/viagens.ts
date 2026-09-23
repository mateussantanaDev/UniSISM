/**
 * Viagens da frota TFD — agendamento, alocação de passageiros, presença,
 * iniciar (com hodômetro), concluir (com hodômetro final), cancelar.
 *
 * Workflow:
 *   AGENDADA → EM_ANDAMENTO → CONCLUIDA
 *      ↓               ↓
 *   CANCELADA      CANCELADA
 *
 * Validações críticas:
 *   - Iniciar exige motorista com CNH válida e veículo ATIVO
 *   - Concluir exige kmFinal > kmInicial
 *   - Alocar passageiro exige solicitação APROVADA + capacidade do veículo
 *   - Cancelar libera solicitações alocadas (volta pra APROVADA)
 */
import type { Request } from 'express';
import { Conflict, NotFound, Unprocessable } from '../../../shared/errors';
import { prisma } from '../../../infrastructure/database/prisma';
import { StatusViagemFrota, type Prisma } from '../../../../generated/prisma';
import type { AccessScope } from '../../../shared/scope';
import type { IAtendenteRepository } from '../../../domain/repositories/IAtendenteRepository';
import type { ITfdAuditLogger } from '../infrastructure/TfdAuditLogger';
import { enumValue } from '../../../shared/prismaHelpers';
import {
  assertMesmaPrefeitura,
  ctxAudit,
  proximoProtocoloTfd,
  resolverOperador,
  resolverPrefeituraIdEfetiva,
  resolverVeiculoPorPlaca,
} from './_helpers';

export interface CriarViagemInput {
  data: string; // YYYY-MM-DD
  horaSaida: string;
  horaPrevistaRetorno?: string;
  /** Use `veiculoId` OU `placa` (UX BlaBlaCar — placa é resolvida no backend). */
  veiculoId?: string;
  placa?: string;
  motoristaId?: string;
  destino: string;
  unidadeDestino?: string;
  rotaResumo?: string;
  kmEstimados?: number;
  /** Número de assentos (vagas totais). Se omitido, usa capacidade do veículo. */
  vagasTotais?: number;
  observacoes?: string;
  isRegistroTardio?: boolean;
  justificativaTardia?: string;
}

export interface AtualizarViagemInput {
  data?: string;
  horaSaida?: string;
  horaPrevistaRetorno?: string;
  destino?: string;
  unidadeDestino?: string;
  rotaResumo?: string;
  kmEstimados?: number;
  observacoes?: string;
}

const INCLUDE_FULL = {
  veiculo: { select: { id: true, placa: true, modelo: true, capacidade: true, status: true } },
  motorista: { select: { id: true, nome: true, cnh: true, validadeCnh: true, status: true } },
  passageiros: {
    include: {
      paciente: { select: { id: true, nome: true, cpf: true } },
      solicitacao: { select: { protocolo: true, especialidade: true, prioridade: true } },
    },
  },
  // Pacientes que solicitaram vaga via app (Face 3) — segunda fonte de passageiros.
  // Sem isso, o painel da regulação mostra "12 vagas livres" mesmo com paciente
  // aprovado, e a validação de alocar passageiro permite overbooking.
  solicitacoesPaciente: {
    where: { status: { in: ['APROVADA' as const, 'EMBARCADA' as const] } },
    include: {
      conta: { select: { id: true, cpf: true, nome: true } },
      encaminhamento: { select: { id: true, protocolo: true, especialidadeSolicitada: true } },
    },
  },
} satisfies Prisma.ViagemFrotaInclude;

type ViagemFrotaRow = Prisma.ViagemFrotaGetPayload<{ include: typeof INCLUDE_FULL }>;

// TfdPacientePrioridade ('NORMAL'|'PRIORITARIA'|'URGENTE') → DTO prioridade.
function _mapPrioPaciente(p: string): string {
  return p === 'PRIORITARIA' ? 'PRIORITARIA' : p === 'URGENTE' ? 'URGENTE' : 'ELETIVA';
}

/**
 * Pedidos do app paciente guardam `numeroAssento` como string ("A1", "A12")
 * para compatibilizar com o auto-gen do backend (`A${n}`). A UI da Face 4
 * espera `number | null` em `PassageiroViagem.numeroAssento` (mesmo shape
 * que `ViagemPassageiro` UBS). Convertemos aqui para que o SeatPicker possa
 * comparar `p.numeroAssento === numero` sem falsos negativos.
 */
function _parseAssento(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(String(raw).replace(/^A/i, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function rowParaViagem(r: ViagemFrotaRow) {
  // Passageiros de duas fontes: UBS (ViagemPassageiro) + App (TfdPacienteSolicitacao APROVADA/EMBARCADA)
  const passageirosUbs = (r.passageiros ?? []).map((p) => ({
    id: p.id,
    origem: 'UBS' as const,
    solicitacaoId: p.solicitacaoId,
    protocolo: p.solicitacao?.protocolo ?? null,
    pacienteId: p.pacienteId,
    pacienteNome: p.paciente?.nome ?? null,
    pacienteCpf: p.paciente?.cpf ?? null,
    especialidade: p.solicitacao?.especialidade ?? null,
    prioridade: p.solicitacao?.prioridade ?? null,
    numeroAssento: p.numeroAssento,
    acompanhante: p.acompanhante,
    presenca: p.presenca,
    observacao: p.observacao,
    marcadoEm: p.marcadoEm?.toISOString() ?? null,
  }));

  const passageirosApp = (r.solicitacoesPaciente ?? []).map((s) => ({
    id: `sol-${s.id}`,
    origem: 'APP' as const,
    solicitacaoId: s.id,
    protocolo: s.encaminhamento?.protocolo ?? s.encaminhamentoProtocolo ?? null,
    pacienteId: null,
    pacienteNome: s.conta?.nome ?? null,
    pacienteCpf: s.conta?.cpf ?? null,
    especialidade: s.encaminhamento?.especialidadeSolicitada ?? null,
    prioridade: _mapPrioPaciente(s.prioridade),
    // String "A12" → 12 — mesmo shape do `ViagemPassageiro` UBS.
    numeroAssento: _parseAssento(s.numeroAssento),
    acompanhante: !!s.acompanhante,
    presenca: s.status === 'EMBARCADA' ? 'EMBARCADO' : 'AGUARDANDO',
    observacao: s.justificativaPaciente ?? null,
    marcadoEm: s.aprovadaEm?.toISOString() ?? null,
  }));

  const passageiros = [...passageirosUbs, ...passageirosApp];
  const assentosOcupados = passageiros
    .map((p) => p.numeroAssento)
    .filter((n): n is number => typeof n === 'number');

  return {
    id: r.id,
    data: r.data.toISOString().slice(0, 10),
    horaSaida: r.horaSaida,
    horaPrevistaRetorno: r.horaPrevistaRetorno,
    veiculoId: r.veiculoId,
    veiculoPlaca: r.veiculo?.placa ?? null,
    veiculoModelo: r.veiculo?.modelo ?? null,
    veiculoCapacidade: r.veiculo?.capacidade ?? null,
    motoristaId: r.motoristaId,
    motoristaNome: r.motorista?.nome ?? null,
    destino: r.destino,
    unidadeDestino: r.unidadeDestino,
    rotaResumo: r.rotaResumo,
    kmEstimados: r.kmEstimados,
    kmInicialHodometro: r.kmInicialHodometro ? Number(r.kmInicialHodometro) : null,
    kmFinalHodometro: r.kmFinalHodometro ? Number(r.kmFinalHodometro) : null,
    vagasTotais: r.vagasTotais,
    vagasOcupadas: passageiros.length,
    observacoes: r.observacoes,
    status: r.status,
    motivoCancelamento: r.motivoCancelamento,
    criadaEm: r.criadaEm.toISOString(),
    iniciadaEm: r.iniciadaEm?.toISOString() ?? null,
    concluidaEm: r.concluidaEm?.toISOString() ?? null,
    passageiros,
    /// Lista de assentos ocupados (para o frontend renderizar mapa de assentos).
    assentosOcupados,
    prefeituraId: r.prefeituraId,
  };
}

export class ViagensTfdUseCases {
  constructor(
    private readonly audit: ITfdAuditLogger,
    private readonly atendentes: IAtendenteRepository,
  ) {}

  async listar(
    scope: AccessScope,
    req: Request,
    filtros: { status?: string; desde?: string; ate?: string },
  ) {
    const prefeituraId = resolverPrefeituraIdEfetiva(scope, req);
    const where: Prisma.ViagemFrotaWhereInput = { prefeituraId };
    if (filtros.status) {
      const status = enumValue(Object.values(StatusViagemFrota), filtros.status);
      if (!status) throw Unprocessable('STATUS_INVALIDO', 'Status de viagem TFD inválido');
      where.status = status;
    }
    if (filtros.desde || filtros.ate) {
      const range: Prisma.DateTimeFilter = {};
      if (filtros.desde) range.gte = new Date(`${filtros.desde}T00:00:00.000Z`);
      if (filtros.ate) range.lte = new Date(`${filtros.ate}T23:59:59.999Z`);
      where.data = range;
    }
    const rows = await prisma.viagemFrota.findMany({
      where,
      include: INCLUDE_FULL,
      orderBy: [{ data: 'desc' }, { horaSaida: 'asc' }],
      take: 200,
    });
    return rows.map(rowParaViagem);
  }

  async porId(scope: AccessScope, id: string) {
    const r = await prisma.viagemFrota.findUnique({ where: { id }, include: INCLUDE_FULL });
    if (!r) throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem não encontrada');
    assertMesmaPrefeitura(scope, r.prefeituraId);
    return rowParaViagem(r);
  }

  async criar(scope: AccessScope, req: Request, autorId: string, input: CriarViagemInput) {
    const prefeituraId = resolverPrefeituraIdEfetiva(scope, req);
    const op = await resolverOperador(this.atendentes, autorId, prefeituraId);

    // Resolve veiculoId — opcional para carro baixo / alocação manual prévia
    let veiculoId: string | null = null;
    let veiculoCapacidade = 4;
    if (input.veiculoId || input.placa) {
      veiculoId = input.veiculoId
        ?? (await resolverVeiculoPorPlaca(input.placa!, prefeituraId));
      const veiculo = await prisma.veiculoTFD.findUnique({ where: { id: veiculoId } });
      if (!veiculo || veiculo.deletadoEm || veiculo.prefeituraId !== prefeituraId) {
        throw NotFound('VEICULO_NAO_ENCONTRADO', 'Veículo não encontrado');
      }
      veiculoCapacidade = veiculo.capacidade;
    }

    let motoristaId: string | null = null;
    if (input.motoristaId) {
      const motorista = await prisma.motoristaTFD.findUnique({ where: { id: input.motoristaId } });
      if (!motorista || motorista.deletadoEm || motorista.prefeituraId !== prefeituraId) {
        throw NotFound('MOTORISTA_NAO_ENCONTRADO', 'Motorista não encontrado');
      }
      motoristaId = input.motoristaId;
    }

    // Vagas: default = capacidade do veículo ou 4
    const vagasTotais = input.vagasTotais ?? veiculoCapacidade;
    if (vagasTotais < 1) {
      throw Unprocessable('VAGAS_INVALIDAS', 'vagasTotais deve ser >= 1');
    }

    const codigoViagem = await proximoProtocoloTfd('VTFD');

    const novo = await prisma.viagemFrota.create({
      data: {
        codigoViagem,
        prefeituraId,
        data: new Date(`${input.data}T00:00:00.000Z`),
        horaSaida: input.horaSaida,
        horaPrevistaRetorno: input.horaPrevistaRetorno || null,
        veiculoId,
        motoristaId,
        destino: input.destino.trim(),
        unidadeDestino: input.unidadeDestino?.trim() || null,
        rotaResumo: input.rotaResumo?.trim() || null,
        kmEstimados: input.kmEstimados ?? null,
        isRegistroTardio: input.isRegistroTardio ?? false,
        justificativaTardia: input.justificativaTardia?.trim() || null,
        vagasTotais,
        observacoes: input.observacoes?.trim() || null,
        criadaPorId: autorId,
      },
      include: INCLUDE_FULL,
    });

    await this.audit.registrar({
      prefeituraId,
      acao: 'VIAGEM_CRIADA',
      recursoTipo: 'VIAGEM',
      recursoId: novo.id,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      depois: {
        data: input.data,
        veiculoId: input.veiculoId,
        motoristaId: input.motoristaId,
        destino: input.destino,
      },
    });
    return rowParaViagem(novo);
  }

  async atualizar(
    scope: AccessScope,
    req: Request,
    autorId: string,
    id: string,
    input: AtualizarViagemInput & { veiculoId?: string; motoristaId?: string },
  ) {
    const atual = await prisma.viagemFrota.findUnique({ where: { id } });
    if (!atual) throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem não encontrada');
    assertMesmaPrefeitura(scope, atual.prefeituraId);
    if (atual.status === 'CONCLUIDA' || atual.status === 'CANCELADA') {
      throw Conflict('STATUS_TERMINAL', `Não pode editar viagem ${atual.status}`);
    }
    const op = await resolverOperador(this.atendentes, autorId, atual.prefeituraId);

    const data: Record<string, unknown> = {};
    if (input.data !== undefined) data['data'] = new Date(`${input.data}T00:00:00.000Z`);
    if (input.horaSaida !== undefined) data['horaSaida'] = input.horaSaida;
    if (input.horaPrevistaRetorno !== undefined) data['horaPrevistaRetorno'] = input.horaPrevistaRetorno || null;
    if (input.destino !== undefined) data['destino'] = input.destino.trim();
    if (input.unidadeDestino !== undefined) data['unidadeDestino'] = input.unidadeDestino?.trim() || null;
    if (input.rotaResumo !== undefined) data['rotaResumo'] = input.rotaResumo?.trim() || null;
    if (input.kmEstimados !== undefined) data['kmEstimados'] = input.kmEstimados ?? null;
    if (input.observacoes !== undefined) data['observacoes'] = input.observacoes?.trim() || null;
    if (input.veiculoId !== undefined) data['veiculoId'] = input.veiculoId || null;
    if (input.motoristaId !== undefined) data['motoristaId'] = input.motoristaId || null;

    const updated = await prisma.viagemFrota.update({ where: { id }, data, include: INCLUDE_FULL });
    await this.audit.registrar({
      prefeituraId: atual.prefeituraId,
      acao: 'VIAGEM_ATUALIZADA',
      recursoTipo: 'VIAGEM',
      recursoId: id,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      antes: { destino: atual.destino, data: atual.data.toISOString().slice(0, 10) },
      depois: input as Record<string, unknown>,
    });
    return rowParaViagem(updated);
  }

  async iniciar(
    scope: AccessScope,
    req: Request,
    autorId: string,
    id: string,
    kmInicialHodometro: number,
  ) {
    const atual = await prisma.viagemFrota.findUnique({
      where: { id },
      include: { veiculo: true, motorista: true },
    });
    if (!atual) throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem não encontrada');
    assertMesmaPrefeitura(scope, atual.prefeituraId);
    if (atual.status !== 'AGENDADA') {
      throw Conflict('STATUS_INVALIDO', `Só pode iniciar viagem AGENDADA (atual: ${atual.status})`);
    }
    if (!atual.veiculo) {
      throw Unprocessable('VEICULO_REQUERIDO', 'Veículo é obrigatório para iniciar a viagem');
    }
    if (atual.veiculo.status !== 'ATIVO') {
      throw Unprocessable('VEICULO_INDISPONIVEL', `Veículo está ${atual.veiculo.status}`);
    }
    if (!atual.motorista) {
      throw Unprocessable('MOTORISTA_REQUERIDO', 'Motorista é obrigatório para iniciar a viagem');
    }
    if (atual.motorista.validadeCnh.getTime() < Date.now()) {
      throw Unprocessable('CNH_VENCIDA', 'CNH do motorista está vencida');
    }
    if (atual.motorista.status !== 'ATIVO') {
      throw Unprocessable('MOTORISTA_INDISPONIVEL', `Motorista está ${atual.motorista.status}`);
    }
    const kmIni = BigInt(kmInicialHodometro);
    if (kmIni < atual.veiculo.hodometroAtualKm) {
      throw Unprocessable(
        'HODOMETRO_INVALIDO',
        `Hodômetro inicial (${kmInicialHodometro}) menor que registrado no veículo (${atual.veiculo.hodometroAtualKm})`,
      );
    }
    const op = await resolverOperador(this.atendentes, autorId, atual.prefeituraId);

    const updated = await prisma.viagemFrota.update({
      where: { id },
      data: {
        status: 'EM_ANDAMENTO',
        kmInicialHodometro: kmIni,
        iniciadaEm: new Date(),
      },
      include: INCLUDE_FULL,
    });
    await this.audit.registrar({
      prefeituraId: atual.prefeituraId,
      acao: 'VIAGEM_INICIADA',
      recursoTipo: 'VIAGEM',
      recursoId: id,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      depois: { kmInicialHodometro },
    });
    return rowParaViagem(updated);
  }

  async registrarKmGestor(
    scope: AccessScope,
    req: Request,
    autorId: string,
    id: string,
    kmInicialHodometro: number,
    kmFinalHodometro: number,
    justificativa: string,
  ) {
    const atual = await prisma.viagemFrota.findUnique({ where: { id } });
    if (!atual) throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem não encontrada');
    assertMesmaPrefeitura(scope, atual.prefeituraId);
    const kmIni = BigInt(kmInicialHodometro);
    const kmFin = BigInt(kmFinalHodometro);
    if (kmFin <= kmIni) {
      throw Unprocessable('HODOMETRO_INVALIDO', 'Hodômetro final deve ser maior que o inicial');
    }
    const op = await resolverOperador(this.atendentes, autorId, atual.prefeituraId);

    const updated = await prisma.viagemFrota.update({
      where: { id },
      data: {
        kmInicialHodometro: kmIni,
        kmFinalHodometro: kmFin,
        kmGestorRegistradoPor: autorId,
        kmGestorDataRegistro: new Date(),
        justificativaKmGestor: justificativa.trim(),
      },
      include: INCLUDE_FULL,
    });

    await this.audit.registrar({
      prefeituraId: atual.prefeituraId,
      acao: 'VIAGEM_ATUALIZADA',
      recursoTipo: 'VIAGEM',
      recursoId: id,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      depois: { kmInicialHodometro, kmFinalHodometro, justificativa },
    });
    return rowParaViagem(updated);
  }

  async concluir(
    scope: AccessScope,
    req: Request,
    autorId: string,
    id: string,
    dados: {
      veiculoId?: string;
      motoristaId?: string;
      kmInicialHodometro?: number;
      kmFinalHodometro?: number;
      observacoes?: string;
    },
  ) {
    const atual = await prisma.viagemFrota.findUnique({ where: { id } });
    if (!atual) throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem não encontrada');
    assertMesmaPrefeitura(scope, atual.prefeituraId);

    const effectiveVeiculoId = dados.veiculoId ?? atual.veiculoId;
    const effectiveMotoristaId = dados.motoristaId ?? atual.motoristaId;
    const effectiveKmInicial = dados.kmInicialHodometro ?? (atual.kmInicialHodometro !== null ? Number(atual.kmInicialHodometro) : null);
    const effectiveKmFinal = dados.kmFinalHodometro ?? (atual.kmFinalHodometro !== null ? Number(atual.kmFinalHodometro) : null);

    // Trava Antifraude de Conclusão (Regra 5)
    if (!effectiveVeiculoId || !effectiveMotoristaId || effectiveKmInicial === null || effectiveKmFinal === null) {
      throw Unprocessable(
        'TRAVA_ANTIFRAUDE_CONCLUSAO',
        'Para finalizar a viagem de carro baixo, o Gestor DEVE fornecer Veículo, Motorista e Quilometragem (Hodômetro Inicial e Final).',
      );
    }

    const kmIni = BigInt(effectiveKmInicial);
    const kmFin = BigInt(effectiveKmFinal);
    if (kmFin <= kmIni) {
      throw Unprocessable(
        'HODOMETRO_INVALIDO',
        `Hodômetro final (${effectiveKmFinal}) deve ser maior que o inicial (${effectiveKmInicial})`,
      );
    }
    const op = await resolverOperador(this.atendentes, autorId, atual.prefeituraId);
    const kmRodados = kmFin - kmIni;

    const updated = await prisma.$transaction(async (tx) => {
      const v = await tx.viagemFrota.update({
        where: { id },
        data: {
          status: 'CONCLUIDA',
          veiculoId: effectiveVeiculoId,
          motoristaId: effectiveMotoristaId,
          kmInicialHodometro: kmIni,
          kmFinalHodometro: kmFin,
          concluidaEm: new Date(),
          observacoes: dados.observacoes?.trim() || atual.observacoes,
        },
        include: INCLUDE_FULL,
      });
      // Atualiza hodômetro do veículo
      await tx.veiculoTFD.update({
        where: { id: effectiveVeiculoId },
        data: { hodometroAtualKm: kmFin },
      });
      // Soma KM e contagem ao motorista
      await tx.motoristaTFD.update({
        where: { id: effectiveMotoristaId },
        data: {
          totalViagens: { increment: 1 },
          totalKmRodados: { increment: kmRodados },
        },
      });
      // Marca solicitações alocadas como REALIZADA
      const passageiros = await tx.viagemPassageiro.findMany({
        where: { viagemId: id },
        select: { solicitacaoId: true },
      });
      if (passageiros.length > 0) {
        await tx.solicitacaoTFD.updateMany({
          where: { id: { in: passageiros.map((p) => p.solicitacaoId) } },
          data: { status: 'REALIZADA' },
        });
      }
      return v;
    });

    await this.audit.registrar({
      prefeituraId: atual.prefeituraId,
      acao: 'VIAGEM_CONCLUIDA',
      recursoTipo: 'VIAGEM',
      recursoId: id,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      antes: { kmInicialHodometro: atual.kmInicialHodometro?.toString() },
      depois: { kmFinalHodometro: effectiveKmFinal, kmRodados: kmRodados.toString() },
    });
    return rowParaViagem(updated);
  }

  async cancelar(scope: AccessScope, req: Request, autorId: string, id: string, motivo: string) {
    const atual = await prisma.viagemFrota.findUnique({ where: { id } });
    if (!atual) throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem não encontrada');
    assertMesmaPrefeitura(scope, atual.prefeituraId);
    if (atual.status === 'CONCLUIDA' || atual.status === 'CANCELADA') {
      throw Conflict('STATUS_TERMINAL', `Viagem já está ${atual.status}`);
    }
    if (motivo.trim().length < 10) {
      throw Unprocessable('MOTIVO_OBRIGATORIO', 'Motivo do cancelamento deve ter ao menos 10 caracteres');
    }
    const op = await resolverOperador(this.atendentes, autorId, atual.prefeituraId);

    const updated = await prisma.$transaction(async (tx) => {
      const v = await tx.viagemFrota.update({
        where: { id },
        data: {
          status: 'CANCELADA',
          motivoCancelamento: motivo.trim(),
        },
        include: INCLUDE_FULL,
      });
      // Libera solicitações alocadas (volta pra APROVADA)
      const passageiros = await tx.viagemPassageiro.findMany({
        where: { viagemId: id },
        select: { solicitacaoId: true },
      });
      if (passageiros.length > 0) {
        await tx.solicitacaoTFD.updateMany({
          where: { id: { in: passageiros.map((p) => p.solicitacaoId) } },
          data: { status: 'APROVADA', viagemId: null },
        });
      }
      return v;
    });

    await this.audit.registrar({
      prefeituraId: atual.prefeituraId,
      acao: 'VIAGEM_CANCELADA',
      recursoTipo: 'VIAGEM',
      recursoId: id,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      depois: { motivo },
    });
    return rowParaViagem(updated);
  }

  async alocarPassageiro(
    scope: AccessScope,
    req: Request,
    autorId: string,
    viagemId: string,
    solicitacaoId: string,
    /** Assento opcional (1..vagasTotais). Se omitido, alocação livre. */
    numeroAssento?: number,
  ) {
    const viagem = await prisma.viagemFrota.findUnique({
      where: { id: viagemId },
      include: {
        veiculo: true,
        _count: {
          select: {
            passageiros: true,
            solicitacoesPaciente: { where: { status: { in: ['APROVADA' as const, 'EMBARCADA' as const] } } },
          },
        },
        passageiros: { select: { numeroAssento: true } },
        solicitacoesPaciente: {
          where: { status: { in: ['APROVADA' as const, 'EMBARCADA' as const] } },
          select: { numeroAssento: true },
        },
      },
    });
    if (!viagem) throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem não encontrada');
    assertMesmaPrefeitura(scope, viagem.prefeituraId);
    if (viagem.status !== 'AGENDADA') {
      throw Conflict('STATUS_INVALIDO', `Só pode alocar em viagem AGENDADA (atual: ${viagem.status})`);
    }
    // Vagas ocupadas = UBS (passageiros) + App (solicitacoesPaciente APROVADA/EMBARCADA)
    const totalOcupadas =
      viagem._count.passageiros + viagem._count.solicitacoesPaciente;
    if (totalOcupadas >= viagem.vagasTotais) {
      throw Conflict('CAPACIDADE_EXCEDIDA', `Viagem cheia (${viagem.vagasTotais} vagas)`);
    }
    let assentoFinal = numeroAssento;
    if (assentoFinal === undefined || assentoFinal === null) {
      assentoFinal = totalOcupadas + 1;
    }

    if (assentoFinal < 1 || assentoFinal > viagem.vagasTotais) {
      throw Unprocessable(
        'ASSENTO_INVALIDO',
        `Assento ${assentoFinal} fora do intervalo [1..${viagem.vagasTotais}]`,
      );
    }

    const assentoStr = String(assentoFinal);
    const ocupadoUbs = viagem.passageiros.some((p) => String(p.numeroAssento) === assentoStr);
    const ocupadoApp = viagem.solicitacoesPaciente.some(
      (s) => String(s.numeroAssento) === assentoStr,
    );
    if (ocupadoUbs || ocupadoApp) {
      if (numeroAssento !== undefined && numeroAssento !== null) {
        throw Conflict('ASSENTO_OCUPADO', `Assento ${numeroAssento} já está ocupado`);
      } else {
        // Encontra o próximo assento livre dinamicamente
        for (let a = 1; a <= viagem.vagasTotais; a++) {
          const str = String(a);
          const oUbs = viagem.passageiros.some((p) => String(p.numeroAssento) === str);
          const oApp = viagem.solicitacoesPaciente.some((s) => String(s.numeroAssento) === str);
          if (!oUbs && !oApp) {
            assentoFinal = a;
            break;
          }
        }
      }
    }

    const sol = await prisma.solicitacaoTFD.findUnique({ where: { id: solicitacaoId } });
    if (!sol || sol.deletadaEm || sol.prefeituraId !== viagem.prefeituraId) {
      throw NotFound('SOLICITACAO_NAO_ENCONTRADA', 'Solicitação não encontrada');
    }
    if (sol.status !== 'APROVADA') {
      throw Conflict(
        'SOLICITACAO_NAO_APROVADA',
        `Só pode alocar solicitação APROVADA (atual: ${sol.status})`,
      );
    }
    const op = await resolverOperador(this.atendentes, autorId, viagem.prefeituraId);

    await prisma.$transaction(async (tx) => {
      await tx.viagemPassageiro.create({
        data: {
          viagemId,
          solicitacaoId,
          pacienteId: sol.pacienteId,
          acompanhante: sol.acompanhanteNecessario,
          numeroAssento: assentoFinal,
        },
      });
      await tx.solicitacaoTFD.update({
        where: { id: solicitacaoId },
        data: { status: 'ALOCADA', viagemId },
      });
    });

    await this.audit.registrar({
      prefeituraId: viagem.prefeituraId,
      acao: 'PASSAGEIRO_ALOCADO',
      recursoTipo: 'VIAGEM',
      recursoId: viagemId,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      depois: { solicitacaoId, protocolo: sol.protocolo, pacienteId: sol.pacienteId, numeroAssento },
    });

    return this.porId(scope, viagemId);
  }

  async removerPassageiro(
    scope: AccessScope,
    req: Request,
    autorId: string,
    viagemId: string,
    passageiroId: string,
  ) {
    const viagem = await prisma.viagemFrota.findUnique({ where: { id: viagemId } });
    if (!viagem) throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem não encontrada');
    assertMesmaPrefeitura(scope, viagem.prefeituraId);
    if (viagem.status !== 'AGENDADA') {
      throw Conflict('STATUS_INVALIDO', `Só pode remover passageiro em viagem AGENDADA`);
    }
    const passag = await prisma.viagemPassageiro.findUnique({ where: { id: passageiroId } });
    if (!passag || passag.viagemId !== viagemId) {
      throw NotFound('PASSAGEIRO_NAO_ENCONTRADO', 'Passageiro não encontrado');
    }
    const op = await resolverOperador(this.atendentes, autorId, viagem.prefeituraId);

    await prisma.$transaction(async (tx) => {
      await tx.viagemPassageiro.delete({ where: { id: passageiroId } });
      await tx.solicitacaoTFD.update({
        where: { id: passag.solicitacaoId },
        data: { status: 'APROVADA', viagemId: null },
      });
    });

    await this.audit.registrar({
      prefeituraId: viagem.prefeituraId,
      acao: 'PASSAGEIRO_REMOVIDO',
      recursoTipo: 'VIAGEM',
      recursoId: viagemId,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      antes: { passageiroId, solicitacaoId: passag.solicitacaoId },
    });
    return this.porId(scope, viagemId);
  }

  async marcarPresenca(
    scope: AccessScope,
    req: Request,
    autorId: string,
    viagemId: string,
    passageiroId: string,
    presenca: 'CONFIRMADO' | 'EMBARCADO' | 'AUSENTE' | 'DESISTIU',
    observacao?: string,
  ) {
    const viagem = await prisma.viagemFrota.findUnique({ where: { id: viagemId } });
    if (!viagem) throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem não encontrada');
    assertMesmaPrefeitura(scope, viagem.prefeituraId);
    const passag = await prisma.viagemPassageiro.findUnique({ where: { id: passageiroId } });
    if (!passag || passag.viagemId !== viagemId) {
      throw NotFound('PASSAGEIRO_NAO_ENCONTRADO', 'Passageiro não encontrado');
    }
    const op = await resolverOperador(this.atendentes, autorId, viagem.prefeituraId);

    await prisma.viagemPassageiro.update({
      where: { id: passageiroId },
      data: {
        presenca,
        observacao: observacao?.trim() || null,
        marcadoEm: new Date(),
        marcadoPorId: autorId,
      },
    });
    await this.audit.registrar({
      prefeituraId: viagem.prefeituraId,
      acao: 'PRESENCA_MARCADA',
      recursoTipo: 'VIAGEM',
      recursoId: viagemId,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      antes: { presenca: passag.presenca },
      depois: { presenca, passageiroId, observacao },
    });
    return this.porId(scope, viagemId);
  }
}
