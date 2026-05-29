/**
 * Mapper compartilhado entre o repository da Face 1 (UBS) e o módulo de gestão (Face 2 / SMS).
 * Converte uma row Prisma de Encaminhamento (com anexos + timeline) para o shape de domínio.
 */
import {
  type Prisma,
  type Encaminhamento as EncaminhamentoRow,
  type AnexoDocumento as AnexoRow,
  type EventoTimeline as EventoRow,
} from '../../../generated/prisma';
import type {
  AnexoDocumento,
  Encaminhamento,
  EventoTimeline,
  Paciente,
  RespostaSUS,
  SolicitacaoMedica,
} from '../../domain/entities/Encaminhamento';
import { ymd } from './mappers';

export type EncaminhamentoFull = EncaminhamentoRow & {
  anexos: AnexoRow[];
  timeline: EventoRow[];
};

export const INCLUDE_ENCAMINHAMENTO_FULL = {
  anexos: true,
  timeline: true,
} satisfies Prisma.EncaminhamentoInclude;

export function rowParaEncaminhamento(r: EncaminhamentoFull): Encaminhamento {
  const paciente: Paciente = {
    nome: r.pacienteNome,
    cpf: r.pacienteCpf,
    cartaoSus: r.pacienteCartaoSus,
    dataNascimento: ymd(r.pacienteDataNascimento),
    sexo: r.pacienteSexo,
    telefone: r.pacienteTelefone,
    endereco: r.pacienteEndereco,
  };
  const solicitacao: SolicitacaoMedica = {
    medicoSolicitante: r.medicoSolicitante,
    crm: r.crm,
    especialidadeSolicitada: r.especialidadeSolicitada,
    cid10: r.cid10,
    cidDescricao: r.cidDescricao,
    justificativaClinica: r.justificativaClinica,
    prioridade: r.prioridade,
    dataSolicitacao: ymd(r.dataSolicitacao),
  };
  const anexos: AnexoDocumento[] = r.anexos
    .slice()
    .sort((a, b) => a.uploadEm.getTime() - b.uploadEm.getTime())
    .map((a) => ({
      id: a.id,
      nome: a.nome,
      tipo: a.tipo,
      tamanhoKb: a.tamanhoKb,
      uploadEm: a.uploadEm.toISOString(),
      scanStatus: a.scanStatus,
    }));
  const timeline: EventoTimeline[] = r.timeline
    .slice()
    .sort((a, b) => a.em.getTime() - b.em.getTime())
    .map((e) => ({
      id: e.id,
      tipo: e.tipo,
      titulo: e.titulo,
      descricao: e.descricao,
      autor: e.autor,
      autorPapel: e.autorPapel,
      em: e.em.toISOString(),
    }));

  const enc: Encaminhamento = {
    id: r.id,
    protocolo: r.protocolo,
    paciente,
    solicitacao,
    anexos,
    status: r.status,
    criadoEm: r.criadoEm.toISOString(),
    atualizadoEm: r.atualizadoEm.toISOString(),
    unidadeOrigem: r.unidadeOrigem,
    atendenteResponsavel: r.atendenteResponsavel,
    timeline,
    agendamentoPrevisto: r.agendamentoPrevisto ? r.agendamentoPrevisto.toISOString() : null,
    localAgendamento: r.localAgendamento ?? null,
    profissionalAgendado: r.profissionalAgendado ?? null,
    cidadeAgendamento: r.cidadeAgendamento ?? null,
    ufAgendamento: r.ufAgendamento ?? null,
    motivoRejeicao: r.motivoRejeicao ?? null,
    recomendacoes: Array.isArray(r.recomendacoes) ? (r.recomendacoes as string[]) : [],
  };
  if (r.observacoesRegulacao) enc.observacoesRegulacao = r.observacoesRegulacao;

  if (
    r.respostaSusAnexoId &&
    r.respostaSusRegistradoEm &&
    r.respostaSusRegistradoPorId &&
    r.respostaSusRegistradoPorNome &&
    r.respostaSusRegistradoPorMat
  ) {
    const respostaSUS: RespostaSUS = {
      anexoId: r.respostaSusAnexoId,
      observacao: r.respostaSusObservacao ?? '',
      registradoEm: r.respostaSusRegistradoEm.toISOString(),
      registradoPor: {
        id: r.respostaSusRegistradoPorId,
        nome: r.respostaSusRegistradoPorNome,
        matricula: r.respostaSusRegistradoPorMat,
      },
    };
    enc.respostaSUS = respostaSUS;
  }

  return enc;
}
