import { StatusEncaminhamento, CanalRoteamento, DestinoRegulacao, Sexo, PrioridadeClinica, TipoEventoTimeline } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import { CalcularAlocacaoVagaCentroUseCase } from './CalcularAlocacaoVagaCentroUseCase';
import type { Encaminhamento } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { BadRequest, NotFound } from '../../../../shared/errors';
import { NotificacaoPacienteService, MENSAGENS } from '../../../../infrastructure/services/NotificacaoPacienteService';

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

    // Detect if CEO or CEM based on specialty or routing
    const espLow = input.solicitacao.especialidadeSolicitada.toLowerCase();
    const ehCeo = espLow.includes('odonto') || espLow.includes('bucal') || espLow.includes('canal') || espLow.includes('periodontia') || espLow.includes('estomatologia') || espLow.includes('bucomaxilo') || espLow.includes('endodontia') || espLow.includes('prótese') || espLow.includes('protese') || /\bpne\b/i.test(espLow);
    const centroTipo = ehCeo ? 'CEO' : 'CEM';

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

    let agendamentoPrevisto: Date;
    let profissionalAgendado = input.medicoDesejado || input.solicitacao.medicoSolicitante || 'Especialista da Escala';
    let localAg = ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro Municipal de Especialidades (CEM)';

    if (input.dataAgendada && input.horaAgendada) {
      agendamentoPrevisto = new Date(`${input.dataAgendada}T${input.horaAgendada}:00`);
      if (input.consultorio) localAg = input.consultorio;
      else if (resultadoAlocacao.sucesso && resultadoAlocacao.alocacao) {
        localAg = resultadoAlocacao.alocacao.consultorio;
      }
      if (resultadoAlocacao.sucesso && resultadoAlocacao.alocacao?.medicoNome) {
        profissionalAgendado = input.medicoDesejado || resultadoAlocacao.alocacao.medicoNome;
      }
    } else if (resultadoAlocacao.sucesso && resultadoAlocacao.alocacao) {
      const aloc = resultadoAlocacao.alocacao;
      agendamentoPrevisto = new Date(`${aloc.data}T${aloc.hora}:00`);
      profissionalAgendado = aloc.medicoNome;
      localAg = aloc.consultorio;
    } else {
      agendamentoPrevisto = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
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

      const encRow = await tx.encaminhamento.create({
        data: {
          protocolo,
          status: StatusEncaminhamento.APROVADO,
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
          agendamentoPrevisto,
          profissionalAgendado,
          localAgendamento: localAg,
          observacoesRegulacao: input.nota || `Agendamento direto efetuado no balcão do ${centroTipo}.`,
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
            titulo: 'Vaga Alocada na Escala',
            descricao: `Consulta agendada para ${agendamentoPrevisto.toISOString().substring(0, 10)} às ${agendamentoPrevisto.toISOString().substring(11, 16)}. Profissional: ${profissionalAgendado}.`,
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
            dataCalculada: agendamentoPrevisto.toISOString().substring(0, 10),
            horario: agendamentoPrevisto.toISOString().substring(11, 16),
            medico: profissionalAgendado,
          },
        },
      });

      return tx.encaminhamento.findUniqueOrThrow({
        where: { id: encRow.id },
        include: INCLUDE_ENCAMINHAMENTO_FULL,
      });
    });

    void this.notificacoes
      .notificar({
        cpfPaciente: createdRow.pacienteCpf,
        pacienteNome: createdRow.pacienteNome,
        encaminhamentoId: createdRow.id,
        tipo: 'AGENDADO',
        ...MENSAGENS.agendado(createdRow.protocolo, agendamentoPrevisto.toISOString()),
        payload: {
          protocolo: createdRow.protocolo,
          agendamentoPrevisto: agendamentoPrevisto.toISOString(),
        },
      })
      .catch(() => {});

    return rowParaEncaminhamento(createdRow);
  }
}
