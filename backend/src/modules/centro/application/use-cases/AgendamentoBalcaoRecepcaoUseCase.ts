import { StatusEncaminhamento, CanalRoteamento, DestinoRegulacao, Sexo, PrioridadeClinica, TipoEventoTimeline } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import { CalcularAlocacaoVagaCentroUseCase } from './CalcularAlocacaoVagaCentroUseCase';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { BadRequest, NotFound } from '../../../../shared/errors';
import { NotificacaoPacienteService, MENSAGENS } from '../../../../infrastructure/services/NotificacaoPacienteService';
import { isEspecialidadeOdonto } from '../../shared/centroClassifier';

export interface AgendamentoBalcaoInput {
  paciente: {
    nome: string;
    cpf: string;
    cartaoSus?: string;
    dataNascimento: string; // YYYY-MM-DD
    sexo: 'M' | 'F' | 'OUTRO';
    telefone: string;
    endereco: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
    nomeMae?: string;
    racaCor?: string;
  };
  solicitacao: {
    medicoSolicitante: string;
    crm: string;
    especialidadeSolicitada: string;
    cid10: string;
    cidDescricao: string;
    justificativaClinica: string;
    prioridade: 'ELETIVA' | 'PRIORITARIA' | 'URGENTE' | 'EMERGENCIA';
    dataSolicitacao?: string;
  };
  nota?: string;
  medicoDesejado?: string;
  dataAgendada?: string; // YYYY-MM-DD
  horaAgendada?: string; // HH:MM
  consultorio?: string;
  ubsId?: string;
  centro?: 'CEM' | 'CEO' | 'CENTRO_ESPECIALIDADES' | 'CENTRO_ODONTOLOGICO' | string;
  confirmarPresenca?: boolean;
  statusAtendimento?: string;
  agendarDireto?: boolean;
  atendente: {
    id: string;
    nome: string;
    ubsId?: string | null;
    prefeituraId?: string | null;
  };
}

export class AgendamentoBalcaoRecepcaoUseCase {
  private readonly notificacoes = new NotificacaoPacienteService();
  private readonly alocador = new CalcularAlocacaoVagaCentroUseCase();

  async exec(input: AgendamentoBalcaoInput, scope: AccessScope): Promise<Encaminhamento> {
    const cleanCpf = input.paciente.cpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) {
      throw BadRequest('CPF_INVALIDO', 'CPF do paciente deve ter 11 dígitos');
    }

    // Determine target UBS for patient linkage
    let targetUbsId = input.ubsId || input.atendente.ubsId;
    if (!targetUbsId) {
      const ubs = await prisma.ubs.findFirst({
        where: scope.kind === 'PREFEITURA' ? { prefeituraId: scope.prefeituraId } : { ativa: true },
      });
      if (!ubs) {
        throw NotFound('UBS_NAO_ENCONTRADA', 'Nenhuma UBS encontrada para vincular o cadastro do paciente');
      }
      targetUbsId = ubs.id;
    }

    const now = new Date();
    const dataSolicitacao = input.solicitacao.dataSolicitacao
      ? new Date(input.solicitacao.dataSolicitacao)
      : now;

    // Detect if CEO or CEM based on explicit centro or semantic classification
    const odontoDetectado = isEspecialidadeOdonto({
      nome: input.solicitacao.especialidadeSolicitada,
      especialidade: input.solicitacao.especialidadeSolicitada,
      crm: input.solicitacao.crm,
      medicoNome: input.medicoDesejado,
      localAgendamento: input.consultorio,
    });
    const centroExplicitamenteCeo = input.centro
      ? input.centro.toUpperCase() === 'CEO' || input.centro.toUpperCase() === 'CENTRO_ODONTOLOGICO'
      : false;
    const ehCeo = centroExplicitamenteCeo || odontoDetectado;
    const centroTipo = ehCeo ? 'CEO' : 'CEM';

    const agendarDireto = input.agendarDireto === true;

    let agendamentoPrevisto: Date | null = null;
    let profissionalAgendado: string | null = input.medicoDesejado || null;
    let localAg = ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro Municipal de Especialidades (CEM)';
    let horaFinalFormatada = '08:00';

    if (agendarDireto) {
      // Optimize scheduling date and slot using real database scales
      const resultadoAlocacao = await this.alocador.exec(
        {
          centro: centroTipo,
          medicoNome: input.medicoDesejado,
          especialidade: input.solicitacao.especialidadeSolicitada,
          prioridade: input.solicitacao.prioridade,
        },
        scope,
      );

      profissionalAgendado = input.medicoDesejado || input.solicitacao.medicoSolicitante || 'Especialista da Escala';

      if (input.dataAgendada && input.horaAgendada) {
        horaFinalFormatada = input.horaAgendada.trim();
        agendamentoPrevisto = new Date(`${input.dataAgendada}T${horaFinalFormatada}:00`);
        if (input.consultorio) localAg = input.consultorio;
        else if (resultadoAlocacao.sucesso && resultadoAlocacao.alocacao) {
          localAg = resultadoAlocacao.alocacao.consultorio;
        }
        if (resultadoAlocacao.sucesso && resultadoAlocacao.alocacao?.medicoNome) {
          profissionalAgendado = input.medicoDesejado || resultadoAlocacao.alocacao.medicoNome;
        }
      } else if (resultadoAlocacao.sucesso && resultadoAlocacao.alocacao) {
        const aloc = resultadoAlocacao.alocacao;
        horaFinalFormatada = aloc.hora;
        agendamentoPrevisto = new Date(`${aloc.data}T${aloc.hora}:00`);
        profissionalAgendado = aloc.medicoNome;
        localAg = aloc.consultorio;
      } else {
        agendamentoPrevisto = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
      }
    }

    // Create Encaminhamento record in single atomic transaction
    const createdRow = await prisma.$transaction(async (tx) => {
      // 1. Find or create Paciente
      let dbPaciente = await tx.paciente.findUnique({
        where: { cpf: cleanCpf },
      });

      if (!dbPaciente) {
        dbPaciente = await tx.paciente.create({
          data: {
            nome: input.paciente.nome.trim(),
            cpf: cleanCpf,
            cartaoSus: input.paciente.cartaoSus || null,
            dataNascimento: new Date(input.paciente.dataNascimento),
            sexo: input.paciente.sexo as Sexo,
            telefone: input.paciente.telefone,
            endereco: input.paciente.endereco,
            bairro: input.paciente.bairro || null,
            municipio: input.paciente.municipio || 'Águas Belas',
            uf: input.paciente.uf || 'PE',
            cep: input.paciente.cep || null,
            nomeMae: input.paciente.nomeMae || null,
            racaCor: (input.paciente.racaCor as any) || undefined,
            ubsId: targetUbsId,
          },
        });
      } else {
        const updateData: any = {};
        if (input.ubsId && dbPaciente.ubsId !== input.ubsId) updateData.ubsId = input.ubsId;
        if (input.paciente.endereco && input.paciente.endereco !== dbPaciente.endereco) updateData.endereco = input.paciente.endereco;
        if (input.paciente.bairro && input.paciente.bairro !== dbPaciente.bairro) updateData.bairro = input.paciente.bairro;
        if (input.paciente.municipio && input.paciente.municipio !== dbPaciente.municipio) updateData.municipio = input.paciente.municipio;
        if (input.paciente.uf && input.paciente.uf !== dbPaciente.uf) updateData.uf = input.paciente.uf;
        if (input.paciente.cep && input.paciente.cep !== dbPaciente.cep) updateData.cep = input.paciente.cep;
        if (input.paciente.nomeMae && input.paciente.nomeMae !== dbPaciente.nomeMae) updateData.nomeMae = input.paciente.nomeMae;
        if (input.paciente.racaCor && input.paciente.racaCor !== dbPaciente.racaCor) updateData.racaCor = input.paciente.racaCor;
        if (input.paciente.telefone && input.paciente.telefone !== dbPaciente.telefone) updateData.telefone = input.paciente.telefone;

        if (Object.keys(updateData).length > 0) {
          dbPaciente = await tx.paciente.update({
            where: { id: dbPaciente.id },
            data: updateData,
          });
        }
      }

      // 2. Generate Protocol
      const ano = now.getUTCFullYear();
      const chave = `UBS-${ano}`;
      const seq = await tx.sequencialProtocolo.upsert({
        where: { chave },
        create: { chave, valor: 1 },
        update: { valor: { increment: 1 } },
      });
      const protocolo = `BAL-${ano}-${String(seq.valor).padStart(6, '0')}`;

      const statusFinal = agendarDireto ? StatusEncaminhamento.APROVADO : StatusEncaminhamento.AGUARDANDO_REGULACAO;

      const encRow = await tx.encaminhamento.create({
        data: {
          protocolo,
          status: statusFinal,
          canalRoteamento: ehCeo ? CanalRoteamento.CENTRO_ODONTOLOGICO : CanalRoteamento.CENTRO_ESPECIALIDADES,
          destinoRegulacao: ehCeo ? DestinoRegulacao.CENTRO_ODONTOLOGICO : DestinoRegulacao.CENTRO_ESPECIALIDADES,
          pacienteId: dbPaciente.id,
          pacienteNome: dbPaciente.nome,
          pacienteCpf: dbPaciente.cpf,
          pacienteCartaoSus: dbPaciente.cartaoSus || input.paciente.cartaoSus || '000000000000000',
          pacienteDataNascimento: dbPaciente.dataNascimento,
          pacienteSexo: dbPaciente.sexo,
          pacienteTelefone: dbPaciente.telefone || input.paciente.telefone,
          pacienteEndereco: dbPaciente.endereco || input.paciente.endereco,
          medicoSolicitante: input.solicitacao.medicoSolicitante || 'Atendente do Balcão',
          crm: input.solicitacao.crm || '000000',
          especialidadeSolicitada: input.solicitacao.especialidadeSolicitada,
          cid10: input.solicitacao.cid10,
          cidDescricao: input.solicitacao.cidDescricao,
          justificativaClinica: input.solicitacao.justificativaClinica,
          prioridade: input.solicitacao.prioridade as PrioridadeClinica,
          dataSolicitacao,
          unidadeOrigem: ehCeo ? 'Balcão do Centro de Especialidades Odontológicas' : 'Balcão do Centro de Especialidades Médicas',
          atendenteResponsavel: input.atendente.nome,
          ubsId: targetUbsId,
          atendenteId: input.atendente.id,
          criadoPorId: input.atendente.id,
          criadoPorNome: input.atendente.nome,
          agendamentoPrevisto: agendamentoPrevisto,
          profissionalAgendado: profissionalAgendado,
          localAgendamento: localAg,
          observacoesRegulacao: agendarDireto
            ? (input.nota ? `${input.nota} (Horário: às ${horaFinalFormatada})` : `Agendamento direto efetuado no balcão do ${centroTipo} às ${horaFinalFormatada}.`)
            : (input.nota ? `${input.nota} | Solicitação acolhida no balcão. Aguardando liberação de data pela Regulação.` : `Acolhimento no balcão do ${centroTipo}. Demanda inserida na fila de espera da Regulação Municipal.`),
          statusAtendimentoCentro: agendarDireto
            ? ((input.confirmarPresenca || input.statusAtendimento === 'AGUARDANDO_ATENDIMENTO') ? 'AGUARDANDO_ATENDIMENTO' : ((input.statusAtendimento as any) || 'AGENDADO'))
            : null,
          presencaRegistradaEm: (agendarDireto && (input.confirmarPresenca || input.statusAtendimento === 'AGUARDANDO_ATENDIMENTO'))
            ? now
            : null,
        },
      });

      const timelineEvents: any[] = [
        {
          encaminhamentoId: encRow.id,
          tipo: TipoEventoTimeline.CRIADO,
          titulo: 'Solicitação Criada no Balcão',
          descricao: `Demanda acolhida no balcão da recepção para ${input.solicitacao.especialidadeSolicitada}.`,
          autor: input.atendente.nome,
          autorPapel: 'Recepção · Centro de Especialidades',
        },
      ];

      if (agendarDireto && agendamentoPrevisto) {
        timelineEvents.push(
          {
            encaminhamentoId: encRow.id,
            tipo: TipoEventoTimeline.APROVADO,
            titulo: 'Aprovado para Centro de Especialidades',
            descricao: 'Aprovação direta realizada pelo atendente de recepção.',
            autor: input.atendente.nome,
            autorPapel: 'Recepção · Centro de Especialidades',
          },
          {
            encaminhamentoId: encRow.id,
            tipo: TipoEventoTimeline.AGENDADO,
            titulo: 'Vaga Alocada na Escala',
            descricao: `Consulta agendada para ${agendamentoPrevisto.toISOString().substring(0, 10)} às ${horaFinalFormatada}. Profissional: ${profissionalAgendado}.`,
            autor: input.atendente.nome,
            autorPapel: 'Recepção · Centro de Especialidades',
          },
        );

        if (input.confirmarPresenca || input.statusAtendimento === 'AGUARDANDO_ATENDIMENTO') {
          timelineEvents.push({
            encaminhamentoId: encRow.id,
            tipo: TipoEventoTimeline.OBSERVACAO,
            titulo: 'Presença Confirmada no Balcão',
            descricao: `Presença confirmada no ato do agendamento presencial. Paciente aguardando chamada para ${localAg}.`,
            autor: input.atendente.nome,
            autorPapel: 'Recepção · Centro de Especialidades',
          });
        }
      } else {
        timelineEvents.push({
          encaminhamentoId: encRow.id,
          tipo: TipoEventoTimeline.ENVIADO_REGULACAO,
          titulo: 'Enviado para Fila da Regulação',
          descricao: `Demanda de ${input.solicitacao.especialidadeSolicitada} registrada no balcão por ${input.atendente.nome}. Aguardando liberação de data e horário pela Central de Regulação.`,
          autor: input.atendente.nome,
          autorPapel: 'Recepção · Centro de Especialidades',
        });
      }

      await tx.eventoTimeline.createMany({
        data: timelineEvents,
      });

      await tx.auditoriaLog.create({
        data: {
          acao: agendarDireto ? 'CENTRO_AGENDAMENTO_BALCAO_DIRETO' : 'CENTRO_ENTRADA_FILA_REGULACAO_BALCAO',
          recurso: 'CENTRO_ESPECIALIDADES',
          recursoId: encRow.id,
          atendenteId: input.atendente.id,
          payload: {
            protocolo: encRow.protocolo,
            pacienteNome: dbPaciente.nome,
            especialidade: input.solicitacao.especialidadeSolicitada,
            prioridade: input.solicitacao.prioridade,
            status: statusFinal,
            agendarDireto,
            operadorNome: input.atendente.nome,
            dataAgendada: agendamentoPrevisto ? agendamentoPrevisto.toISOString().substring(0, 10) : null,
            horario: agendamentoPrevisto ? horaFinalFormatada : null,
            medico: profissionalAgendado,
          },
        },
      });

      return tx.encaminhamento.findUniqueOrThrow({
        where: { id: encRow.id },
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });
    });

    if (input.paciente.cpf) {
      if (agendarDireto && createdRow.agendamentoPrevisto) {
        void this.notificacoes
          .notificar({
            cpfPaciente: cleanCpf,
            pacienteNome: createdRow.pacienteNome,
            pacienteTelefone: createdRow.pacienteTelefone,
            encaminhamentoId: createdRow.id,
            tipo: 'AGENDADO',
            titulo: 'Consulta Agendada no Centro de Especialidades',
            corpo: `Sua consulta de ${input.solicitacao.especialidadeSolicitada} foi agendada para ${createdRow.agendamentoPrevisto.toISOString().substring(0, 10)}.`,
            payload: {
              protocolo: createdRow.protocolo,
              especialidade: input.solicitacao.especialidadeSolicitada,
              local: localAg,
              medico: profissionalAgendado,
            },
          })
          .catch((err) => console.error('[NotificacaoBalcao] Erro:', err));
      } else {
        const msgCriado = MENSAGENS.encaminhamentoCriado(createdRow.protocolo, 'Recepção Central');
        void this.notificacoes
          .notificar({
            cpfPaciente: cleanCpf,
            pacienteNome: createdRow.pacienteNome,
            pacienteTelefone: createdRow.pacienteTelefone,
            encaminhamentoId: createdRow.id,
            tipo: 'ENCAMINHAMENTO_CRIADO',
            titulo: msgCriado.titulo,
            corpo: msgCriado.corpo,
            payload: {
              protocolo: createdRow.protocolo,
              especialidade: input.solicitacao.especialidadeSolicitada,
              prioridade: input.solicitacao.prioridade,
              status: 'AGUARDANDO_REGULACAO',
            },
          })
          .catch((err) => console.error('[NotificacaoBalcao] Erro:', err));
      }
    }

    return rowParaEncaminhamento(createdRow);
  }
}
