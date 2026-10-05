import { z } from 'zod';

// Limites de representação: rejeitam números impossíveis; não classificam risco clínico.
export const sinaisVitaisCentroSchema = z.object({
  pressaoArterial: z.string().trim().refine(v => !v || /^\d{1,3}\s*\/\s*\d{1,3}$/.test(v) && v.split('/').every(n => +n > 0 && +n <= 400), 'Pressão arterial: informe sistólica/diastólica, por exemplo 120/80').optional(),
  frequenciaCardiaca: z.number().finite().positive().max(400).optional(),
  frequenciaRespiratoria: z.number().finite().positive().max(150).optional(),
  temperatura: z.number().finite().min(20).max(50).optional(),
  glicemiaCapilar: z.number().finite().positive().max(2000).optional(),
  saturacaoO2: z.number().finite().positive().max(100).optional(),
  pesoKg: z.number().finite().positive().max(700).optional(),
  alturaCm: z.number().finite().positive().max(300).optional(),
  peso: z.number().finite().positive().max(700).optional(),
  altura: z.number().finite().positive().max(300).optional(),
  imc: z.number().finite().positive().optional(),
  classificacaoImc: z.string().optional(),
  classificacaoRisco: z.enum(['VERMELHO','LARANJA','AMARELO','VERDE','AZUL']).optional(),
  queixaPrincipal: z.string().optional(),
  alergiasRelatadas: z.string().optional(),
  medicamentosEmUso: z.string().optional(),
  observacoes: z.string().optional(),
}).transform(v => {
  const pesoKg = v.pesoKg ?? v.peso;
  const alturaCm = v.alturaCm ?? v.altura;
  return { ...v, pesoKg, alturaCm, ...(pesoKg && alturaCm ? { imc: +(pesoKg / (alturaCm / 100) ** 2).toFixed(2) } : {}) };
});
