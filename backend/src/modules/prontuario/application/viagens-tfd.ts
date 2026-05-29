/**
 * Viagens TFD (Tratamento Fora do Domicílio) — workflow com transições de status:
 *
 *   AGENDADA ──[Iniciar]──→ EM_ANDAMENTO ──[Realizar]──→ REALIZADA
 *                 ↓                 ↓
 *              [Cancelar] ──────→ CANCELADA
 *
 * Estados terminais (REALIZADA, CANCELADA) não aceitam mais mudança. 422 se tentar.
 */
import { Conflict, NotFound } from '../../../shared/errors';
import { prisma } from '../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../shared/scope';
import type { PacienteCompleto } from '../../../domain/entities/Paciente';
import type { IPacienteRepository } from '../../../domain/repositories/IPacienteRepository';
import type { IAtendenteRepository } from '../../../domain/repositories/IAtendenteRepository';
import type { IProntuarioAuditLogger } from '../infrastructure/PrismaProntuarioAuditLogger';
import {
  assertAcessoPaciente,
  carregarCompleto,
  parseIsoObrigatorio,
  resolverAutor,
} from './_helpers';

export type TransporteTFD =
  | 'VAN_SMS'
  | 'AMBULANCIA'
  | 'PASSAGEM_RODOVIARIA'
  | 'PASSAGEM_AEREA';

export type StatusViagemTFD = 'AGENDADA' | 'EM_ANDAMENTO' | 'REALIZADA' | 'CANCELADA';

export interface AddViagemTfdInput {
  dataIda: string; // ISO
  dataVolta: string; // ISO
  destino: string;
  unidadeDestino: string;
  motivo: string;
  especialidade: string;
  acompanhante: boolean;
  transporte: TransporteTFD;
  custoEstimadoBRL?: number;
}

export interface UpdateViagemTfdInput {
  status?: StatusViagemTFD;
  dataIda?: string;
  dataVolta?: string;
  destino?: string;
  unidadeDestino?: string;
  custoEstimadoBRL?: number;
}

/** Transições válidas. `from -> Set<to>`. */
const TRANSICOES: Record<StatusViagemTFD, Set<StatusViagemTFD>> = {
  AGENDADA: new Set<StatusViagemTFD>(['EM_ANDAMENTO', 'CANCELADA']),
  EM_ANDAMENTO: new Set<StatusViagemTFD>(['REALIZADA', 'CANCELADA']),
  REALIZADA: new Set<StatusViagemTFD>(),
  CANCELADA: new Set<StatusViagemTFD>(),
};

export class AddViagemTfdUseCase {
  constructor(
    private readonly repo: IPacienteRepository,
    private readonly atendentes: IAtendenteRepository,
    private readonly audit: IProntuarioAuditLogger,
  ) {}

  async exec(
    scope: AccessScope,
    autorId: string,
    pacienteId: string,
    input: AddViagemTfdInput,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ): Promise<PacienteCompleto> {
    await assertAcessoPaciente(pacienteId, scope);
    const autor = await resolverAutor(this.atendentes, autorId);

    const dataIda = parseIsoObrigatorio(input.dataIda, 'DATA_INVALIDA', 'dataIda');
    const dataVolta = parseIsoObrigatorio(input.dataVolta, 'DATA_INVALIDA', 'dataVolta');
    if (dataVolta.getTime() < dataIda.getTime()) {
      throw Conflict('DATA_VOLTA_ANTERIOR_IDA', 'Data de volta não pode ser anterior à ida');
    }

    const ano = new Date().getUTCFullYear();
    const seq = await prisma.sequencialProtocolo.upsert({
      where: { chave: `TFD-${ano}` },
      create: { chave: `TFD-${ano}`, valor: 1 },
      update: { valor: { increment: 1 } },
    });
    const protocolo = `TFD-${ano}-${String(seq.valor).padStart(6, '0')}`;

    const novo = await prisma.viagemTFD.create({
      data: {
        protocolo,
        pacienteId,
        dataIda,
        dataVolta,
        destino: input.destino.trim(),
        unidadeDestino: input.unidadeDestino.trim(),
        motivo: input.motivo.trim(),
        especialidade: input.especialidade.trim(),
        acompanhante: input.acompanhante,
        transporte: input.transporte,
        status: 'AGENDADA',
        custoEstimadoBRL: input.custoEstimadoBRL ?? 0,
      },
      select: { id: true, protocolo: true },
    });

    await this.audit.registrar({
      pacienteId,
      autorId: autor.id,
      autorNome: autor.nome,
      autorPapel: autor.papel,
      acao: 'ADD_VIAGEM_TFD',
      recursoId: novo.id,
      dados: { protocolo: novo.protocolo, ...input },
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    });

    return carregarCompleto(this.repo, pacienteId, scope);
  }
}

export class UpdateViagemTfdUseCase {
  constructor(
    private readonly repo: IPacienteRepository,
    private readonly atendentes: IAtendenteRepository,
    private readonly audit: IProntuarioAuditLogger,
  ) {}

  async exec(
    scope: AccessScope,
    autorId: string,
    pacienteId: string,
    viagemId: string,
    input: UpdateViagemTfdInput,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ): Promise<PacienteCompleto> {
    await assertAcessoPaciente(pacienteId, scope);
    const autor = await resolverAutor(this.atendentes, autorId);

    const atual = await prisma.viagemTFD.findUnique({ where: { id: viagemId } });
    if (!atual || atual.pacienteId !== pacienteId) {
      throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem TFD não encontrada');
    }

    // Valida transição de status
    if (input.status !== undefined && input.status !== atual.status) {
      const permitidas = TRANSICOES[atual.status as StatusViagemTFD];
      if (!permitidas.has(input.status)) {
        throw Conflict(
          'TRANSICAO_INVALIDA',
          `Transição de ${atual.status} → ${input.status} não permitida`,
          { de: atual.status, para: input.status },
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (input.status !== undefined) data['status'] = input.status;
    if (input.dataIda !== undefined) {
      data['dataIda'] = parseIsoObrigatorio(input.dataIda, 'DATA_INVALIDA', 'dataIda');
    }
    if (input.dataVolta !== undefined) {
      data['dataVolta'] = parseIsoObrigatorio(input.dataVolta, 'DATA_INVALIDA', 'dataVolta');
    }
    if (input.destino !== undefined) data['destino'] = input.destino.trim();
    if (input.unidadeDestino !== undefined) data['unidadeDestino'] = input.unidadeDestino.trim();
    if (input.custoEstimadoBRL !== undefined) data['custoEstimadoBRL'] = input.custoEstimadoBRL;

    await prisma.viagemTFD.update({ where: { id: viagemId }, data });
    await this.audit.registrar({
      pacienteId,
      autorId: autor.id,
      autorNome: autor.nome,
      autorPapel: autor.papel,
      acao: 'UPDATE_VIAGEM_TFD',
      recursoId: viagemId,
      dados: {
        antes: {
          status: atual.status,
          dataIda: atual.dataIda.toISOString(),
          dataVolta: atual.dataVolta.toISOString(),
          destino: atual.destino,
          unidadeDestino: atual.unidadeDestino,
          custoEstimadoBRL: atual.custoEstimadoBRL,
        },
        depois: input,
      },
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    });

    return carregarCompleto(this.repo, pacienteId, scope);
  }
}

export class RemoveViagemTfdUseCase {
  constructor(
    private readonly repo: IPacienteRepository,
    private readonly atendentes: IAtendenteRepository,
    private readonly audit: IProntuarioAuditLogger,
  ) {}

  async exec(
    scope: AccessScope,
    autorId: string,
    pacienteId: string,
    viagemId: string,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ): Promise<PacienteCompleto> {
    await assertAcessoPaciente(pacienteId, scope);
    const autor = await resolverAutor(this.atendentes, autorId);

    const atual = await prisma.viagemTFD.findUnique({ where: { id: viagemId } });
    if (!atual || atual.pacienteId !== pacienteId) {
      throw NotFound('VIAGEM_NAO_ENCONTRADA', 'Viagem TFD não encontrada');
    }
    // Não permite excluir viagem REALIZADA — é registro histórico de custo SUS
    if (atual.status === 'REALIZADA') {
      throw Conflict(
        'VIAGEM_REALIZADA_IMUTAVEL',
        'Viagem REALIZADA não pode ser excluída (registro histórico)',
      );
    }

    await prisma.viagemTFD.delete({ where: { id: viagemId } });
    await this.audit.registrar({
      pacienteId,
      autorId: autor.id,
      autorNome: autor.nome,
      autorPapel: autor.papel,
      acao: 'REMOVE_VIAGEM_TFD',
      recursoId: viagemId,
      dados: {
        protocolo: atual.protocolo,
        status: atual.status,
        destino: atual.destino,
        dataIda: atual.dataIda.toISOString(),
      },
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    });

    return carregarCompleto(this.repo, pacienteId, scope);
  }
}
