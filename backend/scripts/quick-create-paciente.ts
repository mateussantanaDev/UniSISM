/**
 * Cria rapidinho um paciente de teste pro app.
 *
 * CPF      : 53474131826
 * Nome     : Mateus Santana
 * Senha    : = CPF dígitos (53474131826) — senhaProvisoria=true (app força troca)
 *
 * Idempotente: roda múltiplas vezes sem duplicar.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/infrastructure/database/prisma';

const CPF = '53474131826';
const CPF_FMT = '534.741.318-26';
const NOME = 'Mateus Santana';

async function main() {
  console.log('→ criando paciente de teste…\n');

  // 1) Garantir uma Prefeitura + UBS de teste (banco está zerado)
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
  console.log(`  ✓ prefeitura: ${prefeitura.id}`);

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
  console.log(`  ✓ UBS: ${ubs.id} (${ubs.nome})`);

  // 2) Cria/atualiza Paciente
  const paciente = await prisma.paciente.upsert({
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
  console.log(`  ✓ paciente: ${paciente.id}`);

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
  console.log(`  ✓ conta app: ${conta.id}`);

  console.log('\n═══════════════════════════════════════════');
  console.log('  ✓ PRONTO PARA LOGAR NO APP');
  console.log('═══════════════════════════════════════════');
  console.log(`  CPF       : ${CPF}  (ou ${CPF_FMT})`);
  console.log(`  Senha     : ${CPF}    (= CPF — senha provisória)`);
  console.log(`  Nome      : ${NOME}`);
  console.log(`  UBS       : ${ubs.nome}`);
  console.log(`  Prefeitura: ${prefeitura.nome}`);
  console.log('═══════════════════════════════════════════');
  console.log('  ⚠️  app vai forçar troca de senha no 1º login');
  console.log('═══════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('✗ falha:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
