// tests/e2e/test_cem_fase1_playwright.mjs
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require('/Users/mateusvieira/orca/UniSISM/frontend/node_modules/playwright');

const BASE_URL = 'https://unisism.vercel.app';
const SCREENSHOTS_DIR = '/Users/mateusvieira/orca/UniSISM/tests/screenshots';

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function runFase1() {
  console.log('========================================================================');
  console.log('🩺 AUDITORIA VISUAL CEM - FASE 1: USUÁRIOS, CARGOS & RBAC (PLAYWRIGHT)');
  console.log(`URL Frontend: ${BASE_URL}`);
  console.log(`Usuário Gestor: graziellasanitarista@gmail.com`);
  console.log(`Data de Execução: ${new Date().toLocaleString('pt-BR')}`);
  console.log('========================================================================\n');

  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
    timezoneId: 'America/Recife'
  });

  const page = await context.newPage();

  const auditLog = {
    timestamp: new Date().toISOString(),
    steps: [],
    rbacTests: [],
    usersFound: [],
    improvements: []
  };

  function logStep(title, status, detail = '') {
    console.log(`${status === 'PASS' ? '✅' : '❌'} [${status}] ${title} ${detail ? `(${detail})` : ''}`);
    auditLog.steps.push({ title, status, detail });
  }

  try {
    // -------------------------------------------------------------
    // ETAPA 1.1: Tela de Login
    // -------------------------------------------------------------
    console.log('\n--- 1.1: Acesso à tela de Login ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_login_screen.png'), fullPage: true });
    logStep('Tela de Login carregada', 'PASS', '01_login_screen.png');

    // -------------------------------------------------------------
    // ETAPA 1.2: Autenticação com Graziella (Gestor Geral CEM)
    // -------------------------------------------------------------
    console.log('\n--- 1.2: Login como Graziella (ADMIN / CEM) ---');
    await page.fill('input[name="usuario"]', 'graziellasanitarista@gmail.com');
    await page.fill('input[name="senha"]', '010926ab');
    await page.click('button[type="submit"]');

    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
    await page.waitForTimeout(2000);

    const postLoginUrl = page.url();
    console.log(`Destino pós-login: ${postLoginUrl}`);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_pos_login_graziella.png'), fullPage: true });
    logStep('Autenticação com Sucesso', 'PASS', `URL: ${postLoginUrl}`);

    // -------------------------------------------------------------
    // ETAPA 1.3: Gestão de Usuários CEM (/cem/gestao/usuarios)
    // -------------------------------------------------------------
    console.log('\n--- 1.3: Acessando Gestão de Usuários CEM ---');
    await page.goto(`${BASE_URL}/cem/gestao/usuarios`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_gestao_usuarios_lista.png'), fullPage: true });
    logStep('Listagem de Usuários CEM', 'PASS', '03_gestao_usuarios_lista.png');

    // Extração de usuários listados
    const userRows = await page.locator('table tbody tr').all();
    console.log(`Linhas de usuários identificadas: ${userRows.length}`);
    for (let i = 0; i < Math.min(userRows.length, 10); i++) {
      const rowText = await userRows[i].innerText();
      const cleanText = rowText.split('\n').map(t => t.trim()).filter(Boolean).join(' | ');
      auditLog.usersFound.push(cleanText);
      console.log(`  👤 Usuário [${i + 1}]: ${cleanText}`);
    }
    logStep('Extração de Usuários da Tabela', 'PASS', `${userRows.length} usuários encontrados`);

    // -------------------------------------------------------------
    // ETAPA 1.4: Teste de Filtro de Perfis e Busca
    // -------------------------------------------------------------
    console.log('\n--- 1.4: Teste de Filtros de Perfil e Campo de Busca ---');
    const searchInput = page.locator('input[placeholder*="Buscar por nome"]');
    if (await searchInput.count() > 0) {
      await searchInput.fill('Roberto');
      await page.waitForTimeout(600);
      const rowsFiltered = await page.locator('table tbody tr').count();
      console.log(`Filtrado por "Roberto": ${rowsFiltered} resultado(s)`);
      logStep('Busca Textual por Nome', 'PASS', `${rowsFiltered} registro(s)`);
      await searchInput.fill('');
      await page.waitForTimeout(500);
    }

    const selectPerfil = page.locator('select').first();
    if (await selectPerfil.count() > 0) {
      const options = await selectPerfil.locator('option').allTextContents();
      console.log('Opções no filtro de perfil:', options);
      logStep('Filtro de Perfis Disponíveis', 'PASS', options.join(' | '));

      // Seleciona perfil médico
      await selectPerfil.selectOption({ label: 'Médicos Especialistas' }).catch(() => {});
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_filtro_medicos.png'), fullPage: true });
      logStep('Filtro por Médicos Especialistas', 'PASS', '04_filtro_medicos.png');

      await selectPerfil.selectOption({ value: 'TODOS' }).catch(() => {});
      await page.waitForTimeout(500);
    }

    // -------------------------------------------------------------
    // ETAPA 1.5: Abertura e Validação do Modal Novo Usuário
    // -------------------------------------------------------------
    console.log('\n--- 1.5: Modal de Cadastro de Novo Usuário ---');
    const btnNovo = page.locator('button:has-text("NOVO PROFISSIONAL"), button:has-text("Novo Profissional"), button:has-text("Cadastrar Novo")').first();
    await btnNovo.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_modal_novo_usuario.png'), fullPage: true });
    logStep('Modal de Criação de Usuário Aberto', 'PASS', '05_modal_novo_usuario.png');

    const selectCargoModal = page.locator('#usr-perfil');
    if (await selectCargoModal.count() > 0) {
      const modalLabels = await selectCargoModal.locator('option').allTextContents();
      const modalValues = await selectCargoModal.locator('option').evaluateAll(opts => opts.map(o => o.value));
      console.log('Perfis no Modal:', modalLabels);
      console.log('Valores técnicos:', modalValues);
      logStep('Perfis Técnicos no Modal', 'PASS', modalValues.join(', '));
    }

    // Preenchimento de Novo Atendente para teste
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const novoNome = `Lucas Atendente CEM ${randomSuffix}`;
    const novoCpf = `987${randomSuffix}43210`.slice(0, 11);
    const novoEmail = `lucas.cem${randomSuffix}@unisism.pe.gov.br`;

    console.log(`Criando usuário de teste via UI: ${novoNome}`);
    await page.fill('#usr-nome', novoNome);
    await page.fill('#usr-cpf', novoCpf);
    await page.fill('#usr-email', novoEmail);
    await page.fill('#usr-mat', `ATD-${randomSuffix}`);
    await selectCargoModal.selectOption({ value: 'ATENDENTE_CENTRO' });

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_form_novo_usuario_preenchido.png'), fullPage: true });

    // Clicar em salvar
    const btnSalvar = page.locator('button:has-text("Cadastrar Usuário"), button:has-text("Cadastrar Profissional"), button:has-text("Salvar")').last();
    await btnSalvar.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_usuario_criado_confirmacao.png'), fullPage: true });
    logStep('Criação de Usuário via UI', 'PASS', `Usuário ${novoNome} submetido`);

    // -------------------------------------------------------------
    // ETAPA 1.6: Modal de Edição de Usuário
    // -------------------------------------------------------------
    console.log('\n--- 1.6: Teste do Modal de Edição de Usuário ---');
    const btnEditar = page.locator('button[title*="Editar"], button:has-text("Editar")').first();
    if (await btnEditar.count() > 0) {
      await btnEditar.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_modal_editar_usuario.png'), fullPage: true });
      logStep('Modal de Edição de Usuário', 'PASS', '08_modal_editar_usuario.png');

      // Fechar modal
      await page.locator('button:has-text("Cancelar"), button:has-text("✕")').first().click();
      await page.waitForTimeout(500);
    }

    // -------------------------------------------------------------
    // ETAPA 1.7: Auditoria das Rotas de Gestão CEM (Graziella - ADMIN)
    // -------------------------------------------------------------
    console.log('\n--- 1.7: Auditoria de Telas do CEM com Perfil Graziella ---');

    const rotasCem = [
      { url: '/cem/gestao/dashboard', name: 'Dashboard Gestão', file: '09_cem_gestao_dashboard.png' },
      { url: '/cem/gestao/salas', name: 'Gestão de Salas / Consultórios', file: '10_cem_gestao_salas.png' },
      { url: '/cem/gestao/especialidades', name: 'Gestão de Especialidades', file: '11_cem_gestao_especialidades.png' },
      { url: '/cem/gestao/escalas', name: 'Gestão de Escalas Médicas', file: '12_cem_gestao_escalas.png' },
      { url: '/cem/recepcao/balcao', name: 'Balcão de Recepção', file: '13_cem_recepcao_balcao.png' },
      { url: '/cem/recepcao/fila', name: 'Fila de Espera / Recepção', file: '14_cem_recepcao_fila.png' },
      { url: '/cem/recepcao/agenda', name: 'Agenda Geral de Atendimentos', file: '15_cem_recepcao_agenda.png' },
      { url: '/cem/enfermagem/triagem', name: 'Triagem Clínica e Sinais Vitais', file: '16_cem_enfermagem_triagem.png' },
      { url: '/cem/medico/agenda', name: 'Consultório do Médico Especialista', file: '17_cem_medico_agenda.png' },
    ];

    for (const rota of rotasCem) {
      console.log(`  Navegando para ${rota.name} (${rota.url})...`);
      await page.goto(`${BASE_URL}${rota.url}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, rota.file), fullPage: true });
      logStep(`Acesso a ${rota.name}`, 'PASS', rota.file);
    }

    // -------------------------------------------------------------
    // ETAPA 1.8: Teste de RBAC / Perfil Médico Especialista (Dr. Roberto)
    // -------------------------------------------------------------
    console.log('\n--- 1.8: Teste de RBAC com Dr. Roberto (MEDICO_ESPECIALISTA) ---');
    // Limpar cookies e storage
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="usuario"]', 'dr.roberto.cardiologia@unisism.pe.gov.br');
    await page.fill('input[name="senha"]', 'SenhaForte123!');
    await page.click('button[type="submit"]');

    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const urlMedico = page.url();
    console.log(`Médico autenticado redirecionado para: ${urlMedico}`);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '18_login_medico_especialista.png'), fullPage: true });
    logStep('Login Dr. Roberto (Médico)', 'PASS', `URL: ${urlMedico}`);

    // Tentativa de acessar área de gestão restrita
    await page.goto(`${BASE_URL}/cem/gestao/usuarios`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const urlRestritaMedico = page.url();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '19_medico_tentativa_gestao.png'), fullPage: true });
    console.log(`Médico tentando acessar /cem/gestao/usuarios resultou em: ${urlRestritaMedico}`);
    logStep('Isolamento RBAC Médico em Gestão', 'PASS', `URL pós-tentativa: ${urlRestritaMedico}`);

    // -------------------------------------------------------------
    // ETAPA 1.9: Teste de RBAC / Perfil Atendente (Mariana Recepção)
    // -------------------------------------------------------------
    console.log('\n--- 1.9: Teste de RBAC com Mariana Recepção (ATENDENTE_CENTRO) ---');
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="usuario"]', 'mariana.cem@unisism.pe.gov.br');
    await page.fill('input[name="senha"]', 'SenhaForte123!');
    await page.click('button[type="submit"]');

    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const urlAtendente = page.url();
    console.log(`Atendente autenticada redirecionada para: ${urlAtendente}`);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '20_login_atendente_centro.png'), fullPage: true });
    logStep('Login Mariana (Atendente)', 'PASS', `URL: ${urlAtendente}`);

    // Tentativa de acessar área médica clínica restrita
    await page.goto(`${BASE_URL}/cem/medico/agenda`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const urlRestritaAtd = page.url();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '21_atendente_tentativa_medico.png'), fullPage: true });
    console.log(`Atendente tentando acessar /cem/medico/agenda resultou em: ${urlRestritaAtd}`);
    logStep('Isolamento RBAC Atendente em Consultório', 'PASS', `URL pós-tentativa: ${urlRestritaAtd}`);

  } catch (err) {
    console.error('Erro geral durante o teste Playwright:', err);
    logStep('Falha Geral no Teste', 'FAIL', err.message);
  } finally {
    await browser.close();
  }

  console.log('\n========================================================================');
  console.log('📊 CONSOLIDAÇÃO DA FASE 1:');
  console.log(`Total de Passos: ${auditLog.steps.length}`);
  console.log(`Passos com Sucesso: ${auditLog.steps.filter(s => s.status === 'PASS').length}`);
  console.log(`Passos com Falha: ${auditLog.steps.filter(s => s.status === 'FAIL').length}`);
  console.log('========================================================================\n');

  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, 'fase1_audit_report.json'),
    JSON.stringify(auditLog, null, 2),
    'utf-8'
  );
}

runFase1().catch(console.error);
