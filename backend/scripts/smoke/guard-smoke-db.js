#!/usr/bin/env node

const rawUrl = process.env.DATABASE_URL;
const allowUnsafe = process.env.SMOKE_ALLOW_NON_ISOLATED_DB === 'true';

if (!rawUrl) {
  console.error('DATABASE_URL ausente. Configure SMOKE_DATABASE_URL ou .env.smoke.');
  process.exit(1);
}

let dbName = '';
try {
  const url = new URL(rawUrl);
  dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
} catch {
  console.error('DATABASE_URL invalida.');
  process.exit(1);
}

if (allowUnsafe) {
  console.warn('SMOKE_ALLOW_NON_ISOLATED_DB=true: guard de banco isolado ignorado.');
  process.exit(0);
}

if (!/(^|[_-])(smoke|test|testing|ci)([_-]|$)/i.test(dbName)) {
  console.error(`Banco "${dbName}" nao parece isolado para smoke/teste.`);
  console.error('Use SMOKE_DATABASE_URL apontando para um banco como unisism_ubs_smoke.');
  console.error('Para override consciente: SMOKE_ALLOW_NON_ISOLATED_DB=true.');
  process.exit(1);
}
