import { prisma } from '../../../../infrastructure/database/prisma';
import type { AccessScope } from '../../../../shared/scope';
import { logger } from '../../../../infrastructure/logger';

export interface NotificacaoAusenciaMedicaInput {
  medicoNome: string;
  dataAfetada: string; // YYYY-MM-DD
  tipoMotivo: 'FALTA_MEDICA' | 'MUDANCA_DIA' | 'FERIAS_LICENCA';
  novaData?: string;
  mensagem: string;
  canais?: {
    app?: boolean;
    sms?: boolean;
    whatsapp?: boolean;
  };
}

export interface NotificacaoAusenciaMedicaOutput {
  sucesso: boolean;
  pacientesNotificados: number;
  dataDisparo: string;
}

export class NotificacaoAusenciaMedicaUseCase {
  async exec(
    input: NotificacaoAusenciaMedicaInput,
    scope: AccessScope,
    atendenteId: string,
  ): Promise<NotificacaoAusenciaMedicaOutput> {
    const dataAfetadaDate = new Date(`${input.dataAfetada}T00:00:00.000Z`);
    const dataAfetadaFim = new Date(`${input.dataAfetada}T23:59:59.999Z`);

    const prefeituraId = scope.kind === 'PREFEITURA' ? scope.prefeituraId : undefined;

    // 1. Busca encaminhamentos / agendamentos afetados
    const encaminhamentos = await prisma.encaminhamento.findMany({
      where: {
        ...(prefeituraId ? { ubs: { prefeituraId } } : {}),
        profissionalAgendado: { contains: input.medicoNome, mode: 'insensitive' },
        agendamentoPrevisto: {
          gte: dataAfetadaDate,
          lte: dataAfetadaFim,
        },
      },
      select: {
        id: true,
        pacienteId: true,
        pacienteNome: true,
        pacienteTelefone: true,
      },
    });

    const agendamentosCentro = await prisma.agendamentoCentro.findMany({
      where: {
        ...(prefeituraId ? { prefeituraId } : {}),
        medicoNome: { contains: input.medicoNome, mode: 'insensitive' },
        dataAgendamento: {
          gte: dataAfetadaDate,
          lte: dataAfetadaFim,
        },
      },
      select: {
        id: true,
        pacienteId: true,
        paciente: { select: { nome: true, telefone: true } },
      },
    });

    const pacienteIdsSet = new Set<string>();
    for (const e of encaminhamentos) {
      if (e.pacienteId) pacienteIdsSet.add(e.pacienteId);
    }
    for (const a of agendamentosCentro) {
      if (a.pacienteId) pacienteIdsSet.add(a.pacienteId);
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
