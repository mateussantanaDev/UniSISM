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
	const report = { stage: 'Subetapa 4.4 - Módulo TFD (Tratamento Fora do Domicílio)', success: false, checks: [] };

	try {
		console.log('1. Acessando https://unisism.vercel.app/login...');
		await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });

		console.log('2. Efetuando login...');
		await page.fill('#usuario, input[name="usuario"]', 'mateusvieira@gmail.com');
		await page.fill('#senha, input[name="senha"]', 'Aguasbelas#1');
		await page.click('button[type="submit"]');
		await page.waitForTimeout(4000);

		const screenshotDir = path.resolve('tests/screenshots');
		if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

		console.log('3. Acessando Dashboard Logístico TFD (/tfd/dashboard)...');
		await page.goto(`${baseUrl}/tfd/dashboard`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_tfd_dashboard.png'), fullPage: true });

		const tfdText = await page.locator('body').innerText();
		const temTfd = tfdText.includes('TFD') || tfdText.includes('TRATAMENTO FORA DO DOMICÍLIO') || tfdText.includes('VIAGENS') || tfdText.includes('LOGÍSTICA');
		const noInvalidDateTfd = !tfdText.includes('Invalid Date') && !tfdText.includes('NaNa');

		report.checks.push({
			name: 'Dashboard Logístico TFD (/tfd/dashboard)',
			passed: temTfd && noInvalidDateTfd,
			detail: `Página renderizada: ${temTfd} | Sem Invalid Date: ${noInvalidDateTfd}`
		});

		console.log('4. Acessando Solicitações de TFD (/tfd/solicitacoes)...');
		await page.goto(`${baseUrl}/tfd/solicitacoes`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_tfd_solicitacoes.png'), fullPage: true });

		const solText = await page.locator('body').innerText();
		const temSol = solText.includes('SOLICITAÇÕES') || solText.includes('PEDIDOS') || solText.includes('PACIENTE');
		const noInvalidDateSol = !solText.includes('Invalid Date') && !solText.includes('NaNa');

		report.checks.push({
			name: 'Solicitações de Deslocamento TFD (/tfd/solicitacoes)',
			passed: temSol && noInvalidDateSol,
			detail: `Solicitações TFD carregadas com sucesso: ${temSol}`
		});

		console.log('5. Acessando Escala de Viagens TFD (/tfd/viagens)...');
		await page.goto(`${baseUrl}/tfd/viagens`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_tfd_viagens.png'), fullPage: true });

		const viagText = await page.locator('body').innerText();
		const temViag = viagText.includes('VIAGENS') || viagText.includes('ESCALA') || viagText.includes('DESTINO');
		const noInvalidDateViag = !viagText.includes('Invalid Date') && !viagText.includes('NaNa');

		report.checks.push({
			name: 'Escala de Viagens Intermunicipais TFD (/tfd/viagens)',
			passed: temViag && noInvalidDateViag,
			detail: `Escala de viagens renderizada: ${temViag}`
		});

		console.log('6. Acessando Gestão da Frota (/tfd/frota)...');
		await page.goto(`${baseUrl}/tfd/frota`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_tfd_frota.png'), fullPage: true });

		const frotaText = await page.locator('body').innerText();
		const temFrota = frotaText.includes('FROTA') || frotaText.includes('VEÍCULOS') || frotaText.includes('PLACA');
		const noInvalidDateFrota = !frotaText.includes('Invalid Date') && !frotaText.includes('NaNa');

		report.checks.push({
			name: 'Gestão da Frota de Veículos (/tfd/frota)',
			passed: temFrota && noInvalidDateFrota,
			detail: `Módulo da frota de veículos renderizado: ${temFrota}`
		});

		console.log('7. Acessando Quadro de Motoristas (/tfd/motoristas)...');
		await page.goto(`${baseUrl}/tfd/motoristas`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_tfd_motoristas.png'), fullPage: true });

		const motText = await page.locator('body').innerText();
		const temMot = motText.includes('MOTORISTAS') || motText.includes('CONDUTORES') || motText.includes('CNH');
		const noInvalidDateMot = !motText.includes('Invalid Date') && !motText.includes('NaNa');

		report.checks.push({
			name: 'Quadro de Motoristas TFD (/tfd/motoristas)',
			passed: temMot && noInvalidDateMot,
			detail: `Cadastro de motoristas renderizado: ${temMot}`
		});

		console.log('8. Acessando Ajuda de Custo TFD (/tfd/ajuda-custo)...');
		await page.goto(`${baseUrl}/tfd/ajuda-custo`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_tfd_ajuda_custo.png'), fullPage: true });

		const custoText = await page.locator('body').innerText();
		const temCusto = custoText.includes('AJUDA DE CUSTO') || custoText.includes('PAGAMENTOS') || custoText.includes('SALDO') || custoText.includes('VALOR');
		const noInvalidDateCusto = !custoText.includes('Invalid Date') && !custoText.includes('NaNa');

		report.checks.push({
			name: 'Gestão de Ajuda de Custo e Diárias (/tfd/ajuda-custo)',
			passed: temCusto && noInvalidDateCusto,
			detail: `Gestão de ajuda de custo renderizada: ${temCusto}`
		});

		report.success = report.checks.every((c) => c.passed);
		console.log('\nRelatório Final Subetapa 4.4:', JSON.stringify(report, null, 2));
	} catch (err) {
		console.error('Erro durante os testes de QA da Subetapa 4.4:', err);
		report.error = err.message;
	} finally {
		await browser.close();
		fs.writeFileSync('tests/screenshots/qa_etapa4_tfd_report.json', JSON.stringify(report, null, 2));
	}
})();
