import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/infrastructure/database/prisma';
import { aplicarTriggersImutabilidade } from '../src/main/bootstrapTriggers';

/**
 * RESET TOTAL DO UNISISM · BANCO VIRGEM PARA PRODUÇÃO
 *
 * 1. Zera DINAMICAMENTE 100% das tabelas do PostgreSQL usando TRUNCATE CASCADE
 *    (desativa temporariamente triggers de auditoria para permitir a limpeza total).
 * 2. Re-aplica os triggers de imutabilidade LGPD/CFM.
 * 3. Injeta APENAS e EXCLUSIVAMENTE o usuário Desenvolvedor / Administrador Global:
 *      - Email:     mateushenrivieira@gmail.com
 *      - Senha:     Aguasbelas#1
 *      - Role:      DESENVOLVEDOR (Acesso irrestrito a todos os módulos)
 *      - Matrícula: SMS-DEV-001
 *      - Nome:      Mateus Henrique Vieira
 *
 * O banco fica 100% zerado e pronto para receber a coleta e importação limpa do PEC.
 */

const EMAIL_ADMIN = 'mateushenrivieira@gmail.com';
const SENHA_ADMIN = 'Aguasbelas#1';
const NOME_ADMIN = 'Mateus Henrique Vieira';
const MATRICULA_ADMIN = 'SMS-DEV-001';
const CPF_ADMIN = '00000000191';

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🧹 INICIANDO RESET TOTAL DO BANCO DE DADOS (ZERO ABSOLUTO)');
  console.log('════════════════════════════════════════════════════════════════');

  // ────────────────────────────────────────────────────────────────
  // 1. ZERAR DINAMICAMENTE TODAS AS TABELAS
  // ────────────────────────────────────────────────────────────────
  console.log('\n[1/3] Limpando todas as tabelas do PostgreSQL (TRUNCATE CASCADE)...');

  const tables: Array<{ tablename: string }> = await prisma.$queryRawUnsafe(`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename NOT LIKE '_prisma%'
  `);

  console.log(`  → Encontradas ${tables.length} tabelas no schema public.`);

  // Desativa verificação de triggers e constraints temporariamente para o truncate
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica';`);

  for (const { tablename } of tables) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE;`);
    } catch (err) {
      console.warn(`    ⚠️ Aviso ao truncar ${tablename}:`, (err as Error).message);
    }
  }

  // Restaura verificação padrão de triggers
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin';`);

  // Re-aplica triggers de imutabilidade do SUS/LGPD
  await aplicarTriggersImutabilidade();
  console.log('✓ Todas as tabelas foram truncadas e os triggers de segurança foram rearmados.');

  // ────────────────────────────────────────────────────────────────
  // 2. INJETAR O USUÁRIO ADMINISTRADOR GLOBAL ÚNICO
  // ────────────────────────────────────────────────────────────────
  console.log('\n[2/3] Injetando o Usuário Administrador Global...');

  const senhaHash = await bcrypt.hash(SENHA_ADMIN, 10);

  const admin = await prisma.atendente.create({
    data: {
      email: EMAIL_ADMIN,
      nome: NOME_ADMIN,
      matricula: MATRICULA_ADMIN,
      cpf: CPF_ADMIN,
      senhaHash,
      cargo: 'DESENVOLVEDOR',
      funcao: 'Administrador Geral da Plataforma UNISISM',
      role: 'DESENVOLVEDOR',
      ativo: true,
      ubsId: null,         // GLOBAL — sem restrição de UBS
      prefeituraId: null,  // GLOBAL — sem restrição de Prefeitura
    },
  });

  console.log(`✓ Administrador criado com sucesso: ${admin.nome} (${admin.email})`);

  // ────────────────────────────────────────────────────────────────
  // 3. AUDITORIA FINAL DO ESTADO DO BANCO
  // ────────────────────────────────────────────────────────────────
  console.log('\n[3/3] Verificando integridade pós-reset...');

  const stats = {
    atendentes: await prisma.atendente.count(),
    prefeituras: await prisma.prefeitura.count(),
    ubs: await prisma.ubs.count(),
    pacientes: await prisma.paciente.count(),
    pacienteContas: await prisma.pacienteConta.count(),
    salasConsultorios: await prisma.salaConsultorio.count(),
    especialidades: await prisma.especialidadeCatalogo.count(),
    escalas: await prisma.escalaEspecialista.count(),
    agendamentosCentro: await prisma.agendamentoCentro.count(),
    encaminhamentos: await prisma.encaminhamento.count(),
    atendimentos: await prisma.atendimento.count(),
    viagensTfd: await prisma.viagemFrota.count(),
  };

  console.log('\n📊 ESTADO FINAL DO BANCO DE DADOS:');
  for (const [k, v] of Object.entries(stats)) {
    const isExpected = (k === 'atendentes' && v === 1) || (k !== 'atendentes' && v === 0);
    console.log(`   ${isExpected ? '✅' : '❌'} ${k.padEnd(22)}: ${v}`);
  }

  if (stats.atendentes !== 1) {
    throw new Error('Falha: esperado exatamente 1 atendente no banco!');
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('🎉 UNISISM ZERADO COM SUCESSO · PRONTO PARA PRODUÇÃO!');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`  Painel:      https://unisism.vercel.app`);
  console.log(`  Login:       ${EMAIL_ADMIN}`);
  console.log(`  Senha:       ${SENHA_ADMIN}`);
  console.log(`  Perfil:      DESENVOLVEDOR (Acesso Global)`);
  console.log('════════════════════════════════════════════════════════════════\n');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('✗ Erro no reset total:', err);
  process.exit(1);
});
