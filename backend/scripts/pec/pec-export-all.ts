/**
 * PEC e-SUS APS · Exportador paralelo de relatórios CSV (perfil Gestor)
 *
 * Arquitetura:
 *   1. UM login → salva storage state em pec-state/storage-state.json
 *   2. Pool de N contexts paralelos (default 4) reutilizando a mesma sessão
 *   3. Throttle global de 6 req/s pra não disparar anti-bot do PEC
 *   4. Disparar exports em paralelo (cada um vai pra fila do PEC)
 *   5. Aguardar fila + baixar CSVs em paralelo (Nível 3)
 *
 * Tempo estimado:
 *   - Antes (serial): 1-3h
 *   - Com 4 contexts: 20-50 min
 *
 * Uso:
 *   cd backend
 *   npx ts-node-dev --transpile-only scripts/pec/pec-export-all.ts
 *
 * Background:
 *   pm2 start --interpreter "npx" --interpreter-args "ts-node-dev --transpile-only" \
 *     scripts/pec/pec-export-all.ts --name pec-exports
 */
import path from 'node:path';
import {
  CSV_DIR,
  ContextPool,
  PEC,
  POOL_SIZE,
  defensiveSleep,
  hasStoredSession,
  log,
  loadProgress,
  loginAndSaveState,
  saveProgress,
  sleep,
} from './pec-common';

interface RelatorioConfig {
  key: string;
  nome: string;
  url: string;
  modo: 'periodo' | 'snapshot';
  chunks?: Array<{ inicio: string; fim: string }>;
  dataSnapshot?: string;
  selecionarTodos: boolean;
  gruposIdx?: number[];
}

const CHUNKS_29M = [
  { inicio: '01/01/2024', fim: '31/03/2025' },
  { inicio: '01/04/2025', fim: '31/05/2026' },
];
const CHUNKS_6M = [
  { inicio: '01/01/2024', fim: '30/06/2024' },
  { inicio: '01/07/2024', fim: '31/12/2024' },
  { inicio: '01/01/2025', fim: '30/06/2025' },
  { inicio: '01/07/2025', fim: '31/12/2025' },
  { inicio: '01/01/2026', fim: '31/05/2026' },
];

const RELATORIOS: RelatorioConfig[] = [
  { key: 'atendimento-individual', nome: 'Atendimento Individual', url: '/relatorios/producao/atendimento-individual', modo: 'periodo', chunks: CHUNKS_29M, selecionarTodos: true },
  { key: 'cadastro-individual', nome: 'Cadastro Individual', url: '/relatorios/consolidados/cadastro-individual', modo: 'snapshot', dataSnapshot: '01/06/2026', selecionarTodos: true },
  { key: 'cadastro-domiciliar', nome: 'Cadastro Domiciliar', url: '/relatorios/consolidados/cadastro-domiciliar', modo: 'snapshot', dataSnapshot: '01/06/2026', selecionarTodos: true },
  { key: 'visita-domiciliar', nome: 'Visita Domiciliar', url: '/relatorios/producao/visita-domiciliar', modo: 'periodo', chunks: CHUNKS_29M, selecionarTodos: true },
  { key: 'atendimento-domiciliar', nome: 'Atendimento Domiciliar', url: '/relatorios/producao/atendimento-domiciliar', modo: 'periodo', chunks: CHUNKS_29M, selecionarTodos: true },
  { key: 'atendimento-odontologico', nome: 'Atendimento Odontológico', url: '/relatorios/producao/atendimento-odontologico', modo: 'periodo', chunks: CHUNKS_29M, selecionarTodos: true },
  { key: 'procedimentos-individualizados', nome: 'Procedimentos Individualizados', url: '/relatorios/producao/procedimentos-individualizados', modo: 'periodo', chunks: CHUNKS_29M, selecionarTodos: true },
  { key: 'procedimentos-consolidados', nome: 'Procedimentos Consolidados', url: '/relatorios/producao/procedimentos-consolidados', modo: 'periodo', chunks: CHUNKS_29M, selecionarTodos: true },
  { key: 'vacinacao', nome: 'Vacinação', url: '/relatorios/producao/vacinacao', modo: 'periodo', chunks: CHUNKS_6M, selecionarTodos: false, gruposIdx: [5, 6] },
  { key: 'atividade-coletiva', nome: 'Atividade Coletiva', url: '/relatorios/producao/atividade-coletiva', modo: 'periodo', chunks: CHUNKS_29M, selecionarTodos: true },
  { key: 'marcadores-consumo-alimentar', nome: 'Marcadores Consumo Alimentar', url: '/relatorios/producao/marcadores-consumo-alimentar', modo: 'periodo', chunks: CHUNKS_29M, selecionarTodos: true },
  { key: 'avaliacao-elegibilidade-admissao', nome: 'Avaliação Elegibilidade', url: '/relatorios/producao/avaliacao-elegibilidade-admissao', modo: 'periodo', chunks: CHUNKS_29M, selecionarTodos: true },
];

// Achatar todos os exports em tasks individuais (key + chunk)
function expandirTasks(): Array<{ key: string; cfg: RelatorioConfig; chunk: { inicio: string; fim: string } | null; chunkIdx: number }> {
  const tasks: Array<{ key: string; cfg: RelatorioConfig; chunk: { inicio: string; fim: string } | null; chunkIdx: number }> = [];
  for (const cfg of RELATORIOS) {
    if (cfg.modo === 'periodo' && cfg.chunks) {
      cfg.chunks.forEach((c, idx) => {
        tasks.push({ key: `${cfg.key}__c${idx}`, cfg, chunk: c, chunkIdx: idx });
      });
    } else {
      tasks.push({ key: `${cfg.key}__c0`, cfg, chunk: null, chunkIdx: 0 });
    }
  }
  return tasks;
}

// ────────────────────────────────────────────────────────────────
// Configura iframe e dispara Exportar CSV
// ────────────────────────────────────────────────────────────────
async function dispararExport(
  page: import('playwright').Page,
  cfg: RelatorioConfig,
  chunk: { inicio: string; fim: string } | null,
): Promise<{ ok: boolean; msg?: string }> {
  return await page.evaluate(({ cfg, chunk }) => {
    const iframe = document.querySelector('iframe') as HTMLIFrameElement | null;
    if (!iframe?.contentDocument) return { ok: false, msg: 'sem iframe' };
    const doc = iframe.contentDocument;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;

    Array.from(doc.querySelectorAll('button')).filter(b => b.innerText.trim() === 'OK').forEach(b => (b as HTMLElement).click());

    const dateInputs = Array.from(doc.querySelectorAll('input')).filter(i => (i as HTMLInputElement).maxLength === 10 && (i as HTMLInputElement).type === 'text') as HTMLInputElement[];
    if (cfg.modo === 'periodo' && chunk && dateInputs.length >= 2) {
      setter.call(dateInputs[0], chunk.inicio);
      dateInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      dateInputs[0].dispatchEvent(new Event('blur', { bubbles: true }));
      setter.call(dateInputs[1], chunk.fim);
      dateInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      dateInputs[1].dispatchEvent(new Event('blur', { bubbles: true }));
    } else if (cfg.modo === 'snapshot' && cfg.dataSnapshot && dateInputs.length >= 1) {
      setter.call(dateInputs[0], cfg.dataSnapshot);
      dateInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      dateInputs[0].dispatchEvent(new Event('blur', { bubbles: true }));
    }

    const checkboxes = Array.from(doc.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    checkboxes.forEach(c => { if (c.checked) c.click(); });
    if (cfg.selecionarTodos) {
      const btnSel = Array.from(doc.querySelectorAll('button')).find(b => b.innerText.trim() === 'Selecionar todos');
      if (btnSel) (btnSel as HTMLElement).click();
    } else if (cfg.gruposIdx) {
      cfg.gruposIdx.forEach((idx: number) => { if (checkboxes[idx] && !checkboxes[idx].checked) checkboxes[idx].click(); });
    }

    const btnExp = Array.from(doc.querySelectorAll('button')).find(b => b.innerText.trim() === 'Exportar CSV');
    if (!btnExp) return { ok: false, msg: 'botão Exportar CSV ausente' };
    (btnExp as HTMLElement).click();
    return { ok: true };
  }, { cfg, chunk });
}

// ────────────────────────────────────────────────────────────────
// Verifica se há "Pronto" pra esse relatório, baixa se sim
// ────────────────────────────────────────────────────────────────
async function tentarBaixarPronto(
  page: import('playwright').Page,
  cfg: RelatorioConfig,
  taskKey: string,
): Promise<{ baixado: boolean; pendente: boolean; path?: string }> {
  await page.goto(PEC.baseUrl.replace(/\/$/, '') + cfg.url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
  await page.waitForSelector('iframe', { timeout: 30_000 }).catch(() => {});
  await sleep(5000);

  const status = await page.evaluate(() => {
    const iframe = document.querySelector('iframe') as HTMLIFrameElement | null;
    if (!iframe?.contentDocument) return { text: '', botoesBaixar: 0 };
    const doc = iframe.contentDocument;
    // Fechar modal "OK" se aparecer
    Array.from(doc.querySelectorAll('button')).filter(b => b.innerText.trim() === 'OK').forEach(b => (b as HTMLElement).click());
    // Botões de download são divs Qooxdoo com title="Baixar CSV"
    const botoesBaixar = doc.querySelectorAll('div[title="Baixar CSV"]').length;
    return { text: doc.body.innerText.slice(0, 800), botoesBaixar };
  });

  if (status.botoesBaixar === 0) {
    return { baixado: false, pendente: status.text.includes('processamento') || status.text.includes('Aguarde') };
  }

  // Qooxdoo usa XHR/download — interceptamos a request via route, refetch e salvamos body
  try {
    const downloadPath = path.join(CSV_DIR, `${taskKey}.csv`);
    const ctx = page.context();
    const fs = await import('node:fs');

    const bodyPromise = new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout 180s no download')), 180_000);
      ctx.route('**/*download*', async (route) => {
        try {
          const r = await route.fetch();
          const body = await r.body();
          clearTimeout(timer);
          resolve(body);
          await route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
          await ctx.unroute('**/*download*').catch(() => {});
        } catch (e) {
          clearTimeout(timer);
          reject(e as Error);
        }
      });
    });

    const frame = page.frameLocator('iframe');
    await frame.locator('div[title="Baixar CSV"]').first().click({ timeout: 15_000 });
    const buffer = await bodyPromise;
    fs.writeFileSync(downloadPath, buffer);
    return { baixado: true, pendente: false, path: downloadPath };
  } catch (e) {
    log('WARN', `download falhou ${taskKey}: ${(e as Error).message}`);
    return { baixado: false, pendente: true };
  }
}

// ────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────
async function main() {
  const tasks = expandirTasks();
  log('INFO', `🚀 Iniciando pec-export-all`, { totalTasks: tasks.length, poolSize: POOL_SIZE });

  // 1. Login (se não tem state)
  if (!hasStoredSession()) {
    await loginAndSaveState('GESTOR');
  }

  // 2. Sobe pool
  const pool = new ContextPool();
  await pool.init(POOL_SIZE);
  const progress = loadProgress();

  try {
    // FASE A: disparar exports em paralelo
    log('INFO', `📤 disparando ${tasks.length} exports em paralelo (pool=${POOL_SIZE})`);
    await pool.runAll(tasks, async (task, worker) => {
      const state = progress.exports[task.key];
      if (state?.status === 'downloaded' || state?.status === 'dispatched' || state?.status === 'ready') {
        log('INFO', `[skip] ${task.key} status=${state.status}`);
        return;
      }
      log('INFO', `→ [worker ${worker.id}] disparando ${task.key}`, { chunk: task.chunk });
      // PEC é SPA Vaadin com iframe JSF — domcontentloaded é mais confiável que networkidle
      await worker.page.goto(PEC.baseUrl.replace(/\/$/, '') + task.cfg.url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
      // Espera explicitamente o iframe Vaadin aparecer e ter conteúdo carregado
      await worker.page.waitForSelector('iframe', { timeout: 30_000 }).catch(() => {});
      await sleep(5000); // dá tempo do iframe carregar seu próprio JSF
      // Loop de espera até iframe estar pronto (máx 30s adicional)
      for (let t = 0; t < 30; t++) {
        const hasContent = await worker.page.evaluate(() => {
          const f = document.querySelector('iframe') as HTMLIFrameElement | null;
          return !!(f?.contentDocument?.body?.innerText?.length);
        }).catch(() => false);
        if (hasContent) break;
        await sleep(1000);
      }
      const r = await dispararExport(worker.page, task.cfg, task.chunk);
      if (r.ok) {
        progress.exports[task.key] = { status: 'dispatched', dispatchedAt: new Date().toISOString() };
        log('INFO', `✓ [worker ${worker.id}] disparado ${task.key}`);
      } else {
        progress.exports[task.key] = { status: 'failed', errorMsg: r.msg, lastTry: new Date().toISOString() };
        log('ERROR', `✗ falhou ${task.key}: ${r.msg}`);
      }
      saveProgress();
    });

    // FASE B: aguardar fila + baixar prontos (paralelo)
    log('INFO', `⏳ aguardando fila e baixando prontos`);
    let loops = 0;
    while (loops < 60) { // 60 × 30s = 30 min max
      const pendentes = tasks.filter(t => {
        const s = progress.exports[t.key];
        return s && (s.status === 'dispatched' || s.status === 'ready');
      });
      if (pendentes.length === 0) {
        log('INFO', '✓ fila vazia');
        break;
      }
      log('INFO', `loop ${loops} · ${pendentes.length} pendentes`);

      await pool.runAll(pendentes, async (task, worker) => {
        const r = await tentarBaixarPronto(worker.page, task.cfg, task.key);
        if (r.baixado && r.path) {
          progress.exports[task.key] = { ...progress.exports[task.key]!, status: 'downloaded', filename: r.path };
          log('INFO', `✓ baixado ${task.key} → ${r.path}`);
          saveProgress();
        } else if (!r.pendente) {
          // Não está pronto nem processando — talvez falhou silenciosamente
          log('WARN', `${task.key} sem status — ignorando neste loop`);
        }
      });
      loops++;
      if (loops < 60) await sleep(30_000);
    }

    log('INFO', '✓ pipeline export-all concluído');
  } catch (e) {
    log('ERROR', `falha geral: ${(e as Error).message}`);
  } finally {
    await pool.close();
  }

  // Resumo
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  RESUMO PEC EXPORT-ALL');
  console.log('═══════════════════════════════════════════════════════════');
  const counts: Record<string, number> = {};
  for (const [, s] of Object.entries(progress.exports)) counts[s.status] = (counts[s.status] ?? 0) + 1;
  console.log(JSON.stringify(counts, null, 2));
  console.log(`CSVs: ${CSV_DIR}`);
}

main().catch((e) => {
  log('ERROR', 'unhandled', { msg: String(e) });
  process.exit(1);
});
