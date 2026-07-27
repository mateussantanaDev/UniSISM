import { StatusEncaminhamento, CanalRoteamento, DestinoRegulacao, Sexo, PrioridadeClinica, TipoEventoTimeline } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import { calcularOtimizacaoAgendamento } from '../../../gestao/application/use-cases/OtimizadorVagas';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { BadRequest, NotFound } from '../../../../shared/errors';

export interface AgendamentoBalcaoInput {
  paciente: {
    nome: string;
    cpf: string;
    cartaoSus?: string;
    dataNascimento: string; // YYYY-MM-DD
    sexo: 'M' | 'F' | 'OUTRO';
    telefone: string;
    endereco: string;
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
  ubsId?: string;
  atendente: {
    id: string;
    nome: string;
    ubsId?: string | null;
    prefeituraId?: string | null;
  };
}

export class AgendamentoBalcaoRecepcaoUseCase {
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

    // 1. Find or create Paciente
    let dbPaciente = await prisma.paciente.findUnique({
      where: { cpf: cleanCpf },
    });

    if (!dbPaciente) {
      dbPaciente = await prisma.paciente.create({
        data: {
          nome: input.paciente.nome.trim(),
          cpf: cleanCpf,
          cartaoSus: input.paciente.cartaoSus || null,
          dataNascimento: new Date(input.paciente.dataNascimento),
          sexo: input.paciente.sexo as Sexo,
          telefone: input.paciente.telefone,
          endereco: input.paciente.endereco,
          ubsId: targetUbsId,
        },
      });
    }

    // 2. Generate Protocol
    const now = new Date();
    const datePart = now.toISOString().substring(0, 10).replace(/-/g, '');
    const count = await prisma.encaminhamento.count();
    const protocolo = `ENC${datePart}-${String(count + 1).padStart(4, '0')}`;

    // 3. Optimize scheduling date and slot
    const otimizado = await calcularOtimizacaoAgendamento({
      profissional: input.medicoDesejado,
      nota: input.nota,
      especialidade: input.solicitacao.especialidadeSolicitada,
      prioridade: input.solicitacao.prioridade,
    });

    const localAg = 'Centro Municipal de Especialidades';
    const dataSolicitacao = input.solicitacao.dataSolicitacao
      ? new Date(input.solicitacao.dataSolicitacao)
      : now;

    // 4. Create Encaminhamento record in single transaction
    const createdRow = await prisma.$transaction(async (tx) => {
      const encRow = await tx.encaminhamento.create({
        data: {
          protocolo,
          status: StatusEncaminhamento.APROVADO,
          canalRoteamento: CanalRoteamento.CENTRO_ESPECIALIDADES,
          destinoRegulacao: DestinoRegulacao.CENTRO_ESPECIALIDADES,
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
          unidadeOrigem: 'Balcão do Centro de Especialidades',
          atendenteResponsavel: input.atendente.nome,
          ubsId: targetUbsId,
          atendenteId: input.atendente.id,
          agendamentoPrevisto: otimizado.dateTime,
          profissionalAgendado: otimizado.doctor.nome,
          localAgendamento: localAg,
          observacoesRegulacao: input.nota || 'Agendamento direto efetuado no balcão do Centro de Especialidades.',
          statusAtendimentoCentro: 'AGENDADO',
        },
      });

      await tx.eventoTimeline.createMany({
        data: [
          {
            encaminhamentoId: encRow.id,
            tipo: TipoEventoTimeline.CRIADO,
            titulo: 'Encaminhamento Criado no Balcão',
            descricao: `Registrado diretamente no balcão do Centro de Especialidades para ${input.solicitacao.especialidadeSolicitada}.`,
            autor: input.atendente.nome,
            autorPapel: 'Recepção · Centro de Especialidades',
          },
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
            titulo: 'Vaga Alocada Otimizada',
            descricao: `Consulta agendada para ${otimizado.dateStr} às ${otimizado.timeStr}. Médico: ${otimizado.doctor.nome}.`,
            autor: input.atendente.nome,
            autorPapel: 'Recepção · Centro de Especialidades',
          },
        ],
      });

      await tx.auditoriaLog.create({
        data: {
          acao: 'CENTRO_AGENDAMENTO_BALCAO',
          recurso: 'CENTRO_ESPECIALIDADES',
          recursoId: encRow.id,
          atendenteId: input.atendente.id,
          payload: {
            protocolo: encRow.protocolo,
            pacienteNome: dbPaciente.nome,
            especialidade: input.solicitacao.especialidadeSolicitada,
            dataCalculada: otimizado.dateStr,
            horario: otimizado.timeStr,
            medico: otimizado.doctor.nome,
          },
        },
      });

      return tx.encaminhamento.findUniqueOrThrow({
        where: { id: encRow.id },
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });
    });

    return rowParaEncaminhamento(createdRow);
  }
}
