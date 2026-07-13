/**
 * Seed — banco virgem com usuário DESENVOLVEDOR e PACIENTE de teste.
 *
 *  Usuário Dev:
 *    - Nome:   MATEUS VIEIRA
 *    - Email:  mateushenrivieira@gmail.com
 *    - Senha:  Aguasbelas#!
 *    - Role:   DESENVOLVEDOR (acesso global)
 * 
 *  Usuário Paciente:
 *    - CPF:    53474131826
 *    - Senha:  53474131826 (senhaProvisoria = true)
 *    - Nome:   Mateus Santana
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

const CPF = '53474131826';
const CPF_FMT = '534.741.318-26';
const NOME = 'Mateus Santana';

async function main() {
  const devSenhaHash = await bcrypt.hash('Aguasbelas#!', 10);

  const dev = await prisma.atendente.upsert({
    where: { email: 'mateushenrivieira@gmail.com' },
    update: {},
    create: {
      matricula: 'DEV-MATEUS',
      nome: 'MATEUS VIEIRA',
      email: 'mateushenrivieira@gmail.com',
      cpf: '000.000.000-00',
      senhaHash: devSenhaHash,
      cargo: 'Desenvolvedor',
      funcao: 'Engenharia de Software · UNISISM',
      role: 'DESENVOLVEDOR',
      ativo: true,
      ubsId: null,
      prefeituraId: null,
    },
  });

  console.log('✓ Usuário desenvolvedor criado/garantido.');

  // 1) Garantir uma Prefeitura + UBS de teste (necessário para escopo do paciente)
  const prefeitura = await prisma.prefeitura.upsert({
    where: { cnpj: '00000000000191' },
    update: {},
    create: {
      nome: 'Prefeitura Municipal de Águas Belas',
      municipio: 'Águas Belas',
      uf: 'PE',
      cnpj: '00000000000191',
      ativa: true,
    },
  });

  const ubs = await prisma.ubs.upsert({
    where: { cnes: '0000001' },
    update: {},
    create: {
      nome: 'UBS Centro Águas Belas',
      municipio: 'Águas Belas',
      uf: 'PE',
      cnes: '0000001',
      endereco: 'Praça Central, s/n · Centro · Águas Belas/PE',
      ativa: true,
      prefeituraId: prefeitura.id,
    },
  });

  // 2) Cria/atualiza Paciente
  await prisma.paciente.upsert({
    where: { cpf: CPF },
    update: { nome: NOME, ubsId: ubs.id },
    create: {
      nome: NOME,
      cpf: CPF,
      cartaoSus: '700000000000000',
      dataNascimento: new Date('1995-08-12T00:00:00Z'),
      sexo: 'M',
      telefone: '87999999999',
      endereco: 'Rua das Acácias, 123',
      bairro: 'Centro',
      municipio: 'Águas Belas',
      uf: 'PE',
      cep: '55400000',
      ubsId: ubs.id,
    },
  });

  // 3) Cria/atualiza PacienteConta com senha = CPF (provisória)
  const senhaHash = await bcrypt.hash(CPF, 10);
  const conta = await prisma.pacienteConta.upsert({
    where: { cpf: CPF },
    update: {
      nome: NOME,
      cpfFormatado: CPF_FMT,
      senhaHash,
      senhaProvisoria: true,
      ativo: true,
      ubsVinculadaId: ubs.id,
    },
    create: {
      cpf: CPF,
      cpfFormatado: CPF_FMT,
      nome: NOME,
      senhaHash,
      senhaProvisoria: true,
      ativo: true,
      ubsVinculadaId: ubs.id,
    },
  });

  console.log('✓ Paciente de teste criado/garantido.');
  console.log(`  CPF       : ${CPF}`);
  console.log(`  Senha     : ${CPF} (Provisória)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
