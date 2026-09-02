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

function cleanDigits(s?: string): string {
  return (s || '').replace(/\D/g, '');
}

function parseDate(s?: string): Date {
  if (!s) return new Date('1990-01-01');
  const str = s.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/').map(Number);
    const date = new Date(y, m - 1, d);
    if (!isNaN(date.getTime())) return date;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const date = new Date(str);
    if (!isNaN(date.getTime())) return date;
  }
  return new Date('1990-01-01');
}

function getVal(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== '') return row[k].trim();
    const foundKey = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim());
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== '') return row[foundKey].trim();
  }
  return '';
}

// ════════════════════════════════════════════════════════════════
// Worker thread — processa 1 arquivo
// ════════════════════════════════════════════════════════════════
if (!isMainThread) {
  void (async () => {
    const { file, ubsMap, prefeituraId, dryRun } = workerData as {
      file: string;
      ubsMap: Record<string, string>;
      prefeituraId: string;
      dryRun: boolean;
    };
    parentPort?.postMessage({ kind: 'start', file });

    try {
      // Worker importa Prisma dinâmico pra ter conexão isolada
      const { PrismaClient } = await import('@prisma/client');
      const wPrisma = new PrismaClient();

      let rows: any[] = [];
      const isJsonl = file.endsWith('.jsonl') || file.endsWith('.json');

      if (isJsonl) {
        const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/).filter(Boolean);
        rows = lines.map(l => {
          try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);
      } else {
        // Detecta charset (tenta UTF-8 → senão Win-1252)
        let content = fs.readFileSync(file, 'utf-8');
        if (content.includes('')) {
          const raw = fs.readFileSync(file);
          try {
            content = raw.toString('latin1');
          } catch {}
        }
        rows = parseCsv(content);
      }

      parentPort?.postMessage({ kind: 'parsed', file, rows: rows.length });

      const fileName = path.basename(file).toLowerCase();
      const defaultUbsId = Object.values(ubsMap)[0];
      let insertedCount = 0;

      // ─── 1. CADASTRO INDIVIDUAL / PACIENTES (CSV ou JSONL GraphQL) ─
      if (isJsonl || fileName.includes('cadastro-individual') || fileName.includes('cidadao') || fileName.includes('paciente')) {
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rawNome = isJsonl ? row.nome : getVal(row, 'Nome do Cidadão', 'Nome', 'NO_CIDADAO', 'Nome Cidadão', 'Nome Completo');
          if (!rawNome) continue;

          const rawCpf = cleanDigits(isJsonl ? row.cpf : getVal(row, 'CPF', 'NU_CPF', 'Cpf'));
          const rawCns = cleanDigits(isJsonl ? row.cns : getVal(row, 'CNS', 'Cartão Nacional de Saúde', 'Cartao SUS', 'NU_CNS', 'Cns'));
          const cpfFinal = rawCpf.length === 11 ? rawCpf : (rawCns ? `CNS-${rawCns}` : `TEMP-${Date.now()}-${i}`);
          const cnsFinal = rawCns.length === 15 ? rawCns : (rawCpf.length === 11 ? `999${rawCpf.slice(0, 12)}` : null);

          const dataNascimento = parseDate(isJsonl ? row.dataNascimento : getVal(row, 'Data de Nascimento', 'DT_NASCIMENTO', 'Nascimento', 'Data Nascimento'));
          const sexoStr = String(isJsonl ? (row.sexo || '') : getVal(row, 'Sexo', 'DS_SEXO', 'Gênero')).toUpperCase();
          const sexo = sexoStr.startsWith('M') ? 'MASCULINO' : (sexoStr.startsWith('F') ? 'FEMININO' : 'OUTRO');

          const nomeMae = (isJsonl ? row.nomeMae : getVal(row, 'Nome da Mãe', 'Nome Mãe', 'NO_MAE')) || null;
          const telefone = (isJsonl ? (row.telefoneCelular || row.telefoneResidencial) : getVal(row, 'Telefone Celular', 'Telefone', 'Celular', 'NU_TELEFONE_CELULAR')) || null;
          const endereco = (isJsonl ? row.endereco : getVal(row, 'Logradouro', 'Endereço', 'DS_LOGRADOURO', 'Endereco')) || null;
          const bairro = (isJsonl ? row.bairro : getVal(row, 'Bairro', 'NO_BAIRRO')) || null;
          const cep = cleanDigits(isJsonl ? row.cep : getVal(row, 'CEP', 'NU_CEP')) || null;
          const microarea = (isJsonl ? row.microarea : getVal(row, 'Microárea', 'Microarea', 'NU_MICRO_AREA')) || null;
          const equipeSaudeFamilia = (isJsonl ? row.equipe : getVal(row, 'Equipe', 'Nome da Equipe', 'DS_EQUIPE')) || null;
          const agenteComunitario = (isJsonl ? row.acs : getVal(row, 'Agente Comunitário', 'ACS', 'NO_PROFISSIONAL')) || null;

          // Resolve UBS por correspondência de nome/INE
          const rawUbs = isJsonl
            ? (row.cidadaoVinculacaoEquipe?.unidadeSaude?.nome || '')
            : getVal(row, 'Unidade de Saúde', 'Unidade', 'UBS', 'CNES', 'INE', 'NO_UNIDADE_SAUDE');
          const matchedUbsSlug = Object.keys(ubsMap).find(k => k.includes(slug(rawUbs)) || slug(rawUbs).includes(k));
          const ubsId = (matchedUbsSlug ? ubsMap[matchedUbsSlug] : null) || defaultUbsId;

          if (!dryRun) {
            await wPrisma.paciente.upsert({
              where: { cpf: cpfFinal },
              update: {
                nome: rawNome,
                cartaoSus: cnsFinal,
                dataNascimento,
                sexo: sexo as any,
                nomeMae,
                telefone,
                endereco,
                bairro,
                municipio: 'Águas Belas',
                uf: 'PE',
                cep,
                microarea,
                equipeSaudeFamilia,
                agenteComunitario,
                ubsId,
              },
              create: {
                nome: rawNome,
                cpf: cpfFinal,
                cartaoSus: cnsFinal,
                dataNascimento,
                sexo: sexo as any,
                nomeMae,
                telefone,
                endereco,
                bairro,
                municipio: 'Águas Belas',
                uf: 'PE',
                cep,
                microarea,
                equipeSaudeFamilia,
                agenteComunitario,
                ubsId,
              },
            });
          }
          insertedCount++;
        }
      }

      parentPort?.postMessage({ kind: 'done', file, processed: rows.length, inserted: insertedCount });
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
            workerData: { file, ubsMap, prefeituraId, dryRun: DRY_RUN },
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
    const jsonlFiles = fs.existsSync(PACIENTES_DIR)
      ? fs.readdirSync(PACIENTES_DIR).filter(f => f.endsWith('.jsonl') || f.endsWith('.json')).map(f => path.join(PACIENTES_DIR, f))
      : [];
    const allFiles = [...csvFiles, ...jsonlFiles];
    log('INFO', `${allFiles.length} arquivos encontrados (${csvFiles.length} CSVs, ${jsonlFiles.length} JSONLs)`);

    if (allFiles.length === 0) {
      log('WARN', 'Nenhum arquivo encontrado em data/pec-csv ou data/pec-pacientes — rode pec-export-all.ts ou pec-graphql-scraper.ts primeiro');
      return;
    }

    await runWorkerPool(allFiles, ubsMap, prefeituraId);
  }

  main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
