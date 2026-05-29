/**
 * Aplica triggers de imutabilidade idempotentemente no boot do servidor.
 *
 * - Lê o SQL de `prisma/sql/tfd-audit-triggers.sql`
 * - Executa via `prisma.$executeRawUnsafe`
 * - Idempotente: o SQL usa `CREATE OR REPLACE` + `DROP IF EXISTS`
 * - Falhas não impedem o boot — apenas logam ERROR (operadores devem ser alertados)
 *
 * Em produção, recomendado também rodar `npm run db:setup-triggers` em deploys
 * (manualmente ou via pipeline) — o boot apenas garante consistência.
 */
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../infrastructure/database/prisma';
import { logger } from '../infrastructure/logger';

const SQL_RELATIVE = '../../prisma/sql/tfd-audit-triggers.sql';

export async function aplicarTriggersImutabilidade(): Promise<{
  aplicados: boolean;
  motivo?: string;
}> {
  const abs = path.resolve(__dirname, SQL_RELATIVE);
  if (!fs.existsSync(abs)) {
    return { aplicados: false, motivo: `arquivo SQL não encontrado: ${abs}` };
  }

  const sql = fs.readFileSync(abs, 'utf-8');
  const statements = splitarSqlStatements(sql);

  try {
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;
      await prisma.$executeRawUnsafe(trimmed);
    }
    logger.info(
      { arquivo: 'tfd-audit-triggers.sql', statements: statements.length },
      '✓ triggers de imutabilidade de audit aplicados',
    );
    return { aplicados: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { err, arquivo: 'tfd-audit-triggers.sql' },
      '✗ falha ao aplicar triggers de imutabilidade — operação manual requerida',
    );
    return { aplicados: false, motivo: msg };
  }
}

/**
 * Split de SQL respeitando dollar-quoted strings ($$ ... $$ do PL/pgSQL),
 * comentários de linha `--` e comentários de bloco (slash-asterisk).
 *
 * Postgres prepared statements aceitam apenas um comando por chamada,
 * então precisamos enviar cada statement individualmente.
 */
export function splitarSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let i = 0;
  let dollarTag: string | null = null; // ex.: "$$" ou "$body$"

  while (i < sql.length) {
    const ch = sql[i]!;

    // Dentro de dollar-quoted string?
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }

    // Detecta abertura de dollar-quote ($$, $body$, etc.)
    if (ch === '$') {
      const m = sql.slice(i).match(/^\$([A-Za-z0-9_]*)\$/);
      if (m) {
        dollarTag = m[0];
        buf += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    // Comentário de linha
    if (ch === '-' && sql[i + 1] === '-') {
      const eol = sql.indexOf('\n', i);
      if (eol < 0) break;
      i = eol + 1;
      continue;
    }

    // Comentário de bloco
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end < 0) break;
      i = end + 2;
      continue;
    }

    if (ch === ';') {
      if (buf.trim()) out.push(buf);
      buf = '';
      i++;
      continue;
    }

    buf += ch;
    i++;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

/**
 * Valida em runtime que os triggers estão ativos. Útil pro endpoint
 * `/v1/tfd/auditoria/verificar` ou healthcheck de produção.
 */
export async function checarTriggersAtivos(): Promise<{
  tfdAuditOk: boolean;
  prontuarioAuditOk: boolean;
}> {
  const rows = await prisma.$queryRawUnsafe<Array<{ tgname: string; tgrelname: string }>>(`
    SELECT t.tgname, c.relname AS tgrelname
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE t.tgname IN (
      'tfd_audit_no_update', 'tfd_audit_no_delete',
      'prontuario_audit_no_update', 'prontuario_audit_no_delete'
    )
  `);
  const nomes = new Set(rows.map((r) => r.tgname));
  return {
    tfdAuditOk: nomes.has('tfd_audit_no_update') && nomes.has('tfd_audit_no_delete'),
    prontuarioAuditOk:
      nomes.has('prontuario_audit_no_update') && nomes.has('prontuario_audit_no_delete'),
  };
}
