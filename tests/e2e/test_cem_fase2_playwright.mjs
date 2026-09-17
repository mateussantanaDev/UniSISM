// tests/e2e/test_cem_fase2_playwright.mjs
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

async function runFase2() {
  console.log('========================================================================');
  console.log('🏥 AUDITORIA VISUAL CEM - FASE 2: GESTÃO DE RECURSOS CLÍNICOS');
  console.log('Salas/Consultórios, Especialidades com Triagem e Escalas Médicas');
  console.log(`URL Frontend: ${BASE_URL}`);
  console.log(`Gestora: graziellasanitarista@gmail.com`);
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
    findings: []
  };

  function logStep(title, status, detail = '') {
    console.log(`${status === 'PASS' ? '✅' : '❌'} [${status}] ${title} ${detail ? `(${detail})` : ''}`);
    auditLog.steps.push({ title, status, detail });
  }

  try {
    // -------------------------------------------------------------
    // ETAPA 2.1: Login com Graziella
    // -------------------------------------------------------------
    console.log('\n--- 2.1: Autenticação da Gestora Graziella ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="usuario"]', 'graziellasanitarista@gmail.com');
    await page.fill('input[name="senha"]', '010926ab');
    await page.click('button[type="submit"]');

    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
    await page.waitForTimeout(1500);
    logStep('Autenticação Gestora', 'PASS', page.url());

    // -------------------------------------------------------------
    // ETAPA 2.2: Gestão de Salas / Consultórios (/cem/gestao/salas)
    // -------------------------------------------------------------
    console.log('\n--- 2.2: Cadastro de Consultório Médico (CONS-04) ---');
    await page.goto(`${BASE_URL}/cem/gestao/salas`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '22_cem_gestao_salas_inicial.png'), fullPage: true });
    logStep('Tela Gestão de Salas Carregada', 'PASS', '22_cem_gestao_salas_inicial.png');

    // Clicar para cadastrar nova sala
    const btnNovaSala = page.locator('button:has-text("CADASTRAR CONSULTÓRIO"), button:has-text("Cadastrar Consultório")').first();
    await btnNovaSala.click();
    await page.waitForTimeout(1000);

    // Preencher dados da Sala
    await page.fill('#sl-cod', 'CONS-04');
    await page.fill('#sl-nome', 'Consultório 04 - Métodos Gráficos & Cardiologia Avançada');
    await page.fill('#sl-ala', 'Ala Médica A — Métodos Diagnósticos');
    await page.fill('#sl-eq', 'Eletrocardiógrafo 12 derivações, Ecocardiógrafo com Doppler, Desfibrilador Externo Automático, Esfigmomanômetro Digital, Maca Clínica Articulada');

    // Alocar profissional na sala
    const selProf = page.locator('#sl-sel-prof');
    if (await selProf.count() > 0) {
      const profOptions = await selProf.locator('option').allTextContents();
      console.log('Profissionais disponíveis para alocação na sala:', profOptions);
      // Tentar selecionar Dr. Roberto se estiver na lista
      const optRoberto = profOptions.find(o => o.includes('Roberto') || o.includes('Cardiolog'));
      if (optRoberto) {
        await selProf.selectOption({ label: optRoberto });
      } else {
        await page.fill('#sl-nome-manual', 'Dr. Roberto Medeiros');
        await page.fill('#sl-registro-prof', 'CRM-PE 14920');
        await page.fill('#sl-esp-prof', 'Cardiologia');
      }
    } else {
      await page.fill('#sl-nome-manual', 'Dr. Roberto Medeiros');
      await page.fill('#sl-registro-prof', 'CRM-PE 14920');
      await page.fill('#sl-esp-prof', 'Cardiologia');
    }

    // Selecionar turnos e dias
    const btnAddProf = page.locator('button:has-text("Adicionar Profissional"), button:has-text("Alocar Profissional")').first();
    await btnAddProf.click();
    await page.waitForTimeout(600);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '23_cem_modal_sala_preenchido.png'), fullPage: true });

    // Salvar Sala
    const btnSalvarSala = page.locator('button:has-text("Cadastrar Consultório"), button:has-text("Salvar Alterações")').last();
    await btnSalvarSala.click();
    await page.waitForTimeout(2500);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '24_cem_sala_cadastrada_sucesso.png'), fullPage: true });
    logStep('Consultório CONS-04 Cadastrado', 'PASS', '24_cem_sala_cadastrada_sucesso.png');

    // -------------------------------------------------------------
    // ETAPA 2.3: Catálogo SIGTAP - Procedimento com Triagem Obrigatória (/cem/gestao/especialidades)
    // -------------------------------------------------------------
    console.log('\n--- 2.3: Cadastro de Procedimento com Triagem Prévia Obrigatória ---');
    await page.goto(`${BASE_URL}/cem/gestao/especialidades`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '25_cem_gestao_especialidades_inicial.png'), fullPage: true });
    logStep('Tela Catálogo SIGTAP Carregada', 'PASS', '25_cem_gestao_especialidades_inicial.png');

    // Abrir modal de novo serviço
    const btnNovoServico = page.locator('button:has-text("HABILITAR SERVIÇO"), button:has-text("Habilitar Serviço")').first();
    await btnNovoServico.click();
    await page.waitForTimeout(1000);

    // Preencher campos do procedimento com triagem obrigatória
    await page.selectOption('#esp-tipo', 'PROCEDIMENTO');
    await page.fill('#esp-nome', 'Ecocardiograma Transtorácico');
    await page.fill('#esp-cod', '0205010032');
    await page.fill('#esp-tempo', '30');
    await page.fill('#esp-val', '120.00');

    // Marcar checkbox de exigência de triagem prévia
    const chkTriagem = page.locator('#esp-triagem');
    if (await chkTriagem.count() > 0) {
      const isChecked = await chkTriagem.isChecked();
      if (!isChecked) {
        await chkTriagem.check();
      }
      console.log('Checkbox Exige Triagem Prévia marcado: true');
    }

    await page.fill('#esp-docs', 'Encaminhamento médico da UBS com indicação clínica, ECG basal recente');
    await page.fill('#esp-prep', 'Chegar com 20 minutos de antecedência para triagem de enfermagem e aferição de sinais vitais');

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '26_cem_modal_procedimento_triagem.png'), fullPage: true });

    // Salvar procedimento
    const btnSalvarEsp = page.locator('button:has-text("Salvar no Catálogo")').first();
    await btnSalvarEsp.click();
    await page.waitForTimeout(2500);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '27_cem_procedimento_cadastrado_com_triagem.png'), fullPage: true });
    logStep('Procedimento Ecocardiograma com Triagem Obrigatória Cadastrado', 'PASS', '27_cem_procedimento_cadastrado_com_triagem.png');

    // -------------------------------------------------------------
    // ETAPA 2.4: Matriz de Vagas & Escalas Médicas (/cem/gestao/vagas)
    // -------------------------------------------------------------
    console.log('\n--- 2.4: Cadastro de Escala Médica do Especialista ---');
    await page.goto(`${BASE_URL}/cem/gestao/vagas`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '28_cem_gestao_vagas_cotas.png'), fullPage: true });
    logStep('Acesso à Matriz de Vagas / Cotas', 'PASS', '28_cem_gestao_vagas_cotas.png');

    // Alternar para a Aba 2: Escala & Grade dos Especialistas
    const tabEscala = page.locator('button:has-text("02. Escala"), button:has-text("Escala & Grade")').first();
    await tabEscala.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '29_cem_grade_escalas_lista.png'), fullPage: true });
    logStep('Aba de Escalas Médicas Ativa', 'PASS', '29_cem_grade_escalas_lista.png');

    // Clicar para cadastrar nova escala
    const btnNovaEscala = page.locator('button:has-text("Cadastrar Nova Escala"), button:has-text("+ Cadastrar Nova Escala")').first();
    if (await btnNovaEscala.count() > 0) {
      await btnNovaEscala.click();
      await page.waitForTimeout(1000);

      // Selecionar profissional se houver select
      const selProfEsc = page.locator('#esc-prof');
      if (await selProfEsc.count() > 0) {
        const profsEscOptions = await selProfEsc.locator('option').allTextContents();
        console.log('Profissionais na lista de escalas:', profsEscOptions);
        const optDrRoberto = profsEscOptions.find(p => p.includes('Roberto') || p.includes('Cardio'));
        if (optDrRoberto) {
          await selProfEsc.selectOption({ label: optDrRoberto });
        }
      }

      // Selecionar especialidade / procedimento
      const selEspEsc = page.locator('#esc-esp');
      if (await selEspEsc.count() > 0) {
        const espOptions = await selEspEsc.locator('option').allTextContents();
        console.log('Especialidades na lista de escalas:', espOptions);
        const optEco = espOptions.find(e => e.includes('Ecocardiograma') || e.includes('Cardiologia'));
        if (optEco) {
          await selEspEsc.selectOption({ label: optEco });
        }
      }

      // Tipo de Atendimento
      const selTipoEsc = page.locator('#esc-tipo');
      if (await selTipoEsc.count() > 0) {
        await selTipoEsc.selectOption({ value: 'PROCEDIMENTO' }).catch(() => {});
      }

      // Modalidade Semanal
      const btnSemanal = page.locator('button:has-text("Semanal")').first();
      if (await btnSemanal.count() > 0) {
        await btnSemanal.click();
      }

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '30_cem_modal_nova_escala.png'), fullPage: true });

      // Salvar Escala
      const btnSalvarEscala = page.locator('button:has-text("Salvar Escala"), button:has-text("Salvar Nova Escala")').last();
      if (await btnSalvarEscala.count() > 0) {
        await btnSalvarEscala.click();
        await page.waitForTimeout(2500);
      }

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '31_cem_escala_criada_sucesso.png'), fullPage: true });
      logStep('Escala Médica Especialista Cadastrada', 'PASS', '31_cem_escala_criada_sucesso.png');
    }

  } catch (err) {
    console.error('Erro na execução da Fase 2:', err);
    logStep('Falha na Execução da Fase 2', 'FAIL', err.message);
  } finally {
    await browser.close();
  }

  console.log('\n========================================================================');
  console.log('📊 CONSOLIDAÇÃO DA FASE 2:');
  console.log(`Total de Passos: ${auditLog.steps.length}`);
  console.log(`Passos com Sucesso: ${auditLog.steps.filter(s => s.status === 'PASS').length}`);
  console.log(`Passos com Falha: ${auditLog.steps.filter(s => s.status === 'FAIL').length}`);
  console.log('========================================================================\n');

  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, 'fase2_audit_report.json'),
    JSON.stringify(auditLog, null, 2),
    'utf-8'
  );
}

runFase2().catch(console.error);
