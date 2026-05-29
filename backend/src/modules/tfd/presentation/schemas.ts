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
  pacienteId: z.string().min(1),
  ubsId: z.string().min(1),
  encaminhamentoOrigemId: z.string().optional(),
  destino: z.string().min(2).max(200),
  unidadeDestino: z.string().max(200).optional(),
  especialidade: z.string().min(2).max(100),
  motivo: z.string().min(5).max(2000),
  dataDesejada: ymd,
  acompanhanteNecessario: z.boolean().optional(),
  prioridade: z.enum(['ELETIVA', 'PRIORITARIA', 'URGENTE']),
  observacoes: z.string().max(1000).optional(),
  prefeituraId: z.string().optional(),
});

export const aprovarSolicitacaoSchema = z.object({
  observacoes: z.string().max(1000).optional(),
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
    motoristaId: z.string().min(1),
    destino: z.string().min(2).max(200),
    unidadeDestino: z.string().max(200).optional(),
    rotaResumo: z.string().max(500).optional(),
    kmEstimados: z.number().int().positive().optional(),
    // Default = capacidade do veículo (resolvido no use case)
    vagasTotais: z.number().int().positive().max(100).optional(),
    observacoes: z.string().max(1000).optional(),
    prefeituraId: z.string().optional(),
  })
  .refine(
    (v) => v.veiculoId !== undefined || v.placa !== undefined,
    { message: 'Informe veiculoId ou placa', path: ['veiculoId'] },
  );

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
  })
  .refine((v) => Object.keys(v).length > 0, 'Informe pelo menos um campo');

export const iniciarViagemSchema = z.object({
  kmInicialHodometro: z.number().int().nonnegative(),
});

export const concluirViagemSchema = z.object({
  kmFinalHodometro: z.number().int().positive(),
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
