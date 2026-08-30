import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';
import { ensureUbsAcessivel } from '../../../../shared/scope';
import { NotFound, Unprocessable } from '../../../../shared/errors';

export interface AgendamentoBalcaoRetroativoInput {
  pacienteId: string;
  especialidade: string;
  tipoServico?: 'CONSULTA' | 'PROCEDIMENTO';
  procedimentoSolicitado?: string;
  modoData?: 'AUTODATA' | 'MANUAL' | 'RETROATIVO';
  dataRetroativa: string; // YYYY-MM-DD
  horaRetroativa: string; // HH:mm
  statusRetroativo?: 'CONCLUIDO' | 'AGUARDANDO' | 'FALTOU';
  medicoId?: string;
  medicoNome?: string;
}

export interface AgendamentoBalcaoRetroativoOutput {
  id: string;
  protocolo: string;
  status: string;
  mensagem: string;
}

export class AgendamentoBalcaoRetroativoUseCase {
  async exec(
    input: AgendamentoBalcaoRetroativoInput,
    scope: AccessScope,
    atendenteId: string,
  ): Promise<AgendamentoBalcaoRetroativoOutput> {
    const paciente = await prisma.paciente.findUnique({
      where: { id: input.pacienteId },
      include: { ubs: true },
    });
    if (!paciente) {
      throw NotFound('PACIENTE_NAO_ENCONTRADO', 'Paciente não encontrado');
    }

    ensureUbsAcessivel(scope, { id: paciente.ubsId, prefeituraId: paciente.ubs?.prefeituraId ?? '' });

    const modoData = input.modoData || 'RETROATIVO';
    const dataRetroativaDate = new Date(`${input.dataRetroativa}T00:00:00.000Z`);
    const hojeDate = new Date();
    hojeDate.setHours(23, 59, 59, 999);

    // Validação Trava Retroativa (422 Unprocessable Entity)
    if (modoData === 'RETROATIVO' && dataRetroativaDate > hojeDate) {
      throw Unprocessable(
        'DATA_RETROATIVA_INVALIDA',
        'Agendamento retroativo deve ter data inferior ou igual à data atual.',
      );
    }

    const prefeituraId = scope.kind === 'PREFEITURA' ? scope.prefeituraId : undefined;
    const statusVal = input.statusRetroativo || 'CONCLUIDO';
    const ano = input.dataRetroativa.slice(0, 4);

    const created = await prisma.$transaction(async (tx) => {
      const chave = `BALCAO-${ano}`;
      const seq = await tx.sequencialProtocolo.upsert({
        where: { chave },
        create: { chave, valor: 1 },
        update: { valor: { increment: 1 } },
      });
      const protocolo = `BALCAO-${ano}-${String(seq.valor).padStart(6, '0')}`;

      const ag = await tx.agendamentoCentro.create({
        data: {
          protocolo,
          prefeituraId,
          pacienteId: input.pacienteId,
          medicoId: input.medicoId || null,
          medicoNome: input.medicoNome || null,
          especialidade: input.especialidade,
          tipoServico: input.tipoServico || 'CONSULTA',
          procedimentoNome: input.procedimentoSolicitado || null,
          modoData,
          dataAgendamento: dataRetroativaDate,
          horaAgendamento: input.horaRetroativa,
          status: statusVal as any,
        },
      });

      await tx.auditoriaLog.create({
        data: {
          acao: 'CENTRO_BALCAO_AGENDAMENTO_RETROATIVO',
          recurso: 'CENTRO_ESPECIALIDADES',
          recursoId: ag.id,
          atendenteId,
          payload: {
            protocolo: ag.protocolo,
            pacienteId: input.pacienteId,
            especialidade: input.especialidade,
            dataRetroativa: input.dataRetroativa,
            modoData,
            status: statusVal,
          },
        },
      });

      return ag;
    });

    return {
      id: created.id,
      protocolo: created.protocolo,
      status: created.status,
      mensagem: 'Agendamento direto em balcão registrado com sucesso.',
    };
  }
}
