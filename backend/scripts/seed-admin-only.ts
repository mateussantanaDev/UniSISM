/**
 * Seed enxuto — cria APENAS o usuário admin/dev e nada mais.
 *
 * Banco esperado: já resetado via `prisma db push --force-reset` + triggers aplicados.
 *
 * Credenciais (passadas via env ou hardcoded — DEV ONLY):
 *   email:     mateushenrivieira@gmail.com
 *   senha:     Aguasbelas#1
 *   role:      DESENVOLVEDOR (escopo GLOBAL — vê todas prefeituras e UBSs)
 *   matricula: DEV-001
 *
 * Uso: npx ts-node-dev --transpile-only scripts/seed-admin-only.ts
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/infrastructure/database/prisma';

const EMAIL = 'mateushenrivieira@gmail.com';
const SENHA_PLAIN = 'Aguasbelas#1';
const MATRICULA = 'DEV-001';
const CPF = '00000000191'; // placeholder válido (passou checksum modulus 11)
const NOME = 'Mateus Henrique Vieira';

async function main() {
  console.log('→ criando usuário admin/dev único...');
  console.log(`  email:     ${EMAIL}`);
  console.log(`  matrícula: ${MATRICULA}`);
  console.log(`  role:      DESENVOLVEDOR (GLOBAL)`);

  const senhaHash = await bcrypt.hash(SENHA_PLAIN, 10);

  // Idempotente: upsert por email
  const dev = await prisma.atendente.upsert({
    where: { email: EMAIL },
    update: {
      senhaHash,
      nome: NOME,
      matricula: MATRICULA,
      cpf: CPF,
      role: 'DESENVOLVEDOR',
      ativo: true,
      bloqueadoAte: null,
      ubsId: null,
      prefeituraId: null,
      senhaAlteradaEm: new Date(),
    },
    create: {
      email: EMAIL,
      senhaHash,
      nome: NOME,
      matricula: MATRICULA,
      cpf: CPF,
      cargo: 'DESENVOLVEDOR',
      funcao: 'Mantenedor da plataforma UNISISM',
      role: 'DESENVOLVEDOR',
      ativo: true,
      ubsId: null,         // GLOBAL — sem UBS
      prefeituraId: null,  // GLOBAL — sem prefeitura
    },
  });

  console.log(`✓ atendente criado: ${dev.id}`);

  // Confirmar que NADA mais existe no banco
  const counts = {
    atendentes: await prisma.atendente.count(),
    prefeituras: await prisma.prefeitura.count(),
    ubs: await prisma.ubs.count(),
    pacientes: await prisma.paciente.count(),
    pacienteContas: await prisma.pacienteConta.count(),
    encaminhamentos: await prisma.encaminhamento.count(),
    veiculosTfd: await prisma.veiculoTFD.count(),
    motoristasTfd: await prisma.motoristaTFD.count(),
    solicitacoesTfd: await prisma.solicitacaoTFD.count(),
    auditoriaLogs: await prisma.auditoriaLog.count(),
    tfdAuditLogs: await prisma.tfdAuditLog.count(),
    prontuarioAudits: await prisma.pacienteProntuarioAudit.count(),
  };

  console.log('\n=== Estado do banco após seed ===');
  for (const [k, v] of Object.entries(counts)) {
    const ok = (k === 'atendentes' && v === 1) || (k !== 'atendentes' && v === 0);
    console.log(`  ${ok ? '✓' : '✗'} ${k.padEnd(20)} ${v}`);
  }

  if (counts.atendentes !== 1) {
    throw new Error('Esperado exatamente 1 atendente após seed');
  }

  console.log('\n✓ Banco zerado · 1 usuário admin/dev criado');
  console.log('  Login web em http://localhost:5173/login com:');
  console.log(`    matrícula:  ${MATRICULA}`);
  console.log(`    OU email:   ${EMAIL}`);
  console.log(`    senha:      ${SENHA_PLAIN}`);
}

main()
  .catch((e) => {
    console.error('✗ falha no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
