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
import { safeIsoString, safeIsoOrNull, ymd } from './mappers';

export type EncaminhamentoFull = EncaminhamentoRow & {
  anexos: AnexoRow[];
  timeline: EventoRow[];
  ubs?: any;
};

export const INCLUDE_ENCAMINHAMENTO_FULL = {
  anexos: true,
  timeline: true,
  ubs: { select: { id: true, prefeituraId: true } },
} satisfies Prisma.EncaminhamentoInclude;

function safeTime(d: any): number {
  if (!d) return 0;
  if (d instanceof Date) return isNaN(d.getTime()) ? 0 : d.getTime();
  try {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  } catch {
    return 0;
  }
}

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
  const anexos: AnexoDocumento[] = (r.anexos ?? [])
    .slice()
    .sort((a, b) => safeTime(a.uploadEm) - safeTime(b.uploadEm))
    .map((a) => ({
      id: a.id,
      nome: a.nome,
      tipo: a.tipo,
      tamanhoKb: a.tamanhoKb,
      uploadEm: safeIsoString(a.uploadEm) || new Date().toISOString(),
      scanStatus: a.scanStatus,
    }));
  const timeline: EventoTimeline[] = (r.timeline ?? [])
    .slice()
    .sort((a, b) => safeTime(a.em) - safeTime(b.em))
    .map((e) => ({
      id: e.id,
      tipo: e.tipo,
      titulo: e.titulo,
      descricao: e.descricao,
      autor: e.autor,
      autorPapel: e.autorPapel,
      em: safeIsoString(e.em) || new Date().toISOString(),
    }));

  const enc: Encaminhamento = {
    id: r.id,
    protocolo: r.protocolo,
    paciente,
    solicitacao,
    anexos,
    status: r.status,
    criadoEm: safeIsoString(r.criadoEm) || new Date().toISOString(),
    atualizadoEm: safeIsoString(r.atualizadoEm) || new Date().toISOString(),
    unidadeOrigem: r.unidadeOrigem,
    atendenteResponsavel: r.atendenteResponsavel,
    timeline,
    agendamentoPrevisto: safeIsoOrNull(r.agendamentoPrevisto),
    localAgendamento: r.localAgendamento ?? null,
    profissionalAgendado: r.profissionalAgendado ?? null,
    cidadeAgendamento: r.cidadeAgendamento ?? null,
    ufAgendamento: r.ufAgendamento ?? null,
    motivoRejeicao: r.motivoRejeicao ?? null,
    recomendacoes: Array.isArray(r.recomendacoes) ? (r.recomendacoes as string[]) : [],
    canalRoteamento: r.canalRoteamento ?? null,
    filaDestino: (r.canalRoteamento === 'CENTRO_ODONTOLOGICO' || r.destinoRegulacao === 'CENTRO_ODONTOLOGICO') ? 'CEO' : (r.canalRoteamento ?? r.destinoRegulacao ?? null),
    destinoRegulacao: r.destinoRegulacao ?? null,
    dataDisponibilidade: safeIsoOrNull(r.dataDisponibilidade),
    statusAtendimentoCentro: r.statusAtendimentoCentro ?? null,
    presencaRegistradaEm: safeIsoOrNull(r.presencaRegistradaEm),
    atendimentoIniciadoEm: safeIsoOrNull(r.atendimentoIniciadoEm),
    atendimentoConcluidoEm: safeIsoOrNull(r.atendimentoConcluidoEm),
    criadoPorId: r.criadoPorId ?? r.atendenteId ?? null,
    criadoPorNome: r.criadoPorNome ?? r.atendenteResponsavel ?? null,
    atualizadoPorId: r.atualizadoPorId ?? null,
    atualizadoPorNome: r.atualizadoPorNome ?? null,
    deletadoPorId: r.deletadoPorId ?? null,
    deletadoPorNome: r.deletadoPorNome ?? null,
    motivoExclusao: r.motivoExclusao ?? null,
    deletadoEm: safeIsoOrNull(r.deletadoEm),
    necessitaTriagem: r.necessitaTriagem ?? false,
    triagemRealizada: r.triagemRealizada ?? false,
    triagemEm: safeIsoOrNull(r.triagemEm),
    triagemPorId: r.triagemPorId ?? null,
    triagemPorNome: r.triagemPorNome ?? null,
    triagemCoren: r.triagemCoren ?? null,
    triagemDados: r.triagemDados ?? null,
    chamadaTriagemEm: safeIsoOrNull(r.chamadaTriagemEm),
    consultorioTriagem: r.consultorioTriagem ?? null,
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
      registradoEm: safeIsoString(r.respostaSusRegistradoEm) || new Date().toISOString(),
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
