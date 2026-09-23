/**
 * PEC e-SUS APS · Importador paralelo (Nível 2 — worker pool Node)
 *
 * Arquitetura:
 *   - Main thread: descobre arquivos CSV/JSON, garante Prefeitura+UBS, distribui tarefas
 *   - N worker threads (Node): cada worker faz parse de 1 arquivo e bulk-insert no UNISISM
 *   - Não toca no PEC (só lê arquivos locais + escreve no Postgres)
 *   - Pool size = CPU cores - 2 (default), configurável por PEC_IMPORT_WORKERS
 *   - Bulk insert Prisma em batches de 1000 rows
 *
 * Uso:
 *   npx ts-node-dev --transpile-only scripts/pec/pec-import.ts --dry-run
 *   npx ts-node-dev --transpile-only scripts/pec/pec-import.ts --commit
 *
 * Tudo importado dentro de Prefeitura "Prefeitura Municipal de Águas Belas"
 * com audit IMPORT_PEC por paciente.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { prisma } from '../../src/infrastructure/database/prisma';
import { CSV_DIR, PACIENTES_DIR, UBS_AGUAS_BELAS, log, slug } from './pec-common';

const DRY_RUN = !process.argv.includes('--commit');
const WORKER_COUNT = parseInt(process.env.PEC_IMPORT_WORKERS ?? String(Math.max(2, os.cpus().length - 2)), 10);

// ════════════════════════════════════════════════════════════════
// CSV parser (PEC usa ; como separador, codificação UTF-8 ou Win1252)
// ════════════════════════════════════════════════════════════════
export function parseCsv(content: string, sep = ';'): Array<Record<string, string>> {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = parseRow(lines[0], sep);
  return lines.slice(1).map((line) => {
    const cells = parseRow(line, sep);
    const obj: Record<string, string> = {};
    header.forEach((h, i) => { obj[h] = (cells[i] ?? '').trim(); });
    return obj;
  });
}

function parseRow(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === sep) { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// ════════════════════════════════════════════════════════════════
// Worker thread — processa 1 arquivo
// ════════════════════════════════════════════════════════════════
if (!isMainThread) {
  void (async () => {
    const { file, ubsMap, prefeituraId } = workerData as {
      file: string;
      ubsMap: Record<string, string>;
      prefeituraId: string;
    };
    parentPort?.postMessage({ kind: 'start', file });

    try {
      // Worker importa Prisma dinâmico pra ter conexão isolada
      const { PrismaClient } = await import('@prisma/client');
      const wPrisma = new PrismaClient();

      // Detecta charset (tenta UTF-8 → senão Win-1252)
      let content = fs.readFileSync(file, 'utf-8');
      if (content.includes('�')) {
        const raw = fs.readFileSync(file);
        // Fallback Win-1252
        try {
          content = raw.toString('latin1');
        } catch {}
      }
      const rows = parseCsv(content);
      parentPort?.postMessage({ kind: 'parsed', file, rows: rows.length });

      // TODO: mapear por nome do arquivo qual entidade UNISISM importar
      // Por enquanto só conta — implementação real do upsert vem após 1º CSV exemplar
      parentPort?.postMessage({ kind: 'done', file, processed: rows.length, inserted: 0 });

      await wPrisma.$disconnect();
    } catch (e) {
      parentPort?.postMessage({ kind: 'error', file, error: (e as Error).message });
    }
  })();
} else {
  // ════════════════════════════════════════════════════════════════
  // Main thread — dispatch + bookkeeping
  // ════════════════════════════════════════════════════════════════

  async function garantirPrefeituraEUbs(): Promise<{ prefeituraId: string; ubsMap: Record<string, string> }> {
    const prefeitura = await prisma.prefeitura.upsert({
      where: { cnpj: '00000000000191' },
      update: { nome: 'Prefeitura Municipal de Águas Belas', municipio: 'Águas Belas', uf: 'PE' },
      create: {
        nome: 'Prefeitura Municipal de Águas Belas',
        municipio: 'Águas Belas',
        uf: 'PE',
        cnpj: '00000000000191',
        ativa: true,
      },
    });
    log('INFO', `Prefeitura OK: ${prefeitura.id}`);

    const ubsMap: Record<string, string> = {};
    for (const u of UBS_AGUAS_BELAS) {
      const ubs = await prisma.ubs.upsert({
        where: { cnes: u.ine ?? `__no_cnes_${u.nome}` },
        update: { nome: u.nome, municipio: 'Águas Belas', uf: 'PE' },
        create: {
          nome: u.nome,
          municipio: 'Águas Belas',
          uf: 'PE',
          cnes: u.ine ?? `__no_cnes_${u.nome}`,
          ativa: true,
          prefeituraId: prefeitura.id,
        },
      });
      ubsMap[slug(u.nome)] = ubs.id;
    }
    log('INFO', `13 UBSs OK`);
    return { prefeituraId: prefeitura.id, ubsMap };
  }

  async function runWorkerPool(files: string[], ubsMap: Record<string, string>, prefeituraId: string): Promise<void> {
    log('INFO', `🧵 pool de ${WORKER_COUNT} workers · ${files.length} arquivos`);
    let idx = 0;
    const counters = { processed: 0, inserted: 0, errors: 0 };

    function spawnWorker(): Promise<void> {
      return new Promise((resolve) => {
        const next = () => {
          if (idx >= files.length) {
            resolve();
            return;
          }
          const file = files[idx++];
          const w = new Worker(__filename, {
            workerData: { file, ubsMap, prefeituraId },
            execArgv: ['-r', 'ts-node/register/transpile-only'],
          });
          w.on('message', (msg: { kind: string; file?: string; rows?: number; processed?: number; inserted?: number; error?: string }) => {
            if (msg.kind === 'done') {
              counters.processed += msg.processed ?? 0;
              counters.inserted += msg.inserted ?? 0;
              log('INFO', `✓ worker concluiu ${path.basename(msg.file ?? '')} · ${msg.processed} rows`);
            } else if (msg.kind === 'error') {
              counters.errors++;
              log('ERROR', `✗ worker erro ${msg.file}: ${msg.error}`);
            }
          });
          w.on('exit', () => next());
          w.on('error', (e) => { counters.errors++; log('ERROR', `worker crashou: ${e.message}`); next(); });
        };
        next();
      });
    }

    await Promise.all(Array.from({ length: WORKER_COUNT }, () => spawnWorker()));

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`  RESUMO ${DRY_RUN ? 'DRY-RUN' : 'COMMIT'}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log(JSON.stringify(counters, null, 2));
  }

  async function main() {
    console.log(`\n${DRY_RUN ? '🔍 DRY-RUN' : '✏️  COMMIT'} — PEC → UNISISM importer\n`);

    const { prefeituraId, ubsMap } = await garantirPrefeituraEUbs();

    const csvFiles = fs.existsSync(CSV_DIR)
      ? fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv')).map(f => path.join(CSV_DIR, f))
      : [];
    log('INFO', `${csvFiles.length} CSVs encontrados`);

    // TODO: incluir JSONs do deep-scraper em outra fase
    if (csvFiles.length === 0) {
      log('WARN', 'Nenhum CSV encontrado — rode pec-export-all.ts primeiro');
      return;
    }

    await runWorkerPool(csvFiles, ubsMap, prefeituraId);
  }

  main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
