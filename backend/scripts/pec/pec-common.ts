/**
 * PEC e-SUS APS · biblioteca comum (v2 com pool paralelo)
 *
 * Suporta 3 níveis de paralelismo seguro:
 *   1. Storage state compartilhado entre N contexts (mesma sessão PEC)
 *   2. Worker pool Node pra parse/import (não toca PEC)
 *   3. Download paralelo de CSVs (independente de sessão login)
 *
 * Throttle global protege contra anti-bot do PEC.
 */
import 'dotenv/config';
import { config as dotenvConfig } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright';

dotenvConfig({ path: path.resolve(__dirname, '../../.env.pec'), override: true });

export const PEC = {
  baseUrl: (process.env.PEC_BASE_URL ?? 'https://aguasbelas.esuscloud.com.br/').replace(/\/+$/, '/'),
  user: process.env.PEC_USER ?? '',
  password: process.env.PEC_PASSWORD ?? '',
};

if (!PEC.user || !PEC.password) {
  console.error('✗ credenciais ausentes — popule backend/.env.pec');
  process.exit(1);
}

export const DATA_ROOT = path.resolve(__dirname, '../../data');
export const CSV_DIR = path.join(DATA_ROOT, 'pec-csv');
export const PACIENTES_DIR = path.join(DATA_ROOT, 'pec-pacientes');
export const LOGS_DIR = path.join(DATA_ROOT, 'pec-logs');
export const PROGRESS_FILE = path.join(DATA_ROOT, 'pec-progress.json');
export const STATE_DIR = path.join(DATA_ROOT, 'pec-state');

for (const d of [CSV_DIR, PACIENTES_DIR, LOGS_DIR, STATE_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

// ────────────────────────────────────────────────────────────────
// Configuração de paralelismo
// ────────────────────────────────────────────────────────────────
export const POOL_SIZE = parseInt(process.env.PEC_POOL_SIZE ?? '4', 10);          // contexts paralelos (3-5 ideal)
export const RATE_DELAY_MS = parseInt(process.env.PEC_RATE_DELAY_MS ?? '3500', 10); // por context
export const GLOBAL_RATE_HZ = parseInt(process.env.PEC_GLOBAL_RATE_HZ ?? '6', 10);  // máx req/s global
export const HEADLESS = (process.env.PEC_HEADLESS ?? 'true') === 'true';

// ────────────────────────────────────────────────────────────────
// Log estruturado
// ────────────────────────────────────────────────────────────────
const logFile = path.join(LOGS_DIR, `pec-${new Date().toISOString().slice(0, 10)}.log`);
export function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, extra?: Record<string, unknown>): void {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra });
  console.log(line);
  try {
    fs.appendFileSync(logFile, line + '\n');
  } catch {}
}

// ────────────────────────────────────────────────────────────────
// Progress / checkpoint resumível
// ────────────────────────────────────────────────────────────────
export interface PecProgress {
  exports: Record<string, {
    status: 'pending' | 'dispatched' | 'ready' | 'downloaded' | 'failed';
    filename?: string;
    lastTry?: string;
    errorMsg?: string;
    dispatchedAt?: string;
  }>;
  ubsPacientes: Record<string, {
    coletados: string[];
    restantes: number;
    ultimoCpf?: string;
    finalizado?: boolean;
  }>;
  startedAt: string;
  lastSyncAt: string;
}

let _progressCache: PecProgress | null = null;
export function loadProgress(): PecProgress {
  if (_progressCache) return _progressCache;
  if (fs.existsSync(PROGRESS_FILE)) {
    _progressCache = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    return _progressCache!;
  }
  _progressCache = {
    exports: {},
    ubsPacientes: {},
    startedAt: new Date().toISOString(),
    lastSyncAt: new Date().toISOString(),
  };
  return _progressCache;
}

export function saveProgress(p?: PecProgress): void {
  const data = p ?? _progressCache;
  if (!data) return;
  data.lastSyncAt = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

// ────────────────────────────────────────────────────────────────
// Throttle global — limita requests/segundo agregado
// ────────────────────────────────────────────────────────────────
class GlobalThrottle {
  private lastReqTimes: number[] = [];
  private readonly windowMs = 1000;

  async wait(): Promise<void> {
    while (true) {
      const now = Date.now();
      this.lastReqTimes = this.lastReqTimes.filter(t => now - t < this.windowMs);
      if (this.lastReqTimes.length < GLOBAL_RATE_HZ) {
        this.lastReqTimes.push(now);
        return;
      }
      const oldestExitsIn = this.windowMs - (now - this.lastReqTimes[0]) + 50;
      await sleep(oldestExitsIn);
    }
  }
}

export const throttle = new GlobalThrottle();

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export async function defensiveSleep(): Promise<void> {
  await sleep(RATE_DELAY_MS + Math.floor(Math.random() * 1500));
}

// ────────────────────────────────────────────────────────────────
// Login + storage state (uma vez, depois reusa)
// ────────────────────────────────────────────────────────────────
const STATE_FILE = path.join(STATE_DIR, 'storage-state.json');

export function getLaunchOptions() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  return {
    headless: HEADLESS,
    ...(executablePath ? { executablePath } : {}),
  };
}

export async function loginAndSaveState(perfil: 'GESTOR' | { nomeUbs: string }): Promise<void> {
  log('INFO', '🔐 fazendo login fresco', { perfil });
  const browser = await chromium.launch(getLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  try {
    // domcontentloaded em vez de networkidle — PEC é SPA Vaadin e nunca atinge networkidle
    await page.goto(PEC.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // Aguarda os inputs aparecerem (sinal real de página pronta)
    await page.waitForSelector('input[name="username"]', { timeout: 30_000 });

    // Cookies essenciais
    const cookieBtn = page.locator('button:has-text("apenas os necessários")');
    if (await cookieBtn.count()) await cookieBtn.click().catch(() => {});

    // Login via React setter
    await page.evaluate(({ u, p }) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      const userInput = document.querySelector('input[name="username"]') as HTMLInputElement;
      const passInput = document.querySelector('input[name="password"]') as HTMLInputElement;
      setter.call(userInput, u);
      userInput.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(passInput, p);
      passInput.dispatchEvent(new Event('input', { bubbles: true }));
    }, { u: PEC.user, p: PEC.password });

    await page.locator('button:has-text("Acessar")').click();
    // Espera URL mudar (sair de /login pra dashboard com seleção de perfil)
    await page.waitForURL((url) => !url.toString().includes('login'), { timeout: 30_000 }).catch(() => {});
    await sleep(3000);

    // PEC bloqueia login concorrente. Se aparece modal "Você já está logado em outra sessão",
    // clica Continuar pra tomar a sessão (derruba a outra).
    const modalConcorrente = page.locator('text=/já está logado em outra sessão/i').first();
    if (await modalConcorrente.count() > 0) {
      log('WARN', '⚠ modal de sessão concorrente — clicando Continuar (derruba outra sessão)');
      await page.locator('button:has-text("Continuar")').click().catch(() => {});
      await sleep(3000);
    }

    // Aguarda estabilidade visual (Vaadin SPA renderiza lazy)
    await sleep(3000);

    // Seleção de perfil
    if (perfil === 'GESTOR') {
      await page.evaluate(() => {
        const h3 = Array.from(document.querySelectorAll('h3')).find(e => e.textContent?.trim() === 'ÁGUAS BELAS');
        const card = h3?.closest('div[class]') as HTMLElement | null;
        card?.click();
      });
    } else {
      await page.evaluate((nomeUbs: string) => {
        const cards = Array.from(document.querySelectorAll('h3'));
        const target = cards.find(h => h.textContent?.trim().toLowerCase().includes(nomeUbs.toLowerCase()));
        const card = target?.closest('div[class]') as HTMLElement | null;
        card?.click();
      }, perfil.nomeUbs);
    }

    // Após escolher perfil, espera load do dashboard PEC (iframe Vaadin)
    await sleep(5000);

    // Salva storage state
    await context.storageState({ path: STATE_FILE });
    log('INFO', '✓ session state salvo', { file: STATE_FILE });
  } finally {
    await context.close();
    await browser.close();
  }
}

export function hasStoredSession(): boolean {
  return fs.existsSync(STATE_FILE);
}

// ────────────────────────────────────────────────────────────────
// Pool de contexts paralelos compartilhando session
// ────────────────────────────────────────────────────────────────
export interface PoolWorker {
  context: BrowserContext;
  page: Page;
  id: number;
  busy: boolean;
}

export class ContextPool {
  private browser!: Browser;
  private workers: PoolWorker[] = [];

  async init(size = POOL_SIZE): Promise<void> {
    if (!hasStoredSession()) {
      throw new Error('Sem storage state — rode loginAndSaveState() primeiro');
    }
    this.browser = await chromium.launch(getLaunchOptions());
    for (let i = 0; i < size; i++) {
      const context = await this.browser.newContext({
        storageState: STATE_FILE,
        viewport: { width: 1366, height: 900 },
        acceptDownloads: true,
      });
      const page = await context.newPage();
      this.workers.push({ context, page, id: i, busy: false });
      log('INFO', `pool worker ${i} pronto`);
    }
  }

  async acquire(): Promise<PoolWorker> {
    while (true) {
      const free = this.workers.find(w => !w.busy);
      if (free) {
        free.busy = true;
        await throttle.wait();
        return free;
      }
      await sleep(200);
    }
  }

  release(worker: PoolWorker): void {
    worker.busy = false;
  }

  /**
   * Executa N tarefas em paralelo, cada uma com 1 worker do pool.
   * Retorna array de resultados na ordem das tarefas.
   */
  async runAll<T, R>(items: T[], fn: (item: T, worker: PoolWorker, idx: number) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIdx = 0;

    const launchWorker = async () => {
      while (true) {
        const idx = nextIdx++;
        if (idx >= items.length) return;
        const worker = await this.acquire();
        try {
          results[idx] = await fn(items[idx], worker, idx);
        } catch (e) {
          log('ERROR', `pool task ${idx} falhou: ${(e as Error).message}`);
          results[idx] = undefined as R;
        } finally {
          this.release(worker);
        }
        await defensiveSleep();
      }
    };

    await Promise.all(this.workers.map(() => launchWorker()));
    return results;
  }

  async close(): Promise<void> {
    for (const w of this.workers) {
      await w.context.close().catch(() => {});
    }
    await this.browser.close().catch(() => {});
  }
}

// ────────────────────────────────────────────────────────────────
// UBSs descobertas na Fase 1
// ────────────────────────────────────────────────────────────────
export const UBS_AGUAS_BELAS: Array<{ nome: string; ine?: string }> = [
  { nome: 'PSF Jose Wellington Alves Rodrigues', ine: '0000134813' },
  { nome: 'UBS Abel Dias da Silva', ine: '0002459485' },
  { nome: 'UBS Ayrton Diogenes', ine: '0000134848' },
  { nome: 'UBS Garanhuzinho', ine: '0002459477' },
  { nome: 'UBS Jovelina Maria dos Santos', ine: '0002459493' },
  { nome: 'UBS Paulo Maranhao', ine: '0000134910' },
  { nome: 'Unidade de Saude da Familia Campo Grande', ine: '0000134872' },
  { nome: 'Unidade de Saude da Familia Zilda Arns', ine: '0000134910' },
  { nome: 'Usf Alan Roberto', ine: '0001592084' },
  { nome: 'Usf Dr Clecio Xavier', ine: '0000134899' },
  { nome: 'Usf Nahor Gueiros Lagoa do Barro', ine: '0000134848' },
  { nome: 'Usf Zumbi', ine: '0000134856' },
  { nome: 'Usf de Curral Novo', ine: '0000134821' },
];

export function slug(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
