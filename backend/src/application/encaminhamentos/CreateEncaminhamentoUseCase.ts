import { Unprocessable } from '../../shared/errors';
import type {
  Encaminhamento,
  Paciente,
  SolicitacaoMedica,
  TipoAnexo,
} from '../../domain/entities/Encaminhamento';
import type {
  IEncaminhamentoRepository,
  CriarEncaminhamentoInput,
  PacienteComplemento,
} from '../../domain/repositories/IEncaminhamentoRepository';
import type { IFileStorage } from '../../domain/services/IFileStorage';
import type { IAnexoScanner } from '../../infrastructure/scan/ClamavScanner';
import { logger } from '../../infrastructure/logger';
import { prisma } from '../../infrastructure/database/prisma';
import { PdfCompressor } from '../../infrastructure/services/PdfCompressor';
import {
  MENSAGENS,
  NotificacaoPacienteService,
} from '../../infrastructure/services/NotificacaoPacienteService';
import { calcularOtimizacaoAgendamento } from '../../modules/gestao/application/use-cases/OtimizadorVagas';
import { rowParaEncaminhamento } from '../../infrastructure/database/encaminhamentoMapper';

export interface AnexoUpload {
  nomeOriginal: string;
  mimeType: string;
  buffer: Buffer;
  tipo: TipoAnexo;
}

export interface CreateEncaminhamentoInput {
  paciente: Paciente;
  pacienteComplemento?: PacienteComplemento;
  solicitacao: SolicitacaoMedica;
  ubsId?: string;
  atendenteId: string;
  unidadeOrigem?: string;
  atendenteResponsavel: string;
  solicitacaoPdf?: AnexoUpload;
  anexos: AnexoUpload[];
}

export class CreateEncaminhamentoUseCase {
  private readonly compressor = new PdfCompressor();
  private readonly notificacoes = new NotificacaoPacienteService();

  constructor(
    private readonly encaminhamentos: IEncaminhamentoRepository,
    private readonly storage: IFileStorage,
    private readonly scanner?: IAnexoScanner,
  ) {}

  private async talvezComprimir(
    nome: string,
    mimeType: string,
    buffer: Buffer,
  ): Promise<Buffer> {
    if (mimeType !== 'application/pdf') return buffer;
    try {
      const r = await this.compressor.comprimir(buffer);
      return r.buffer;
    } catch (err) {
      logger.warn({ err, nome }, 'falha ao comprimir PDF, salvando original');
      return buffer;
    }
  }

  async exec(input: CreateEncaminhamentoInput): Promise<Encaminhamento> {
    if (!input.paciente.cpf || !input.paciente.nome || !input.solicitacao.especialidadeSolicitada) {
      throw Unprocessable(
        'DADOS_OBRIGATORIOS_AUSENTES',
        'Faltam campos obrigatórios (CPF, nome ou especialidade)',
      );
    }

    const atendente = await prisma.atendente.findUnique({
      where: { id: input.atendenteId },
    });
    if (!atendente) {
      throw Unprocessable('ATENDENTE_NAO_ENCONTRADO', 'Atendente não encontrado');
    }

    let resolvedUbsId = input.ubsId;
    let resolvedUnidadeOrigem = input.unidadeOrigem;

    if (!resolvedUbsId) {
      const fallbackUbs = await prisma.ubs.findFirst({
        where: atendente.prefeituraId ? { prefeituraId: atendente.prefeituraId } : undefined,
      });
      if (!fallbackUbs) {
        throw Unprocessable(
          'UBS_AUSENTE',
          'Não foi possível encontrar uma UBS vinculada à prefeitura do atendente.',
        );
      }
      resolvedUbsId = fallbackUbs.id;
      resolvedUnidadeOrigem = `${fallbackUbs.nome} - ${fallbackUbs.municipio}`;
    }

    const pasta = `encaminhamentos/${new Date().toISOString().slice(0, 7)}`;

    const anexosPersistidos: CriarEncaminhamentoInput['anexos'] = [];

    if (input.solicitacaoPdf) {
      const buf = await this.talvezComprimir(
        input.solicitacaoPdf.nomeOriginal,
        input.solicitacaoPdf.mimeType,
        input.solicitacaoPdf.buffer,
      );
      const arq = await this.storage.salvar({
        nomeOriginal: input.solicitacaoPdf.nomeOriginal,
        mimeType: input.solicitacaoPdf.mimeType,
        buffer: buf,
        pasta,
      });
      anexosPersistidos.push({
        nome: input.solicitacaoPdf.nomeOriginal,
        tipo: 'SOLICITACAO',
        tamanhoKb: arq.tamanhoKb,
        mimeType: input.solicitacaoPdf.mimeType,
        caminho: arq.caminho,
      });
    }

    for (const a of input.anexos) {
      const buf = await this.talvezComprimir(a.nomeOriginal, a.mimeType, a.buffer);
      const arq = await this.storage.salvar({
        nomeOriginal: a.nomeOriginal,
        mimeType: a.mimeType,
        buffer: buf,
        pasta,
      });
      anexosPersistidos.push({
        nome: a.nomeOriginal,
        tipo: a.tipo,
        tamanhoKb: arq.tamanhoKb,
        mimeType: a.mimeType,
        caminho: arq.caminho,
      });
    }

    const criado = await this.encaminhamentos.criar({
      paciente: input.paciente,
      ...(input.pacienteComplemento ? { pacienteComplemento: input.pacienteComplemento } : {}),
      solicitacao: input.solicitacao,
      ubsId: resolvedUbsId!,
      atendenteId: input.atendenteId,
      unidadeOrigem: resolvedUnidadeOrigem!,
      atendenteResponsavel: input.atendenteResponsavel,
      anexos: anexosPersistidos,
    });

    let finalEnc = criado;

    // Se o criador for do Centro ou Regulador SMS, faz o agendamento/aprovação direta (Balcão)
    if (atendente.role === 'ATENDENTE_CENTRO' || atendente.role === 'REGULADOR_SMS') {
      const otimizado = await calcularOtimizacaoAgendamento({
        especialidade: input.solicitacao.especialidadeSolicitada,
        prioridade: input.solicitacao.prioridade,
      });

      await prisma.$transaction(async (tx) => {
        await tx.eventoTimeline.createMany({
          data: [
            {
              encaminhamentoId: criado.id,
              tipo: 'APROVADO',
              titulo: 'Encaminhamento aprovado',
              descricao: `Aprovado automaticamente via agendamento direto de balcão.`,
              autor: atendente.nome,
              autorPapel: atendente.role === 'REGULADOR_SMS' ? 'Regulação · SMS' : 'Recepção · Centro de Especialidades',
            },
            {
              encaminhamentoId: criado.id,
              tipo: 'AGENDADO',
              titulo: 'Consulta agendada',
              descricao: `Atendimento agendado para ${otimizado.dateStr} no local Centro Municipal de Especialidades. Profissional: ${otimizado.doctor.nome} às ${otimizado.timeStr}.`,
              autor: atendente.nome,
              autorPapel: atendente.role === 'REGULADOR_SMS' ? 'Regulação · SMS' : 'Recepção · Centro de Especialidades',
            }
          ]
        });

        await tx.encaminhamento.update({
          where: { id: criado.id },
          data: {
            status: 'APROVADO',
            agendamentoPrevisto: otimizado.dateTime,
            localAgendamento: 'Centro Municipal de Especialidades',
            profissionalAgendado: otimizado.doctor.nome,
            cidadeAgendamento: criado.cidadeAgendamento || 'Município Sede',
            ufAgendamento: 'PE',
            canalRoteamento: 'CENTRO_ESPECIALIDADES',
            destinoRegulacao: 'CENTRO_ESPECIALIDADES',
            observacoesRegulacao: `Médico: ${otimizado.doctor.nome} às ${otimizado.timeStr} | Agendamento direto de Balcão`,
          }
        });
      });

      // Busca o registro atualizado
      const updated = await prisma.encaminhamento.findUnique({
        where: { id: criado.id },
        include: {
          anexos: true,
          timeline: true,
        }
      });
      if (updated) {
        finalEnc = rowParaEncaminhamento(updated);
      }

      // Notificações de aprovação e agendamento para o paciente
      void this.notificacoes
        .notificar({
          cpfPaciente: finalEnc.pacienteCpf,
          pacienteNome: finalEnc.pacienteNome,
          encaminhamentoId: finalEnc.id,
          tipo: 'APROVADO',
          ...MENSAGENS.aprovado(finalEnc.protocolo),
          payload: { protocolo: finalEnc.protocolo },
        })
        .catch((err) => logger.warn({ err }, 'notificar APROVADO falhou'));

      void this.notificacoes
        .notificar({
          cpfPaciente: finalEnc.pacienteCpf,
          pacienteNome: finalEnc.pacienteNome,
          encaminhamentoId: finalEnc.id,
          tipo: 'AGENDADO',
          ...MENSAGENS.agendado(finalEnc.protocolo, otimizado.dateTime.toISOString()),
          payload: {
            protocolo: finalEnc.protocolo,
            agendamentoPrevisto: otimizado.dateTime.toISOString(),
          },
        })
        .catch((err) => logger.warn({ err }, 'notificar AGENDADO falhou'));
    } else {
      // Notificação comum de criação para o app do paciente
      void this.notificacoes
        .notificar({
          cpfPaciente: input.paciente.cpf,
          pacienteNome: input.paciente.nome,
          ...(input.paciente.telefone ? { pacienteTelefone: input.paciente.telefone } : {}),
          encaminhamentoId: criado.id,
          tipo: 'ENCAMINHAMENTO_CRIADO',
          ...MENSAGENS.encaminhamentoCriado(criado.protocolo, resolvedUnidadeOrigem!),
          payload: { protocolo: criado.protocolo, unidadeOrigem: resolvedUnidadeOrigem! },
        })
        .catch((err) => logger.warn({ err }, 'falha ao notificar paciente'));
    }

    // Scan AV dos anexos (fire-and-forget).
    if (this.scanner) {
      void this.escanearAnexosAsync(criado.id);
    }

    return finalEnc;
  }

  private async escanearAnexosAsync(encaminhamentoId: string): Promise<void> {
    if (!this.scanner) return;
    try {
      const anexos = await prisma.anexoDocumento.findMany({
        where: { encaminhamentoId },
        select: { id: true, caminho: true },
      });
      for (const a of anexos) {
        try {
          await this.scanner.escanearEAtualizar(a.id, this.storage.caminhoAbsoluto(a.caminho));
        } catch (err) {
          logger.warn({ err, anexoId: a.id }, 'scan AV falhou');
        }
      }
    } catch (err) {
      logger.warn({ err, encaminhamentoId }, 'falha ao enfileirar scan AV');
    }
  }
}
