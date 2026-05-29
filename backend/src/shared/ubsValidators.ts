/**
 * Validações para campos da UBS.
 *
 * Todos retornam `null` se válido, ou string com motivo se inválido (pt-BR).
 * Use `valOrThrow(field, ...)` no use case pra throw 422 padronizado.
 *
 * Nenhum dependence — usável tanto no backend quanto compartilhado com testes.
 */

import { Unprocessable } from './errors';

/** CEP brasileiro — aceita "00000-000" ou "00000000" (normaliza pra "00000-000"). */
export function validarCep(input: string | null | undefined): string | null {
  if (input === null || input === undefined || input === '') return null;
  const digits = input.replace(/\D+/g, '');
  if (digits.length !== 8) return 'CEP deve ter 8 dígitos (formato 00000-000)';
  return null;
}

/** Normaliza CEP para "00000-000". Pressupõe entrada válida (use `validarCep` antes). */
export function normalizarCep(input: string): string {
  const d = input.replace(/\D+/g, '');
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : input;
}

/**
 * Telefone/WhatsApp brasileiro:
 *   - 10 dígitos: fixo (DDD + 8 dígitos)
 *   - 11 dígitos: celular (DDD + 9 + 8 dígitos)
 *   - 13 dígitos: E.164 internacional (`55XX9XXXXXXXX`)
 * Retorna `null` se válido ou null/empty; string com motivo se inválido.
 */
export function validarTelefoneBr(input: string | null | undefined): string | null {
  if (input === null || input === undefined || input === '') return null;
  const d = input.replace(/\D+/g, '');
  if (d.length === 10 || d.length === 11) return null;
  if (d.length === 13 && d.startsWith('55')) return null;
  if (d.length === 12 && d.startsWith('55')) return null; // 55+10
  return 'Telefone deve ter 10 ou 11 dígitos (DDD + número) ou E.164 com 55';
}

/** Normaliza para dígitos puros (DDD + número sem máscara). */
export function normalizarTelefone(input: string): string {
  return input.replace(/\D+/g, '');
}

/** Email institucional — leve regex (RFC 5322 simplificado). */
export function validarEmail(input: string | null | undefined): string | null {
  if (input === null || input === undefined || input === '') return null;
  const s = input.trim().toLowerCase();
  if (s.length > 180) return 'Email muito longo (máx 180 caracteres)';
  // Regex razoável (não RFC-perfeita — basta evitar lixo óbvio).
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) {
    return 'Email com formato inválido';
  }
  return null;
}

/** Coordenada latitude (-90 a 90). Aceita `null`. */
export function validarLatitude(input: number | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'number' || !Number.isFinite(input)) return 'Latitude deve ser número';
  if (input < -90 || input > 90) return 'Latitude fora do intervalo válido (-90 a 90)';
  return null;
}

/** Coordenada longitude (-180 a 180). Aceita `null`. */
export function validarLongitude(input: number | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'number' || !Number.isFinite(input)) return 'Longitude deve ser número';
  if (input < -180 || input > 180) return 'Longitude fora do intervalo válido (-180 a 180)';
  return null;
}

/**
 * Horários de funcionamento — JSON estruturado por dia da semana.
 *
 * Aceita:
 *   - `null` (sem horário cadastrado)
 *   - objeto `{ segunda: { abre: 'HH:MM', fecha: 'HH:MM' } | null, ... }`
 *
 * Valida:
 *   - apenas chaves conhecidas (segunda..domingo)
 *   - formato HH:MM em `abre`/`fecha`
 *   - `abre < fecha` lexicalmente (HH:MM compara como string)
 */
const DIAS_VALIDOS = new Set([
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado',
  'domingo',
]);

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export type DiaHorario = { abre: string; fecha: string } | null;
export type HorariosFuncionamento = Partial<Record<string, DiaHorario>>;

export function validarHorarios(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object' || Array.isArray(input)) {
    return 'Horários deve ser objeto com dias da semana como chave';
  }
  const obj = input as Record<string, unknown>;
  for (const [dia, valor] of Object.entries(obj)) {
    if (!DIAS_VALIDOS.has(dia)) {
      return `Dia inválido: "${dia}". Use segunda, terca, quarta, quinta, sexta, sabado, domingo`;
    }
    if (valor === null) continue; // fechado nesse dia
    if (typeof valor !== 'object' || Array.isArray(valor)) {
      return `Horário de "${dia}" deve ser { abre, fecha } ou null (fechado)`;
    }
    const v = valor as Record<string, unknown>;
    if (typeof v['abre'] !== 'string' || typeof v['fecha'] !== 'string') {
      return `Horário de "${dia}" precisa de abre + fecha (HH:MM)`;
    }
    if (!RE_HORA.test(v['abre']) || !RE_HORA.test(v['fecha'])) {
      return `Horário de "${dia}" inválido — use formato HH:MM`;
    }
    if (v['abre'] >= v['fecha']) {
      return `Horário de "${dia}": abre (${v['abre']}) deve ser antes de fecha (${v['fecha']})`;
    }
  }
  return null;
}

/** Aplica validador e dá throw 422 padronizado se erro. */
export function valOrThrow(campo: string, motivo: string | null): void {
  if (motivo !== null) {
    throw Unprocessable('VALIDATION_ERROR', `${campo}: ${motivo}`);
  }
}
