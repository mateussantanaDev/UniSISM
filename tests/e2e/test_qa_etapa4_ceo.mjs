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
	const report = { stage: 'Subetapa 4.2 - Face CEO (Centro Odontológico Especializado)', success: false, checks: [] };

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

		console.log('3. Acessando Dashboard Principal CEO (/ceo)...');
		await page.goto(`${baseUrl}/ceo`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_ceo_dashboard.png'), fullPage: true });

		const ceoText = await page.locator('body').innerText();
		const temCeo = ceoText.includes('CEO') || ceoText.includes('CENTRO ODONTOLÓGICO') || ceoText.includes('OPERAÇÃO') || ceoText.includes('BALCÃO');
		const noInvalidDateCeo = !ceoText.includes('Invalid Date') && !ceoText.includes('NaNa');

		report.checks.push({
			name: 'Dashboard Principal CEO (/ceo)',
			passed: temCeo && noInvalidDateCeo,
			detail: `Página renderizada: ${temCeo} | Sem Invalid Date: ${noInvalidDateCeo}`
		});

		console.log('4. Acessando Balcão de Recepção do CEO (/centro/recepcao/balcao)...');
		await page.goto(`${baseUrl}/centro/recepcao/balcao`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_ceo_balcao.png'), fullPage: true });

		const balcaoText = await page.locator('body').innerText();
		const temBalcao = balcaoText.includes('BALCÃO') || balcaoText.includes('RECEPÇÃO') || balcaoText.includes('CHECK-IN') || balcaoText.includes('PACIENTES');
		const noInvalidDateBalcao = !balcaoText.includes('Invalid Date') && !balcaoText.includes('NaNa');

		report.checks.push({
			name: 'Balcão de Recepção Especializada (/centro/recepcao/balcao)',
			passed: temBalcao && noInvalidDateBalcao,
			detail: `Balcão de Recepção CEO carregado com sucesso: ${temBalcao}`
		});

		console.log('5. Acessando Agenda de Especialistas CEO (/centro/recepcao/agenda)...');
		await page.goto(`${baseUrl}/centro/recepcao/agenda`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_ceo_agenda.png'), fullPage: true });

		const agendaText = await page.locator('body').innerText();
		const temAgenda = agendaText.includes('AGENDA') || agendaText.includes('HORÁRIOS') || agendaText.includes('ESPECIALISTA');
		const noInvalidDateAgenda = !agendaText.includes('Invalid Date') && !agendaText.includes('NaNa');

		report.checks.push({
			name: 'Agenda & Escala de Atendimentos (/centro/recepcao/agenda)',
			passed: temAgenda && noInvalidDateAgenda,
			detail: `Agenda do CEO renderizada com sucesso: ${temAgenda}`
		});

		console.log('6. Acessando Gestão de Vagas por Especialidade (/centro/gestao/vagas)...');
		await page.goto(`${baseUrl}/centro/gestao/vagas`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_ceo_vagas.png'), fullPage: true });

		const vagasText = await page.locator('body').innerText();
		const temVagas = vagasText.includes('VAGAS') || vagasText.includes('OFERTA') || vagasText.includes('ESPECIALIDADES');
		const noInvalidDateVagas = !vagasText.includes('Invalid Date') && !vagasText.includes('NaNa');

		report.checks.push({
			name: 'Gestão e Distribuição de Vagas (/centro/gestao/vagas)',
			passed: temVagas && noInvalidDateVagas,
			detail: `Módulo de gestão de vagas renderizado: ${temVagas}`
		});

		console.log('7. Acessando Auditoria do Centro (/centro/gestao/auditoria)...');
		await page.goto(`${baseUrl}/centro/gestao/auditoria`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_ceo_auditoria.png'), fullPage: true });

		const auditoriaText = await page.locator('body').innerText();
		const temAuditoria = auditoriaText.includes('AUDITORIA') || auditoriaText.includes('LOGS') || auditoriaText.includes('DECISÕES');
		const noInvalidDateAuditoria = !auditoriaText.includes('Invalid Date') && !auditoriaText.includes('NaNa');

		report.checks.push({
			name: 'Trilha de Auditoria e Decisões (/centro/gestao/auditoria)',
			passed: temAuditoria && noInvalidDateAuditoria,
			detail: `Módulo de auditoria do centro renderizado: ${temAuditoria}`
		});

		report.success = report.checks.every((c) => c.passed);
		console.log('\nRelatório Final Subetapa 4.2:', JSON.stringify(report, null, 2));
	} catch (err) {
		console.error('Erro durante os testes de QA da Subetapa 4.2:', err);
		report.error = err.message;
	} finally {
		await browser.close();
		fs.writeFileSync('tests/screenshots/qa_etapa4_ceo_report.json', JSON.stringify(report, null, 2));
	}
})();
