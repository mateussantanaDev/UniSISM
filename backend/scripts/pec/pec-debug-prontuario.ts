/**
 * Captura TODAS as queries GraphQL que o PEC dispara ao abrir folha de 1 paciente
 * Usa o paciente ABDIAS MARTINS SANTOS (id=21260, prontuario=17437) como cobaia
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { PEC, sleep, log, getLaunchOptions } from './pec-common';

const OUT = '/tmp/pec-prontuario-graphql.json';

async function loginAndContext(page: Page) {
  await page.goto(PEC.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('input[name="username"]', { timeout: 30_000 });
  const cookieBtn = page.locator('button:has-text("apenas os necessários")');
  if (await cookieBtn.count()) await cookieBtn.click().catch(() => {});
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
  await page.waitForURL((url) => !url.toString().includes('login'), { timeout: 30_000 }).catch(() => {});
  await sleep(3000);
  const modal = page.locator('text=/já está logado em outra sessão/i').first();
  if (await modal.count() > 0) {
    await page.locator('button:has-text("Continuar")').click().catch(() => {});
    await sleep(3000);
  }
  await sleep(2000);
  await page.evaluate(() => {
    const h3 = Array.from(document.querySelectorAll('h3')).find(e => e.textContent?.trim() === 'UBS Abel Dias da Silva');
    const card = h3?.closest('div[class]') as HTMLElement | null;
    card?.click();
  });
  await sleep(6000);
}

async function main() {
  const records: any[] = [];

  const browser = await chromium.launch(getLaunchOptions());
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();

  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/api/graphql') && req.method() === 'POST') {
      const body = req.postData();
      try {
        const parsed = JSON.parse(body!);
        const ops = Array.isArray(parsed) ? parsed : [parsed];
        ops.forEach((op: any) => {
          records.push({ kind: 'request', operationName: op.operationName, variables: op.variables, query: op.query });
        });
      } catch {}
    }
  });
  page.on('response', async (res) => {
    const u = res.url();
    if (u.includes('/api/graphql')) {
      try {
        const text = await res.text();
        const parsed = JSON.parse(text);
        const responses = Array.isArray(parsed) ? parsed : [parsed];
        responses.forEach((r: any, i: number) => {
          records.push({ kind: 'response', idx: i, hasData: !!r.data, hasErrors: !!r.errors, preview: text.slice(0, 2000) });
        });
      } catch {}
    }
  });

  try {
    log('INFO', '🔐 login + contexto');
    await loginAndContext(page);

    log('INFO', '📋 buscar paciente ABDIAS MARTINS');
    await page.locator('input').first().fill('ABDIAS MARTINS');
    await sleep(500);
    await page.locator('button:has-text("Buscar cidadão")').click();
    await sleep(5000);

    log('INFO', '👤 clicar no 1º resultado pra abrir folha do cidadão');
    // Tira screenshot e captura DOM da lista de resultados
    await page.screenshot({ path: '/tmp/pec-pront-lista.png', fullPage: true });
    fs.writeFileSync('/tmp/pec-pront-lista.html', await page.content());

    // Tentar clicar no primeiro paciente. PEC pode renderizar a lista de várias formas;
    // experimenta: link com nome, botão "Acessar prontuário", linha clicável.
    const cliques = [
      'a:has-text("ABDIAS MARTINS")',
      'button:has-text("Acessar prontuário")',
      'button:has-text("Visualizar")',
      'button:has-text("Folha de rosto")',
      '[title*="rontuário"]',
      'tr:has-text("ABDIAS MARTINS")',
    ];
    let clicado = false;
    for (const sel of cliques) {
      const loc = page.locator(sel).first();
      if (await loc.count() > 0) {
        try {
          await loc.click({ timeout: 3000 });
          log('INFO', `   ✓ cliquei em "${sel}"`);
          clicado = true;
          break;
        } catch {}
      }
    }
    if (!clicado) log('WARN', '   ⚠ não consegui clicar no paciente — vou só salvar o que tem');

    await sleep(8000);
    await page.screenshot({ path: '/tmp/pec-pront-folha.png', fullPage: true });
    fs.writeFileSync('/tmp/pec-pront-folha.html', await page.content());

    // Tentar clicar em "Prontuário" ou "Folha de rosto" se estiver visível
    const buttonsPront = [
      'button:has-text("Prontuário")',
      'button:has-text("Folha de rosto")',
      'a:has-text("Prontuário")',
      'a:has-text("Folha de rosto")',
      '[title="Prontuário"]',
    ];
    for (const sel of buttonsPront) {
      const loc = page.locator(sel).first();
      if (await loc.count() > 0) {
        try {
          await loc.click({ timeout: 3000 });
          log('INFO', `   ✓ cliquei adicional em "${sel}"`);
          await sleep(5000);
          break;
        } catch {}
      }
    }

    await sleep(3000);

  } finally {
    await browser.close();
  }

  log('INFO', `📦 ${records.length} eventos GraphQL capturados`);
  fs.writeFileSync(OUT, JSON.stringify(records, null, 2));
  log('INFO', `📁 ${OUT}`);

  // Sumário das operações
  const ops = new Set<string>();
  records.filter(r => r.kind === 'request').forEach(r => ops.add(r.operationName));
  console.log('\n=== operationNames únicas capturadas ===');
  Array.from(ops).sort().forEach(o => console.log(`  · ${o}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
