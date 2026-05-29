/**
 * Backfill: cria Atendente (role=MOTORISTA_TFD) para cada MotoristaTFD ATIVO
 * que ainda não tem vínculo. Define senha provisória = últimos 8 dígitos do CPF.
 *
 * Uso:
 *   npm run db:backfill-motoristas
 *
 * Output:
 *   Tabela {matricula, senhaProvisoria, motorista} pra entrega física aos
 *   motoristas. Quando logarem, o app força a troca de senha (primeiroLogin=true).
 *
 * Idempotente:
 *   - O SQL (.sql ao lado) só insere Atendente p/ motoristas SEM vínculo.
 *   - Esta etapa Node só atualiza hashes de Atendentes com `senhaHash='!provisorio!'`.
 */
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/infrastructure/database/prisma';
import { splitarSqlStatements } from '../src/main/bootstrapTriggers';

const SQL_RELATIVE = '../prisma/sql/motorista-app-backfill.sql';
const PLACEHOLDER = '!provisorio!';

async function main(): Promise<void> {
  console.log('→ aplicando SQL de criação de Atendentes (esqueleto)...');
  const abs = path.resolve(__dirname, SQL_RELATIVE);
  if (!fs.existsSync(abs)) {
    console.error(`✗ arquivo SQL não encontrado: ${abs}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(abs, 'utf-8');
  // Postgres prepared statements aceitam só 1 comando por chamada → split.
  for (const stmt of splitarSqlStatements(sql)) {
    const trimmed = stmt.trim();
    if (trimmed) await prisma.$executeRawUnsafe(trimmed);
  }

  console.log('→ definindo senha provisória (bcrypt) pra cada motorista pendente...');
  const motoristas = await prisma.motoristaTFD.findMany({
    where: {
      atendenteId: { not: null },
      deletadoEm: null,
      atendente: { senhaHash: PLACEHOLDER },
    },
    include: { atendente: { select: { id: true, matricula: true } } },
  });

  if (motoristas.length === 0) {
    console.log('✓ nada a fazer — todos os motoristas já têm senha bcrypt definida.');
    return;
  }

  const rows: Array<{ motorista: string; matricula: string; senhaProvisoria: string }> = [];

  for (const m of motoristas) {
    if (!m.atendente) continue;
    const senhaProvisoria = m.cpf.slice(-8);
    const hash = await bcrypt.hash(senhaProvisoria, 10);
    await prisma.atendente.update({
      where: { id: m.atendente.id },
      data: { senhaHash: hash, senhaAlteradaEm: new Date() },
    });
    await prisma.motoristaTFD.update({
      where: { id: m.id },
      data: { primeiroLogin: true },
    });
    rows.push({
      motorista: m.nome,
      matricula: m.atendente.matricula,
      senhaProvisoria,
    });
  }

  console.log('\n─── ENTREGAR PESSOALMENTE AOS MOTORISTAS ───');
  console.table(rows);
  console.log(`✓ ${rows.length} motorista(s) atualizado(s).`);
  console.log('\nO app força troca de senha no 1º login (primeiroLogin=true).\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
