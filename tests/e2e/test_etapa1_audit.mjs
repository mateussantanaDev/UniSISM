import { chromium } from '../../frontend/node_modules/playwright/index.mjs';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://unisism.vercel.app';
const SCREENSHOT_DIR = path.resolve('tests/screenshots');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!fs.existsSync(SCREENSHOT_DIR)) {
	fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runAudit() {
	console.log('🚀 Iniciando Auditoria Etapa 1 na URL:', BASE_URL);
	const browser = await chromium.launch({
		executablePath: CHROME_PATH,
		headless: true
	});
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await context.newPage();

	const report = {
		timestamp: new Date().toISOString(),
		targetUrl: BASE_URL,
		loginResult: {},
		smsDashboardLeak: {},
		smsSolicitacoesLeak: {},
		novoUsuarioForm: {}
	};

	try {
		// 1. LOGIN
		console.log('1. Acessando /login...');
		await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
		await page.fill('#usuario, input[name="usuario"]', 'mateusvieira@gmail.com');
		await page.fill('#senha, input[name="senha"]', 'Aguasbelas#1');
		
		console.log('   Enviando credenciais...');
		await Promise.all([
			page.click('button[type="submit"]'),
			page.waitForTimeout(4000)
		]);

		const postLoginUrl = page.url();
		console.log('📌 URL pós-login:', postLoginUrl);
		await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'etapa1_01_pos_login.png'), fullPage: true });

		report.loginResult = {
			email: 'mateusvieira@gmail.com',
			postLoginUrl,
			landedOnCeo: postLoginUrl.includes('/ceo') || postLoginUrl.includes('/centro')
		};

		// 2. INSPEÇÃO DO DASHBOARD SMS
		console.log('2. Navegando diretamente para /sms/dashboard...');
		await page.goto(`${BASE_URL}/sms/dashboard`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(3000);
		await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'etapa1_02_sms_dashboard.png'), fullPage: true });

		const dashboardText = await page.innerText('body');

		report.smsDashboardLeak = {
			url: page.url(),
			containsEncaminhamentosText: dashboardText.includes('Encaminhamento') || dashboardText.includes('Ecocardiograma') || dashboardText.includes('CEM'),
			pageTitle: await page.title()
		};

		// 3. INSPEÇÃO DAS SOLICITAÇÕES DA SMS
		console.log('3. Navegando para /sms/solicitacoes...');
		await page.goto(`${BASE_URL}/sms/solicitacoes`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(3000);
		await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'etapa1_03_sms_solicitacoes.png'), fullPage: true });

		const solicitacoesText = await page.innerText('body');
		const tabelaLinhas = await page.evaluate(() => {
			const rows = Array.from(document.querySelectorAll('table tr, .border, [role="row"]'));
			return rows.map(r => r.textContent ? r.textContent.replace(/\s+/g, ' ').trim() : '').filter(t => t && t.length > 10);
		});

		report.smsSolicitacoesLeak = {
			url: page.url(),
			totalLinhasIdentificadas: tabelaLinhas.length,
			amostraLinhas: tabelaLinhas.slice(0, 10),
			contemCEM: solicitacoesText.includes('CEM') || solicitacoesText.includes('Ecocardiograma') || solicitacoesText.includes('Balcão')
		};

		// 4. INSPEÇÃO DO FORMULÁRIO DE NOVO USUÁRIO
		console.log('4. Navegando para /sms/rede/usuarios/novo...');
		await page.goto(`${BASE_URL}/sms/rede/usuarios/novo`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(3000);
		await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'etapa1_04_sms_novo_usuario.png'), fullPage: true });

		const selectTipoUnidadeVal = await page.evaluate(() => {
			const el = document.querySelector('#tipoUnidade');
			return el ? el.value : null;
		});

		const selectRoleVal = await page.evaluate(() => {
			const el = document.querySelector('#role');
			return el ? el.value : null;
		});

		const optionsRole = await page.evaluate(() => {
			const el = document.querySelector('#role');
			return el ? Array.from(el.options).map(o => ({ value: o.value, text: o.text })) : [];
		});

		report.novoUsuarioForm = {
			url: page.url(),
			tipoUnidadeDefault: selectTipoUnidadeVal,
			roleDefault: selectRoleVal,
			opcoesRole: optionsRole
		};

		fs.writeFileSync(
			path.join(SCREENSHOT_DIR, 'etapa1_audit_report.json'),
			JSON.stringify(report, null, 2)
		);

		console.log('✅ Auditoria concluída com sucesso! Relatório gerado em tests/screenshots/etapa1_audit_report.json');

	} catch (err) {
		console.error('❌ Erro durante auditoria Playwright:', err);
	} finally {
		await browser.close();
	}
}

runAudit();
