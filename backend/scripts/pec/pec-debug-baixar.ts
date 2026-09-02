/**
 * Debug: tenta baixar o "Baixar CSV" mais recente do Cadastro Domiciliar
 * Já tem 1 pronto na fila do PEC da sessão anterior — não precisa re-dispatch
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PEC, sleep, getLaunchOptions } from './pec-common';

async function main() {
  const browser = await chromium.launch(getLaunchOptions());
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    acceptDownloads: true,
  });
  const page = await ctx.newPage();

  try {
    // 1. Login
    console.log('1. login...');
    await page.goto(PEC.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('input[name="username"]', { timeout: 30_000 });
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

    // 2. GESTOR
    console.log('2. selecionar GESTOR...');
    await page.evaluate(() => {
      const h3 = Array.from(document.querySelectorAll('h3')).find(e => e.textContent?.trim() === 'ÁGUAS BELAS');
      const card = h3?.closest('div[class]') as HTMLElement | null;
      card?.click();
    });
    await sleep(5000);

    // 3. Ir pra cadastro-domiciliar
    console.log('3. navegar pro relatório...');
    await page.goto(PEC.baseUrl.replace(/\/$/, '') + '/relatorios/consolidados/cadastro-domiciliar',
      { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    await page.waitForSelector('iframe', { timeout: 30_000 }).catch(() => {});
    await sleep(8000);

    // 4. Contar botões "Baixar CSV"
    const ready = await page.evaluate(() => {
      const f = document.querySelector('iframe') as HTMLIFrameElement;
      if (!f?.contentDocument) return { erro: 'sem iframe' };
      const btns = f.contentDocument.querySelectorAll('div[title="Baixar CSV"]');
      return { count: btns.length };
    });
    console.log(`4. botões "Baixar CSV" encontrados: ${ready.count ?? 'erro: ' + ready.erro}`);

    if (!ready.count) {
      console.log('   nenhum botão pronto — saindo');
      return;
    }

    // 5. Interceptar request /esus/download via route — refetch + salvar body
    console.log('5. interceptar request via route + clicar...');
    const downloadPath = path.join('/tmp', `pec-test-${Date.now()}.csv`);

    const bodyPromise = new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout 60s')), 60_000);
      ctx.route('**/esus/download?**', async (route) => {
        try {
          const response = await route.fetch();
          const body = await response.body();
          clearTimeout(timer);
          resolve(body);
          // Continua com vazio pra UI não travar
          await route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
        } catch (e) {
          clearTimeout(timer);
          reject(e as Error);
        }
      });
    });

    const frame = page.frameLocator('iframe');
    await frame.locator('div[title="Baixar CSV"]').first().click({ timeout: 10_000 });

    const buffer = await bodyPromise;
    fs.writeFileSync(downloadPath, buffer);
    const size = buffer.length;
    console.log(`\n✅ DOWNLOAD OK · ${downloadPath} · ${(size / 1024).toFixed(1)} KB`);
    console.log('  Primeiras 5 linhas:');
    console.log(buffer.toString('utf-8').split('\n').slice(0, 5).join('\n'));
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
