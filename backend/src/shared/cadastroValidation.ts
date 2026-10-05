import { z } from 'zod';

export function normalizarCpf(value: string): string {
  return value.replace(/[.\-\s]/g, '');
}

export function cpfValido(value: string): boolean {
  const cpf = normalizarCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let size = 9; size <= 10; size++) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(cpf[i]) * (size + 1 - i);
    const digit = (sum * 10) % 11;
    if (Number(cpf[size]) !== (digit === 10 ? 0 : digit)) return false;
  }
  return true;
}

export function dataNascimentoValida(value: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return value <= today;
}

export const cpfSchema = z.string().transform(normalizarCpf).refine(cpfValido, 'Informe um CPF válido com 11 dígitos.');
export const dataNascimentoSchema = z.string().refine(dataNascimentoValida, 'Informe uma data de nascimento válida, não posterior a hoje.');
export const codigoSigtapSchema = z.string().trim()
  .regex(/^(?:\d{10}|\d{2}\.\d{2}\.\d{2}\.\d{3}-\d)$/, 'SIGTAP deve ter 10 dígitos (ex.: 03.01.01.007-2).')
  .transform((value) => value.replace(/\D/g, ''));

export function codigoDoProcedimento(procedimento?: string): string | null {
  const code = procedimento?.match(/^(\d{2}\.\d{2}\.\d{2}\.\d{3}-\d|\d{10})(?:\s|$)/)?.[1];
  return code ? code.replace(/\D/g, '') : null;
}
