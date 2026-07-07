import { env } from './env';

export interface AdminConfiguracoes {
  senhaMinimaCaracteres: number;
  senhaHistoricoBloqueado: number;
  senhaValidadeDias: number;
  slaPorPrioridade: {
    EMERGENCIA: number;
    URGENTE: number;
    PRIORITARIA: number;
    ELETIVA: number;
  };
  retencaoProntuarioAnos: number;
  retencaoAuditLogAnos: number;
  retencaoSessaoDias: number;
  maxUploadMb: number;
  uploadMaxMb: number;
  uploadMaxBytes: number;
}

interface AdminConfiguracoesOverrides {
  MAX_UPLOAD_MB?: number | string;
}

export function getAdminConfiguracoes(overrides: AdminConfiguracoesOverrides = {}): AdminConfiguracoes {
  const maxUploadMb = Number(overrides.MAX_UPLOAD_MB ?? env.MAX_UPLOAD_MB);
  const uploadMaxBytes = maxUploadMb * 1024 * 1024;

  return {
    senhaMinimaCaracteres: env.PASSWORD_MIN_LENGTH,
    senhaHistoricoBloqueado: env.PASSWORD_HISTORY_SIZE,
    senhaValidadeDias: env.PASSWORD_VALIDITY_DAYS,
    slaPorPrioridade: {
      EMERGENCIA: 12,
      URGENTE: 48,
      PRIORITARIA: 168,
      ELETIVA: 720,
    },
    retencaoProntuarioAnos: env.RETENCAO_PRONTUARIO_ANOS,
    retencaoAuditLogAnos: env.RETENCAO_AUDIT_LOG_ANOS,
    retencaoSessaoDias: env.RETENCAO_SESSAO_DIAS,
    maxUploadMb,
    uploadMaxMb: maxUploadMb,
    uploadMaxBytes,
  };
}
