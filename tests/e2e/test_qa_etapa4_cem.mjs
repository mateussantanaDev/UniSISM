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
	const report = { stage: 'Subetapa 4.3 - Face CEM (Centro de Especialidades Médicas)', success: false, checks: [] };

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

		console.log('3. Acessando Dashboard Principal CEM (/cem)...');
		await page.goto(`${baseUrl}/cem`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_cem_dashboard.png'), fullPage: true });

		const cemText = await page.locator('body').innerText();
		const temCem = cemText.includes('CEM') || cemText.includes('ESPECIALIDADES') || cemText.includes('OPERAÇÃO') || cemText.includes('CENTRO MÉDICO');
		const noInvalidDateCem = !cemText.includes('Invalid Date') && !cemText.includes('NaNa');

		report.checks.push({
			name: 'Dashboard Principal CEM (/cem)',
			passed: temCem && noInvalidDateCem,
			detail: `Página renderizada: ${temCem} | Sem Invalid Date: ${noInvalidDateCem}`
		});

		console.log('4. Acessando Balcão de Recepção Médica do CEM (/cem/recepcao/balcao)...');
		await page.goto(`${baseUrl}/cem/recepcao/balcao`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_cem_balcao.png'), fullPage: true });

		const balcaoText = await page.locator('body').innerText();
		const temBalcao = balcaoText.includes('BALCÃO') || balcaoText.includes('RECEPÇÃO') || balcaoText.includes('CHECK-IN') || balcaoText.includes('ATENDIMENTO');
		const noInvalidDateBalcao = !balcaoText.includes('Invalid Date') && !balcaoText.includes('NaNa');

		report.checks.push({
			name: 'Recepção e Check-in do CEM (/cem/recepcao/balcao)',
			passed: temBalcao && noInvalidDateBalcao,
			detail: `Balcão de Recepção CEM carregado com sucesso: ${temBalcao}`
		});

		console.log('5. Acessando Triagem de Enfermagem CEM (/cem/enfermagem/triagem)...');
		await page.goto(`${baseUrl}/cem/enfermagem/triagem`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_cem_enfermagem.png'), fullPage: true });

		const enfText = await page.locator('body').innerText();
		const temEnf = enfText.includes('ENFERMAGEM') || enfText.includes('TRIAGEM') || enfText.includes('SINAIS VITAIS');
		const noInvalidDateEnf = !enfText.includes('Invalid Date') && !enfText.includes('NaNa');

		report.checks.push({
			name: 'Módulo de Triagem & Enfermagem (/cem/enfermagem)',
			passed: temEnf && noInvalidDateEnf,
			detail: `Triagem de enfermagem renderizada: ${temEnf}`
		});

		console.log('6. Acessando Consultório / Agenda Médica CEM (/cem/medico/agenda)...');
		await page.goto(`${baseUrl}/cem/medico/agenda`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_cem_medico.png'), fullPage: true });

		const medText = await page.locator('body').innerText();
		const temMed = medText.includes('MÉDICO') || medText.includes('CONSULTÓRIO') || medText.includes('AGENDA') || medText.includes('PRONTUÁRIO');
		const noInvalidDateMed = !medText.includes('Invalid Date') && !medText.includes('NaNa');

		report.checks.push({
			name: 'Consultório Médico & Agenda do Especialista (/cem/medico/agenda)',
			passed: temMed && noInvalidDateMed,
			detail: `Painel do médico especialista renderizado: ${temMed}`
		});

		console.log('7. Acessando Gestão de Especialidades Médicas (/cem/gestao/especialidades)...');
		await page.goto(`${baseUrl}/cem/gestao/especialidades`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_cem_especialidades.png'), fullPage: true });

		const espText = await page.locator('body').innerText();
		const temEsp = espText.includes('ESPECIALIDADES') || espText.includes('MÉDICAS') || espText.includes('CATÁLOGO');
		const noInvalidDateEsp = !espText.includes('Invalid Date') && !espText.includes('NaNa');

		report.checks.push({
			name: 'Gestão do Catálogo de Especialidades Médicas (/cem/gestao/especialidades)',
			passed: temEsp && noInvalidDateEsp,
			detail: `Gestão de especialidades médicas renderizada: ${temEsp}`
		});

		report.success = report.checks.every((c) => c.passed);
		console.log('\nRelatório Final Subetapa 4.3:', JSON.stringify(report, null, 2));
	} catch (err) {
		console.error('Erro durante os testes de QA da Subetapa 4.3:', err);
		report.error = err.message;
	} finally {
		await browser.close();
		fs.writeFileSync('tests/screenshots/qa_etapa4_cem_report.json', JSON.stringify(report, null, 2));
	}
})();
