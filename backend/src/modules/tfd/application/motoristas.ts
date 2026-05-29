/**
 * CRUD de motoristas TFD.
 *
 * Ao criar um motorista, o sistema também cria automaticamente um Atendente
 * vinculado (role=MOTORISTA_TFD) com senha provisória = últimos 8 dígitos
 * do CPF — usada pelo motorista para o 1º login no app mobile. A senha
 * provisória é devolvida UMA vez no response do `criar` (gestor anota e
 * entrega pessoalmente). O backend depois só guarda o bcrypt.
 */
import type { Request } from 'express';
import { Conflict, NotFound } from '../../../shared/errors';
import { prisma } from '../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../shared/scope';
import type { IAtendenteRepository } from '../../../domain/repositories/IAtendenteRepository';
import type { IPasswordHasher } from '../../../domain/services/IPasswordHasher';
import type { ITfdAuditLogger } from '../infrastructure/TfdAuditLogger';
import {
  assertMesmaPrefeitura,
  ctxAudit,
  resolverOperador,
  resolverPrefeituraIdEfetiva,
} from './_helpers';

export interface CriarMotoristaInput {
  nome: string;
  cpf: string;
  cnh: string;
  categoriaCnh: 'B' | 'C' | 'D' | 'E';
  validadeCnh: string; // YYYY-MM-DD
  telefone: string;
}
export interface AtualizarMotoristaInput extends Partial<CriarMotoristaInput> {
  status?: 'ATIVO' | 'AFASTADO' | 'INATIVO';
}

function rowParaMotorista(r: any) {
  return {
    id: r.id,
    nome: r.nome,
    cpf: r.cpf,
    cnh: r.cnh,
    categoriaCnh: r.categoriaCnh,
    validadeCnh: r.validadeCnh.toISOString().slice(0, 10),
    telefone: r.telefone,
    status: r.status,
    totalViagens: r.totalViagens,
    totalKmRodados: Number(r.totalKmRodados),
    cnhVencidaEm: diasParaVencer(r.validadeCnh),
    prefeituraId: r.prefeituraId,
    criadoEm: r.criadoEm.toISOString(),
    atualizadoEm: r.atualizadoEm.toISOString(),
  };
}

function diasParaVencer(d: Date): number {
  const ms = d.getTime() - Date.now();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export class MotoristasTfdUseCases {
  constructor(
    private readonly audit: ITfdAuditLogger,
    private readonly atendentes: IAtendenteRepository,
    private readonly hasher: IPasswordHasher,
  ) {}

  async listar(scope: AccessScope, req: Request) {
    const prefeituraId = resolverPrefeituraIdEfetiva(scope, req);
    const rows = await prisma.motoristaTFD.findMany({
      where: { prefeituraId, deletadoEm: null },
      orderBy: { nome: 'asc' },
    });
    return rows.map(rowParaMotorista);
  }

  async porId(scope: AccessScope, id: string) {
    const r = await prisma.motoristaTFD.findUnique({ where: { id } });
    if (!r || r.deletadoEm) throw NotFound('MOTORISTA_NAO_ENCONTRADO', 'Motorista não encontrado');
    assertMesmaPrefeitura(scope, r.prefeituraId);
    return rowParaMotorista(r);
  }

  async criar(scope: AccessScope, req: Request, autorId: string, input: CriarMotoristaInput) {
    const prefeituraId = resolverPrefeituraIdEfetiva(scope, req);
    const op = await resolverOperador(this.atendentes, autorId, prefeituraId);

    const cpf = input.cpf.replace(/\D+/g, '');
    if (cpf.length !== 11) {
      throw Conflict('CPF_INVALIDO', 'CPF deve ter 11 dígitos');
    }

    const dup = await prisma.motoristaTFD.findFirst({
      where: { prefeituraId, cpf, deletadoEm: null },
      select: { id: true },
    });
    if (dup) throw Conflict('CPF_DUPLICADO', `Já existe motorista com CPF ${cpf} ativo`);

    const validadeCnh = new Date(`${input.validadeCnh}T00:00:00.000Z`);
    if (Number.isNaN(validadeCnh.getTime())) {
      throw Conflict('VALIDADE_CNH_INVALIDA', 'Validade CNH inválida (use YYYY-MM-DD)');
    }

    // Gera matrícula determinística + ajusta colisão (raro).
    let matricula = `MOT-${cpf.slice(-6)}`;
    const collision = await prisma.atendente.findUnique({ where: { matricula }, select: { id: true } });
    if (collision) {
      matricula = `${matricula}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    }

    // Senha provisória = últimos 8 dígitos do CPF — devolvida UMA vez no response.
    const senhaProvisoria = cpf.slice(-8);
    const senhaHash = await this.hasher.hash(senhaProvisoria);
    const emailSintetico = `motorista-${matricula.toLowerCase()}@motorista.local`;

    const novo = await prisma.$transaction(async (tx) => {
      const atendente = await tx.atendente.create({
        data: {
          matricula,
          nome: input.nome.trim(),
          email: emailSintetico,
          senhaHash,
          cpf,
          telefone: input.telefone.trim(),
          cargo: 'MOTORISTA TFD',
          funcao: 'Motorista da frota TFD',
          role: 'MOTORISTA_TFD',
          ativo: true,
          prefeituraId,
        },
      });
      const motorista = await tx.motoristaTFD.create({
        data: {
          prefeituraId,
          nome: input.nome.trim(),
          cpf,
          cnh: input.cnh.trim(),
          categoriaCnh: input.categoriaCnh,
          validadeCnh,
          telefone: input.telefone.trim(),
          criadoPorId: autorId,
          atendenteId: atendente.id,
          primeiroLogin: true,
        },
      });
      return motorista;
    });

    await this.audit.registrar({
      prefeituraId,
      acao: 'MOTORISTA_CRIADO',
      recursoTipo: 'MOTORISTA',
      recursoId: novo.id,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      depois: {
        nome: novo.nome,
        cnh: novo.cnh,
        categoriaCnh: novo.categoriaCnh,
        matricula,
      },
    });

    // Devolve a senha em texto plano UMA vez — entregar fisicamente ao motorista.
    return {
      ...rowParaMotorista(novo),
      matricula,
      senhaProvisoria,
    };
  }

  async atualizar(
    scope: AccessScope,
    req: Request,
    autorId: string,
    id: string,
    input: AtualizarMotoristaInput,
  ) {
    const atual = await prisma.motoristaTFD.findUnique({ where: { id } });
    if (!atual || atual.deletadoEm) throw NotFound('MOTORISTA_NAO_ENCONTRADO', 'Motorista não encontrado');
    assertMesmaPrefeitura(scope, atual.prefeituraId);
    const op = await resolverOperador(this.atendentes, autorId, atual.prefeituraId);

    const data: Record<string, unknown> = {};
    if (input.nome !== undefined) data['nome'] = input.nome.trim();
    if (input.cnh !== undefined) data['cnh'] = input.cnh.trim();
    if (input.categoriaCnh !== undefined) data['categoriaCnh'] = input.categoriaCnh;
    if (input.validadeCnh !== undefined)
      data['validadeCnh'] = new Date(`${input.validadeCnh}T00:00:00.000Z`);
    if (input.telefone !== undefined) data['telefone'] = input.telefone.trim();
    if (input.status !== undefined) data['status'] = input.status;

    const updated = await prisma.motoristaTFD.update({ where: { id }, data });
    await this.audit.registrar({
      prefeituraId: atual.prefeituraId,
      acao: 'MOTORISTA_ATUALIZADO',
      recursoTipo: 'MOTORISTA',
      recursoId: id,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      antes: { nome: atual.nome, validadeCnh: atual.validadeCnh.toISOString() },
      depois: input as Record<string, unknown>,
    });
    return rowParaMotorista(updated);
  }

  async setStatus(
    scope: AccessScope,
    req: Request,
    autorId: string,
    id: string,
    status: 'AFASTADO' | 'ATIVO',
  ) {
    const atual = await prisma.motoristaTFD.findUnique({ where: { id } });
    if (!atual || atual.deletadoEm) throw NotFound('MOTORISTA_NAO_ENCONTRADO', 'Motorista não encontrado');
    assertMesmaPrefeitura(scope, atual.prefeituraId);
    const op = await resolverOperador(this.atendentes, autorId, atual.prefeituraId);

    const updated = await prisma.motoristaTFD.update({ where: { id }, data: { status } });
    await this.audit.registrar({
      prefeituraId: atual.prefeituraId,
      acao: status === 'AFASTADO' ? 'MOTORISTA_AFASTADO' : 'MOTORISTA_REATIVADO',
      recursoTipo: 'MOTORISTA',
      recursoId: id,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      antes: { status: atual.status },
      depois: { status: updated.status },
    });
    return rowParaMotorista(updated);
  }

  async deletar(scope: AccessScope, req: Request, autorId: string, id: string) {
    const atual = await prisma.motoristaTFD.findUnique({ where: { id } });
    if (!atual || atual.deletadoEm) throw NotFound('MOTORISTA_NAO_ENCONTRADO', 'Motorista não encontrado');
    assertMesmaPrefeitura(scope, atual.prefeituraId);
    const op = await resolverOperador(this.atendentes, autorId, atual.prefeituraId);

    const ativas = await prisma.viagemFrota.count({
      where: { motoristaId: id, status: { in: ['AGENDADA', 'EM_ANDAMENTO'] } },
    });
    if (ativas > 0) {
      throw Conflict(
        'MOTORISTA_EM_USO',
        'Motorista possui viagens AGENDADA/EM_ANDAMENTO; conclua/cancele antes',
      );
    }

    await prisma.motoristaTFD.update({
      where: { id },
      data: { deletadoEm: new Date() },
    });
    await this.audit.registrar({
      prefeituraId: atual.prefeituraId,
      acao: 'MOTORISTA_DELETADO',
      recursoTipo: 'MOTORISTA',
      recursoId: id,
      operadorId: op.id,
      operadorNome: op.nome,
      operadorMatricula: op.matricula,
      operadorRole: op.role,
      ...ctxAudit(req),
      antes: { nome: atual.nome, cpf: atual.cpf },
    });
  }
}
