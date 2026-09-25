import { chromium } from '../../frontend/node_modules/playwright/index.mjs';
import * as path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function debugLogin() {
	console.log('🔍 Debugando formulário de login em https://unisism.vercel.app/login...');
	const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
	const page = await browser.newPage();

	try {
		await page.goto('https://unisism.vercel.app/login', { waitUntil: 'load', timeout: 15000 });
		await page.waitForTimeout(2000);

		console.log('📌 URL Atual:', page.url());
		await page.screenshot({ path: 'tests/screenshots/debug_login.png', fullPage: true });

		const inputs = await page.evaluate(() => {
			return Array.from(document.querySelectorAll('input, button, form')).map(el => ({
				tag: el.tagName,
				type: el.getAttribute('type'),
				id: el.id,
				name: el.getAttribute('name'),
				placeholder: el.getAttribute('placeholder'),
				class: el.className
			}));
		});

		console.log('📋 Elementos encontrados:', JSON.stringify(inputs, null, 2));
	} catch (e) {
		console.error('❌ Erro no debug:', e);
	} finally {
		await browser.close();
	}
}

debugLogin();
