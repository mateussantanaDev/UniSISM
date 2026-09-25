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
	const report = { stage: 'Subetapa 4.1 - Face UBS (Unidade Básica de Saúde)', success: false, checks: [] };

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

		console.log('3. Acessando Perfil UBS (/ubs/perfil)...');
		await page.goto(`${baseUrl}/ubs/perfil`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_ubs_perfil.png'), fullPage: true });

		const perfilUbsText = await page.locator('body').innerText();
		const temPerfilUbs = perfilUbsText.includes('PERFIL DO OPERADOR') || perfilUbsText.includes('IDENTIDADE') || perfilUbsText.includes('UBS');
		const noInvalidDatePerfil = !perfilUbsText.includes('Invalid Date') && !perfilUbsText.includes('NaNa');

		report.checks.push({
			name: 'Perfil do Operador na Face UBS (/ubs/perfil)',
			passed: temPerfilUbs && noInvalidDatePerfil,
			detail: `Página renderizada: ${temPerfilUbs} | Sem Invalid Date: ${noInvalidDatePerfil}`
		});

		console.log('4. Acessando Conta na Face UBS (/ubs/perfil/conta)...');
		await page.goto(`${baseUrl}/ubs/perfil/conta`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_ubs_conta.png'), fullPage: true });

		const contaUbsText = await page.locator('body').innerText();
		const noInvalidDateConta = !contaUbsText.includes('Invalid Date') && !contaUbsText.includes('NaNa');

		report.checks.push({
			name: 'Conta do Operador na Face UBS (/ubs/perfil/conta)',
			passed: noInvalidDateConta,
			detail: `Página de Conta UBS renderizada sem exceções de data`
		});

		console.log('5. Acessando Recepção / Fila da UBS (/ubs/recepcao/fila)...');
		await page.goto(`${baseUrl}/ubs/recepcao/fila`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_ubs_recepcao_fila.png'), fullPage: true });

		const recepcaoText = await page.locator('body').innerText();
		const temRecepcao = recepcaoText.includes('RECEPÇÃO') || recepcaoText.includes('FILA') || recepcaoText.includes('ATENDIMENTO');
		const noInvalidDateRecepcao = !recepcaoText.includes('Invalid Date') && !recepcaoText.includes('NaNa');

		report.checks.push({
			name: 'Fila da Recepção da UBS (/ubs/recepcao/fila)',
			passed: temRecepcao && noInvalidDateRecepcao,
			detail: `Fila de Recepção UBS carregada com sucesso: ${temRecepcao}`
		});

		console.log('6. Acessando Pacientes UBS (/ubs/pacientes)...');
		await page.goto(`${baseUrl}/ubs/pacientes`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_ubs_pacientes.png'), fullPage: true });

		const pacientesText = await page.locator('body').innerText();
		const temPacientes = pacientesText.includes('PACIENTES') || pacientesText.includes('CADASTRO') || pacientesText.includes('BUSCA');
		const noInvalidDatePacientes = !pacientesText.includes('Invalid Date') && !pacientesText.includes('NaNa');

		report.checks.push({
			name: 'Lista de Pacientes da UBS (/ubs/pacientes)',
			passed: temPacientes && noInvalidDatePacientes,
			detail: `Lista de pacientes da UBS renderizada: ${temPacientes}`
		});

		console.log('7. Acessando Respostas da SMS na UBS (/ubs/respostas-sms)...');
		await page.goto(`${baseUrl}/ubs/respostas-sms`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa4_ubs_respostas.png'), fullPage: true });

		const respostasText = await page.locator('body').innerText();
		const temRespostas = respostasText.includes('RESPOSTAS') || respostasText.includes('REGULAÇÃO') || respostasText.includes('ENVIADOS');
		const noInvalidDateRespostas = !respostasText.includes('Invalid Date') && !respostasText.includes('NaNa');

		report.checks.push({
			name: 'Central de Respostas da SMS na UBS (/ubs/respostas-sms)',
			passed: temRespostas && noInvalidDateRespostas,
			detail: `Respostas da SMS na UBS renderizadas: ${temRespostas}`
		});

		report.success = report.checks.every((c) => c.passed);
		console.log('\nRelatório Final Subetapa 4.1:', JSON.stringify(report, null, 2));
	} catch (err) {
		console.error('Erro durante os testes de QA da Subetapa 4.1:', err);
		report.error = err.message;
	} finally {
		await browser.close();
		fs.writeFileSync('tests/screenshots/qa_etapa4_ubs_report.json', JSON.stringify(report, null, 2));
	}
})();
