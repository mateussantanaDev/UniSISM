/**
 * Atendimentos (SOAP) — registro formal de consulta/enfermagem/procedimento.
 * Não há UPDATE: SOAP é registro contemporâneo do fato. Se errou, deleta e recria.
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

export type TipoAtendimento =
  | 'CONSULTA_MEDICA'
  | 'ENFERMAGEM'
  | 'VACINACAO'
  | 'CURATIVO'
  | 'ODONTOLOGICO'
  | 'PROCEDIMENTO'
  | 'ACOLHIMENTO';

export interface AddAtendimentoInput {
  data: string; // ISO datetime
  tipo: TipoAtendimento;
  profissional: string;
  registroProfissional: string;
  especialidade: string;
  unidade: string;
  queixaPrincipal: string;
  diagnostico: string;
  cid10: string;
  conduta: string;
  prescricaoResumo?: string;
}

export class AddAtendimentoUseCase {
  constructor(
    private readonly repo: IPacienteRepository,
    private readonly atendentes: IAtendenteRepository,
    private readonly audit: IProntuarioAuditLogger,
  ) {}

  async exec(
    scope: AccessScope,
    autorId: string,
    pacienteId: string,
    input: AddAtendimentoInput,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ): Promise<PacienteCompleto> {
    await assertAcessoPaciente(pacienteId, scope);
    const autor = await resolverAutor(this.atendentes, autorId);
    const data = parseIsoObrigatorio(input.data, 'DATA_INVALIDA', 'data');

    const novo = await prisma.atendimento.create({
      data: {
        pacienteId,
        data,
        tipo: input.tipo,
        profissional: input.profissional.trim(),
        registroProfissional: input.registroProfissional.trim(),
        especialidade: input.especialidade.trim(),
        unidade: input.unidade.trim(),
        queixaPrincipal: input.queixaPrincipal.trim(),
        diagnostico: input.diagnostico.trim(),
        cid10: input.cid10.trim(),
        conduta: input.conduta.trim(),
        prescricaoResumo: input.prescricaoResumo?.trim() || null,
      },
      select: { id: true },
    });

    await this.audit.registrar({
      pacienteId,
      autorId: autor.id,
      autorNome: autor.nome,
      autorPapel: autor.papel,
      acao: 'ADD_ATENDIMENTO',
      recursoId: novo.id,
      dados: { ...input },
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    });

    return carregarCompleto(this.repo, pacienteId, scope);
  }
}

export class RemoveAtendimentoUseCase {
  constructor(
    private readonly repo: IPacienteRepository,
    private readonly atendentes: IAtendenteRepository,
    private readonly audit: IProntuarioAuditLogger,
  ) {}

  async exec(
    scope: AccessScope,
    autorId: string,
    pacienteId: string,
    atendimentoId: string,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ): Promise<PacienteCompleto> {
    await assertAcessoPaciente(pacienteId, scope);
    const autor = await resolverAutor(this.atendentes, autorId);

    const atual = await prisma.atendimento.findUnique({ where: { id: atendimentoId } });
    if (!atual || atual.pacienteId !== pacienteId) {
      throw NotFound('ATENDIMENTO_NAO_ENCONTRADO', 'Atendimento não encontrado');
    }

    await prisma.atendimento.delete({ where: { id: atendimentoId } });
    await this.audit.registrar({
      pacienteId,
      autorId: autor.id,
      autorNome: autor.nome,
      autorPapel: autor.papel,
      acao: 'REMOVE_ATENDIMENTO',
      recursoId: atendimentoId,
      dados: {
        data: atual.data.toISOString(),
        tipo: atual.tipo,
        profissional: atual.profissional,
        diagnostico: atual.diagnostico,
      },
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    });

    return carregarCompleto(this.repo, pacienteId, scope);
  }
}
