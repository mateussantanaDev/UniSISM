/**
 * Seed inicial das recomendações por especialidade ("o que levar no dia").
 * Idempotente — UPSERT por `especialidade`.
 *
 * Uso:
 *   npm run db:seed-recomendacoes
 */
import { prisma } from '../src/infrastructure/database/prisma';

interface SeedItem {
  especialidade: string;
  recomendacoes: string[];
}

const SEED: SeedItem[] = [
  {
    especialidade: 'Cardiologia',
    recomendacoes: [
      'Levar ECG recente (≤ 6 meses) se tiver',
      'Lista de medicações em uso, com dosagens',
      'Não suspender medicação habitual no dia',
      'Chegar com 30 minutos de antecedência',
      'Levar exames de sangue recentes (colesterol, glicemia)',
    ],
  },
  {
    especialidade: 'Endocrinologia',
    recomendacoes: [
      'Jejum de 12 horas se for fazer exame de sangue',
      'Levar hemoglobina glicada (HbA1c) recente',
      'Lista de medicações de diabetes/tireoide',
      'Anotar valores recentes de glicemia capilar',
      'Chegar com 30 minutos de antecedência',
    ],
  },
  {
    especialidade: 'Ortopedia',
    recomendacoes: [
      'Levar raio-X, ressonância ou tomografia recentes',
      'Levar laudo do médico solicitante',
      'Vestir roupa confortável para exame físico',
      'Anotar momento e causa da dor',
    ],
  },
  {
    especialidade: 'Oftalmologia',
    recomendacoes: [
      'Não dirigir até a consulta (vão dilatar a pupila)',
      'Levar óculos e prescrição atual',
      'Levar acompanhante adulto',
      'Chegar com 30 minutos de antecedência',
    ],
  },
  {
    especialidade: 'Dermatologia',
    recomendacoes: [
      'Não usar cremes, hidratantes ou maquiagem no local da consulta',
      'Levar fotos da evolução das lesões se tiver',
      'Lista de medicamentos em uso (oral e tópico)',
    ],
  },
  {
    especialidade: 'Ginecologia',
    recomendacoes: [
      'Não estar menstruando (preferencial)',
      'Levar último exame preventivo (Papanicolau)',
      'Levar última ultrassonografia se tiver',
      'Anotar data da última menstruação',
    ],
  },
  {
    especialidade: 'Urologia',
    recomendacoes: [
      'Levar último PSA (se homem ≥ 50 anos)',
      'Levar ultrassonografia recente se tiver',
      'Lista de medicações em uso',
    ],
  },
  {
    especialidade: 'Pneumologia',
    recomendacoes: [
      'Levar raio-X de tórax recente',
      'Levar espirometria se tiver',
      'Lista de medicamentos respiratórios em uso',
      'Anotar frequência de crises e fatores desencadeantes',
    ],
  },
  {
    especialidade: 'Neurologia',
    recomendacoes: [
      'Levar ressonância ou tomografia do crânio se tiver',
      'Levar acompanhante (alguns pacientes recebem medicação)',
      'Lista de medicamentos neurológicos em uso',
      'Anotar diário de crises (se aplicável)',
    ],
  },
  {
    especialidade: 'Psiquiatria',
    recomendacoes: [
      'Levar relatório do clínico ou da UBS',
      'Lista de medicações psiquiátricas em uso',
      'Diário de sintomas (humor, sono, ansiedade)',
      'Acompanhante adulto (recomendado)',
    ],
  },
  {
    especialidade: 'Gastroenterologia',
    recomendacoes: [
      'Levar últimos exames de sangue e fezes',
      'Levar endoscopia ou colonoscopia recente se tiver',
      'Anotar histórico alimentar e queixas (azia, dor, mudanças)',
    ],
  },
  {
    especialidade: 'Nefrologia',
    recomendacoes: [
      'Levar exames de função renal recentes (creatinina, ureia, TFG)',
      'Levar exame de urina recente',
      'Lista de medicações em uso (especialmente anti-hipertensivos)',
    ],
  },
  {
    especialidade: 'Reumatologia',
    recomendacoes: [
      'Levar exames de FAN, FR e PCR recentes se tiver',
      'Levar raio-X de articulações afetadas',
      'Anotar quais articulações doem e quando piora',
      'Lista de medicamentos em uso (anti-inflamatórios)',
    ],
  },
  {
    especialidade: 'Pediatria',
    recomendacoes: [
      'Levar cartão de vacinação da criança',
      'Levar caderneta de saúde',
      'Anotar peso, altura recentes, queixas',
      'Levar exames recentes se tiver',
    ],
  },
  {
    especialidade: 'Oncologia',
    recomendacoes: [
      'Levar TODOS os exames (biópsia, marcadores, imagens)',
      'Levar laudo do médico solicitante',
      'Levar acompanhante adulto',
      'Lista completa de medicamentos em uso',
      'Anotar dúvidas — consulta é longa',
    ],
  },
];

async function main(): Promise<void> {
  let criados = 0;
  let atualizados = 0;
  for (const item of SEED) {
    const existente = await prisma.especialidadeRecomendacao.findUnique({
      where: { especialidade: item.especialidade },
    });
    if (existente) {
      await prisma.especialidadeRecomendacao.update({
        where: { especialidade: item.especialidade },
        data: { recomendacoes: item.recomendacoes },
      });
      atualizados++;
    } else {
      await prisma.especialidadeRecomendacao.create({
        data: {
          especialidade: item.especialidade,
          recomendacoes: item.recomendacoes,
        },
      });
      criados++;
    }
  }
  console.log(`✓ Recomendações: ${criados} criadas, ${atualizados} atualizadas, total ${SEED.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
