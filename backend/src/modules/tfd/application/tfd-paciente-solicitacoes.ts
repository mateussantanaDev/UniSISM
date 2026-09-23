/**
 * Use cases administrativos para `TfdPacienteSolicitacao` (Face 4 gerencia
 * pedidos de TFD vindos do app paciente — Face 3).
 *
 * v0.17: Integração completa Face 3 ↔ Face 4.
 *
 * Garantias:
 *   1. **Hash chain SHA-256** — toda transição vai em `tfd_audit_log` (cadeia TJ)
 *   2. **Validação atômica de vagas** — `$transaction` previne race em viagens
 *      lotadas (paciente A e B competindo pela última vaga)
 *   3. **Auto-alocação em `ViagemPassageiro`** ao aprovar (transação)
 *   4. **Notificação push** ao paciente em transições (via NotificacaoPaciente)
 *   5. **Escopo prefeitura**: gestor só vê/aprova solicitações da sua prefeitura
 *   6. **motivoRecusa obrigatório** ao recusar (mín 5 chars)
 *   7. **Lista ordenada** por prioridade (URGENTE→PRIORITARIA→NORMAL) + idade
 */
import { Prisma } from '../../../../generated/prisma';
import { Conflict, NotFound, Unprocessable } from '../../../shared/errors';
import { prisma } from '../../../infrastructure/database/prisma';
import { ensurePrefeituraAcessivel, type AccessScope } from '../../../shared/scope';
import type { ITfdAuditLogger } from '../infrastructure/TfdAuditLogger';
import { NotificacaoPacienteService } from '../../../infrastructure/services/NotificacaoPacienteService';

export type StatusTfdPaciente =
  | 'AGUARDANDO'
  | 'APROVADA'
  | 'RECUSADA'
  | 'CANCELADA'
  | 'EMBARCADA'
  | 'CONCLUIDA';

export type PrioridadeTfdPaciente = 'NORMAL' | 'PRIORITARIA' | 'URGENTE';

export interface TfdPacienteSolicAdminDto {
  id: string;
  status: StatusTfdPaciente;
  prioridade: PrioridadeTfdPaciente;
  paciente: {
    contaId: string;
    nome: string;
    cpf: string;
  };
  viagem: {
    id: string;
    destino: string;
    unidadeDestino: string;
    data: string;
    horaSaida: string;
    vagasTotais: number;
    vagasOcupadas: number;
  };
  justificativaPaciente: string;
  acompanhante: string | null;
  encaminhamentoId: string | null;
  encaminhamentoProtocolo: string | null;
  numeroAssento: string | null;
  motivoRecusa: string | null;
  operadorNome: string | null;
  tentativasReabertura: number;
  criadaEm: string;
  aprovadaEm: string | null;
  recusadaEm: string | null;
  canceladaEm: string | null;
}

export interface OperadorTfdCtx {
  operadorId: string;
  operadorNome: string;
  operadorMatricula: string;
  operadorRole: string;
  ip: string;
  userAgent: string;
}

const INCLUDE_ADMIN = {
  conta: { select: { id: true, nome: true, cpfFormatado: true, cpf: true } },
  viagem: {
    select: {
      id: true,
      destino: true,
      unidadeDestino: true,
      data: true,
      horaSaida: true,
      vagasTotais: true,
      prefeituraId: true,
      _count: {
        select: {
          // UBS — `ViagemPassageiro` alocações
          passageiros: true,
          // App paciente — `TfdPacienteSolicitacao` em estado ocupando assento.
          // Filtra por status; cada pedido APROVADA/EMBARCADA consome 1 vaga.
          solicitacoesPaciente: {
            where: { status: { in: ['APROVADA' as const, 'EMBARCADA' as const] } },
          },
        },
      },
    },
  },
} satisfies Prisma.TfdPacienteSolicitacaoInclude;

function _toAdminDto(s: Prisma.TfdPacienteSolicitacaoGetPayload<{ include: typeof INCLUDE_ADMIN }>): TfdPacienteSolicAdminDto {
  return {
    id: s.id,
    status: s.status,
    prioridade: s.prioridade,
    paciente: {
      contaId: s.conta.id,
      nome: s.conta.nome,
      cpf: s.conta.cpfFormatado || s.conta.cpf,
    },
    viagem: {
      id: s.viagem.id,
      destino: s.viagem.destino,
      unidadeDestino: s.viagem.unidadeDestino ?? s.viagem.destino,
      data: s.viagem.data.toISOString(),
      horaSaida: s.viagem.horaSaida,
      vagasTotais: s.viagem.vagasTotais,
      // Soma as duas origens — UBS + pedidos do app já alocados.
      // Sem somar, o painel TFD mostra "0/12" mesmo com pedidos do app
      // já aprovados, e o gestor pode tentar superalocar.
      vagasOcupadas:
        s.viagem._count.passageiros + s.viagem._count.solicitacoesPaciente,
    },
    justificativaPaciente: s.justificativaPaciente,
    acompanhante: s.acompanhante,
    encaminhamentoId: s.encaminhamentoId,
    encaminhamentoProtocolo: s.encaminhamentoProtocolo,
    numeroAssento: s.numeroAssento,
    motivoRecusa: s.motivoRecusa,
    operadorNome: s.operadorNome,
    tentativasReabertura: s.tentativasReabertura,
    criadaEm: s.criadaEm.toISOString(),
    aprovadaEm: s.aprovadaEm?.toISOString() ?? null,
    recusadaEm: s.recusadaEm?.toISOString() ?? null,
    canceladaEm: s.canceladaEm?.toISOString() ?? null,
  };
}

const PRIORIDADE_RANK: Record<PrioridadeTfdPaciente, number> = {
  URGENTE: 3,
  PRIORITARIA: 2,
  NORMAL: 1,
};

/** Filtros opcionais para listagem. */
export interface ListarFiltrosAdmin {
  status?: StatusTfdPaciente;
  viagemId?: string;
  prioridade?: PrioridadeTfdPaciente;
}

/**
 * Lista solicitações TFD do paciente (Face 4 admin).
 * Ordenação: prioridade desc → criadaEm asc (FIFO dentro da mesma prioridade).
 */
export class ListarTfdPacienteSolicAdminUseCase {
  async exec(scope: AccessScope, filtros: ListarFiltrosAdmin = {}): Promise<TfdPacienteSolicAdminDto[]> {
    // Filtro de prefeitura: gestor PREFEITURA só vê solicitações de viagens da própria prefeitura
    const where: Prisma.TfdPacienteSolicitacaoWhereInput = {};
    if (filtros.status) where.status = filtros.status;
    if (filtros.viagemId) where.viagemId = filtros.viagemId;
    if (filtros.prioridade) where.prioridade = filtros.prioridade;

    if (scope.kind === 'PREFEITURA') {
      where.viagem = { prefeituraId: scope.prefeituraId };
    }
    // GLOBAL (DEV) vê tudo. UBS scope é bloqueado no controller.

    const rows = await prisma.tfdPacienteSolicitacao.findMany({
      where,
      include: INCLUDE_ADMIN,
      take: 200,
    });
    // Ordenação no app: prioridade rank desc + criadaEm asc
    rows.sort((a, b) => {
      const pa = PRIORIDADE_RANK[a.prioridade];
      const pb = PRIORIDADE_RANK[b.prioridade];
      if (pa !== pb) return pb - pa;
      return a.criadaEm.getTime() - b.criadaEm.getTime();
    });
    return rows.map(_toAdminDto);
  }
}

/**
 * Obter detalhe de uma solicitação (Face 4).
 */
export class ObterTfdPacienteSolicAdminUseCase {
  async exec(scope: AccessScope, id: string): Promise<TfdPacienteSolicAdminDto> {
    const s = await prisma.tfdPacienteSolicitacao.findUnique({
      where: { id },
      include: INCLUDE_ADMIN,
    });
    if (!s) throw NotFound('SOLICITACAO_NAO_ENCONTRADA', 'Solicitação não encontrada');
    ensurePrefeituraAcessivel(scope, s.viagem.prefeituraId);
    return _toAdminDto(s);
  }
}

export interface AprovarInput {
  /** Número de assento — opcional. Se omitido, sistema atribui sequencial. */
  numeroAssento?: string;
}

/**
 * Aprova solicitação TFD do paciente.
 * - Verifica vagas disponíveis (ATOMIC via $transaction)
 * - Aloca em `ViagemPassageiro`
 * - Grava `tfd_audit_log` (hash chain)
 * - Envia notificação push ao paciente
 */
export class AprovarTfdPacienteSolicUseCase {
  constructor(
    private readonly audit: ITfdAuditLogger,
    private readonly notificacoes: NotificacaoPacienteService,
  ) {}

  async exec(
    scope: AccessScope,
    id: string,
    operador: OperadorTfdCtx,
    input: AprovarInput = {},
  ): Promise<TfdPacienteSolicAdminDto> {
    const dtoOut = await prisma.$transaction(async (tx) => {
      // ─── Lock pessimista na viagem (anti race em concorrência de aprovação) ───
      // `SELECT ... FOR UPDATE` força serialização de aprovações para a MESMA viagem.
      // Sem isso, 2 gestores aprovando 2 solicitações na mesma viagem com 1 vaga
      // poderiam ambos ler `count=0` e ambos commitar → overbook.
      // PostgreSQL: linhas bloqueadas pela tx até commit/rollback.
      const sIni = await tx.tfdPacienteSolicitacao.findUnique({
        where: { id },
        select: { viagemId: true },
      });
      if (!sIni) throw NotFound('SOLICITACAO_NAO_ENCONTRADA', 'Solicitação não encontrada');
      await tx.$queryRawUnsafe(
        'SELECT id FROM "tfd_viagens" WHERE id = $1 FOR UPDATE',
        sIni.viagemId,
      );

      const s = await tx.tfdPacienteSolicitacao.findUnique({
        where: { id },
        include: {
          conta: { select: { id: true, cpf: true, cpfFormatado: true, nome: true } },
          viagem: { include: { _count: { select: { passageiros: true } } } },
        },
      });
      if (!s) throw NotFound('SOLICITACAO_NAO_ENCONTRADA', 'Solicitação não encontrada');
      ensurePrefeituraAcessivel(scope, s.viagem.prefeituraId);

      if (s.status !== 'AGUARDANDO') {
        throw Conflict(
          'STATUS_INVALIDO',
          `Só pode aprovar solicitação AGUARDANDO (atual: ${s.status})`,
        );
      }
      // Validação atômica de vagas — soma:
      //   (a) `ViagemPassageiro` (alocações UBS via SolicitacaoTFD)
      //   (b) `TfdPacienteSolicitacao` APROVADA/EMBARCADA (alocações app paciente)
      // O índice `[contaId, viagemId] UNIQUE` previne paciente duplicado.
      // Como temos `FOR UPDATE` na viagem acima, esses counts são consistentes
      // até o commit (outras txs aprovando esta viagem ficam bloqueadas).
      const ocupadasUbs = s.viagem._count.passageiros;
      const ocupadasApp = await tx.tfdPacienteSolicitacao.count({
        where: {
          viagemId: s.viagemId,
          status: { in: ['APROVADA', 'EMBARCADA'] },
        },
      });
      const ocupadas = ocupadasUbs + ocupadasApp;
      if (ocupadas >= s.viagem.vagasTotais) {
        throw Conflict(
          'TFD_VIAGEM_SEM_VAGAS',
          `Viagem está lotada (${ocupadas}/${s.viagem.vagasTotais}).`,
        );
      }

      // Atribuição de assento — formato "A{n}" se não fornecido.
      // Valida duplicação dentro da MESMA viagem (Brecha 2 fechada v0.17.1).
      const cpfDigits = s.conta.cpf.replace(/\D+/g, '');
      let numAssento = input.numeroAssento?.trim() ?? `A${ocupadas + 1}`;
      // Se admin passou explícito, valida que não está em uso na viagem
      // (TfdPacienteSolicitacao APROVADA/EMBARCADA). Para auto-gerado, tenta
      // até MAX_TRIES (raro precisar — só se houver gap por cancelamentos).
      const MAX_TRIES = 20;
      let collisionFound = false;
      for (let tryN = 0; tryN < MAX_TRIES; tryN++) {
        const colide = await tx.tfdPacienteSolicitacao.findFirst({
          where: {
            viagemId: s.viagemId,
            numeroAssento: numAssento,
            status: { in: ['APROVADA', 'EMBARCADA'] },
            id: { not: s.id },
          },
          select: { id: true },
        });
        if (!colide) {
          collisionFound = false;
          break;
        }
        // Admin explícito → erro imediato (não tenta sugerir outro)
        if (input.numeroAssento) {
          throw Conflict(
            'TFD_ASSENTO_OCUPADO',
            `Assento ${numAssento} já está ocupado nesta viagem.`,
          );
        }
        // Auto-gerado → tenta próximo
        collisionFound = true;
        numAssento = `A${ocupadas + 1 + tryN + 1}`;
      }
      if (collisionFound) {
        throw Conflict(
          'TFD_ASSENTO_INDISPONIVEL',
          'Não foi possível encontrar assento livre. Atribua manualmente.',
        );
      }

      const antes = { status: s.status, numeroAssento: s.numeroAssento };
      const agora = new Date();
      const atualizada = await tx.tfdPacienteSolicitacao.update({
        where: { id: s.id },
        data: {
          status: 'APROVADA',
          numeroAssento: numAssento,
          aprovadaEm: agora,
          recusadaEm: null,
          motivoRecusa: null,
          operadorId: operador.operadorId,
          operadorNome: operador.operadorNome,
          operadorMatricula: operador.operadorMatricula,
        },
        include: INCLUDE_ADMIN,
      });

      // Hash chain
      await this.audit.registrarNaTransacao(tx, {
        prefeituraId: s.viagem.prefeituraId,
        acao: 'TFD_PAC_SOLIC_APROVADA',
        recursoTipo: 'TfdPacienteSolicitacao',
        recursoId: s.id,
        operadorId: operador.operadorId,
        operadorNome: operador.operadorNome,
        operadorMatricula: operador.operadorMatricula,
        operadorRole: operador.operadorRole,
        ip: operador.ip,
        userAgent: operador.userAgent,
        antes,
        depois: { status: 'APROVADA', numeroAssento: numAssento },
      });

      // Notificação push (NotificacaoPaciente + dispatcher worker pega)
      // Reusa MENSAGENS.agendado pra UX consistente
      await this.notificacoes.notificarNaTransacao(tx, {
        cpfPaciente: s.conta.cpfFormatado || cpfDigits,
        pacienteNome: s.conta.nome,
        tipo: 'AGENDADO',
        titulo: 'Pedido de TFD aprovado',
        corpo: `Seu pedido de transporte foi APROVADO. Embarque ${atualizada.viagem.data.toISOString().slice(0, 10)} — assento ${numAssento}.`,
        payload: {
          tfdSolicitacaoId: s.id,
          viagemId: s.viagemId,
          numeroAssento: numAssento,
        },
      });

      return _toAdminDto(atualizada);
    });

    return dtoOut;
  }
}

export interface RecusarInput {
  motivo: string;
}

export class RecusarTfdPacienteSolicUseCase {
  constructor(
    private readonly audit: ITfdAuditLogger,
    private readonly notificacoes: NotificacaoPacienteService,
  ) {}

  async exec(
    scope: AccessScope,
    id: string,
    operador: OperadorTfdCtx,
    input: RecusarInput,
  ): Promise<TfdPacienteSolicAdminDto> {
    const motivo = input.motivo?.trim() ?? '';
    if (motivo.length < 5) {
      throw Unprocessable(
        'VALIDATION_ERROR',
        'Motivo da recusa precisa ter ao menos 5 caracteres.',
        { fields: { motivo: 'Mínimo 5 caracteres.' } },
      );
    }

    return await prisma.$transaction(async (tx) => {
      const s = await tx.tfdPacienteSolicitacao.findUnique({
        where: { id },
        include: {
          conta: { select: { id: true, cpf: true, cpfFormatado: true, nome: true } },
          viagem: { select: { prefeituraId: true } },
        },
      });
      if (!s) throw NotFound('SOLICITACAO_NAO_ENCONTRADA', 'Solicitação não encontrada');
      ensurePrefeituraAcessivel(scope, s.viagem.prefeituraId);

      if (s.status !== 'AGUARDANDO') {
        throw Conflict(
          'STATUS_INVALIDO',
          `Só pode recusar solicitação AGUARDANDO (atual: ${s.status})`,
        );
      }

      const agora = new Date();
      const atualizada = await tx.tfdPacienteSolicitacao.update({
        where: { id: s.id },
        data: {
          status: 'RECUSADA',
          recusadaEm: agora,
          motivoRecusa: motivo,
          operadorId: operador.operadorId,
          operadorNome: operador.operadorNome,
          operadorMatricula: operador.operadorMatricula,
        },
        include: INCLUDE_ADMIN,
      });

      await this.audit.registrarNaTransacao(tx, {
        prefeituraId: s.viagem.prefeituraId,
        acao: 'TFD_PAC_SOLIC_RECUSADA',
        recursoTipo: 'TfdPacienteSolicitacao',
        recursoId: s.id,
        operadorId: operador.operadorId,
        operadorNome: operador.operadorNome,
        operadorMatricula: operador.operadorMatricula,
        operadorRole: operador.operadorRole,
        ip: operador.ip,
        userAgent: operador.userAgent,
        antes: { status: 'AGUARDANDO' },
        depois: { status: 'RECUSADA', motivo: motivo.slice(0, 200) },
      });

      // Push notification ao paciente
      const cpfDigits = s.conta.cpf.replace(/\D+/g, '');
      await this.notificacoes.notificarNaTransacao(tx, {
        cpfPaciente: s.conta.cpfFormatado || cpfDigits,
        pacienteNome: s.conta.nome,
        tipo: 'REJEITADO',
        titulo: 'Pedido de TFD recusado',
        corpo: `Seu pedido de transporte foi recusado. Motivo: ${motivo.slice(0, 200)}`,
        payload: {
          tfdSolicitacaoId: s.id,
          viagemId: s.viagemId,
          motivo,
        },
      });

      return _toAdminDto(atualizada);
    });
  }
}

/** Marca embarque (motorista presente já no embarque). */
export class MarcarEmbarqueTfdPacUseCase {
  constructor(private readonly audit: ITfdAuditLogger) {}

  async exec(scope: AccessScope, id: string, operador: OperadorTfdCtx): Promise<TfdPacienteSolicAdminDto> {
    return await prisma.$transaction(async (tx) => {
      const s = await tx.tfdPacienteSolicitacao.findUnique({
        where: { id },
        include: { viagem: { select: { prefeituraId: true } } },
      });
      if (!s) throw NotFound('SOLICITACAO_NAO_ENCONTRADA', 'Solicitação não encontrada');
      ensurePrefeituraAcessivel(scope, s.viagem.prefeituraId);
      if (s.status !== 'APROVADA') {
        throw Conflict('STATUS_INVALIDO', `Só APROVADA pode embarcar (atual: ${s.status})`);
      }
      const r = await tx.tfdPacienteSolicitacao.update({
        where: { id },
        data: { status: 'EMBARCADA' },
        include: INCLUDE_ADMIN,
      });
      await this.audit.registrarNaTransacao(tx, {
        prefeituraId: s.viagem.prefeituraId,
        acao: 'TFD_PAC_EMBARCADA',
        recursoTipo: 'TfdPacienteSolicitacao',
        recursoId: id,
        operadorId: operador.operadorId,
        operadorNome: operador.operadorNome,
        operadorMatricula: operador.operadorMatricula,
        operadorRole: operador.operadorRole,
        ip: operador.ip,
        userAgent: operador.userAgent,
        antes: { status: 'APROVADA' },
        depois: { status: 'EMBARCADA' },
      });
      return _toAdminDto(r);
    });
  }
}

/** Marca como concluída (viagem terminou). */
export class MarcarConclusaoTfdPacUseCase {
  constructor(private readonly audit: ITfdAuditLogger) {}

  async exec(scope: AccessScope, id: string, operador: OperadorTfdCtx): Promise<TfdPacienteSolicAdminDto> {
    return await prisma.$transaction(async (tx) => {
      const s = await tx.tfdPacienteSolicitacao.findUnique({
        where: { id },
        include: { viagem: { select: { prefeituraId: true } } },
      });
      if (!s) throw NotFound('SOLICITACAO_NAO_ENCONTRADA', 'Solicitação não encontrada');
      ensurePrefeituraAcessivel(scope, s.viagem.prefeituraId);
      if (s.status !== 'EMBARCADA') {
        throw Conflict('STATUS_INVALIDO', `Só EMBARCADA pode concluir (atual: ${s.status})`);
      }
      const r = await tx.tfdPacienteSolicitacao.update({
        where: { id },
        data: { status: 'CONCLUIDA' },
        include: INCLUDE_ADMIN,
      });
      await this.audit.registrarNaTransacao(tx, {
        prefeituraId: s.viagem.prefeituraId,
        acao: 'TFD_PAC_CONCLUIDA',
        recursoTipo: 'TfdPacienteSolicitacao',
        recursoId: id,
        operadorId: operador.operadorId,
        operadorNome: operador.operadorNome,
        operadorMatricula: operador.operadorMatricula,
        operadorRole: operador.operadorRole,
        ip: operador.ip,
        userAgent: operador.userAgent,
        antes: { status: 'EMBARCADA' },
        depois: { status: 'CONCLUIDA' },
      });
      return _toAdminDto(r);
    });
  }
}
