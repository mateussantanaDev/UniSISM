/**
 * Adapter Notificação → shape do app paciente (MANDATO_BACKEND.md §6.1).
 *
 * Mapeamentos:
 *   criadaEm    → em
 *   lidaEm      → lida (boolean derivado: != null)
 *   corpo       → corpo (mantém)
 *   tipo        → tipo (mantém)
 *   protocolo   → protocolo (mantém)
 *   payload.X   → derivado pra tone + deepLink + tfdSolicitacaoId
 */

export type NotificacaoToneApp = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export interface NotificacaoApp {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string;
  em: string;
  lida: boolean;
  tone: NotificacaoToneApp;
  deepLink: string | null;
  encaminhamentoId: string | null;
  tfdSolicitacaoId: string | null;
}

export interface NotificacaoInterna {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string;
  encaminhamentoId: string | null;
  protocolo: string | null;
  payload: Record<string, unknown> | null;
  criadaEm: string;
  lidaEm: string | null;
}

/**
 * Deriva o tom visual da notificação a partir do tipo.
 * Centralizar essa lógica no backend (em vez de espalhar no Flutter) reduz
 * inconsistência entre versões do app.
 */
export function deriveTone(tipo: string): NotificacaoToneApp {
  switch (tipo) {
    case 'APROVADO':
    case 'ENCAMINHAMENTO_APROVADO':
    case 'PENDENCIA_RESOLVIDA':
    case 'RESPOSTA_SUS_DISPONIVEL':
    case 'TFD_APROVADA':
    case 'TFD_PAC_SOLIC_APROVADA':
      return 'SUCCESS';
    case 'PENDENCIA_REGISTRADA':
    case 'AGENDADO':
    case 'TFD_AGENDADA':
      return 'WARNING';
    case 'REJEITADO':
    case 'ENCAMINHAMENTO_REJEITADO':
    case 'TFD_RECUSADA':
    case 'TFD_PAC_SOLIC_RECUSADA':
      return 'CRITICAL';
    default:
      return 'INFO';
  }
}

/**
 * Deriva o deep-link interno do app.
 * - Se aponta pra encaminhamento → `/encaminhamento/:id`
 * - Se aponta pra solicitação TFD → `/tfd/solicitacao/:id`
 * - Senão → null
 */
export function deriveDeepLink(n: NotificacaoInterna): string | null {
  const tfdId = (n.payload?.['tfdSolicitacaoId'] as string | undefined) ?? null;
  if (tfdId) return `/tfd/solicitacao/${tfdId}`;
  if (n.encaminhamentoId) return `/encaminhamento/${n.encaminhamentoId}`;
  return null;
}

export function mapNotificacaoApp(n: NotificacaoInterna): NotificacaoApp {
  const tfdId = (n.payload?.['tfdSolicitacaoId'] as string | undefined) ?? null;
  return {
    id: n.id,
    tipo: n.tipo,
    titulo: n.titulo,
    corpo: n.corpo,
    em: n.criadaEm,
    lida: n.lidaEm !== null,
    tone: deriveTone(n.tipo),
    deepLink: deriveDeepLink(n),
    encaminhamentoId: n.encaminhamentoId,
    tfdSolicitacaoId: tfdId,
  };
}
