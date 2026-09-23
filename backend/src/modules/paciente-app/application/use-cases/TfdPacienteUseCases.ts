/**
 * TFD do paciente (Face 3 mobile) — listagem de viagens disponíveis e
 * solicitação de vaga.
 *
 * Reaproveita o domínio TFD da Face 4 (gestor):
 *   - `ViagemFrota` da Face 4 vira `TfdViagemDto` (filtrado por prefeitura do paciente)
 *   - `TfdPacienteSolicitacao` é a entidade nova com pedidos feitos pelo paciente
 *     (separada de `SolicitacaoTFD` da UBS — que é criada por atendente UBS)
 *
 * Regra crítica: prioridade é **derivada no servidor** a partir do
 * encaminhamento anexado. Cliente NÃO envia.
 */
import { prisma } from '../../../../infrastructure/database/prisma';
import { Conflict, NotFound, Unprocessable } from '../../../../shared/errors';

export interface GeoCoord {
  lat: number;
  lng: number;
}

export interface TfdViagemPacienteDto {
  id: string;
  destinoCidade: string;
  destinoUf: string;
  destinoLocal: string;
  dataPartida: string; // ISO 8601
  horaPartida: string; // "HH:MM"
  localEmbarque: string;
  vagasTotal: number;
  vagasOcupadas: number;
  veiculoDescricao: string;
  veiculoPlaca: string;
  motoristaNome: string | null;
  observacoes: string | null;
  coordOrigem: GeoCoord | null;
  coordDestino: GeoCoord | null;
}

export interface TfdSolicitacaoPacienteDto {
  id: string;
  viagemId: string;
  status: 'AGUARDANDO' | 'APROVADA' | 'RECUSADA' | 'CANCELADA' | 'EMBARCADA' | 'CONCLUIDA';
  prioridade: 'NORMAL' | 'PRIORITARIA' | 'URGENTE';
  criadaEm: string;
  viagem: TfdViagemPacienteDto;
  numeroAssento: string | null;
  justificativaPaciente: string | null;
  motivoRecusa: string | null;
  encaminhamentoId: string | null;
  encaminhamentoProtocolo: string | null;
  acompanhante: string | null;
  aprovadaEm: string | null;
}

type TfdViagemPacienteRow = {
  id: string;
  destino: string;
  unidadeDestino: string | null;
  data: Date;
  horaSaida: string;
  rotaResumo: string | null;
  vagasTotais: number;
  observacoes: string | null;
  veiculo: {
    placa: string;
    modelo: string;
    capacidade: number;
  } | null;
  motorista: {
    nome: string;
  } | null;
  passageiros?: unknown[];
  _count?: {
    passageiros?: number;
    solicitacoesPaciente?: number;
  };
};

type TfdSolicitacaoPacienteRow = {
  id: string;
  viagemId: string;
  status: TfdSolicitacaoPacienteDto['status'];
  prioridade: TfdSolicitacaoPacienteDto['prioridade'];
  criadaEm: Date;
  viagem: TfdViagemPacienteRow;
  numeroAssento: string | null;
  justificativaPaciente: string | null;
  motivoRecusa: string | null;
  encaminhamentoId: string | null;
  encaminhamentoProtocolo: string | null;
  acompanhante: string | null;
  aprovadaEm: Date | null;
};

async function _prefeituraIdDoPaciente(contaId: string): Promise<string | null> {
  const conta = await prisma.pacienteConta.findUnique({
    where: { id: contaId },
    include: { ubsVinculada: { select: { prefeituraId: true } } },
  });
  return conta?.ubsVinculada?.prefeituraId ?? null;
}

function _viagemDto(v: TfdViagemPacienteRow): TfdViagemPacienteDto {
  // Vagas ocupadas = UBS (ViagemPassageiro) + app paciente (TfdPacienteSolicitacao APROVADA/EMBARCADA)
  const ocupadasUbs = v.passageiros?.length ?? v._count?.passageiros ?? 0;
  const ocupadasApp = v._count?.solicitacoesPaciente ?? 0;
  const ocupadas = ocupadasUbs + ocupadasApp;
  return {
    id: v.id,
    destinoCidade: v.destino ?? '',
    destinoUf: 'PE', // schema não tem UF explícita — assume PE por enquanto
    destinoLocal: v.unidadeDestino ?? v.destino ?? '',
    dataPartida: v.data.toISOString(),
    horaPartida: v.horaSaida,
    localEmbarque: v.rotaResumo ?? 'Local de embarque a confirmar',
    vagasTotal: v.vagasTotais,
    vagasOcupadas: ocupadas,
    veiculoDescricao: v.veiculo
      ? `${v.veiculo.modelo} · ${v.veiculo.capacidade} lugares`
      : '',
    veiculoPlaca: v.veiculo?.placa ?? '',
    motoristaNome: v.motorista?.nome ?? null,
    observacoes: v.observacoes,
    coordOrigem: null,
    coordDestino: null,
  };
}

function _solicitacaoDto(s: TfdSolicitacaoPacienteRow): TfdSolicitacaoPacienteDto {
  return {
    id: s.id,
    viagemId: s.viagemId,
    status: s.status,
    prioridade: s.prioridade,
    criadaEm: s.criadaEm.toISOString(),
    viagem: _viagemDto(s.viagem),
    numeroAssento: s.numeroAssento,
    justificativaPaciente: s.justificativaPaciente,
    motivoRecusa: s.motivoRecusa,
    encaminhamentoId: s.encaminhamentoId,
    encaminhamentoProtocolo: s.encaminhamentoProtocolo,
    acompanhante: s.acompanhante,
    aprovadaEm: s.aprovadaEm?.toISOString() ?? null,
  };
}

const INCLUDE_VIAGEM = {
  veiculo: { select: { placa: true, modelo: true, capacidade: true } },
  motorista: { select: { nome: true } },
  _count: {
    select: {
      passageiros: true,
      solicitacoesPaciente: {
        where: { status: { in: ['APROVADA' as const, 'EMBARCADA' as const] } },
      },
    },
  },
};

const INCLUDE_SOLIC = {
  viagem: { include: INCLUDE_VIAGEM },
};

// ─────────── LISTAR VIAGENS ───────────
export class ListarTfdViagensPacienteUseCase {
  async exec(contaId: string): Promise<TfdViagemPacienteDto[]> {
    const prefeituraId = await _prefeituraIdDoPaciente(contaId);
    if (!prefeituraId) return [];

    const hoje = new Date();
    hoje.setUTCHours(0, 0, 0, 0);

    const rows = await prisma.viagemFrota.findMany({
      where: {
        prefeituraId,
        status: 'AGENDADA',
        data: { gte: hoje },
      },
      include: INCLUDE_VIAGEM,
      orderBy: [{ data: 'asc' }, { horaSaida: 'asc' }],
      take: 50,
    });
    return rows.map(_viagemDto);
  }
}

// ─────────── OBTER VIAGEM ───────────
export class ObterTfdViagemPacienteUseCase {
  async exec(contaId: string, viagemId: string): Promise<TfdViagemPacienteDto> {
    const prefeituraId = await _prefeituraIdDoPaciente(contaId);
    const v = await prisma.viagemFrota.findUnique({
      where: { id: viagemId },
      include: INCLUDE_VIAGEM,
    });
    if (!v || v.prefeituraId !== prefeituraId || v.status !== 'AGENDADA') {
      throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem não encontrada');
    }
    return _viagemDto(v);
  }
}

// ─────────── LISTAR MINHAS SOLICITAÇÕES ───────────
export class ListarMinhasSolicitacoesTfdUseCase {
  async exec(contaId: string): Promise<TfdSolicitacaoPacienteDto[]> {
    const rows = await prisma.tfdPacienteSolicitacao.findMany({
      where: { contaId },
      include: INCLUDE_SOLIC,
      orderBy: { criadaEm: 'desc' },
      take: 100,
    });
    return rows.map(_solicitacaoDto);
  }
}

// ─────────── OBTER SOLICITAÇÃO ───────────
export class ObterMinhaSolicitacaoTfdUseCase {
  async exec(contaId: string, id: string): Promise<TfdSolicitacaoPacienteDto> {
    const s = await prisma.tfdPacienteSolicitacao.findUnique({
      where: { id },
      include: INCLUDE_SOLIC,
    });
    if (!s || s.contaId !== contaId) {
      throw NotFound('SOLICITACAO_NAO_ENCONTRADA', 'Solicitação não encontrada');
    }
    return _solicitacaoDto(s);
  }
}

// ─────────── CRIAR SOLICITAÇÃO ───────────
export interface CriarSolicitacaoTfdInput {
  viagemId: string;
  justificativa: string;
  encaminhamentoId?: string;
  acompanhante?: string;
}

export class CriarSolicitacaoTfdPacienteUseCase {
  async exec(
    contaId: string,
    cpfDigits: string,
    cpfFormatado: string,
    input: CriarSolicitacaoTfdInput,
  ): Promise<TfdSolicitacaoPacienteDto> {
    if (!input.justificativa || input.justificativa.trim().length < 10) {
      throw Unprocessable(
        'VALIDATION_ERROR',
        'Justificativa precisa ter pelo menos 10 caracteres.',
        { fields: { justificativa: 'Mínimo 10 caracteres.' } },
      );
    }

    // Resolve prefeitura do paciente.
    const prefeituraId = await _prefeituraIdDoPaciente(contaId);
    if (!prefeituraId) {
      throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem não encontrada');
    }

    // Carrega viagem + valida posse + status.
    const viagem = await prisma.viagemFrota.findUnique({
      where: { id: input.viagemId },
      include: { _count: { select: { passageiros: true } } },
    });
    if (!viagem || viagem.prefeituraId !== prefeituraId) {
      throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem não encontrada');
    }
    if (viagem.status !== 'AGENDADA') {
      throw Conflict('TFD_VIAGEM_ENCERRADA', 'Esta viagem não aceita mais pedidos.');
    }

    // Já tem solicitação ATIVA?
    const existente = await prisma.tfdPacienteSolicitacao.findUnique({
      where: { contaId_viagemId: { contaId, viagemId: input.viagemId } },
    });
    if (existente && (existente.status === 'AGUARDANDO' || existente.status === 'APROVADA')) {
      throw Conflict(
        'TFD_JA_TEM_SOLICITACAO',
        'Você já tem uma solicitação ativa para esta viagem.',
      );
    }

    // Deriva prioridade no servidor.
    let prioridade: 'NORMAL' | 'PRIORITARIA' | 'URGENTE' = 'NORMAL';
    let encProtocolo: string | null = null;
    if (input.encaminhamentoId) {
      const enc = await prisma.encaminhamento.findUnique({
        where: { id: input.encaminhamentoId },
        select: { id: true, protocolo: true, pacienteCpf: true, prioridade: true },
      });
      const cpfEnc = enc?.pacienteCpf.replace(/\D+/g, '');
      // Anti-enum: encaminhamento de outro paciente → trata como inexistente.
      if (!enc || (cpfEnc !== cpfDigits && enc.pacienteCpf !== cpfFormatado)) {
        throw Unprocessable(
          'VALIDATION_ERROR',
          'Encaminhamento não encontrado.',
          { fields: { encaminhamentoId: 'Encaminhamento não encontrado' } },
        );
      }
      encProtocolo = enc.protocolo;
      prioridade =
        enc.prioridade === 'URGENTE' || enc.prioridade === 'EMERGENCIA'
          ? 'URGENTE'
          : 'PRIORITARIA';
    }

    // Anti-spam: limite de reaberturas após recusa/cancelamento.
    // Default 3 tentativas. Se existente.tentativasReabertura >= 3 → bloqueia.
    const LIMITE_REABERTURAS = 3;
    if (existente && existente.tentativasReabertura >= LIMITE_REABERTURAS) {
      throw Conflict(
        'TFD_LIMITE_REABERTURAS',
        `Limite de ${LIMITE_REABERTURAS} reaberturas para esta viagem atingido. Procure a Secretaria.`,
      );
    }

    // Cria. Se já existia (status terminal — CANCELADA/RECUSADA), substitui via upsert.
    const created = existente
      ? await prisma.tfdPacienteSolicitacao.update({
          where: { id: existente.id },
          data: {
            status: 'AGUARDANDO',
            prioridade,
            justificativaPaciente: input.justificativa.trim(),
            acompanhante: input.acompanhante?.trim() ?? null,
            encaminhamentoId: input.encaminhamentoId ?? null,
            encaminhamentoProtocolo: encProtocolo,
            numeroAssento: null,
            motivoRecusa: null,
            operadorId: null,
            operadorNome: null,
            operadorMatricula: null,
            aprovadaEm: null,
            recusadaEm: null,
            canceladaEm: null,
            criadaEm: new Date(),
            tentativasReabertura: { increment: 1 },
          },
          include: INCLUDE_SOLIC,
        })
      : await prisma.tfdPacienteSolicitacao.create({
          data: {
            contaId,
            viagemId: input.viagemId,
            status: 'AGUARDANDO',
            prioridade,
            justificativaPaciente: input.justificativa.trim(),
            acompanhante: input.acompanhante?.trim() ?? null,
            encaminhamentoId: input.encaminhamentoId ?? null,
            encaminhamentoProtocolo: encProtocolo,
          },
          include: INCLUDE_SOLIC,
        });

    return _solicitacaoDto(created);
  }
}

// ─────────── CANCELAR SOLICITAÇÃO ───────────
import type { ITfdAuditLogger } from '../../../tfd/infrastructure/TfdAuditLogger';

export class CancelarSolicitacaoTfdPacienteUseCase {
  constructor(private readonly tfdAudit?: ITfdAuditLogger) {}

  async exec(
    contaId: string,
    id: string,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ): Promise<void> {
    const s = await prisma.tfdPacienteSolicitacao.findUnique({
      where: { id },
      include: { viagem: { select: { prefeituraId: true } } },
    });
    if (!s || s.contaId !== contaId) {
      throw NotFound('SOLICITACAO_NAO_ENCONTRADA', 'Solicitação não encontrada');
    }
    if (s.status !== 'AGUARDANDO') {
      throw Conflict('CONFLICT', 'Esta solicitação não pode mais ser cancelada.');
    }
    await prisma.$transaction(async (tx) => {
      await tx.tfdPacienteSolicitacao.update({
        where: { id },
        data: { status: 'CANCELADA', canceladaEm: new Date() },
      });
      // Audit hash-chain (paciente como operador). Best-effort: se tfdAudit não
      // estiver injetado (testes), skip.
      if (this.tfdAudit) {
        await this.tfdAudit.registrarNaTransacao(tx, {
          prefeituraId: s.viagem.prefeituraId,
          acao: 'TFD_PAC_SOLIC_CANCELADA_PELO_PACIENTE',
          recursoTipo: 'TfdPacienteSolicitacao',
          recursoId: id,
          operadorId: contaId, // contaId do paciente (self-cancel)
          operadorNome: 'PACIENTE',
          operadorMatricula: '',
          operadorRole: 'PACIENTE',
          ip: ctx?.ip ?? '',
          userAgent: ctx?.userAgent ?? '',
          antes: { status: 'AGUARDANDO' },
          depois: { status: 'CANCELADA' },
        });
      }
    });
  }
}
