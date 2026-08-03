import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';
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
    });
    if (!paciente) {
      throw NotFound('PACIENTE_NAO_ENCONTRADO', 'Paciente não encontrado');
    }

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
    const datePart = input.dataRetroativa.replace(/-/g, '').slice(2);
    const count = await prisma.agendamentoCentro.count();
    const protocolo = `BALCAO-${input.dataRetroativa.slice(0, 4)}-${datePart.slice(2)}-${String(count + 1).padStart(4, '0')}`;

    const statusVal = input.statusRetroativo || 'CONCLUIDO';

    const created = await prisma.agendamentoCentro.create({
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

    await prisma.auditoriaLog.create({
      data: {
        acao: 'CENTRO_BALCAO_AGENDAMENTO_RETROATIVO',
        recurso: 'CENTRO_ESPECIALIDADES',
        recursoId: created.id,
        atendenteId,
        payload: {
          protocolo: created.protocolo,
          pacienteId: input.pacienteId,
          dataAgendamento: input.dataRetroativa,
          status: statusVal,
        },
      },
    });

    return {
      id: created.id,
      protocolo: created.protocolo,
      status: created.status,
      mensagem: 'Atendimento retroativo registrado no histórico do paciente.',
    };
  }
}
