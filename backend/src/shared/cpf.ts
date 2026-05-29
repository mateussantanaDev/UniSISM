/**
 * Validação canônica de CPF (Cadastro de Pessoas Físicas brasileiro).
 *
 *   - 11 dígitos
 *   - Não pode ser todos iguais (000.000.000-00, 111.111.111-11, ...)
 *   - Dígitos verificadores (DVs) devem bater pelo algoritmo do mod 11
 *
 * Referência: Receita Federal — Regra de cálculo do CPF.
 *   https://www.receita.fazenda.gov.br/Publico/programas/Cpf/Validacao.pdf
 *
 * Uso:
 *   const ok = isCpfValido('123.456.789-09');  // true se DV bate
 *   const ok = isCpfValido('11111111111');     // false (todos iguais)
 *
 * IMPORTANTE: usar SEMPRE pra validar CPF vindo de input do usuário antes
 * de processar (anti enumeração + anti garbage). Bloqueio early no controller.
 */

/** Strip de não-dígitos. */
export function normalizarCpf(cpf: string): string {
  return cpf.replace(/\D+/g, '');
}

/**
 * Validação completa: tamanho + não-trivial + dois DVs.
 * Retorna `false` para qualquer string que não passe (sem throw).
 */
export function isCpfValido(cpfInput: string): boolean {
  const digits = normalizarCpf(cpfInput);
  if (digits.length !== 11) return false;

  // Bloqueia CPFs triviais (todos dígitos iguais).
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const nums = digits.split('').map((c) => Number.parseInt(c, 10));
  if (nums.some((n) => Number.isNaN(n))) return false;

  // Primeiro DV: soma * peso (10..2) → mod 11 → 11 - resto, se >= 10 vira 0.
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += (nums[i] ?? 0) * (10 - i);
  }
  let resto = soma % 11;
  const dv1 = resto < 2 ? 0 : 11 - resto;
  if (dv1 !== nums[9]) return false;

  // Segundo DV: soma * peso (11..2), incluindo dv1.
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += (nums[i] ?? 0) * (11 - i);
  }
  resto = soma % 11;
  const dv2 = resto < 2 ? 0 : 11 - resto;
  return dv2 === nums[10];
}

/**
 * Formata CPF com máscara `xxx.xxx.xxx-xx`. Se inválido, retorna o input cru.
 */
export function formatarCpf(cpfInput: string): string {
  const d = normalizarCpf(cpfInput);
  if (d.length !== 11) return cpfInput;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
