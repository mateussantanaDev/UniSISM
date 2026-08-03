/**
 * Edição limitada de um encaminhamento.
 *
 * Permitido só quando status === AGUARDANDO_REGULACAO
 *   (depois disso o regulador já está trabalhando; edições tornam-se auditoriais).
 *
 * Campos editáveis:
 *   - paciente.nome, .telefone, .endereco
 *   - solicitacao.justificativaClinica, .prioridade, .cidDescricao
 *   - solicitacao.especialidadeSolicitada, .cid10
 *
 * Não editável: CPF do paciente, protocolo, status, ubsId, atendenteResponsavel.
 * Toda edição gera evento timeline EDITADO.
 */
import type { Prisma } from '../../../generated/prisma';
import { prisma } from '../../infrastructure/database/prisma';
import {
  INCLUDE_ENCAMINHAMENTO_FULL,
  rowParaEncaminhamento,
} from '../../infrastructure/database/encaminhamentoMapper';
import { invalidarCacheArvorePorUbs } from '../../infrastructure/cache/arvoreCacheInvalidator';

import { whereByScopeViaUbs } from '../../infrastructure/database/scopeWhere';
import { Conflict, NotFound, Unprocessable } from '../../shared/errors';
import type { Encaminhamento, PrioridadeClinica } from '../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../shared/scope';
import type { IAuditLogger } from '../../infrastructure/audit/PrismaAuditLogger';

export interface UpdateEncaminhamentoInput {
  pacienteNome?: string;
  pacienteTelefone?: string;
  pacienteEndereco?: string;
  justificativaClinica?: string;
  prioridade?: PrioridadeClinica;
  cidDescricao?: string;
  especialidadeSolicitada?: string;
  cid10?: string;
  agendamentoPrevisto?: string | Date | null;
  dataDisponibilidade?: string | Date | null;
  localAgendamento?: string | null;
  profissionalAgendado?: string | null;
  cidadeAgendamento?: string | null;
  ufAgendamento?: string | null;
}

export class UpdateEncaminhamentoUseCase {
  constructor(private readonly audit?: IAuditLogger) {}

  async exec(
    id: string,
    scope: AccessScope,
    editorNome: string,
    editorPapel: string,
    editorId: string,
    input: UpdateEncaminhamentoInput,
    opts: { bypassGateDeStatus?: boolean } = {},
  ): Promise<Encaminhamento> {
    const existe = await prisma.encaminhamento.findFirst({
      where: { id, ...whereByScopeViaUbs(scope) },
    });
    if (!existe) throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    if (existe.deletadoEm) {
      throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    }
    // Regulação, Centro, Admin e Dev podem editar encaminhamentos em qualquer status (ex: APROVADO)
    const isRegulacaoOuAdminOuCentro =
      scope.kind !== 'UBS' ||
      ['REGULADOR_SMS', 'ADMIN', 'DESENVOLVEDOR', 'ATENDENTE_CENTRO'].some((r) =>
        (editorPapel || '').toUpperCase().includes(r),
      );

    if (
      !opts.bypassGateDeStatus &&
      !isRegulacaoOuAdminOuCentro &&
      existe.status !== 'AGUARDANDO_REGULACAO'
    ) {
      throw Conflict(
        'EDICAO_NAO_PERMITIDA',
        'Encaminhamento só pode ser editado em AGUARDANDO_REGULACAO',
        { statusAtual: existe.status },
      );
    }

    const data: Prisma.EncaminhamentoUpdateInput = {};
    const camposAlterados: string[] = [];

    if (input.pacienteNome !== undefined && input.pacienteNome.trim() !== existe.pacienteNome) {
      data.pacienteNome = input.pacienteNome.trim();
      camposAlterados.push('paciente.nome');
    }
    if (input.pacienteTelefone !== undefined && input.pacienteTelefone !== existe.pacienteTelefone) {
      data.pacienteTelefone = input.pacienteTelefone;
      camposAlterados.push('paciente.telefone');
    }
    if (input.pacienteEndereco !== undefined && input.pacienteEndereco !== existe.pacienteEndereco) {
      data.pacienteEndereco = input.pacienteEndereco;
      camposAlterados.push('paciente.endereco');
    }
    if (
      input.justificativaClinica !== undefined &&
      input.justificativaClinica.trim() !== existe.justificativaClinica
    ) {
      if (input.justificativaClinica.trim().length === 0) {
        throw Unprocessable('JUSTIFICATIVA_VAZIA', 'Justificativa clínica não pode ficar vazia');
      }
      data.justificativaClinica = input.justificativaClinica.trim();
      camposAlterados.push('solicitacao.justificativaClinica');
    }
    if (input.prioridade !== undefined && input.prioridade !== existe.prioridade) {
      data.prioridade = input.prioridade;
      camposAlterados.push('solicitacao.prioridade');
    }
    if (input.cidDescricao !== undefined && input.cidDescricao !== existe.cidDescricao) {
      data.cidDescricao = input.cidDescricao;
      camposAlterados.push('solicitacao.cidDescricao');
    }
    if (
      input.especialidadeSolicitada !== undefined &&
      input.especialidadeSolicitada !== existe.especialidadeSolicitada
    ) {
      data.especialidadeSolicitada = input.especialidadeSolicitada;
      camposAlterados.push('solicitacao.especialidadeSolicitada');
    }
    if (input.cid10 !== undefined && input.cid10 !== existe.cid10) {
      data.cid10 = input.cid10;
      camposAlterados.push('solicitacao.cid10');
    }
    if (input.agendamentoPrevisto !== undefined) {
      if (!input.agendamentoPrevisto) {
        data.agendamentoPrevisto = null;
      } else {
        data.agendamentoPrevisto = new Date(input.agendamentoPrevisto);
      }
      camposAlterados.push('agendamentoPrevisto');
    }
    if (input.dataDisponibilidade !== undefined) {
      if (!input.dataDisponibilidade) {
        data.dataDisponibilidade = null;
      } else {
        data.dataDisponibilidade = new Date(input.dataDisponibilidade);
      }
      camposAlterados.push('dataDisponibilidade');
    }
    if (input.localAgendamento !== undefined && input.localAgendamento !== existe.localAgendamento) {
      data.localAgendamento = input.localAgendamento;
      camposAlterados.push('localAgendamento');
    }
    if (input.profissionalAgendado !== undefined && input.profissionalAgendado !== existe.profissionalAgendado) {
      data.profissionalAgendado = input.profissionalAgendado;
      camposAlterados.push('profissionalAgendado');
    }
    if (input.cidadeAgendamento !== undefined && input.cidadeAgendamento !== existe.cidadeAgendamento) {
      data.cidadeAgendamento = input.cidadeAgendamento;
      camposAlterados.push('cidadeAgendamento');
    }
    if (input.ufAgendamento !== undefined && input.ufAgendamento !== existe.ufAgendamento) {
      data.ufAgendamento = input.ufAgendamento;
      camposAlterados.push('ufAgendamento');
    }

    if (camposAlterados.length === 0) {
      throw Unprocessable('NENHUMA_ALTERACAO', 'Nenhum campo alterado');
    }

    const atualizado = await prisma.$transaction(async (tx) => {
      await tx.eventoTimeline.create({
        data: {
          encaminhamentoId: id,
          tipo: 'EDITADO',
          titulo: 'Encaminhamento editado',
          descricao: `Campos alterados: ${camposAlterados.join(', ')}`,
          autor: editorNome,
          autorPapel: editorPapel,
        },
      });
      return tx.encaminhamento.update({
        where: { id },
        data,
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });
    });

    await this.audit?.registrar({
      acao: 'EDITAR_ENCAMINHAMENTO',
      recurso: 'Encaminhamento',
      recursoId: id,
      atendenteId: editorId,
      payload: { protocolo: atualizado.protocolo, camposAlterados },
    });

    void invalidarCacheArvorePorUbs(atualizado.ubsId);

    return rowParaEncaminhamento(atualizado);
  }
}
