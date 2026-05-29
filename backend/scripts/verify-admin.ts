import bcrypt from 'bcryptjs';
import { prisma } from '../src/infrastructure/database/prisma';

async function main() {
  const u = await prisma.atendente.findUnique({ where: { email: 'mateushenrivieira@gmail.com' } });
  if (!u) { console.log('✗ user não existe'); process.exit(1); }
  const ok = await bcrypt.compare('Aguasbelas#1', u.senhaHash);
  console.log(ok ? '✓ bcrypt(Aguasbelas#1) → match' : '✗ senha não confere');
  console.log('  id:         ' + u.id);
  console.log('  email:      ' + u.email);
  console.log('  matricula:  ' + u.matricula);
  console.log('  nome:       ' + u.nome);
  console.log('  role:       ' + u.role);
  console.log('  ativo:      ' + u.ativo);
  console.log('  cargo:      ' + u.cargo);
  console.log('  prefeitura: ' + (u.prefeituraId ?? 'NULL (escopo GLOBAL)'));
  console.log('  ubs:        ' + (u.ubsId ?? 'NULL (escopo GLOBAL)'));
}

main().catch(console.error).finally(() => prisma.$disconnect());
