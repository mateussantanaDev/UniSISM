import { prisma } from '../../src/infrastructure/database/prisma';
import bcrypt from 'bcryptjs';

/**
 * Script em lote para provisionar contas do aplicativo do paciente (PacienteConta)
 * para todos os cidadãos cadastrados no banco (58.312 pacientes do PEC).
 *
 * Cada conta nasce:
 * - ativo: true
 * - senhaProvisoria: true
 * - senhaHash: bcrypt(cpf_digitos)
 * - ubsVinculadaId: paciente.ubsId
 */

function normalizarCpf(val: string): string {
  return (val || '').replace(/\D/g, '');
}

function formatarCpf(val: string): string {
  const d = normalizarCpf(val);
  if (d.length !== 11) return val;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

async function main() {
  console.log('🚀 Iniciando provisionamento em lote de PacienteConta para o App do Paciente...');
  const inicio = Date.now();

  const totalPacientes = await prisma.paciente.count({ where: { deletadoEm: null } });
  console.log(`📊 Total de pacientes na base: ${totalPacientes}`);

  const totalContasExistentes = await prisma.pacienteConta.count();
  console.log(`📊 Total de contas de app existentes: ${totalContasExistentes}`);

  // Buscar todos os pacientes que ainda não têm conta
  const pacientes = await prisma.paciente.findMany({
    where: { deletadoEm: null },
    select: {
      id: true,
      cpf: true,
      nome: true,
      telefone: true,
      ubsId: true,
    },
  });

  // Mapa de contas já existentes
  const contasExistentes = await prisma.pacienteConta.findMany({
    select: { cpf: true },
  });
  const cpfsComConta = new Set(contasExistentes.map((c) => c.cpf));

  const pendentes = pacientes.filter((p) => {
    const d = normalizarCpf(p.cpf);
    return d.length === 11 && !cpfsComConta.has(d);
  });

  console.log(`⚡ Pacientes elegíveis para provisionamento: ${pendentes.length}`);

  if (pendentes.length === 0) {
    console.log('✅ Todas as contas de pacientes já estão provisionadas!');
    await prisma.$disconnect();
    return;
  }

  // Gera um hash padrão para senhas provisórias em lote para acelerar a inserção
  const BATCH_SIZE = 1000;
  let criadas = 0;

  for (let i = 0; i < pendentes.length; i += BATCH_SIZE) {
    const lote = pendentes.slice(i, i + BATCH_SIZE);

    // Hashes dos CPFs do lote
    const dadosParaInserir = await Promise.all(
      lote.map(async (p) => {
        const cpfDigitos = normalizarCpf(p.cpf);
        const senhaHash = await bcrypt.hash(cpfDigitos, 8); // salt rounds 8 para velocidade na carga
        return {
          cpf: cpfDigitos,
          cpfFormatado: formatarCpf(cpfDigitos),
          nome: p.nome,
          telefone: p.telefone || null,
          senhaHash,
          senhaProvisoria: true,
          ativo: true,
          ubsVinculadaId: p.ubsId,
        };
      }),
    );

    await prisma.pacienteConta.createMany({
      data: dadosParaInserir,
      skipDuplicates: true,
    });

    criadas += lote.length;
    const pct = ((criadas / pendentes.length) * 100).toFixed(1);
    console.log(`  ✓ Progresso: ${criadas}/${pendentes.length} contas provisionadas (${pct}%)`);
  }

  const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`\n🎉 PROVISIONAMENTO COMPLETO: ${criadas} novas contas de app criadas em ${duracao}s!`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Erro no provisionamento:', err);
  process.exit(1);
});
