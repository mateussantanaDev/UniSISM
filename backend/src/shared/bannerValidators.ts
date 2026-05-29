/**
 * Validações específicas para Banner SMS.
 *
 * Todos retornam `null` se válido ou string com motivo se inválido (pt-BR).
 */

import { Unprocessable } from './errors';

/** Limite de caracteres dos campos visíveis na UI. */
export const LIMITES_BANNER = {
  TITULO_MAX: 80,        // ~2 linhas no card do app
  CORPO_MAX: 400,        // ~6 linhas (modal expandido)
  CTA_LABEL_MAX: 30,     // botão CTA
  URL_MAX: 500,
  PRIORIDADE_MIN: -100,  // pra forçar pra fim da lista se necessário
  PRIORIDADE_MAX: 1000,
} as const;

/**
 * Valida URL https.
 * - Aceita `null`/`undefined`/`''` (sem URL)
 * - Exige `https://` (Android bloqueia `http://` por padrão desde API 28+)
 * - Exige URL parseável
 * - Limita a 500 chars
 */
export function validarUrlHttps(input: string | null | undefined, campo: string): string | null {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input !== 'string') return `${campo}: deve ser texto`;
  if (input.length > LIMITES_BANNER.URL_MAX) {
    return `${campo}: URL muito longa (máx ${LIMITES_BANNER.URL_MAX} chars)`;
  }
  if (!/^https:\/\//i.test(input)) {
    return `${campo}: deve começar com https:// (Android bloqueia http://)`;
  }
  try {
    const u = new URL(input);
    if (u.protocol !== 'https:') {
      return `${campo}: protocolo inválido (apenas https://)`;
    }
    if (!u.hostname || u.hostname.length < 3) {
      return `${campo}: hostname inválido`;
    }
  } catch {
    return `${campo}: URL malformada`;
  }
  return null;
}

/**
 * Valida data de expiração (se presente, deve ser maior que publicadoEm).
 */
export function validarExpiraEm(
  expiraEm: Date | null | undefined,
  publicadoEm: Date,
): string | null {
  if (expiraEm === null || expiraEm === undefined) return null;
  if (!(expiraEm instanceof Date) || Number.isNaN(expiraEm.getTime())) {
    return 'expiraEm: data inválida';
  }
  if (expiraEm.getTime() <= publicadoEm.getTime()) {
    return `expiraEm: deve ser após a publicação (${publicadoEm.toISOString()})`;
  }
  return null;
}

/** Valida tamanho de string. */
export function validarTamanho(
  s: string | null | undefined,
  campo: string,
  min: number,
  max: number,
): string | null {
  if (s === null || s === undefined) return null;
  if (typeof s !== 'string') return `${campo}: deve ser texto`;
  const trimmed = s.trim();
  if (trimmed.length < min) return `${campo}: muito curto (mín ${min} chars)`;
  if (trimmed.length > max) return `${campo}: muito longo (máx ${max} chars)`;
  return null;
}

/** Throw 422 padronizado se motivo presente. */
export function valOrThrow(motivo: string | null): void {
  if (motivo !== null) {
    throw Unprocessable('VALIDATION_ERROR', motivo);
  }
}
