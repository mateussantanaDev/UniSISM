/**
 * Investigação · Quais perfis aparecem após login (Gestor + Enfermeira em UBSs)
 * + Mapear UI de "Cidadão" no perfil Enfermeira
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { PEC, sleep } from './pec-common';

const SS = '/tmp/pec-enfermeira';
fs.mkdirSync(SS, { recursive: true });

async function ss(page: Page, name: string) {
  const p = path.join(SS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`  📸 ${p}`);
  fs.writeFileSync(path.join(SS, `${name}.html`), await page.content());
}

async function loginBase(page: Page) {
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
}

async function main() {
  console.log('🔍 INVESTIGAÇÃO · perfis Enfermeira disponíveis\n');
  const browser = await chromium.launch({
    headless: process.env.PEC_HEADLESS !== 'false',
    channel: 'chrome',
  });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  try {
    console.log('1. login...');
    await loginBase(page);
    await ss(page, '01-pos-login');

    // ─── 2. Listar TODOS os cards de perfil ─────────────────
    console.log('2. listar TODOS os perfis disponíveis (cards h3)...');
    const perfis = await page.evaluate(() => {
      const h3s = Array.from(document.querySelectorAll('h3'));
      return h3s.map(h => {
        const card = h.closest('div[class]');
        // Pegar contexto (textos vizinhos)
        const cardText = card ? (card as HTMLElement).innerText.replace(/\n+/g, ' | ').slice(0, 250) : '';
        return {
          titulo: h.textContent?.trim(),
          contextoCard: cardText,
        };
      });
    });
    console.log(JSON.stringify(perfis, null, 2));

    // ─── 3. Clicar em UBS Abel Dias da Silva ───────────────
    console.log('\n3. clicar em "UBS Abel Dias da Silva"...');
    await page.evaluate(() => {
      const h3 = Array.from(document.querySelectorAll('h3')).find(e => e.textContent?.trim() === 'UBS Abel Dias da Silva');
      const card = h3?.closest('div[class]') as HTMLElement | null;
      card?.click();
    });
    await sleep(8000);
    await ss(page, '02-ubs-dashboard');

    console.log(`   url=${page.url()}`);

    // ─── 4. Listar menus visíveis ──────────────────────────
    console.log('\n4. menus/links no dashboard da UBS:');
    const menus = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button, [role="button"], [class*="menu"], [class*="nav"]'));
      return links.map(l => {
        const e = l as HTMLElement;
        return {
          tag: e.tagName,
          txt: e.innerText?.trim().slice(0, 60),
          href: e.getAttribute('href'),
          title: e.getAttribute('title'),
        };
      }).filter(m => m.txt && m.txt.length > 0 && m.txt.length < 60).slice(0, 60);
    });
    menus.forEach(m => console.log(`   ${m.tag} · ${m.txt}${m.href ? ` → ${m.href}` : ''}`));

    // ─── 5. Capturar GraphQL: request body + response body ──
    const graphqlRecords: any[] = [];
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/api/graphql') && req.method() === 'POST') {
        const body = req.postData();
        graphqlRecords.push({ when: 'req', url: u, body });
      }
    });
    page.on('response', async (res) => {
      const u = res.url();
      if (u.includes('/api/graphql')) {
        try {
          const body = await res.text();
          graphqlRecords.push({ when: 'res', url: u, status: res.status(), body: body.slice(0, 4000) });
        } catch {}
      }
    });

    // ─── 6. Buscar por "a" no campo nome ───────────────────
    console.log('\n5. digitar "a" no campo nome + buscar...');
    await page.locator('input').first().fill('a');
    await sleep(500);
    await page.locator('button:has-text("Buscar cidadão")').click();
    await sleep(6000);
    await ss(page, '04-busca-letra-a');

    // ─── 7. Inspecionar resultados ─────────────────────────
    console.log('\n6. inspecionar lista após busca "a"...');
    const resultados = await page.evaluate(() => {
      // Procurar elementos com CPF (formato comum)
      const cpfRegex = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/;
      const all = Array.from(document.querySelectorAll('*'));
      const cpfsEls = all.filter(el => {
        const txt = (el as HTMLElement).innerText?.trim() ?? '';
        return cpfRegex.test(txt) && txt.length < 200;
      });

      // Procurar lista/tabela
      const possiveisTabelas = Array.from(document.querySelectorAll('table, [role="grid"], [role="list"], ul, [class*="list"], [class*="table"], [class*="result"]'));

      // Primeiro card "linha de paciente" — procurar elementos que contêm CPF + nome
      const linhasInfo = cpfsEls.slice(0, 3).map(el => {
        const e = el as HTMLElement;
        // Sobe até o ancestral "linha" (que contém um botão ou link clicável)
        let cur: HTMLElement | null = e;
        for (let i = 0; i < 10 && cur; i++) {
          if (cur.querySelector('button, a, [role="button"]')) break;
          cur = cur.parentElement;
        }
        return {
          textoLinha: cur?.innerText?.slice(0, 300),
          htmlLinha: cur?.outerHTML?.slice(0, 600),
        };
      });

      return {
        cpfsCount: cpfsEls.length,
        tabelasCount: possiveisTabelas.length,
        bodyTextSize: document.body.innerText.length,
        bodyPreview: document.body.innerText.slice(0, 800),
        primeiraLinhaPaciente: linhasInfo,
      };
    });

    console.log(JSON.stringify(resultados, null, 2));

    console.log('\n7. GraphQL trafego (request + response):');
    graphqlRecords.forEach((r, i) => {
      console.log(`\n   ── #${i} (${r.when}) ──`);
      if (r.body) console.log(r.body.slice(0, 1500));
    });

    // Salva tudo em arquivo pro próximo passo
    fs.writeFileSync(path.join(SS, 'graphql-records.json'), JSON.stringify(graphqlRecords, null, 2));
    console.log('\n📁 GraphQL records → ', path.join(SS, 'graphql-records.json'));

    console.log('\n📁 Screenshots em', SS);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
