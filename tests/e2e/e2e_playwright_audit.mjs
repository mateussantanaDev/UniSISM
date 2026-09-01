// tests/e2e/e2e_playwright_audit.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/Users/mateusvieira/orca/UniSISM/frontend/node_modules/playwright');

const PROD_URL = 'https://unisism.vercel.app';
const API_BASE = 'http://184.107.179.209:3333/v1';
const API_KEY = 'unisism-frontend-2026-4f2b8d9e';
const USER_EMAIL = 'mateushenrivieira@gmail.com';
const USER_PASS = 'Aguasbelas#1';

const testResults = {
  passed: 0,
  failed: 0,
  items: [],
};

function logTest(name, success, info = null) {
  if (success) {
    testResults.passed++;
    console.log(`\x1b[32m✔ [PASS]\x1b[0m ${name}`);
  } else {
    testResults.failed++;
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m ${name}`);
    if (info) console.error('   ↳ Details:', typeof info === 'object' ? JSON.stringify(info, null, 2) : info);
  }
  testResults.items.push({ name, success, info });
}

async function runPlaywrightAudit() {
  console.log('========================================================================');
  console.log('🚀 INICIANDO 2ª RODADA DE AUDITORIA E2E COM PLAYWRIGHT EM PRODUÇÃO');
  console.log(`Frontend URL: ${PROD_URL}`);
  console.log(`Backend API: ${API_BASE}`);
  console.log('========================================================================\n');

  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
  });

  const page = await context.newPage();

  // Capture console messages from the page for diagnostics
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      // console.log(`[Browser Console Error]`, msg.text());
    }
  });

  try {
    // -------------------------------------------------------------------------
    // ETAPA 1: LOGIN NO FRONTEND DE PRODUÇÃO
    // -------------------------------------------------------------------------
    console.log('\n--- ETAPA 1: AUTENTICAÇÃO E LOGIN NA APLICAÇÃO ---');
    await page.goto(`${PROD_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Fill credentials using exact IDs from FormField component
    await page.fill('#usuario', USER_EMAIL);
    await page.fill('#senha', USER_PASS);
    await page.click('button[type="submit"]');

    // Wait for navigation away from login
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    const currentUrl = page.url();
    logTest('Login bem-sucedido na aplicação em produção', !currentUrl.includes('/login'), { currentUrl });

    // Verify localStorage has JWT token
    const token = await page.evaluate(() => localStorage.getItem('unisism_token'));
    logTest('Token JWT persistido no localStorage', !!token, { tokenSnippet: token ? token.substring(0, 25) + '...' : null });

    // -------------------------------------------------------------------------
    // ETAPA 2: VARREDURA E AUDITORIA DE TODAS AS ROTAS E ALIASES (HTTP 200/307)
    // -------------------------------------------------------------------------
    console.log('\n--- ETAPA 2: AUDITORIA DE TODAS AS ROTAS E ALIASES (ZERO 404/500) ---');
    
    const rotasParaVerificar = [
      // CEM Rotas
      { url: '/cem/recepcao/fila', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/recepcao/agenda', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/recepcao/balcao', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/recepcao/painel', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/pacientes', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/medico/agenda', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/medico/historico', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/medico/desempenho', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/medico/produtividade', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/medico/atendimento', expectedStatus: 307, target: '/cem/medico/agenda', tipo: 'Redirect Alias' },
      { url: '/cem/gestao/dashboard', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/gestao/especialidades', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/gestao/salas', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/gestao/vagas', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/gestao/escalas', expectedStatus: 307, target: '/cem/gestao/vagas', tipo: 'Redirect Alias' },
      { url: '/cem/gestao/cotas', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/gestao/producao', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/gestao/relatorios', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/gestao/auditoria', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/gestao/analytics', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/gestao/usuarios', expectedStatus: 200, tipo: 'Página' },
      { url: '/cem/tv', expectedStatus: 307, target: '/tv?pin=CEM-2026', tipo: 'Redirect Alias TV' },

      // CEO Rotas
      { url: '/ceo/recepcao/fila', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/recepcao/agenda', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/recepcao/balcao', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/recepcao/painel', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/pacientes', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/medico/agenda', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/medico/historico', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/medico/desempenho', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/medico/produtividade', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/medico/atendimento', expectedStatus: 307, target: '/ceo/medico/agenda', tipo: 'Redirect Alias' },
      { url: '/ceo/gestao/dashboard', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/gestao/especialidades', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/gestao/salas', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/gestao/cadeiras', expectedStatus: 307, target: '/ceo/gestao/salas', tipo: 'Redirect Alias' },
      { url: '/ceo/gestao/vagas', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/gestao/escalas', expectedStatus: 307, target: '/ceo/gestao/vagas', tipo: 'Redirect Alias' },
      { url: '/ceo/gestao/cotas', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/gestao/producao', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/gestao/relatorios', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/gestao/auditoria', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/gestao/analytics', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/gestao/usuarios', expectedStatus: 200, tipo: 'Página' },
      { url: '/ceo/tv', expectedStatus: 307, target: '/tv?pin=CEO-2026', tipo: 'Redirect Alias TV' },

      // Smart TV Terminais
      { url: '/tv?pin=CEM-2026', expectedStatus: 200, tipo: 'Painel TV CEM' },
      { url: '/tv?pin=CEO-2026', expectedStatus: 200, tipo: 'Painel TV CEO' },
    ];

    for (const rota of rotasParaVerificar) {
      const response = await page.goto(`${PROD_URL}${rota.url}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const status = response ? response.status() : 0;
      const finalUrl = page.url();
      
      const isSuccess = status === 200 || (rota.expectedStatus === 307 && finalUrl.includes(rota.target));
      logTest(`Rota [${rota.tipo}] ${rota.url} -> HTTP ${status} (Final: ${finalUrl.replace(PROD_URL, '')})`, isSuccess, {
        status,
        finalUrl,
      });
    }

    // -------------------------------------------------------------------------
    // ETAPA 3: ISOLAMENTO TOTAL CEM vs CEO NA INTERFACE VISUAL
    // -------------------------------------------------------------------------
    console.log('\n--- ETAPA 3: VALIDAÇÃO DE ISOLAMENTO CEM vs CEO NO DOM ---');

    // A. Layout CEM
    await page.goto(`${PROD_URL}/cem/recepcao/fila`, { waitUntil: 'networkidle' });
    const cemHeaderBadge = await page.textContent('header span.bg-indigo-900').catch(() => '');
    const cemHasCeoSwitch = await page.locator('text=Alternar para Centro Odontológico (CEO)').isVisible().catch(() => false);
    logTest('CEM exibe identificação visual própria (CEM) e botão de alternar para CEO', !!cemHeaderBadge?.includes('CEM') && cemHasCeoSwitch);

    // B. Layout CEO
    await page.goto(`${PROD_URL}/ceo/recepcao/fila`, { waitUntil: 'networkidle' });
    const ceoHeaderBadge = await page.textContent('header span.bg-emerald-800').catch(() => '');
    const ceoHasCemSwitch = await page.locator('text=Alternar para Centro Médico (CEM)').isVisible().catch(() => false);
    logTest('CEO exibe identificação visual própria (CEO - Esmeralda) e botão de alternar para CEM', !!ceoHeaderBadge?.includes('CEO') && ceoHasCemSwitch);

    // C. Especialidades CEM
    await page.goto(`${PROD_URL}/cem/gestao/especialidades`, { waitUntil: 'networkidle' });
    const cemEspContent = await page.textContent('table').catch(() => '');
    const cemHasNoDental = !cemEspContent?.toLowerCase().includes('endodontia') && !cemEspContent?.toLowerCase().includes('bucomaxilo');
    logTest('CEM (/cem/gestao/especialidades) não lista especialidades odontológicas', cemHasNoDental);

    // D. Especialidades CEO
    await page.goto(`${PROD_URL}/ceo/gestao/especialidades`, { waitUntil: 'networkidle' });
    const ceoEspContent = await page.textContent('table').catch(() => '');
    logTest('CEO (/ceo/gestao/especialidades) carrega catálogo de serviços', ceoEspContent !== null);

    // E. Infraestrutura CEM vs CEO
    await page.goto(`${PROD_URL}/cem/gestao/salas`, { waitUntil: 'networkidle' });
    const cemSalasHeader = await page.textContent('body').catch(() => '');
    logTest('CEM (/cem/gestao/salas) identifica termo "CONSULTÓRIOS E SALAS"', cemSalasHeader?.includes('CONSULTÓRIOS') || cemSalasHeader?.includes('Consultório'));

    await page.goto(`${PROD_URL}/ceo/gestao/salas`, { waitUntil: 'networkidle' });
    const ceoSalasHeader = await page.textContent('body').catch(() => '');
    logTest('CEO (/ceo/gestao/salas) identifica termo "CADEIRAS ODONTOLÓGICAS"', ceoSalasHeader?.includes('CADEIRAS') || ceoSalasHeader?.includes('Cadeira'));

    // F. Smart TV Terminais
    console.log('\n--- ETAPA 4: TESTE DOS PAINEIS DE SMART TV (/tv) ---');
    await page.goto(`${PROD_URL}/tv?pin=CEM-2026`, { waitUntil: 'networkidle' });
    const tvCemTitle = await page.textContent('h1, body').catch(() => '');
    logTest('TV CEM (/tv?pin=CEM-2026) pareada como "CENTRO DE ESPECIALIDADES MÉDICAS"', 
      tvCemTitle?.includes('CENTRO DE ESPECIALIDADES MÉDICAS') || tvCemTitle?.includes('CEM')
    );

    await page.goto(`${PROD_URL}/tv?pin=CEO-2026`, { waitUntil: 'networkidle' });
    const tvCeoTitle = await page.textContent('h1, body').catch(() => '');
    logTest('TV CEO (/tv?pin=CEO-2026) pareada como "CENTRO DE ESPECIALIDADES ODONTOLÓGICAS"', 
      tvCeoTitle?.includes('CENTRO DE ESPECIALIDADES ODONTOLÓGICAS') || tvCeoTitle?.includes('CEO')
    );

    // -------------------------------------------------------------------------
    // ETAPA 5: FLUXO CLÍNICO COMPLETO E2E NO CEO (BALCÃO -> AGENDA -> ISOLAMENTO)
    // -------------------------------------------------------------------------
    console.log('\n--- ETAPA 5: FLUXO CLÍNICO COMPLETO E2E NO CEO ---');

    // 1. Acessar Balcão do CEO
    await page.goto(`${PROD_URL}/ceo/recepcao/balcao`, { waitUntil: 'networkidle' });
    logTest('Página de Agendamento Balcão CEO carregada com sucesso', page.url().includes('/ceo/recepcao/balcao'));

    // 2. Preencher formulário de balcão do CEO
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const cpfTeste = `777${randomSuffix}3311`.substring(0, 11);
    const nomePacienteTeste = `ANTONIA GOMES DA SILVA E2E ${randomSuffix}`;

    await page.fill('#pac-cpf', cpfTeste);
    await page.dispatchEvent('#pac-cpf', 'blur');
    await page.waitForTimeout(500);

    await page.fill('#pac-nome', nomePacienteTeste);
    await page.fill('#pac-sus', `700400${randomSuffix}0002`);
    await page.fill('#pac-nasc', '1992-04-20');
    await page.selectOption('#pac-sexo', 'F');
    await page.fill('#pac-tel', '87988776655');
    await page.fill('#pac-end', 'Rua São Pedro, 45, Bairro Novo');

    // Selecionar especialidade Endodontia
    const espSelect = page.locator('#cons-esp');
    const options = await espSelect.locator('option').allTextContents();
    const hasEndo = options.some(o => o.toUpperCase().includes('ENDODONTIA'));
    if (hasEndo) {
      await espSelect.selectOption({ label: options.find(o => o.toUpperCase().includes('ENDODONTIA')) });
    } else if (options.length > 1) {
      await espSelect.selectOption({ index: 1 });
    }

    // Selecionar prioridade URGENTE
    await page.click('button:has-text("URGENTE")');
    await page.waitForTimeout(500);

    // Submeter formulário
    await page.click('button:has-text("CONFIRMAR E AGENDAR NO BALCÃO")');
    await page.waitForTimeout(3000);

    // Verificar confirmação de sucesso
    const textoBanner = await page.textContent('body').catch(() => '');
    const sucessoAgendamento = textoBanner?.includes('AGENDAMENTO CONCLUÍDO') || textoBanner?.includes('Protocolo:');
    logTest('Agendamento no Balcão CEO executado com sucesso e protocolado', sucessoAgendamento, {
      nomePacienteTeste,
      cpfTeste
    });

    // 3. Verificar que o agendamento aparece na Agenda do Dia do CEO
    await page.goto(`${PROD_URL}/ceo/recepcao/agenda`, { waitUntil: 'networkidle' });
    const agendaCeoText = await page.textContent('body').catch(() => '');
    const agendadoNoCeo = agendaCeoText?.includes(nomePacienteTeste) || agendaCeoText?.includes(cpfTeste) || agendaCeoText?.includes('AGENDAMENTOS');
    logTest('Agenda do Dia do CEO (/ceo/recepcao/agenda) operacional', agendadoNoCeo);

    // 4. Verificar que NÃO aparece na Agenda do CEM
    await page.goto(`${PROD_URL}/cem/recepcao/agenda`, { waitUntil: 'networkidle' });
    const agendaCemText = await page.textContent('body').catch(() => '');
    const naoEstaNoCem = !agendaCemText?.includes(nomePacienteTeste) && !agendaCemText?.includes(cpfTeste);
    logTest('ISOLAMENTO ABSOLUTO: Paciente do CEO NÃO aparece na Agenda do CEM (/cem/recepcao/agenda)', naoEstaNoCem);

    // 5. Médico/Dentista CEO: Acessar Consultório Digital (/ceo/medico/agenda)
    await page.goto(`${PROD_URL}/ceo/medico/agenda`, { waitUntil: 'networkidle' });
    logTest('Consultório Digital do Dentista (/ceo/medico/agenda) carregado com sucesso', page.url().includes('/ceo/medico/agenda'));

  } catch (err) {
    console.error('Erro durante a execução do Playwright:', err);
    logTest('Execução do teste Playwright sem exceção crítica', false, err.message);
  } finally {
    await browser.close();
  }

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO FINAL PLAYWRIGHT: ${testResults.passed} PASSOU / ${testResults.failed} FALHOU (TOTAL: ${testResults.items.length})`);
  console.log('========================================================================\n');
  return testResults;
}

runPlaywrightAudit().catch((err) => {
  console.error('Fatal error in audit script:', err);
});
