const test = require('node:test');
const assert = require('node:assert/strict');
const { cpfValido, cpfSchema, dataNascimentoValida, codigoSigtapSchema, codigoDoProcedimento } = require('../dist/shared/cadastroValidation');

test('CPF rejeita repetidos, comprimentos, caracteres e checksum; aceita e normaliza máscara', () => {
  for (const cpf of ['11111111111', '00000000000', '123456789012', '1234567890', '12345678900', 'abc12345678909']) assert.equal(cpfValido(cpf), false, cpf);
  assert.equal(cpfSchema.parse('123.456.789-09'), '12345678909');
});
test('nascimento rejeita data futura/impossível e respeita hoje em Recife', () => {
  const now = new Date('2026-10-06T01:00:00Z');
  for (const d of ['2026-10-06','2025-02-29','2026-04-31','1990-1-1','']) assert.equal(dataNascimentoValida(d, now), false, d);
  assert(dataNascimentoValida('2026-10-05', now));
  assert(dataNascimentoValida('2000-02-29', now));
});
test('SIGTAP aceita dez dígitos ou máscara, preserva código de procedimento e rejeita lixo', () => {
  assert.equal(codigoSigtapSchema.parse('03.01.01.007-2'), '0301010072');
  assert.equal(codigoSigtapSchema.parse('0301010072'), '0301010072');
  assert.equal(codigoDoProcedimento('02.11.02.003-6 - Eletrocardiograma'), '0211020036');
  for (const v of ['INVALIDO','123','03010100722','03x01x01x007-2']) assert.equal(codigoSigtapSchema.safeParse(v).success, false, v);
});
