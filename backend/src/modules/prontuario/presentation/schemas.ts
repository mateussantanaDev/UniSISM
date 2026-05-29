import { z } from 'zod';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use formato YYYY-MM-DD');
const iso = z.string().min(10); // aceita YYYY-MM-DDTHH:MM (datetime-local) ou ISO completo

// ----- Alergias -----
export const addAlergiaSchema = z.object({
  substancia: z.string().min(1).max(200),
  tipo: z.enum(['MEDICAMENTO', 'ALIMENTO', 'AMBIENTAL', 'OUTRO']),
  gravidade: z.enum(['LEVE', 'MODERADA', 'GRAVE']),
  observacao: z.string().max(1000).optional(),
});

// ----- Condições crônicas -----
export const addCondicaoCronicaSchema = z.object({
  cid10: z.string().min(1).max(20),
  descricao: z.string().min(1).max(300),
  desde: ymd,
  observacao: z.string().max(1000).optional(),
});

export const updateCondicaoCronicaSchema = z
  .object({
    descricao: z.string().min(1).max(300).optional(),
    ativo: z.boolean().optional(),
    observacao: z.string().max(1000).nullable().optional(),
  })
  .refine(
    (v) => v.descricao !== undefined || v.ativo !== undefined || v.observacao !== undefined,
    'Informe ao menos um campo',
  );

// ----- Medicamentos -----
export const addMedicamentoSchema = z.object({
  nome: z.string().min(1).max(200),
  dosagem: z.string().min(1).max(100),
  frequencia: z.string().min(1).max(100),
  desde: ymd,
  prescritor: z.string().min(1).max(200),
});

export const updateMedicamentoSchema = z
  .object({
    ativo: z.boolean().optional(),
    dosagem: z.string().min(1).max(100).optional(),
    frequencia: z.string().min(1).max(100).optional(),
    prescritor: z.string().min(1).max(200).optional(),
  })
  .refine(
    (v) =>
      v.ativo !== undefined ||
      v.dosagem !== undefined ||
      v.frequencia !== undefined ||
      v.prescritor !== undefined,
    'Informe ao menos um campo',
  );

// ----- Histórico familiar -----
export const setHistoricoFamiliarSchema = z.object({
  itens: z.array(z.string().max(200)).max(50),
});

// ----- Atendimentos -----
export const addAtendimentoSchema = z.object({
  data: iso,
  tipo: z.enum([
    'CONSULTA_MEDICA',
    'ENFERMAGEM',
    'VACINACAO',
    'CURATIVO',
    'ODONTOLOGICO',
    'PROCEDIMENTO',
    'ACOLHIMENTO',
  ]),
  profissional: z.string().min(1).max(200),
  registroProfissional: z.string().min(1).max(50),
  especialidade: z.string().min(1).max(100),
  unidade: z.string().min(1).max(200),
  queixaPrincipal: z.string().min(1).max(2000),
  diagnostico: z.string().min(1).max(2000),
  cid10: z.string().min(1).max(20),
  conduta: z.string().min(1).max(4000),
  prescricaoResumo: z.string().max(4000).optional(),
});

// ----- Exames -----
export const addExameSchema = z.object({
  data: iso,
  tipo: z.string().min(1).max(200),
  categoria: z.enum(['LABORATORIAL', 'IMAGEM', 'FUNCIONAL', 'OUTROS']),
  solicitante: z.string().min(1).max(200),
  unidadeExecutora: z.string().min(1).max(200),
  resultado: z.enum(['NORMAL', 'ALTERADO', 'CRITICO', 'PENDENTE']),
  observacao: z.string().max(2000).optional(),
});

// ----- Vacinas -----
export const addVacinaSchema = z.object({
  data: iso,
  vacina: z.string().min(1).max(200),
  dose: z.string().min(1).max(50),
  lote: z.string().min(1).max(100),
  aplicador: z.string().min(1).max(200),
  unidade: z.string().min(1).max(200),
  via: z.enum(['INTRAMUSCULAR', 'SUBCUTANEA', 'ORAL', 'INTRADERMICA']),
});

// ----- Viagens TFD -----
export const addViagemTfdSchema = z.object({
  dataIda: iso,
  dataVolta: iso,
  destino: z.string().min(1).max(200),
  unidadeDestino: z.string().min(1).max(200),
  motivo: z.string().min(1).max(1000),
  especialidade: z.string().min(1).max(100),
  acompanhante: z.boolean(),
  transporte: z.enum(['VAN_SMS', 'AMBULANCIA', 'PASSAGEM_RODOVIARIA', 'PASSAGEM_AEREA']),
  custoEstimadoBRL: z.number().nonnegative().optional(),
});

export const updateViagemTfdSchema = z
  .object({
    status: z.enum(['AGENDADA', 'EM_ANDAMENTO', 'REALIZADA', 'CANCELADA']).optional(),
    dataIda: iso.optional(),
    dataVolta: iso.optional(),
    destino: z.string().min(1).max(200).optional(),
    unidadeDestino: z.string().min(1).max(200).optional(),
    custoEstimadoBRL: z.number().nonnegative().optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.dataIda !== undefined ||
      v.dataVolta !== undefined ||
      v.destino !== undefined ||
      v.unidadeDestino !== undefined ||
      v.custoEstimadoBRL !== undefined,
    'Informe ao menos um campo',
  );
