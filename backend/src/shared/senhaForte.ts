/**
 * Validação de força de senha para pacientes (Face 3).
 *
 * Regras mínimas (low-friction — paciente médio é idoso e usa CPF/data de nascimento):
 *
 *   1. Mínimo 8 caracteres
 *   2. Não pode ser numérica pura (12345678, 87654321)
 *   3. Não pode ser sequência óbvia (12345678, abcdefgh, qwertyui)
 *   4. Não pode ser o CPF do usuário (digits-only OU formatado)
 *   5. Não pode bater com a senha atual (caso já tenha — checagem feita no use case)
 *
 * Retorna `null` se ok, ou string com motivo amigável em pt-BR se inválida.
 * Não usa libs pesadas (zxcvbn etc.) — regras curadas pro contexto.
 */

import { normalizarCpf } from './cpf';

/** Sequências comuns que NÃO são senhas seguras (caso-insensitive). */
const SEQUENCIAS_PROIBIDAS = [
  '12345678', '87654321', '01234567', '76543210',
  'abcdefgh', 'qwertyui', 'asdfghjk', 'zxcvbnm,',
  'password', 'senha123', 'senhasenha', '11111111',
  'admin123', 'unisism12', 'feirasaude',
];

/**
 * Retorna `null` se senha ok, ou string com motivo se inválida.
 * `contextoUsuario` é opcional (CPF para comparar — senha não pode ser o CPF).
 */
export function validarSenhaForte(
  senha: string,
  contextoUsuario?: { cpf?: string },
): string | null {
  if (typeof senha !== 'string' || senha.length === 0) {
    return 'Senha é obrigatória.';
  }
  if (senha.length < 8) {
    return 'Senha muito curta — mínimo 8 caracteres.';
  }
  if (senha.length > 128) {
    return 'Senha muito longa — máximo 128 caracteres.';
  }

  // Numérica pura?
  if (/^\d+$/.test(senha)) {
    return 'Senha não pode ser apenas números — use letras também.';
  }

  // Sequência comum?
  const lower = senha.toLowerCase();
  for (const seq of SEQUENCIAS_PROIBIDAS) {
    if (lower === seq) {
      return 'Senha muito comum — escolha uma diferente.';
    }
  }

  // CPF do usuário?
  if (contextoUsuario?.cpf) {
    const cpfDigits = normalizarCpf(contextoUsuario.cpf);
    if (senha === cpfDigits || normalizarCpf(senha) === cpfDigits) {
      return 'Senha não pode ser o CPF.';
    }
  }

  // Repetição massiva de char (aaaaaaaa, 11111111).
  if (/^(.)\1{7,}$/.test(senha)) {
    return 'Senha muito fraca — não use o mesmo caractere repetido.';
  }

  return null;
}
