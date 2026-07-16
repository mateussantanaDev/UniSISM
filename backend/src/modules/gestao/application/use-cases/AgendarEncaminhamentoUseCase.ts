import { StatusEncaminhamento } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { INCLUDE_ENCAMINHAMENTO_FULL, rowParaEncaminhamento } from '../../../../infrastructure/database/encaminhamentoMapper';
import { whereByScopeViaUbs } from '../../../../infrastructure/database/scopeWhere';
import { Conflict, NotFound, Unprocessable } from '../../../../shared/errors';
import type { AccessScope } from '../../../../shared/scope';
import { invalidarCacheArvorePorUbs } from '../../../../infrastructure/cache/arvoreCacheInvalidator';
import { NotificacaoPacienteService, MENSAGENS } from '../../../../infrastructure/services/NotificacaoPacienteService';
import { logger } from '../../../../infrastructure/logger';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';

export interface AgendarInput {
  agendamentoPrevisto: string; // YYYY-MM-DD
  localAgendamento?: string;
  profissionalAgendado?: string;
  cidadeAgendamento?: string;
  ufAgendamento?: string;
}

export class AgendarEncaminhamentoUseCase {
  private readonly notificacoes = new NotificacaoPacienteService();

  async exec(
    id: string,
    scope: AccessScope,
    autor: { nome: string; papel: string },
    input: AgendarInput
  ): Promise<Encaminhamento> {
    const atual = await prisma.encaminhamento.findFirst({
      where: { id, ...whereByScopeViaUbs(scope) },
    });
    if (!atual) throw NotFound('ENCAMINHAMENTO_NAO_ENCONTRADO', 'Encaminhamento não encontrado');
    
    if (atual.status !== StatusEncaminhamento.APROVADO) {
      throw Conflict(
        'ENCAMINHAMENTO_NAO_APROVADO',
        'Encaminhamento deve estar aprovado para ser agendado.',
        { statusAtual: atual.status }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.agendamentoPrevisto)) {
      throw Unprocessable(
        'AGENDAMENTO_INVALIDO',
        'agendamentoPrevisto deve ser uma data no formato YYYY-MM-DD'
      );
    }
    const agendamento = new Date(`${input.agendamentoPrevisto}T00:00:00.000Z`);
    if (Number.isNaN(agendamento.getTime())) {
      throw Unprocessable('AGENDAMENTO_INVALIDO', 'agendamentoPrevisto inválido');
    }
    const hojeUtc = new Date();
    hojeUtc.setUTCHours(0, 0, 0, 0);
    if (agendamento < hojeUtc) {
      throw Unprocessable('AGENDAMENTO_NO_PASSADO', 'agendamentoPrevisto deve ser hoje ou no futuro');
    }

    const localAg = input.localAgendamento?.trim();
    const profAg = input.profissionalAgendado?.trim();
    const cidadeAg = input.cidadeAgendamento?.trim();
    const ufAg = input.ufAgendamento?.trim().toUpperCase();

    if (ufAg && !/^[A-Z]{2}$/.test(ufAg)) {
      throw Unprocessable(
        'UF_INVALIDA',
        'ufAgendamento deve ser 2 letras maiúsculas (ex.: BA, SP, PE)'
      );
    }

    const atualizado = await prisma.$transaction(async (tx) => {
      // 1. Create AGENDADO event
      await tx.eventoTimeline.create({
        data: {
          encaminhamentoId: id,
          tipo: 'AGENDADO',
          titulo: 'Consulta agendada',
          descricao: `Atendimento agendado para ${input.agendamentoPrevisto} no local ${localAg || 'não informado'}. Profissional: ${profAg || 'não informado'}.`,
          autor: autor.nome,
          autorPapel: autor.papel,
        },
      });

      // 2. Update fields
      return tx.encaminhamento.update({
        where: { id },
        data: {
          agendamentoPrevisto: agendamento,
          ...(localAg !== undefined ? { localAgendamento: localAg || null } : {}),
          ...(profAg !== undefined ? { profissionalAgendado: profAg || null } : {}),
          ...(cidadeAg !== undefined ? { cidadeAgendamento: cidadeAg || null } : {}),
          ...(ufAg !== undefined ? { ufAgendamento: ufAg || null } : {}),
        },
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });
    });

    // Notify patient
    void this.notificacoes
      .notificar({
        cpfPaciente: atualizado.pacienteCpf,
        pacienteNome: atualizado.pacienteNome,
        encaminhamentoId: id,
        tipo: 'AGENDADO',
        ...MENSAGENS.agendado(atualizado.protocolo, agendamento.toISOString()),
        payload: {
          protocolo: atualizado.protocolo,
          agendamentoPrevisto: agendamento.toISOString(),
        },
      })
      .catch((err) => logger.warn({ err }, 'notificar AGENDADO falhou'));

    void invalidarCacheArvorePorUbs(atualizado.ubsId);

    return rowParaEncaminhamento(atualizado);
  }
}
