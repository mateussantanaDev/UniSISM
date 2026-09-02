import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = '/Users/mateusvieira/.gemini/antigravity-cli/brain/919594da-d5f8-4d01-a323-8daf3d69fb57';

async function main() {
  console.log('🚀 Iniciando Playwright E2E em https://unisism.vercel.app...');
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('  [BROWSER CONSOLE]', msg.type(), msg.text()));
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/pacientes')) {
      console.log(`  [HTTP ${res.status()}] ${url}`);
      try {
        const text = await res.text();
        console.log(`  [BODY PREVIEW] ${text.slice(0, 300)}...`);
      } catch {}
    }
  });

  try {
    // 1. Login
    console.log('\n1. Acessando tela de login...');
    await page.goto('https://unisism.vercel.app/login', { waitUntil: 'networkidle', timeout: 30000 });
    
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="cpf" i]', 'mateushenrivieira@gmail.com');
    await page.fill('input[type="password"]', 'Aguasbelas#1');
    await page.click('button[type="submit"], button:has-text("Entrar"), button:has-text("Acessar")');

    console.log('2. Aguardando autenticação e redirecionamento...');
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });
    console.log(`✓ Logado! URL atual: ${page.url()}`);
    await page.waitForTimeout(2000);

    // 2. Acessar /ubs/pacientes
    console.log('\n3. Navegando para /ubs/pacientes...');
    await page.goto('https://unisism.vercel.app/ubs/pacientes', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const ssUbs = path.join(ARTIFACT_DIR, 'pacientes_ubs.png');
    await page.screenshot({ path: ssUbs, fullPage: true });
    console.log(`📸 Screenshot salvo em: ${ssUbs}`);

    // Extrair dados da tela /ubs/pacientes
    const ubsData = await page.evaluate(() => {
      const metricCards = Array.from(document.querySelectorAll('[class*="metric"], [class*="MetricCard"], [class*="grid-cols"] > div')).map(e => e.textContent?.trim()?.replace(/\s+/g, ' '));
      const panelHeaderText = document.querySelector('header, [class*="PanelHeader"]')?.textContent?.trim();
      const rows = Array.from(document.querySelectorAll('tbody tr')).map(r => Array.from(r.querySelectorAll('td')).map(td => td.textContent?.trim()).join(' | '));
      const paginationText = document.querySelector('[class*="justify-between"], [class*="pagination"]')?.textContent?.trim()?.replace(/\s+/g, ' ');
      const paginationButtons = Array.from(document.querySelectorAll('button')).map(b => ({ text: b.textContent?.trim(), disabled: b.disabled }));

      return {
        metricCards: metricCards.slice(0, 5),
        panelHeaderText,
        rowCount: rows.length,
        firstThreeRows: rows.slice(0, 3),
        paginationText,
        buttons: paginationButtons.filter(b => ['«', '‹ Anterior', 'Próxima ›', '»'].some(t => b.text?.includes(t)))
      };
    });

    console.log('\n=== DADOS UBS PACIENTES ===');
    console.log(JSON.stringify(ubsData, null, 2));

    // 3. Acessar /sms/pacientes
    console.log('\n4. Navegando para /sms/pacientes...');
    await page.goto('https://unisism.vercel.app/sms/pacientes', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const ssSms = path.join(ARTIFACT_DIR, 'pacientes_sms.png');
    await page.screenshot({ path: ssSms, fullPage: true });
    console.log(`📸 Screenshot salvo em: ${ssSms}`);

    const smsData = await page.evaluate(() => {
      const metricCards = Array.from(document.querySelectorAll('[class*="metric"], [class*="MetricCard"], [class*="grid-cols"] > div')).map(e => e.textContent?.trim()?.replace(/\s+/g, ' '));
      const rows = Array.from(document.querySelectorAll('tbody tr')).map(r => Array.from(r.querySelectorAll('td')).map(td => td.textContent?.trim()).join(' | '));
      const paginationText = document.querySelector('[class*="justify-between"], [class*="pagination"]')?.textContent?.trim()?.replace(/\s+/g, ' ');
      const paginationButtons = Array.from(document.querySelectorAll('button')).map(b => ({ text: b.textContent?.trim(), disabled: b.disabled }));

      return {
        metricCards: metricCards.slice(0, 5),
        rowCount: rows.length,
        firstThreeRows: rows.slice(0, 3),
        paginationText,
        buttons: paginationButtons.filter(b => ['«', '‹ Anterior', 'Próxima ›', '»'].some(t => b.text?.includes(t)))
      };
    });

    console.log('\n=== DADOS SMS PACIENTES ===');
    console.log(JSON.stringify(smsData, null, 2));

    // 4. Testar Busca por "MARIA"
    console.log('\n5. Testando busca por "MARIA"...');
    const searchInput = page.locator('#busca, input[placeholder*="Buscar" i]');
    if (await searchInput.count() > 0) {
      await searchInput.fill('MARIA');
      await page.waitForTimeout(2000);
      const rowsSearch = await page.evaluate(() => Array.from(document.querySelectorAll('tbody tr')).map(r => Array.from(r.querySelectorAll('td')).map(td => td.textContent?.trim()).join(' | ')));
      console.log(`Resultados da busca ("MARIA"): ${rowsSearch.length} linhas`);
      console.log('Primeiros resultados:', rowsSearch.slice(0, 3));
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'pacientes_busca_maria.png'), fullPage: true });
    }

    // 5. Testar clique em Próxima Página
    console.log('\n6. Testando clique em "Próxima ›"...');
    const nextBtn = page.locator('button:has-text("Próxima")');
    if (await nextBtn.count() > 0 && !(await nextBtn.isDisabled())) {
      await nextBtn.click();
      await page.waitForTimeout(2000);
      const rowsPage2 = await page.evaluate(() => Array.from(document.querySelectorAll('tbody tr')).map(r => Array.from(r.querySelectorAll('td')).map(td => td.textContent?.trim()).join(' | ')));
      console.log('Resultados da Página 2:', rowsPage2.slice(0, 3));
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'pacientes_pagina_2.png'), fullPage: true });
    } else {
      console.log('Botão Próxima página estava desabilitado ou não encontrado.');
    }

  } catch (err) {
    console.error('Erro durante execução do teste:', err);
  } finally {
    await browser.close();
  }
}

main();
