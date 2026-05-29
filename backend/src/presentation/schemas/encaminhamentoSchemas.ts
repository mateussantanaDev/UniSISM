import { z } from 'zod';

const sexoSchema = z.enum(['M', 'F', 'OUTRO']);
const prioridadeSchema = z.enum(['ELETIVA', 'PRIORITARIA', 'URGENTE', 'EMERGENCIA']);
const tipoAnexoSchema = z.enum([
  'SOLICITACAO',
  'RG',
  'CPF',
  'CARTAO_SUS',
  'EXAME',
  'LAUDO',
  'OUTRO',
]);
const statusEncaminhamentoSchema = z.enum([
  'RASCUNHO',
  'AGUARDANDO_REGULACAO',
  'PENDENCIA_DOCUMENTO',
  'APROVADO',
  'REJEITADO',
]);

const estadoCivilSchema = z.enum([
  'SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL', 'OUTRO',
]);
const racaCorSchema = z.enum([
  'BRANCA', 'PRETA', 'PARDA', 'AMARELA', 'INDIGENA', 'NAO_INFORMADA',
]);

export const pacienteSchema = z.object({
  nome: z.string().min(1),
  cpf: z.string().min(1),
  cartaoSus: z.string().default(''),
  dataNascimento: z.string().default(''),
  sexo: sexoSchema.default('OUTRO'),
  telefone: z.string().default(''),
  endereco: z.string().default(''),

  // Campos complementares — usados quando a UBS preenche dados faltantes
  // do paciente durante a consolidação do encaminhamento. Se o paciente já
  // existe, o backend preenche SOMENTE os campos que ainda estão vazios no
  // banco (não sobrescreve dados já cadastrados).
  nomeSocial: z.string().optional(),
  telefoneSecundario: z.string().optional(),
  email: z.string().optional(),
  nomeMae: z.string().optional(),
  nomePai: z.string().optional(),
  estadoCivil: estadoCivilSchema.optional(),
  escolaridade: z.string().optional(),
  profissao: z.string().optional(),
  racaCor: racaCorSchema.optional(),
  bairro: z.string().optional(),
  municipio: z.string().optional(),
  uf: z.string().optional(),
  cep: z.string().optional(),
});

export const solicitacaoSchema = z.object({
  medicoSolicitante: z.string().default(''),
  crm: z.string().default(''),
  especialidadeSolicitada: z.string().min(1),
  cid10: z.string().default(''),
  cidDescricao: z.string().default(''),
  justificativaClinica: z.string().default(''),
  prioridade: prioridadeSchema.default('ELETIVA'),
  dataSolicitacao: z.string().default(''),
});

export const consolidarPayloadSchema = z.object({
  paciente: pacienteSchema,
  solicitacao: solicitacaoSchema,
});

export const listarQuerySchema = z.object({
  status: statusEncaminhamentoSchema.optional(),
  pacienteId: z.string().optional(),
  desde: z.string().optional(),
  ate: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export { tipoAnexoSchema, statusEncaminhamentoSchema };
