/**
 * Caderneta de vacinação — registro oficial de doses aplicadas.
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

export type ViaAplicacaoVacina = 'INTRAMUSCULAR' | 'SUBCUTANEA' | 'ORAL' | 'INTRADERMICA';

export interface AddVacinaInput {
  data: string; // ISO
  vacina: string;
  dose: string;
  lote: string;
  aplicador: string;
  unidade: string;
  via: ViaAplicacaoVacina;
}

export class AddVacinaUseCase {
  constructor(
    private readonly repo: IPacienteRepository,
    private readonly atendentes: IAtendenteRepository,
    private readonly audit: IProntuarioAuditLogger,
  ) {}

  async exec(
    scope: AccessScope,
    autorId: string,
    pacienteId: string,
    input: AddVacinaInput,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ): Promise<PacienteCompleto> {
    await assertAcessoPaciente(pacienteId, scope);
    const autor = await resolverAutor(this.atendentes, autorId);
    const data = parseIsoObrigatorio(input.data, 'DATA_INVALIDA', 'data');

    const novo = await prisma.vacinaAplicada.create({
      data: {
        pacienteId,
        data,
        vacina: input.vacina.trim(),
        dose: input.dose.trim(),
        lote: input.lote.trim(),
        aplicador: input.aplicador.trim(),
        unidade: input.unidade.trim(),
        via: input.via,
      },
      select: { id: true },
    });

    await this.audit.registrar({
      pacienteId,
      autorId: autor.id,
      autorNome: autor.nome,
      autorPapel: autor.papel,
      acao: 'ADD_VACINA',
      recursoId: novo.id,
      dados: { ...input },
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    });

    return carregarCompleto(this.repo, pacienteId, scope);
  }
}

export class RemoveVacinaUseCase {
  constructor(
    private readonly repo: IPacienteRepository,
    private readonly atendentes: IAtendenteRepository,
    private readonly audit: IProntuarioAuditLogger,
  ) {}

  async exec(
    scope: AccessScope,
    autorId: string,
    pacienteId: string,
    vacinaId: string,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ): Promise<PacienteCompleto> {
    await assertAcessoPaciente(pacienteId, scope);
    const autor = await resolverAutor(this.atendentes, autorId);

    const atual = await prisma.vacinaAplicada.findUnique({ where: { id: vacinaId } });
    if (!atual || atual.pacienteId !== pacienteId) {
      throw NotFound('VACINA_NAO_ENCONTRADA', 'Registro de vacinação não encontrado');
    }

    await prisma.vacinaAplicada.delete({ where: { id: vacinaId } });
    await this.audit.registrar({
      pacienteId,
      autorId: autor.id,
      autorNome: autor.nome,
      autorPapel: autor.papel,
      acao: 'REMOVE_VACINA',
      recursoId: vacinaId,
      dados: {
        data: atual.data.toISOString(),
        vacina: atual.vacina,
        dose: atual.dose,
        lote: atual.lote,
      },
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    });

    return carregarCompleto(this.repo, pacienteId, scope);
  }
}
