/**
 * CRUD de veículos da frota TFD.
 * Cada mutação grava uma linha em `tfd_audit_log` (cadeia hash).
 */
import type { Request } from 'express';
import { Conflict, NotFound } from '../../../shared/errors';
import { prisma } from '../../../infrastructure/database/prisma';
import type { VeiculoTFD } from '../../../../generated/prisma';
import type { AccessScope } from '../../../shared/scope';
import type { IAtendenteRepository } from '../../../domain/repositories/IAtendenteRepository';
import type { ITfdAuditLogger } from '../infrastructure/TfdAuditLogger';
import {
  assertMesmaPrefeitura,
  ctxAudit,
  resolverOperador,
  resolverPrefeituraIdEfetiva,
} from './_helpers';

export interface CriarVeiculoInput {
  placa: string;
  modelo: string;
  tipo: 'VAN' | 'ONIBUS' | 'CARRO' | 'AMBULANCIA';
  capacidade: number;
  ano: number;
  combustivel: 'DIESEL' | 'GASOLINA' | 'ETANOL' | 'FLEX' | 'GNV' | 'ELETRICO';
  consumoMedioKml: number;
  hodometroAtualKm?: number;
  proximaRevisaoKm?: number | null;
  proximaRevisaoEm?: string | null; // YYYY-MM-DD
}

export interface AtualizarVeiculoInput extends Partial<CriarVeiculoInput> {
  status?: 'ATIVO' | 'EM_MANUTENCAO' | 'INATIVO';
}

function rowParaVeiculo(r: VeiculoTFD) {
  return {
    id: r.id,
    placa: r.placa,
    modelo: r.modelo,
    tipo: r.tipo,
    capacidade: r.capacidade,
    ano: r.ano,
    combustivel: r.combustivel,
    consumoMedioKml: Number(r.consumoMedioKml),
    hodometroAtualKm: Number(r.hodometroAtualKm),
    proximaRevisaoKm: r.proximaRevisaoKm ? Number(r.proximaRevisaoKm) : null,
    proximaRevisaoEm: r.proximaRevisaoEm ? r.proximaRevisaoEm.toISOString().slice(0, 10) : null,
    status: r.status,
    prefeituraId: r.prefeituraId,
    criadoEm: r.criadoEm.toISOString(),
    atualizadoEm: r.atualizadoEm.toISOString(),
  };
}

export class VeiculosTfdUseCases {
  constructor(
    private readonly audit: ITfdAuditLogger,
    private readonly atendentes: IAtendenteRepository,
  ) {}

  async listar(scope: AccessScope, req: Request) {
    const prefeituraId = resolverPrefeituraIdEfetiva(scope, req);
    const rows = await prisma.veiculoTFD.findMany({
      where: { prefeituraId, deletadoEm: null },
      orderBy: { placa: 'asc' },
    });
    return rows.map(rowParaVeiculo);
  }

  async porId(scope: AccessScope, id: string) {
    const r = await prisma.veiculoTFD.findUnique({ where: { id } });
    if (!r || r.deletadoEm) throw NotFound('VEICULO_NAO_ENCONTRADO', 'Veículo não encontrado');
    assertMesmaPrefeitura(scope, r.prefeituraId);
    return rowParaVeiculo(r);
  }

  async criar(scope: AccessScope, req: Request, autorId: string, input: CriarVeiculoInput) {
    const prefeituraId = resolverPrefeituraIdEfetiva(scope, req);
    const op = await resolverOperador(this.atendentes, autorId, prefeituraId);

    // Placa única (entre não-deletados da prefeitura)
    const placa = input.placa.trim().toUpperCase();
    const dup = await prisma.veiculoTFD.findFirst({
      where: { prefeituraId, placa, deletadoEm: null },
      select: { id: true },
    });
    if (dup) throw Conflict('PLACA_DUPLICADA', `Já existe um veículo com placa ${placa} ativo`);

    const novo = await prisma.veiculoTFD.create({
      data: {
        prefeituraId,
        placa,
        modelo: input.modelo.trim(),
        tipo: input.tipo,
        capacidade: input.capacidade,
        ano: input.ano,
        combustivel: input.combustivel,
        consumoMedioKml: input.consumoMedioKml,
        hodometroAtualKm: BigInt(input.hodometroAtualKm ?? 0),
        proximaRevisaoKm: input.proximaRevisaoKm ? BigInt(input.proximaRevisaoKm) : null,
        proximaRevisaoEm: input.proximaRevisaoEm
          ? new Date(`${input.proximaRevisaoEm}T00:00:00.000Z`)
          : null,
        criadoPorId: autorId,
      },
    });

    await this.audit.registrar({
      prefeituraId,
      acao: 'VEICULO_CRIADO',
      recursoTipo: 'VEICULO',
      recursoId: novo.id,
      recursoProtocolo: novo.placa,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      depois: { placa: novo.placa, modelo: novo.modelo, tipo: novo.tipo, capacidade: novo.capacidade },
    });

    return rowParaVeiculo(novo);
  }

  async atualizar(
    scope: AccessScope,
    req: Request,
    autorId: string,
    id: string,
    input: AtualizarVeiculoInput,
  ) {
    const atual = await prisma.veiculoTFD.findUnique({ where: { id } });
    if (!atual || atual.deletadoEm) throw NotFound('VEICULO_NAO_ENCONTRADO', 'Veículo não encontrado');
    assertMesmaPrefeitura(scope, atual.prefeituraId);
    const op = await resolverOperador(this.atendentes, autorId, atual.prefeituraId);

    const data: Record<string, unknown> = {};
    if (input.placa !== undefined) data['placa'] = input.placa.trim().toUpperCase();
    if (input.modelo !== undefined) data['modelo'] = input.modelo.trim();
    if (input.tipo !== undefined) data['tipo'] = input.tipo;
    if (input.capacidade !== undefined) data['capacidade'] = input.capacidade;
    if (input.ano !== undefined) data['ano'] = input.ano;
    if (input.combustivel !== undefined) data['combustivel'] = input.combustivel;
    if (input.consumoMedioKml !== undefined) data['consumoMedioKml'] = input.consumoMedioKml;
    if (input.hodometroAtualKm !== undefined)
      data['hodometroAtualKm'] = BigInt(input.hodometroAtualKm);
    if (input.proximaRevisaoKm !== undefined)
      data['proximaRevisaoKm'] = input.proximaRevisaoKm ? BigInt(input.proximaRevisaoKm) : null;
    if (input.proximaRevisaoEm !== undefined)
      data['proximaRevisaoEm'] = input.proximaRevisaoEm
        ? new Date(`${input.proximaRevisaoEm}T00:00:00.000Z`)
        : null;
    if (input.status !== undefined) data['status'] = input.status;

    const updated = await prisma.veiculoTFD.update({ where: { id }, data });
    await this.audit.registrar({
      prefeituraId: atual.prefeituraId,
      acao: 'VEICULO_ATUALIZADO',
      recursoTipo: 'VEICULO',
      recursoId: id,
      recursoProtocolo: updated.placa,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      antes: { placa: atual.placa, status: atual.status },
      depois: input as Record<string, unknown>,
    });
    return rowParaVeiculo(updated);
  }

  async setStatus(
    scope: AccessScope,
    req: Request,
    autorId: string,
    id: string,
    status: 'EM_MANUTENCAO' | 'ATIVO',
  ) {
    const atual = await prisma.veiculoTFD.findUnique({ where: { id } });
    if (!atual || atual.deletadoEm) throw NotFound('VEICULO_NAO_ENCONTRADO', 'Veículo não encontrado');
    assertMesmaPrefeitura(scope, atual.prefeituraId);
    const op = await resolverOperador(this.atendentes, autorId, atual.prefeituraId);

    const updated = await prisma.veiculoTFD.update({ where: { id }, data: { status } });
    await this.audit.registrar({
      prefeituraId: atual.prefeituraId,
      acao: status === 'EM_MANUTENCAO' ? 'VEICULO_MANUTENCAO' : 'VEICULO_REATIVADO',
      recursoTipo: 'VEICULO',
      recursoId: id,
      recursoProtocolo: updated.placa,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      antes: { status: atual.status },
      depois: { status: updated.status },
    });
    return rowParaVeiculo(updated);
  }

  async deletar(scope: AccessScope, req: Request, autorId: string, id: string) {
    const atual = await prisma.veiculoTFD.findUnique({ where: { id } });
    if (!atual || atual.deletadoEm) throw NotFound('VEICULO_NAO_ENCONTRADO', 'Veículo não encontrado');
    assertMesmaPrefeitura(scope, atual.prefeituraId);
    const op = await resolverOperador(this.atendentes, autorId, atual.prefeituraId);

    // Bloqueia se há viagem agendada/em andamento
    const ativas = await prisma.viagemFrota.count({
      where: { veiculoId: id, status: { in: ['AGENDADA', 'EM_ANDAMENTO'] } },
    });
    if (ativas > 0) {
      throw Conflict(
        'VEICULO_EM_USO',
        'Veículo possui viagens AGENDADA/EM_ANDAMENTO; conclua/cancele antes',
      );
    }

    await prisma.veiculoTFD.update({
      where: { id },
      data: { deletadoEm: new Date() },
    });
    await this.audit.registrar({
      prefeituraId: atual.prefeituraId,
      acao: 'VEICULO_DELETADO',
      recursoTipo: 'VEICULO',
      recursoId: id,
      recursoProtocolo: atual.placa,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      antes: { placa: atual.placa, modelo: atual.modelo },
    });
  }
}
