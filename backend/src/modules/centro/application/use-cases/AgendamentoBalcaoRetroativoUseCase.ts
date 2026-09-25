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

      // Se o status retroativo for AGUARDANDO, garantir que o paciente vá para a fila de espera do médico atribuído
      if (statusVal === 'AGUARDANDO') {
        const pacienteObj = await tx.paciente.findUnique({ where: { id: input.pacienteId } });
        if (pacienteObj) {
          const especLower = input.especialidade.toLowerCase();
          const isOdonto = especLower.includes('odonto') || especLower.includes('dent') || especLower.includes('buco') || especLower.includes('protese');
          await tx.encaminhamento.create({
            data: {
              protocolo: `RET-${protocolo}`,
              status: 'APROVADO',
              canalRoteamento: isOdonto ? 'CENTRO_ODONTOLOGICO' : 'CENTRO_ESPECIALIDADES',
              destinoRegulacao: isOdonto ? 'CENTRO_ODONTOLOGICO' : 'CENTRO_ESPECIALIDADES',
              pacienteId: pacienteObj.id,
              pacienteNome: pacienteObj.nome,
              pacienteCpf: pacienteObj.cpf,
              pacienteCartaoSus: pacienteObj.cartaoSus || '000000000000000',
              pacienteDataNascimento: pacienteObj.dataNascimento,
              pacienteSexo: pacienteObj.sexo,
              pacienteTelefone: pacienteObj.telefone ?? '87999990000',
              pacienteEndereco: pacienteObj.endereco ?? 'Águas Belas',
              medicoSolicitante: input.medicoNome || 'Recepção (Balcão)',
              crm: '000000',
              especialidadeSolicitada: input.especialidade,
              cid10: 'Z00',
              cidDescricao: 'Digitalização de Ficha Antiga (Data Histórica)',
              justificativaClinica: 'Lançamento Retroativo de Ficha de Papel em Espera',
              prioridade: 'ELETIVA',
              dataSolicitacao: dataRetroativaDate,
              unidadeOrigem: isOdonto ? 'Balcão do Centro Odontológico' : 'Balcão do Centro de Especialidades',
              atendenteResponsavel: 'Recepção',
              atendenteId,
              ubsId: pacienteObj.ubsId,
              agendamentoPrevisto: new Date(),
              profissionalAgendado: input.medicoNome || 'Especialista da Escala',
              localAgendamento: isOdonto ? 'Centro Odontológico' : 'Centro de Especialidades',
              statusAtendimentoCentro: 'AGUARDANDO_ATENDIMENTO',
              presencaRegistradaEm: new Date(),
              observacoesRegulacao: `Digitalização de Ficha Antiga (Data Histórica: ${input.dataRetroativa}) - Inserido na Fila de Espera do Médico`,
            },
          });
        }
      }

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
