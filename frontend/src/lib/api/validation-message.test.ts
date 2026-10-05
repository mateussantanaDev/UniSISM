import { describe,it,expect } from 'vitest';
import { validationMessage } from './validation-message';
describe('mensagens de validação',()=>{
 it('identifica campos e regras Zod, inclusive caminho aninhado',()=>{
  expect(validationMessage({issues:[{code:'invalid_string',validation:'email',path:['email']},{code:'too_small',type:'string',minimum:6,path:['senha']},{code:'custom',message:'CPF inválido',path:['paciente','cpf']}]})).toBe('E-mail: informe um endereço de e-mail válido. Senha: informe ao menos 6 caracteres. CPF: CPF inválido');
 });
 it('distingue limites inclusivos e ausência de valor',()=>{
  expect(validationMessage({issues:[{code:'too_small',type:'number',minimum:0,inclusive:false,path:['tempoPadraoMinutos']},{code:'invalid_type',received:'undefined',path:['ubsId']}]})).toBe('Duração: informe um valor maior que 0. UBS de origem: preencha este campo.');
 });
 it('preserva fallback quando detalhes não existem',()=>{expect(validationMessage(undefined)).toBeUndefined();expect(validationMessage({issues:[]})).toBeUndefined();});
});
