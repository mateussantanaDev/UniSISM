/**
 * CRUD de exames realizados — laboratoriais, imagem, etc.
 */
import { NotFound } from '../../../shared/errors';
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

export type CategoriaExame = 'LABORATORIAL' | 'IMAGEM' | 'FUNCIONAL' | 'OUTROS';
export type ResultadoExame = 'NORMAL' | 'ALTERADO' | 'CRITICO' | 'PENDENTE';

export interface AddExameInput {
  data: string; // ISO
  tipo: string;
  categoria: CategoriaExame;
  solicitante: string;
  unidadeExecutora: string;
  resultado: ResultadoExame;
  observacao?: string;
}

export class AddExameUseCase {
  constructor(
    private readonly repo: IPacienteRepository,
    private readonly atendentes: IAtendenteRepository,
    private readonly audit: IProntuarioAuditLogger,
  ) {}

  async exec(
    scope: AccessScope,
    autorId: string,
    pacienteId: string,
    input: AddExameInput,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ): Promise<PacienteCompleto> {
    await assertAcessoPaciente(pacienteId, scope);
    const autor = await resolverAutor(this.atendentes, autorId);
    const data = parseIsoObrigatorio(input.data, 'DATA_INVALIDA', 'data');

    const novo = await prisma.exameRealizado.create({
      data: {
        pacienteId,
        data,
        tipo: input.tipo.trim(),
        categoria: input.categoria,
        solicitante: input.solicitante.trim(),
        unidadeExecutora: input.unidadeExecutora.trim(),
        resultado: input.resultado,
        observacao: input.observacao?.trim() || null,
      },
      select: { id: true },
    });

    await this.audit.registrar({
      pacienteId,
      autorId: autor.id,
      autorNome: autor.nome,
      autorPapel: autor.papel,
      acao: 'ADD_EXAME',
      recursoId: novo.id,
      dados: { ...input },
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    });

    return carregarCompleto(this.repo, pacienteId, scope);
  }
}

export class RemoveExameUseCase {
  constructor(
    private readonly repo: IPacienteRepository,
    private readonly atendentes: IAtendenteRepository,
    private readonly audit: IProntuarioAuditLogger,
  ) {}

  async exec(
    scope: AccessScope,
    autorId: string,
    pacienteId: string,
    exameId: string,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ): Promise<PacienteCompleto> {
    await assertAcessoPaciente(pacienteId, scope);
    const autor = await resolverAutor(this.atendentes, autorId);

    const atual = await prisma.exameRealizado.findUnique({ where: { id: exameId } });
    if (!atual || atual.pacienteId !== pacienteId) {
      throw NotFound('EXAME_NAO_ENCONTRADO', 'Exame não encontrado');
    }

    await prisma.exameRealizado.delete({ where: { id: exameId } });
    await this.audit.registrar({
      pacienteId,
      autorId: autor.id,
      autorNome: autor.nome,
      autorPapel: autor.papel,
      acao: 'REMOVE_EXAME',
      recursoId: exameId,
      dados: {
        data: atual.data.toISOString(),
        tipo: atual.tipo,
        categoria: atual.categoria,
        resultado: atual.resultado,
      },
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    });

    return carregarCompleto(this.repo, pacienteId, scope);
  }
}
