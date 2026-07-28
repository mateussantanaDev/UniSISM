import { z } from 'zod';

export const criarPrefeituraSchema = z.object({
  nome: z.string().min(2),
  municipio: z.string().min(2),
  uf: z.string().length(2),
  cnpj: z.string().optional(),
});

/**
 * Schema de horários estruturados — JSON com dias da semana opcionais.
 * Cada dia é `null` (fechado) ou `{ abre: "HH:MM", fecha: "HH:MM" }`.
 * Validação semântica (HH:MM válido + abre < fecha) é feita no use case.
 */
const _diaHorarioSchema = z
  .object({
    abre: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM inválido'),
    fecha: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM inválido'),
  })
  .nullable();

export const horariosFuncionamentoSchema = z
  .object({
    segunda: _diaHorarioSchema.optional(),
    terca: _diaHorarioSchema.optional(),
    quarta: _diaHorarioSchema.optional(),
    quinta: _diaHorarioSchema.optional(),
    sexta: _diaHorarioSchema.optional(),
    sabado: _diaHorarioSchema.optional(),
    domingo: _diaHorarioSchema.optional(),
  })
  .strict();

export const criarUbsSchema = z.object({
  nome: z.string().min(2).max(180),
  municipio: z.string().min(2).max(120),
  uf: z.string().length(2),
  prefeituraId: z.string().min(1),
  endereco: z.string().max(300).optional(),
  cnes: z.string().max(20).optional(),
  // Novos campos (v0.13)
  bairro: z.string().max(120).optional(),
  cep: z.string().max(9).optional(),
  telefone: z.string().max(20).optional(),
  whatsapp: z.string().max(20).optional(),
  email: z.string().max(180).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  horarios: horariosFuncionamentoSchema.optional(),
  observacoes: z.string().max(500).optional(),
});

export const tipoUnidadeEnum = z.enum(['CEO', 'CEM', 'UBS', 'SMS', 'TFD']);

export const roleEnum = z.enum([
  'DESENVOLVEDOR',
  'ADMIN',
  'COORDENADOR_UBS',
  'ATENDENTE_UBS',
  'REGULADOR_SMS',
  'GESTOR_TFD',
  'ATENDENTE_TFD',
  'MOTORISTA_TFD',
  'REGULADOR_TFD',
  'MEDICO',
  'MEDICO_ESPECIALISTA',
  'ATENDENTE_CENTRO',
]);

export const criarUsuarioSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email(),
  matricula: z.string().min(3).optional(),
  cpf: z.string().min(11),
  senha: z.string().min(8),
  role: roleEnum,
  tipoUnidade: tipoUnidadeEnum.optional().nullable(),
  unidadeId: z.string().optional().nullable(),
  ubsId: z.string().optional().nullable(),
  prefeituraId: z.string().optional().nullable(),
  telefone: z.string().optional(),
  cargo: z.string().optional(),
  funcao: z.string().optional(),
});

export const listarUsuariosQuerySchema = z.object({
  q: z.string().optional(),
  role: roleEnum.optional(),
  ubsId: z.string().optional(),
  prefeituraId: z.string().optional(),
  ativo: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export const listarUbsQuerySchema = z.object({
  prefeituraId: z.string().optional(),
});

export const atualizarUsuarioSchema = z.object({
  nome: z.string().min(2).optional(),
  email: z.string().email().optional(),
  telefone: z.string().optional(),
  cargo: z.string().optional(),
  funcao: z.string().optional(),
  role: roleEnum.optional(),
  tipoUnidade: tipoUnidadeEnum.nullable().optional(),
  unidadeId: z.string().nullable().optional(),
  ubsId: z.string().nullable().optional(),
  prefeituraId: z.string().nullable().optional(),
});

export const resetarSenhaSchema = z.object({
  novaSenha: z.string().min(8),
});

export const alterarAtivoSchema = z.object({
  ativo: z.boolean(),
});

export const atualizarPrefeituraSchema = z.object({
  nome: z.string().min(2).optional(),
  municipio: z.string().min(2).optional(),
  uf: z.string().length(2).optional(),
  cnpj: z.string().nullable().optional(),
  ativa: z.boolean().optional(),
});

export const atualizarUbsSchema = z.object({
  nome: z.string().min(2).max(180).optional(),
  municipio: z.string().min(2).max(120).optional(),
  uf: z.string().length(2).optional(),
  endereco: z.string().max(300).nullable().optional(),
  cnes: z.string().max(20).nullable().optional(),
  ativa: z.boolean().optional(),
  // Novos campos (v0.13) — todos opcionais e nullable (limpar valor)
  bairro: z.string().max(120).nullable().optional(),
  cep: z.string().max(9).nullable().optional(),
  telefone: z.string().max(20).nullable().optional(),
  whatsapp: z.string().max(20).nullable().optional(),
  email: z.string().max(180).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  horarios: horariosFuncionamentoSchema.nullable().optional(),
  observacoes: z.string().max(500).nullable().optional(),
});

export const salvarIntegracaoSchema = z.object({
  nome: z.enum(['CADSUS', 'e-SUS APS', 'SISREG', 'Webhook UBS']),
  url: z.string().url('A URL deve ser válida'),
  usuario: z.string().optional().nullable(),
  senha: z.string().optional().nullable(),
  token: z.string().optional().nullable(),
});
