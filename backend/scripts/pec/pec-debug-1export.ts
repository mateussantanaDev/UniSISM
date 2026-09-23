/**
 * Debug isolado · UM relatório, passo a passo, com screenshots
 * Roda com HEADLESS=false pra usuário ver browser visível
 *
 *   PEC_HEADLESS=false npx ts-node-dev --transpile-only scripts/pec/pec-debug-1export.ts
 *
 * Screenshots em /tmp/pec-debug/<step>.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PEC, sleep } from './pec-common';

const SS_DIR = '/tmp/pec-debug';
fs.mkdirSync(SS_DIR, { recursive: true });

async function ss(page: any, name: string): Promise<void> {
  const p = path.join(SS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`  📸 ${p}  ·  url=${page.url()}`);
  const html = await page.content();
  fs.writeFileSync(path.join(SS_DIR, `${name}.html`), html);
}

async function main() {
  console.log('🚀 PEC debug · UM export (Cadastro Domiciliar — snapshot, mais simples)\n');

  const browser = await chromium.launch({
    headless: process.env.PEC_HEADLESS !== 'false' ? true : false,
    channel: 'chrome',
    slowMo: 200, // delay entre ações pra ser visível
  });
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    acceptDownloads: true,
  });
  const page = await ctx.newPage();

  try {
    // ─── 1. Login ──────────────────────────────────────────
    console.log('1. login →');
    await page.goto(PEC.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('input[name="username"]', { timeout: 30_000 });
    await ss(page, '01-login-form');

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

    // Modal sessão concorrente
    const modalConcorrente = page.locator('text=/já está logado em outra sessão/i').first();
    if (await modalConcorrente.count() > 0) {
      console.log('   ⚠ derrubando sessão concorrente');
      await page.locator('button:has-text("Continuar")').click().catch(() => {});
      await sleep(3000);
    }
    await ss(page, '02-after-login');

    // ─── 2. Selecionar perfil GESTOR ───────────────────────
    console.log('2. selecionar perfil GESTOR (Águas Belas) →');
    await page.evaluate(() => {
      const h3 = Array.from(document.querySelectorAll('h3')).find(e => e.textContent?.trim() === 'ÁGUAS BELAS');
      const card = h3?.closest('div[class]') as HTMLElement | null;
      card?.click();
    });
    await sleep(5000);
    await ss(page, '03-dashboard');

    // ─── 3. Navegar pra Cadastro Domiciliar ────────────────
    console.log('3. navegar → /relatorios/consolidados/cadastro-domiciliar');
    const targetUrl = PEC.baseUrl.replace(/\/$/, '') + '/relatorios/consolidados/cadastro-domiciliar';
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    await page.waitForSelector('iframe', { timeout: 30_000 }).catch(() => {});
    await sleep(8000); // dá tempo bom do iframe carregar
    await ss(page, '04-relatorio-page');

    // ─── 4. Inspecionar conteúdo do iframe ─────────────────
    console.log('4. inspecionar tabela "Pronto" →');
    const filaInfo = await page.evaluate(() => {
      const f = document.querySelector('iframe') as HTMLIFrameElement | null;
      if (!f?.contentDocument) return { erro: 'sem iframe' };
      const doc = f.contentDocument;

      // Sobe na hierarquia até achar container "linha" (com timestamp da data ao lado)
      const allEls = Array.from(doc.querySelectorAll('*'));
      const prontosEls = allEls.filter(el => {
        const t = (el as HTMLElement).innerText?.trim();
        return t === 'Pronto';
      });

      function findRowContainer(el: HTMLElement): HTMLElement {
        // sobe até o ancestral que contém um timestamp dd/mm/aaaa
        let cur: HTMLElement | null = el;
        for (let i = 0; i < 10 && cur; i++) {
          const txt = cur.innerText ?? '';
          if (/\d{2}\/\d{2}\/\d{4}/.test(txt) && txt.length < 600) return cur;
          cur = cur.parentElement;
        }
        return el.parentElement ?? el;
      }

      return {
        prontosCount: prontosEls.length,
        primeiraLinha: prontosEls.slice(0, 1).map(el => {
          const row = findRowContainer(el as HTMLElement);
          return {
            rowText: row.innerText?.slice(0, 300),
            rowHtml: row.outerHTML.slice(0, 2000),
            clickablesInRow: Array.from(row.querySelectorAll('*')).filter(c => {
              const cE = c as HTMLElement;
              return cE.tagName === 'BUTTON' ||
                cE.tagName === 'A' ||
                cE.hasAttribute('onclick') ||
                cE.getAttribute('role') === 'button' ||
                /button|link|action|click|download/i.test(cE.className) ||
                cE.style.cursor === 'pointer';
            }).slice(0, 15).map(c => {
              const ce = c as HTMLElement;
              return {
                tag: c.tagName,
                cls: ce.className.slice(0, 100),
                txt: ce.innerText?.trim().slice(0, 50),
                title: c.getAttribute('title') ?? c.getAttribute('aria-label'),
                onclick: c.hasAttribute('onclick'),
                href: c.getAttribute('href'),
              };
            }),
          };
        }),
      };
    });
    console.log(JSON.stringify(filaInfo, null, 2));

    console.log('\n✓ debug concluído · veja /tmp/pec-debug/ para screenshots');
    console.log('   Pressione Ctrl+C pra fechar browser');
    await sleep(60_000); // mantém aberto pra ver
  } catch (e) {
    console.error('✗', (e as Error).message);
    await ss(page, 'ERROR').catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
