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
	const report = { stage: 'Etapa 3 - Rede, Pacientes & Relatórios', success: false, checks: [] };

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

		console.log('3. Acessando Rede UBS (/sms/rede/ubs)...');
		await page.goto(`${baseUrl}/sms/rede/ubs`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa3_rede_ubs.png'), fullPage: true });

		const ubsText = await page.locator('body').innerText();
		const temUbs = ubsText.includes('UNIDADES') || ubsText.includes('UBS') || ubsText.includes('REDE');
		const noInvalidDateUbs = !ubsText.includes('Invalid Date') && !ubsText.includes('NaNa');

		report.checks.push({
			name: 'Módulo de Gestão da Rede UBS (/sms/rede/ubs)',
			passed: temUbs && noInvalidDateUbs,
			detail: `Página renderizada: ${temUbs} | Sem Invalid Date: ${noInvalidDateUbs}`
		});

		console.log('4. Acessando Usuários da Rede (/sms/rede/usuarios)...');
		await page.goto(`${baseUrl}/sms/rede/usuarios`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa3_rede_usuarios.png'), fullPage: true });

		const usuariosText = await page.locator('body').innerText();
		const temUsuarios = usuariosText.includes('USUÁRIOS') || usuariosText.includes('OPERADORES') || usuariosText.includes('MATRÍCULA');
		const noInvalidDateUsers = !usuariosText.includes('Invalid Date') && !usuariosText.includes('NaNa');

		report.checks.push({
			name: 'Módulo de Usuários da Rede (/sms/rede/usuarios)',
			passed: temUsuarios && noInvalidDateUsers,
			detail: `Página renderizada: ${temUsuarios} | Sem Invalid Date: ${noInvalidDateUsers}`
		});

		console.log('5. Acessando Cadastro Geral de Pacientes (/sms/pacientes)...');
		await page.goto(`${baseUrl}/sms/pacientes`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa3_pacientes.png'), fullPage: true });

		const pacientesText = await page.locator('body').innerText();
		const temPacientes = pacientesText.includes('PACIENTES') || pacientesText.includes('CNS') || pacientesText.includes('CPF');
		const noInvalidDatePacientes = !pacientesText.includes('Invalid Date') && !pacientesText.includes('NaNa');

		report.checks.push({
			name: 'Módulo de Pacientes (/sms/pacientes)',
			passed: temPacientes && noInvalidDatePacientes,
			detail: `Página renderizada: ${temPacientes} | Sem Invalid Date: ${noInvalidDatePacientes}`
		});

		console.log('6. Acessando Relatórios & Inteligência (/sms/relatorios)...');
		await page.goto(`${baseUrl}/sms/relatorios`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa3_relatorios.png'), fullPage: true });

		const relatoriosText = await page.locator('body').innerText();
		const temRelatorios = relatoriosText.includes('RELATÓRIOS') || relatoriosText.includes('ANALYTICS') || relatoriosText.includes('PRODUÇÃO');
		const noInvalidDateRelatorios = !relatoriosText.includes('Invalid Date') && !relatoriosText.includes('NaNa');

		report.checks.push({
			name: 'Módulo de Relatórios & Analytics (/sms/relatorios)',
			passed: temRelatorios && noInvalidDateRelatorios,
			detail: `Página renderizada: ${temRelatorios} | Sem Invalid Date: ${noInvalidDateRelatorios}`
		});

		console.log('7. Acessando Configurações (/sms/configuracoes)...');
		await page.goto(`${baseUrl}/sms/configuracoes`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);
		await page.screenshot({ path: path.join(screenshotDir, 'qa_etapa3_configuracoes.png'), fullPage: true });

		const configText = await page.locator('body').innerText();
		const temConfig = configText.includes('CONFIGURAÇÃO') || configText.includes('PARÂMETROS') || configText.includes('INTEGRAÇÕES');
		const noInvalidDateConfig = !configText.includes('Invalid Date') && !configText.includes('NaNa');

		report.checks.push({
			name: 'Módulo de Configurações do Sistema (/sms/configuracoes)',
			passed: temConfig && noInvalidDateConfig,
			detail: `Página renderizada: ${temConfig} | Sem Invalid Date: ${noInvalidDateConfig}`
		});

		report.success = report.checks.every((c) => c.passed);
		console.log('\nRelatório Final Etapa 3:', JSON.stringify(report, null, 2));
	} catch (err) {
		console.error('Erro durante os testes de QA da Etapa 3:', err);
		report.error = err.message;
	} finally {
		await browser.close();
		fs.writeFileSync('tests/screenshots/qa_etapa3_report.json', JSON.stringify(report, null, 2));
	}
})();
