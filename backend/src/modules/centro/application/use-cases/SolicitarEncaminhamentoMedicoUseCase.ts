import { StatusEncaminhamento, CanalRoteamento, Sexo } from '../../../../../generated/prisma';
import { prisma } from '../../../../infrastructure/database/prisma';
import { rowParaEncaminhamento, INCLUDE_ENCAMINHAMENTO_FULL } from '../../../../infrastructure/database/encaminhamentoMapper';
import type { Encaminhamento, PrioridadeClinica } from '../../../../domain/entities/Encaminhamento';
import type { AccessScope } from '../../../../shared/scope';
import { ensureUbsAcessivel } from '../../../../shared/scope';
import { NotFound } from '../../../../shared/errors';
import { NotificacaoPacienteService, MENSAGENS } from '../../../../infrastructure/services/NotificacaoPacienteService';

export interface SolicitarEncaminhamentoMedicoInput {
  encaminhamentoIdOrPacienteId: string;
  solicitacao: {
    especialidadeSolicitada: string;
    cid10: string;
    cidDescricao?: string;
    justificativaClinica: string;
    prioridade?: PrioridadeClinica;
    observacao?: string;
  };
  doctor: {
    id: string;
    nome: string;
    matricula?: string;
  };
}

export class SolicitarEncaminhamentoMedicoUseCase {
  private readonly notificacoes = new NotificacaoPacienteService();

  async exec(input: SolicitarEncaminhamentoMedicoInput, scope: AccessScope): Promise<Encaminhamento> {
    const { encaminhamentoIdOrPacienteId, solicitacao, doctor } = input;

    // Busca o encaminhamento atual ou o paciente
    let pacienteData: {
      id?: string;
      nome: string;
      cpf: string;
      cartaoSus?: string | null;
      dataNascimento: Date;
      sexo: Sexo;
      telefone?: string | null;
      endereco?: string | null;
      ubsId: string;
      unidadeOrigem: string;
    } | null = null;

    const currentEnc = await prisma.encaminhamento.findUnique({
      where: { id: encaminhamentoIdOrPacienteId },
      select: {
        pacienteId: true,
        pacienteNome: true,
        pacienteCpf: true,
        pacienteCartaoSus: true,
        pacienteDataNascimento: true,
        pacienteSexo: true,
        pacienteTelefone: true,
        pacienteEndereco: true,
        ubsId: true,
        unidadeOrigem: true,
        ubs: { select: { id: true, prefeituraId: true } },
      },
    });

    if (currentEnc) {
      ensureUbsAcessivel(scope, { id: currentEnc.ubsId, prefeituraId: currentEnc.ubs?.prefeituraId ?? '' });
      pacienteData = {
        id: currentEnc.pacienteId || undefined,
        nome: currentEnc.pacienteNome,
        cpf: currentEnc.pacienteCpf,
        cartaoSus: currentEnc.pacienteCartaoSus,
        dataNascimento: currentEnc.pacienteDataNascimento,
        sexo: currentEnc.pacienteSexo,
        telefone: currentEnc.pacienteTelefone,
        endereco: currentEnc.pacienteEndereco,
        ubsId: currentEnc.ubsId,
        unidadeOrigem: currentEnc.unidadeOrigem,
      };
    } else {
      const pac = await prisma.paciente.findUnique({
        where: { id: encaminhamentoIdOrPacienteId },
        include: { ubs: { select: { id: true, prefeituraId: true, nome: true, municipio: true } } },
      });

      if (pac) {
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
        };
      }
    }

    if (!pacienteData) {
      throw NotFound('PACIENTE_NAO_ENCONTRADO', 'Paciente ou atendimento de origem não encontrado.');
    }

    // Gerar protocolo
    const ano = new Date().getUTCFullYear();
    const chave = `UBS-${ano}`;
    const seq = await prisma.sequencialProtocolo.upsert({
      where: { chave },
      create: { chave, valor: 1 },
      update: { valor: { increment: 1 } },
    });
    const protocolo = `UBS-${ano}-${String(seq.valor).padStart(6, '0')}`;

    const crmVal = doctor.matricula || 'CRM 00000';
    const prioridadeVal = solicitacao.prioridade || 'ELETIVA';

    const created = await prisma.encaminhamento.create({
      data: {
        protocolo,
        status: StatusEncaminhamento.AGUARDANDO_REGULACAO,
        canalRoteamento: CanalRoteamento.CENTRO_ESPECIALIDADES,
        destinoRegulacao: 'CENTRO_ESPECIALIDADES',
        ubsId: pacienteData.ubsId,
        unidadeOrigem: pacienteData.unidadeOrigem,
        atendenteId: doctor.id,
        atendenteResponsavel: doctor.nome,
        pacienteId: pacienteData.id,
        pacienteNome: pacienteData.nome,
        pacienteCpf: pacienteData.cpf,
        pacienteCartaoSus: pacienteData.cartaoSus || '',
        pacienteDataNascimento: pacienteData.dataNascimento,
        pacienteSexo: pacienteData.sexo,
        pacienteTelefone: pacienteData.telefone || '',
        pacienteEndereco: pacienteData.endereco || '',
        medicoSolicitante: doctor.nome,
        crm: crmVal,
        especialidadeSolicitada: solicitacao.especialidadeSolicitada,
        cid10: solicitacao.cid10,
        cidDescricao: solicitacao.cidDescricao || '',
        justificativaClinica: solicitacao.justificativaClinica,
        prioridade: prioridadeVal,
        dataSolicitacao: new Date(),
        observacoesRegulacao: solicitacao.observacao || 'Solicitação gerada via Consultório Médico Especializado.',
        timeline: {
          create: [
            {
              tipo: 'CRIADO',
              titulo: 'Encaminhamento médico criado',
              descricao: `Solicitação de ${solicitacao.especialidadeSolicitada} emitida pelo especialista ${doctor.nome} (${crmVal}) no Centro de Especialidades.`,
              autor: doctor.nome,
              autorPapel: 'Médico Especialista',
            },
            {
              tipo: 'ENVIADO_REGULACAO',
              titulo: 'Enviado à Regulação Municipal',
              descricao: 'Encaminhamento entrou automaticamente na fila de Regulação da Secretaria de Saúde.',
              autor: 'SISTEMA',
              autorPapel: 'Sistema UNISISM',
            },
          ],
        },
      },
    });

    const full = await prisma.encaminhamento.findUniqueOrThrow({
      where: { id: created.id },
      include: INCLUDE_ENCAMINHAMENTO_FULL,
    });

    void this.notificacoes
      .notificar({
        cpfPaciente: pacienteData.cpf,
        pacienteNome: pacienteData.nome,
        encaminhamentoId: full.id,
        tipo: 'ENCAMINHAMENTO_CRIADO',
        ...MENSAGENS.encaminhamentoCriado(full.protocolo, pacienteData.unidadeOrigem),
        payload: { protocolo: full.protocolo, unidadeOrigem: pacienteData.unidadeOrigem },
      })
      .catch(() => {});

    return rowParaEncaminhamento(full);
  }
}
