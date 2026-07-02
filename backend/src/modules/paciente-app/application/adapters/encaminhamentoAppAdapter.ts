/**
 * Adapter Encaminhamento → shape do app paciente (MANDATO_BACKEND.md §5).
 *
 * App é a fonte da verdade do contrato. Backend internamente usa shape
 * aninhado (`solicitacao.*`) por razões históricas (Face 1/2). Esse adapter
 * achata o shape antes de devolver pro app Flutter.
 *
 * Mapeamentos:
 *   solicitacao.especialidadeSolicitada  → especialidade
 *   solicitacao.cid10                    → cid10
 *   solicitacao.cidDescricao             → cid10Descricao
 *   solicitacao.prioridade               → prioridade
 *   solicitacao.justificativaClinica     → justificativaResumida
 *   solicitacao.medicoSolicitante        → medicoSolicitanteNome
 *   unidadeOrigem                        → ubsOrigemNome
 *   agendamentoPrevisto                  → dataAgendamento
 *
 * Status: deriva `AGENDADO` quando `status=APROVADO && agendamentoPrevisto != null`.
 *
 * Anexos: tamanhoKb → tamanhoBytes (× 1024) + tipo enum interno → PDF/IMG/DOC.
 * Timeline: tipo interno → enum app (CRIADO → CRIACAO, etc.).
 */
import type {
  Encaminhamento,
  AnexoDocumento,
  EventoTimeline,
} from '../../../../domain/entities/Encaminhamento';

export type StatusEncaminhamentoApp =
  | 'RASCUNHO'
  | 'AGUARDANDO_REGULACAO'
  | 'EM_ANALISE'
  | 'PENDENCIA_DOCUMENTO'
  | 'APROVADO'
  | 'AGUARDANDO_AGENDAMENTO'
  | 'AGENDADO'
  | 'REJEITADO'
  | 'CANCELADO'
  | 'CONCLUIDO';

export type EventoTimelineTipoApp =
  | 'CRIACAO'
  | 'ANEXO'
  | 'PENDENCIA'
  | 'APROVACAO'
  | 'AGENDAMENTO'
  | 'REJEICAO'
  | 'ATUALIZACAO';

export type AnexoTipoApp = 'PDF' | 'IMG' | 'DOC';

export interface EncaminhamentoApp {
  id: string;
  protocolo: string;
  status: StatusEncaminhamentoApp;
  prioridade: string;
  especialidade: string;
  cid10: string | null;
  cid10Descricao: string | null;
  justificativaResumida: string | null;
  ubsOrigemNome: string | null;
  medicoSolicitanteNome: string | null;
  dataAgendamento: string | null;
  localAgendamento: string | null;
  observacoesRegulacao: string | null;
  motivoRejeicao: string | null;
  pendenciasAbertas: number;
  podeSolicitarTfd: boolean;
  recomendacoes: string[];
  criadoEm: string;
  atualizadoEm: string;
  // Embedados pra compat — também expostos via endpoints separados
  anexos?: AnexoApp[];
  timeline?: TimelineEventoApp[];
}

export interface AnexoApp {
  id: string;
  nome: string;
  tipo: AnexoTipoApp;
  tamanhoBytes: number;
  adicionadoEm: string;
  descricao: string | null;
}

export interface TimelineEventoApp {
  id: string;
  tipo: EventoTimelineTipoApp;
  titulo: string;
  descricao: string;
  autor: string;
  autorPapel: string;
  em: string;
}

/**
 * Mapeia tipo interno (Face 1/2) → enum do app.
 * O app categoriza eventos em buckets visuais simples; o backend mantém
 * granularidade fina pra audit.
 */
export function mapTimelineTipo(tipo: string): EventoTimelineTipoApp {
  switch (tipo) {
    case 'CRIADO':
      return 'CRIACAO';
    case 'DOCUMENTO_ANEXADO':
      return 'ANEXO';
    case 'PENDENCIA_REGISTRADA':
      return 'PENDENCIA';
    case 'APROVADO':
      return 'APROVACAO';
    case 'AGENDADO':
      return 'AGENDAMENTO';
    case 'REJEITADO':
      return 'REJEICAO';
    case 'ENVIADO_REGULACAO':
    case 'OBSERVACAO':
    case 'RESPOSTA_SUS_RECEBIDA':
    case 'EDITADO':
    default:
      return 'ATUALIZACAO';
  }
}

/**
 * Mapeia tipo interno do anexo (SOLICITACAO/RG/CPF/...) → PDF|IMG|DOC.
 * Estratégia: deriva pela extensão do nome do arquivo (mais confiável que
 * o enum de "função do anexo").
 */
export function mapAnexoTipo(nome: string): AnexoTipoApp {
  const lower = (nome ?? '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'PDF';
  if (/\.(jpg|jpeg|png|gif|webp|heic|bmp|tiff?)$/.test(lower)) return 'IMG';
  return 'DOC';
}

export function mapAnexoApp(anexo: AnexoDocumento): AnexoApp {
  return {
    id: anexo.id,
    nome: anexo.nome,
    tipo: mapAnexoTipo(anexo.nome),
    tamanhoBytes: Math.max(1, (anexo.tamanhoKb ?? 0) * 1024),
    adicionadoEm: anexo.uploadEm,
    descricao: null,
  };
}

export function mapTimelineEventoApp(ev: EventoTimeline): TimelineEventoApp {
  return {
    id: ev.id,
    tipo: mapTimelineTipo(ev.tipo),
    titulo: ev.titulo,
    descricao: ev.descricao ?? '',
    autor: ev.autor ?? '',
    autorPapel: ev.autorPapel ?? '',
    em: ev.em,
  };
}

/**
 * Deriva status visual do app a partir do status interno + presença de
 * `agendamentoPrevisto`.
 *
 * Internamente o backend só tem 5 status; o app expõe 10 incluindo
 * AGENDADO (derivado), AGUARDANDO_AGENDAMENTO (APROVADO sem data),
 * CANCELADO/CONCLUIDO (reservados, não usados hoje).
 */
export function deriveStatusApp(
  statusInterno: string,
  agendamentoPrevisto?: string | null,
): StatusEncaminhamentoApp {
  switch (statusInterno) {
    case 'APROVADO':
      return agendamentoPrevisto ? 'AGENDADO' : 'AGUARDANDO_AGENDAMENTO';
    case 'AGUARDANDO_REGULACAO':
    case 'PENDENCIA_DOCUMENTO':
    case 'REJEITADO':
    case 'RASCUNHO':
      return statusInterno as StatusEncaminhamentoApp;
    default:
      // Backend não tem CANCELADO/CONCLUIDO ainda — se vier, passa direto
      return (statusInterno as StatusEncaminhamentoApp) ?? 'AGUARDANDO_REGULACAO';
  }
}

/**
 * Conversor principal — Encaminhamento interno (com `solicitacao` aninhado)
 * → shape FLAT esperado pelo app.
 */
export function mapEncaminhamentoApp(
  enc: Encaminhamento & {
    pendenciasAbertas?: number;
    podeSolicitarTfd?: boolean;
    recomendacoes?: string[];
  },
): EncaminhamentoApp {
  const sol = enc.solicitacao ?? ({} as Partial<typeof enc.solicitacao>);
  return {
    id: enc.id,
    protocolo: enc.protocolo,
    status: deriveStatusApp(enc.status, enc.agendamentoPrevisto),
    prioridade: sol.prioridade ?? 'ELETIVA',
    especialidade: sol.especialidadeSolicitada ?? '',
    cid10: sol.cid10 ?? null,
    cid10Descricao: sol.cidDescricao ?? null,
    justificativaResumida: sol.justificativaClinica ?? null,
    ubsOrigemNome: enc.unidadeOrigem ?? null,
    medicoSolicitanteNome: sol.medicoSolicitante ?? null,
    dataAgendamento: enc.agendamentoPrevisto ?? null,
    localAgendamento: enc.localAgendamento ?? null,
    observacoesRegulacao: enc.observacoesRegulacao ?? null,
    motivoRejeicao: enc.motivoRejeicao ?? null,
    pendenciasAbertas: enc.pendenciasAbertas ?? 0,
    podeSolicitarTfd: enc.podeSolicitarTfd ?? false,
    recomendacoes: enc.recomendacoes ?? [],
    criadoEm: enc.criadoEm,
    atualizadoEm: enc.atualizadoEm,
    anexos: (enc.anexos ?? []).map(mapAnexoApp),
    timeline: (enc.timeline ?? []).slice()
      .sort((a, b) => new Date(a.em).getTime() - new Date(b.em).getTime())
      .map(mapTimelineEventoApp),
  };
}
