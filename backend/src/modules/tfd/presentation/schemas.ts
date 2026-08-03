import { z } from 'zod';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

// ----- Veículos -----
export const criarVeiculoSchema = z.object({
  placa: z.string().min(7).max(10),
  modelo: z.string().min(2).max(100),
  tipo: z.enum(['VAN', 'ONIBUS', 'CARRO', 'AMBULANCIA']),
  capacidade: z.number().int().positive().max(100),
  ano: z.number().int().min(1980).max(2100),
  combustivel: z.enum(['DIESEL', 'GASOLINA', 'ETANOL', 'FLEX', 'GNV', 'ELETRICO']),
  consumoMedioKml: z.number().positive(),
  hodometroAtualKm: z.number().int().nonnegative().optional(),
  proximaRevisaoKm: z.number().int().positive().nullable().optional(),
  proximaRevisaoEm: ymd.nullable().optional(),
  prefeituraId: z.string().optional(), // DEV pode passar
});

export const atualizarVeiculoSchema = criarVeiculoSchema.partial().extend({
  status: z.enum(['ATIVO', 'EM_MANUTENCAO', 'INATIVO']).optional(),
});

// ----- Motoristas -----
export const criarMotoristaSchema = z.object({
  nome: z.string().min(3).max(200),
  cpf: z.string().min(11).max(14),
  cnh: z.string().min(5).max(20),
  categoriaCnh: z.enum(['B', 'C', 'D', 'E']),
  validadeCnh: ymd,
  telefone: z.string().min(8).max(20),
  prefeituraId: z.string().optional(),
});

export const atualizarMotoristaSchema = criarMotoristaSchema.partial().extend({
  status: z.enum(['ATIVO', 'AFASTADO', 'INATIVO']).optional(),
});

// ----- Solicitações -----
export const criarSolicitacaoSchema = z.object({
  pacienteId: z.string().min(1).optional(),
  paciente: z
    .object({
      nome: z.string({ required_error: 'Nome do paciente é obrigatório' }).min(2).max(150),
      cpf: z.string({ required_error: 'CPF do paciente é obrigatório' }).length(11, 'CPF deve conter 11 dígitos'),
      dataNascimento: ymd,
      sexo: z.enum(['M', 'F', 'OUTRO']).default('M'),
      telefone: z.string({ required_error: 'Telefone do paciente é obrigatório' }).min(8).max(20),
      endereco: z.string({ required_error: 'Endereço é obrigatório' }).min(2).max(200),
      bairro: z.string({ required_error: 'Bairro é obrigatório' }).min(2).max(100),
      municipio: z.string({ required_error: 'Município é obrigatório' }).min(2).max(100),
      uf: z.string({ required_error: 'UF é obrigatória' }).length(2),
      cartaoSus: z.string().max(20).optional().nullable(),
      nomeMae: z.string().max(150).optional().nullable(),
      rg: z.string().max(30).optional().nullable(),
      cep: z.string().max(10).optional().nullable(),
    })
    .optional(),
  ubsId: z.string({ required_error: 'UBS é obrigatória' }).min(1),
  encaminhamentoOrigemId: z.string().optional(),
  destino: z.string({ required_error: 'Destino é obrigatório' }).min(2).max(200),
  unidadeDestino: z.string().max(200).optional().nullable(),
  especialidade: z.string({ required_error: 'Especialidade é obrigatória' }).min(2).max(100),
  motivo: z.string({ required_error: 'Motivo é obrigatório' }).min(5).max(2000),
  dataDesejada: ymd,
  prioridade: z.enum(['ROUTINA', 'ELETIVA', 'PRIORITARIA', 'URGENTE']).default('ROUTINA'),
  observacoes: z.string().max(1000).optional(),
  prefeituraId: z.string().optional(),

  // Acompanhante
  acompanhanteNecessario: z.boolean().optional().default(false),
  acompanhante: z
    .object({
      nome: z.string().max(150).optional(),
      cpf: z.string().max(14).optional(),
      dataNascimento: ymd.optional(),
      telefone: z.string().max(20).optional(),
      parentesco: z.string().max(50).optional(),
      rg: z.string().max(30).optional(),
    })
    .optional(),

  // Registro Tardio / Retroativo
  isRegistroTardio: z.boolean().optional().default(false),
  justificativaRegistroTardio: z.string().max(2000).optional(),
  dataRealizadaRetroativa: ymd.optional(),
  comprovanteHospitalDestino: z.string().max(500).optional(),
}).refine(data => data.pacienteId || data.paciente, {
  message: "Informe o pacienteId ou o objeto paciente completo",
  path: ["paciente"]
}).refine(data => !data.acompanhanteNecessario || (data.acompanhante && data.acompanhante.nome && data.acompanhante.cpf), {
  message: "Quando acompanhante for necessário, os dados do acompanhante (Nome e CPF) devem estar preenchidos",
  path: ["acompanhante"]
});

export const aprovarSolicitacaoSchema = z.object({
  observacoes: z.string().max(1000).optional(),
  modoAlocacao: z.enum(['AUTOMATICA', 'MANUAL']).optional(),
  dataManual: ymd.optional(),
  /**
   * Se informado, faz aprovar + alocar atomicamente — UX "aprova e já joga
   * na viagem X no assento Y", reduzindo cliques no painel do gestor.
   */
  alocacao: z
    .object({
      viagemId: z.string().min(1),
      numeroAssento: z.number().int().positive().max(100).optional(),
    })
    .optional(),
});

export const negarSolicitacaoSchema = z.object({
  motivo: z.string().min(10).max(2000),
});

// ----- Viagens -----
export const criarViagemSchema = z
  .object({
    data: ymd,
    horaSaida: z.string().regex(/^\d{2}:\d{2}$/),
    horaPrevistaRetorno: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    // veiculoId OU placa (UX BlaBlaCar)
    veiculoId: z.string().min(1).optional(),
    placa: z.string().min(7).max(10).optional(),
    motoristaId: z.string().min(1).optional(),
    destino: z.string().min(2).max(200),
    unidadeDestino: z.string().max(200).optional(),
    rotaResumo: z.string().max(500).optional(),
    kmEstimados: z.number().int().positive().optional(),
    vagasTotais: z.number().int().positive().max(100).optional(),
    observacoes: z.string().max(1000).optional(),
    prefeituraId: z.string().optional(),
    isRegistroTardio: z.boolean().optional().default(false),
    justificativaTardia: z.string().max(2000).optional(),
  });

export const atualizarViagemSchema = z
  .object({
    data: ymd.optional(),
    horaSaida: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    horaPrevistaRetorno: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    destino: z.string().min(2).max(200).optional(),
    unidadeDestino: z.string().max(200).optional(),
    rotaResumo: z.string().max(500).optional(),
    kmEstimados: z.number().int().positive().optional(),
    observacoes: z.string().max(1000).optional(),
    veiculoId: z.string().optional(),
    motoristaId: z.string().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Informe pelo menos um campo');

export const iniciarViagemSchema = z.object({
  kmInicialHodometro: z.number().int().nonnegative(),
});

export const kmGestorSchema = z.object({
  kmInicialHodometro: z.number({ required_error: 'Hodômetro inicial é obrigatório' }).int().nonnegative(),
  kmFinalHodometro: z.number({ required_error: 'Hodômetro final é obrigatório' }).int().positive(),
  justificativa: z.string().min(5, 'Justificativa deve conter no mínimo 5 caracteres').max(2000),
});

export const concluirViagemSchema = z.object({
  veiculoId: z.string().optional(),
  motoristaId: z.string().optional(),
  kmInicialHodometro: z.number().int().nonnegative().optional(),
  kmFinalHodometro: z.number().int().positive().optional(),
  observacoes: z.string().max(1000).optional(),
});

export const cancelarViagemSchema = z.object({
  motivo: z.string().min(10).max(2000),
});

export const alocarPassageiroSchema = z.object({
  solicitacaoId: z.string().min(1),
  /** Assento opcional (1..vagasTotais). Frontend mostra mapa de assentos. */
  numeroAssento: z.number().int().positive().max(100).optional(),
});

export const marcarPresencaSchema = z.object({
  presenca: z.enum(['CONFIRMADO', 'EMBARCADO', 'AUSENTE', 'DESISTIU']),
  observacao: z.string().max(500).optional(),
});

// ----- Abastecimento -----
// Aceita 2 modos de informar valor:
//   (A) "valor direto"  → { valorEstimado }                          (UX balcão)
//   (B) "litros × preço" → { litrosEstimados, valorPorLitroEstimado } (UX cálculo)
// Pelo menos um dos modos é obrigatório.
export const solicitarAbastecimentoSchema = z
  .object({
    // veiculoId OU placa (UX BlaBlaCar)
    veiculoId: z.string().min(1).optional(),
    placa: z.string().min(7).max(10).optional(),
    motoristaId: z.string().optional(),
    viagemId: z.string().optional(),
    posto: z.string().min(2).max(200),
    combustivel: z.enum(['DIESEL', 'GASOLINA', 'ETANOL', 'FLEX', 'GNV', 'ELETRICO']),
    valorEstimado: z.number().positive().optional(),
    litrosEstimados: z.number().positive().optional(),
    valorPorLitroEstimado: z.number().positive().optional(),
    hodometroKm: z.number().int().nonnegative(),
    prefeituraId: z.string().optional(),
  })
  .refine(
    (v) => v.veiculoId !== undefined || v.placa !== undefined,
    { message: 'Informe veiculoId ou placa', path: ['veiculoId'] },
  )
  .refine(
    (v) =>
      v.valorEstimado !== undefined
      || (v.litrosEstimados !== undefined && v.valorPorLitroEstimado !== undefined),
    {
      message: 'Informe `valorEstimado` OU (`litrosEstimados` + `valorPorLitroEstimado`)',
      path: ['valorEstimado'],
    },
  );

export const liberarAbastecimentoSchema = z.object({
  observacao: z.string().max(500).optional(),
});

export const negarAbastecimentoSchema = z.object({
  motivo: z.string().min(10).max(2000),
});

// ----- Saldo -----
export const ajustarSaldoSchema = z.object({
  veiculoId: z.string().min(1),
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  novoSaldoMensal: z.number().nonnegative(),
  justificativa: z.string().min(10).max(2000),
});

// ----- Ajuda de Custo -----
export const itemAjudaSchema = z.object({
  categoria: z.enum(['ALIMENTACAO', 'HOSPEDAGEM', 'DESLOCAMENTO_LOCAL', 'OUTRO']),
  descricao: z.string().min(2).max(300),
  valorBRL: z.number().positive(),
});

export const solicitarAjudaSchema = z.object({
  viagemId: z.string().min(1),
  pacienteId: z.string().min(1),
  itens: z.array(itemAjudaSchema).min(1).max(20),
  prefeituraId: z.string().optional(),
});

export const negarAjudaSchema = z.object({
  motivo: z.string().min(10).max(2000),
});
