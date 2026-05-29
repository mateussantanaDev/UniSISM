/**
 * Cria UMA PacienteConta de teste pra validar o app Flutter (Face 3).
 *
 * Uso:
 *   npx ts-node-dev --transpile-only scripts/seed-paciente-app.ts
 *
 * Resultado:
 *   CPF:   123.456.789-09  (login formatado ou só dígitos)
 *   Senha: 12345678909      (CPF dígitos — senha provisória)
 *   App força troca no 1º login.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/infrastructure/database/prisma';

const CPF_DIGITS = '12345678909';
const CPF_FORMATADO = '123.456.789-09';
const NOME = 'MARIA APARECIDA SOUZA';

async function main(): Promise<void> {
  const existente = await prisma.pacienteConta.findUnique({
    where: { cpf: CPF_DIGITS },
  });
  if (existente) {
    console.log('· Conta já existe — resetando pra senha provisória do CPF');
    const hash = await bcrypt.hash(CPF_DIGITS, 10);
    await prisma.pacienteConta.update({
      where: { id: existente.id },
      data: {
        senhaHash: hash,
        senhaProvisoria: true,
        ativo: true,
      },
    });
  } else {
    const hash = await bcrypt.hash(CPF_DIGITS, 10);
    await prisma.pacienteConta.create({
      data: {
        cpf: CPF_DIGITS,
        cpfFormatado: CPF_FORMATADO,
        nome: NOME,
        email: 'maria.souza@example.com',
        telefone: '75999998877',
        senhaHash: hash,
        ativo: true,
        senhaProvisoria: true,
      },
    });
    console.log('✓ Conta criada');
  }

  console.log('\n──────── Credenciais do app Flutter ────────');
  console.log(`  CPF:           ${CPF_FORMATADO}  (ou ${CPF_DIGITS})`);
  console.log(`  Senha inicial: ${CPF_DIGITS}    (= CPF dígitos)`);
  console.log(`  Nome:          ${NOME}`);
  console.log(`  senhaProvisoria=true  →  app força troca no 1º login`);
  console.log('\nLogin no app:');
  console.log('  flutter run --dart-define=USE_MOCK=false \\');
  console.log('              --dart-define=API_BASE_URL=http://localhost:3333/v1\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
