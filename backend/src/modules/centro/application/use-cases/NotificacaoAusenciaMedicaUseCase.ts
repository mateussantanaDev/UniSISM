import { prisma } from '../../../../infrastructure/database/prisma';
import { logger } from '../../../../infrastructure/logger';
import type { AccessScope } from '../../../../shared/scope';
import { NotificacaoPacienteService } from '../../../../infrastructure/services/NotificacaoPacienteService';

export interface NotificacaoAusenciaInput {
  medicoNome: string;
  dataAfetada: string; // YYYY-MM-DD
  tipoMotivo: 'FALTA_MEDICA' | 'MUDANCA_DIA' | 'FERIAS_LICENCA';
  novaData?: string; // YYYY-MM-DD
  mensagem: string;
  canais?: {
    app?: boolean;
    sms?: boolean;
    whatsapp?: boolean;
  };
}

export class NotificacaoAusenciaMedicaUseCase {
  private readonly notificacoes = new NotificacaoPacienteService();

  async exec(
    input: NotificacaoAusenciaInput,
    atendenteId: string,
    scope: AccessScope,
  ): Promise<{ sucesso: boolean; pacientesNotificados: number; dataDisparo: string }> {
    const startOfDay = new Date(`${input.dataAfetada}T00:00:00.000Z`);
    const endOfDay = new Date(`${input.dataAfetada}T23:59:59.999Z`);

    // Busca agendamentos afetados
    const whereEncaminhamento: any = {
      deletadoEm: null,
      agendamentoPrevisto: {
        gte: startOfDay,
        lte: endOfDay,
      },
      profissionalAgendado: {
        contains: input.medicoNome,
        mode: 'insensitive',
      },
    };

    if (scope.kind === 'PREFEITURA') {
      whereEncaminhamento.ubs = { prefeituraId: scope.prefeituraId };
    } else if (scope.kind === 'UBS') {
      whereEncaminhamento.ubsId = scope.ubsId;
    }

    const encaminhamentos = await prisma.encaminhamento.findMany({
      where: whereEncaminhamento,
      select: {
        id: true,
        protocolo: true,
        pacienteId: true,
        pacienteCpf: true,
        pacienteNome: true,
        pacienteTelefone: true,
      },
    });

    const agendamentosCentro = await prisma.agendamentoCentro.findMany({
      where: {
        dataAgendamento: {
          gte: startOfDay,
          lte: endOfDay,
        },
        medicoNome: {
          contains: input.medicoNome,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        pacienteId: true,
        paciente: { select: { nome: true, cpf: true, telefone: true } },
      },
    });

    const pacienteIdsSet = new Set<string>();
    for (const e of encaminhamentos) {
      if (e.pacienteId) pacienteIdsSet.add(e.pacienteId);
      // Dispara push para o paciente
      void this.notificacoes
        .notificar({
          cpfPaciente: e.pacienteCpf,
          pacienteNome: e.pacienteNome,
          encaminhamentoId: e.id,
          tipo: 'AGENDADO',
          titulo: 'Aviso sobre seu atendimento',
          corpo: input.mensagem,
          payload: {
            protocolo: e.protocolo,
            motivo: input.tipoMotivo,
            novaData: input.novaData,
          },
        })
        .catch(() => {});
    }

    for (const a of agendamentosCentro) {
      if (a.pacienteId) pacienteIdsSet.add(a.pacienteId);
      if (a.paciente?.cpf) {
        void this.notificacoes
          .notificar({
            cpfPaciente: a.paciente.cpf,
            pacienteNome: a.paciente.nome,
            tipo: 'AGENDADO',
            titulo: 'Aviso sobre seu atendimento',
            corpo: input.mensagem,
            payload: {
              motivo: input.tipoMotivo,
              novaData: input.novaData,
            },
          })
          .catch(() => {});
      }
    }

    const totalPacientes = pacienteIdsSet.size;

    logger.info(
      {
        medicoNome: input.medicoNome,
        dataAfetada: input.dataAfetada,
        totalNotificados: totalPacientes,
        canais: input.canais,
      },
      'Disparo de notificação por ausência médica efetuado',
    );

    // Registra na auditoria
    await prisma.auditoriaLog.create({
      data: {
        acao: 'CENTRO_NOTIFICACAO_AUSENCIA_MEDICA',
        recurso: 'CENTRO_ESPECIALIDADES',
        atendenteId,
        payload: {
          medicoNome: input.medicoNome,
          dataAfetada: input.dataAfetada,
          tipoMotivo: input.tipoMotivo,
          novaData: input.novaData,
          totalPacientes,
        },
      },
    });

    return {
      sucesso: true,
      pacientesNotificados: totalPacientes,
      dataDisparo: new Date().toISOString(),
    };
  }
}
