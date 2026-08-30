import { StatusEncaminhamento, CanalRoteamento, DestinoRegulacao, TipoEventoTimeline } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { ensureUbsAcessivel } from '../../../../shared/scope';
import { NotFound, BadRequest, Unprocessable } from '../../../../shared/errors';
import { NotificacaoPacienteService, MENSAGENS } from '../../../../infrastructure/services/NotificacaoPacienteService';

export interface AgendarRetornoInput {
  consultaId: string; // ID do encaminhamento ou atendimento anterior
  pacienteId?: string;
  medicoNome: string;
  dataRetorno: string; // YYYY-MM-DD
  horaRetorno: string; // HH:mm
  observacoes?: string;
  doctor: {
    id: string;
    nome: string;
    matricula?: string;
  };
}

export class AgendarRetornoMedicoUseCase {
  private readonly notificacoes = new NotificacaoPacienteService();

  async exec(input: AgendarRetornoInput, scope: AccessScope): Promise<{ sucesso: boolean; retornoId: string; encaminhamento: Encaminhamento }> {
    if (!input.dataRetorno || !input.horaRetorno) {
      throw BadRequest('DATA_HORA_OBRIGATORIAS', 'Data e horário de retorno são obrigatórios.');
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dataRetorno)) {
      throw Unprocessable('DATA_RETORNO_INVALIDA', 'dataRetorno deve ser YYYY-MM-DD.');
    }

    const dataRetornoDate = new Date(`${input.dataRetorno}T${input.horaRetorno}:00.000Z`);
    if (Number.isNaN(dataRetornoDate.getTime())) {
      throw Unprocessable('DATA_HORA_INVALIDA', 'Data ou horário de retorno inválido.');
    }

    // Busca o encaminhamento anterior ou o paciente
    const encAnterior = await prisma.encaminhamento.findUnique({
      where: { id: input.consultaId },
      include: INCLUDE_ENCAMINHAMENTO_FULL,
    });

    let pacienteData: {
      id: string;
      nome: string;
      cpf: string;
      cartaoSus?: string | null;
      dataNascimento: Date;
      sexo: any;
      telefone?: string | null;
      endereco?: string | null;
      ubsId: string;
      unidadeOrigem: string;
      especialidade: string;
      cid10: string;
      cidDescricao?: string | null;
    };

    if (encAnterior) {
      ensureUbsAcessivel(scope, { id: encAnterior.ubsId, prefeituraId: (encAnterior as any).ubs?.prefeituraId ?? '' });
      pacienteData = {
        id: encAnterior.pacienteId || encAnterior.id,
        nome: encAnterior.pacienteNome,
        cpf: encAnterior.pacienteCpf,
        cartaoSus: encAnterior.pacienteCartaoSus,
        dataNascimento: encAnterior.pacienteDataNascimento,
        sexo: encAnterior.pacienteSexo,
        telefone: encAnterior.pacienteTelefone,
        endereco: encAnterior.pacienteEndereco,
        ubsId: encAnterior.ubsId,
        unidadeOrigem: encAnterior.unidadeOrigem,
        especialidade: encAnterior.especialidadeSolicitada,
        cid10: encAnterior.cid10,
        cidDescricao: encAnterior.cidDescricao,
      };
    } else {
      const pacId = input.pacienteId || input.consultaId;
      const pac = await prisma.paciente.findUnique({
        where: { id: pacId },
        include: { ubs: true },
      });
      if (!pac) {
        throw NotFound('PACIENTE_NAO_ENCONTRADO', 'Paciente não encontrado para agendamento de retorno.');
      }
      ensureUbsAcessivel(scope, { id: pac.ubsId, prefeituraId: pac.ubs?.prefeituraId ?? '' });
      pacienteData = {
        id: pac.id,
        nome: pac.nome,
        cpf: pac.cpf,
        cartaoSus: pac.cartaoSus,
        dataNascimento: pac.dataNascimento,
        sexo: pac.sexo,
        telefone: pac.telefone,
        endereco: pac.endereco,
        ubsId: pac.ubsId,
        unidadeOrigem: `${pac.ubs.nome} - ${pac.ubs.municipio}`,
        especialidade: 'Retorno Especializado',
        cid10: 'Z09.8',
        cidDescricao: 'Exame de seguimento após outro tratamento',
      };
    }

    const created = await prisma.$transaction(async (tx) => {
      const ano = new Date().getUTCFullYear();
      const chave = `UBS-${ano}`;
      const seq = await tx.sequencialProtocolo.upsert({
        where: { chave },
        create: { chave, valor: 1 },
        update: { valor: { increment: 1 } },
      });
      const protocolo = `RET-${ano}-${String(seq.valor).padStart(6, '0')}`;

      const enc = await tx.encaminhamento.create({
        data: {
          protocolo,
          status: StatusEncaminhamento.APROVADO,
          canalRoteamento: CanalRoteamento.CENTRO_ESPECIALIDADES,
          destinoRegulacao: DestinoRegulacao.CENTRO_ESPECIALIDADES,
          ubsId: pacienteData.ubsId,
          unidadeOrigem: pacienteData.unidadeOrigem,
          atendenteId: input.doctor.id,
          atendenteResponsavel: input.doctor.nome,
          pacienteId: pacienteData.id,
          pacienteNome: pacienteData.nome,
          pacienteCpf: pacienteData.cpf,
          pacienteCartaoSus: pacienteData.cartaoSus || '000000000000000',
          pacienteDataNascimento: pacienteData.dataNascimento,
          pacienteSexo: pacienteData.sexo,
          pacienteTelefone: pacienteData.telefone || '',
          pacienteEndereco: pacienteData.endereco || '',
          medicoSolicitante: input.doctor.nome,
          crm: input.doctor.matricula || '000000',
          especialidadeSolicitada: pacienteData.especialidade,
          cid10: pacienteData.cid10,
          cidDescricao: pacienteData.cidDescricao || 'Consulta de Retorno',
          justificativaClinica: `Retorno médico agendado pelo especialista Dr(a). ${input.doctor.nome}. ${input.observacoes ? `Obs: ${input.observacoes}` : ''}`,
          prioridade: 'ELETIVA',
          dataSolicitacao: new Date(),
          agendamentoPrevisto: dataRetornoDate,
          profissionalAgendado: input.medicoNome || input.doctor.nome,
          localAgendamento: 'Centro Municipal de Especialidades',
          statusAtendimentoCentro: 'AGENDADO',
          observacoesRegulacao: input.observacoes || `Retorno agendado para ${input.dataRetorno} às ${input.horaRetorno}`,
          timeline: {
            create: [
              {
                tipo: TipoEventoTimeline.CRIADO,
                titulo: 'Retorno Médico Solicitado',
                descricao: `Retorno solicitado pelo Dr(a). ${input.doctor.nome} em consultório.`,
                autor: input.doctor.nome,
                autorPapel: 'Médico Especialista',
              },
              {
                tipo: TipoEventoTimeline.AGENDADO,
                titulo: 'Retorno Agendado no Centro',
                descricao: `Agendado para ${input.dataRetorno} às ${input.horaRetorno} com Dr(a). ${input.medicoNome || input.doctor.nome}.`,
                autor: input.doctor.nome,
                autorPapel: 'Médico Especialista',
              },
            ],
          },
        },
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });

      await tx.auditoriaLog.create({
        data: {
          acao: 'CENTRO_MEDICO_AGENDAR_RETORNO',
          recurso: 'CENTRO_ESPECIALIDADES',
          recursoId: enc.id,
          atendenteId: input.doctor.id,
          payload: {
            protocolo: enc.protocolo,
            pacienteNome: pacienteData.nome,
            dataRetorno: input.dataRetorno,
            horaRetorno: input.horaRetorno,
            medico: input.medicoNome || input.doctor.nome,
          },
        },
      });

      return enc;
    });

    void this.notificacoes
      .notificar({
        cpfPaciente: pacienteData.cpf,
        pacienteNome: pacienteData.nome,
        encaminhamentoId: created.id,
        tipo: 'AGENDADO',
        ...MENSAGENS.agendado(created.protocolo, dataRetornoDate.toISOString()),
        payload: {
          protocolo: created.protocolo,
          agendamentoPrevisto: dataRetornoDate.toISOString(),
        },
      })
      .catch(() => {});

    return {
      sucesso: true,
      retornoId: created.id,
      encaminhamento: rowParaEncaminhamento(created),
    };
  }
}
