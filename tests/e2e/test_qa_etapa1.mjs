import { chromium } from '../../frontend/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

(async () => {
	const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
	const browser = await chromium.launch({
		executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
		headless: true
	});
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await context.newPage();

	const baseUrl = 'https://unisism.vercel.app';
	const report = { stage: 'Etapa 1 - Perfil e Cargos por Face', success: false, checks: [] };

	try {
		console.log('1. Acessando https://unisism.vercel.app/login...');
		await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });

		console.log('2. Preenchendo credenciais (mateusvieira@gmail.com) e efetuando login...');
		await page.fill('#usuario, input[name="usuario"]', 'mateusvieira@gmail.com');
		await page.fill('#senha, input[name="senha"]', 'Aguasbelas#1');
		await page.click('button[type="submit"]');
		await page.waitForTimeout(4000);

		console.log('3. Acessando perfil SMS (/sms/perfil)...');
		await page.goto(`${baseUrl}/sms/perfil`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);

		const screenshotDir = path.resolve('tests/screenshots');
		if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa1_sms_perfil.png'), fullPage: true });

		const bodyText = await page.locator('body').innerText();

		const cargoMatch = bodyText.includes('Regulador(a) da SMS') || bodyText.includes('Regulador');
		const noCeoCargoInSms = !bodyText.includes('Regulador(a) do CEO');
		const noInvalidDate = !bodyText.includes('Invalid Date');
		const noNaN = !bodyText.includes('NaNa NaNm');

		console.log('--- RESULTADOS ETAPA 1 (SMS PERFIL) ---');
		console.log('Cargo exibido como Regulador(a) da SMS:', cargoMatch);
		console.log('Sem a string legada "Regulador(a) do CEO":', noCeoCargoInSms);
		console.log('Sem "Invalid Date":', noInvalidDate);
		console.log('Sem "NaNa NaNm":', noNaN);

		report.checks.push({
			name: 'Cargo SMS formatado dinamicamente (Regulador(a) da SMS)',
			passed: cargoMatch && noCeoCargoInSms,
			detail: bodyText
				.split('\n')
				.filter((l) => l.includes('Regulador') || l.includes('Cargo'))
				.join(' | ')
		});

		report.checks.push({
			name: 'Sem erros de parse de data (Invalid Date / NaN)',
			passed: noInvalidDate && noNaN,
			detail: bodyText
				.split('\n')
				.filter((l) => l.includes('Admissão') || l.includes('Tempo de Casa'))
				.join(' | ')
		});

		console.log('4. Acessando conta SMS (/sms/perfil/conta)...');
		await page.goto(`${baseUrl}/sms/perfil/conta`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(1500);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa1_sms_conta.png'), fullPage: true });

		const contaText = await page.locator('body').innerText();
		const contaNoInvalidDate = !contaText.includes('Invalid Date');
		const contaCargoMatch =
			contaText.includes('Regulador(a) da SMS') || !contaText.includes('Regulador(a) do CEO');

		report.checks.push({
			name: 'Página de Conta SMS sem datas nulas/inválidas e cargo correto',
			passed: contaNoInvalidDate && contaCargoMatch,
			detail: contaText
				.split('\n')
				.filter((l) => l.includes('Cargo') || l.includes('Admissão'))
				.join(' | ')
		});

		report.success = report.checks.every((c) => c.passed);
		console.log('\nRelatório Final Etapa 1:', JSON.stringify(report, null, 2));
	} catch (err) {
		console.error('Erro durante os testes de QA da Etapa 1:', err);
		report.error = err.message;
	} finally {
		await browser.close();
		fs.writeFileSync('tests/screenshots/qa_etapa1_report.json', JSON.stringify(report, null, 2));
	}
})();
