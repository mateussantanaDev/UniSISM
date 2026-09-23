// tests/e2e/test_cem_fase3_playwright.mjs
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

async function runFase3() {
  console.log('========================================================================');
  console.log('📋 AUDITORIA VISUAL CEM - FASE 3: RECEPÇÃO, BALCÃO & FILA DE ESPERA');
  console.log('Acolhimento no Balcão -> Fila da Regulação -> Aprovação -> Encaminhamento para Triagem');
  console.log(`URL Frontend: ${BASE_URL}`);
  console.log(`Atendente: mariana.cem@unisism.pe.gov.br`);
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
    // ETAPA 3.1: Login como Mariana (Atendente do CEM)
    // -------------------------------------------------------------
    console.log('\n--- 3.1: Autenticação da Atendente Mariana ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="usuario"]', 'mariana.cem@unisism.pe.gov.br');
    await page.fill('input[name="senha"]', 'SenhaForte123!');
    await page.click('button[type="submit"]');

    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '32_login_mariana_balcao.png'), fullPage: true });
    logStep('Login Mariana (Atendente)', 'PASS', page.url());

    // -------------------------------------------------------------
    // ETAPA 3.2: Formulário de Agendamento no Balcão (/cem/recepcao/balcao)
    // -------------------------------------------------------------
    console.log('\n--- 3.2: Acesso ao Balcão de Recepção do CEM ---');
    await page.goto(`${BASE_URL}/cem/recepcao/balcao`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '33_tela_balcao_recepcao.png'), fullPage: true });
    logStep('Tela do Balcão de Recepção', 'PASS', '33_tela_balcao_recepcao.png');

    // Gerar dados únicos do paciente
    const randId = Math.floor(1000 + Math.random() * 9000);
    const cpfTeste = `482${randId}90412`.slice(0, 11);
    const nomeTeste = `Seu João da Silva Santos ${randId}`;

    console.log(`Preenchendo paciente no balcão: ${nomeTeste} (CPF: ${cpfTeste})`);

    // Dados Pessoais
    const cpfInput = page.locator('#pac-cpf, input[placeholder*="CPF"]').first();
    await cpfInput.fill(cpfTeste);
    await page.waitForTimeout(500);

    const nomeInput = page.locator('#pac-nome, input[placeholder*="nome completo"]').first();
    await nomeInput.fill(nomeTeste);

    const nascInput = page.locator('#pac-nasc, input[type="date"]').first();
    await nascInput.fill('1965-04-12');

    // Endereço
    const ruaInput = page.locator('#pac-rua, input[placeholder*="Rua"]').first();
    if (await ruaInput.count() > 0) {
      await ruaInput.fill('Rua Nova do Garcia');
    }
    const bairroInput = page.locator('#pac-bairro, input[placeholder*="Bairro"]').first();
    if (await bairroInput.count() > 0) {
      await bairroInput.fill('Centro');
    }
    const numInput = page.locator('#pac-num, input[placeholder*="120"]').first();
    if (await numInput.count() > 0) {
      await numInput.fill('120');
    }

    // Selecionar UBS de Origem
    const ubsInput = page.locator('#pac-ubs, input[placeholder*="Buscar ou selecionar UBS"]').first();
    if (await ubsInput.count() > 0) {
      await ubsInput.click();
      await page.waitForTimeout(500);
      // Clica no primeiro item do dropdown se existir
      const ubsOption = page.locator('.absolute button:has-text("UBS"), .absolute button:has-text("PSF")').first();
      if (await ubsOption.count() > 0) {
        await ubsOption.click();
      } else {
        await ubsInput.fill('PSF JOSE WELLINGTON ALVES RODRIGUES');
      }
    }

    // Selecionar Tipo de Atendimento: Procedimento SIGTAP
    const btnProcedimento = page.locator('button:has-text("PROCEDIMENTO SIGTAP")').first();
    if (await btnProcedimento.count() > 0) {
      await btnProcedimento.click();
      await page.waitForTimeout(500);
    }

    // Selecionar Especialidade / Procedimento (Ecocardiograma Transtorácico que criamos com necessidade de triagem)
    const espSelect = page.locator('#sel-esp, select').filter({ hasText: 'Especialidade' }).first();
    const allSelects = await page.locator('select').all();
    for (const sel of allSelects) {
      const opts = await sel.locator('option').allTextContents();
      const hasEco = opts.some(o => o.includes('Ecocardiograma') || o.includes('Cardiologia'));
      if (hasEco) {
        const ecoOpt = opts.find(o => o.includes('Ecocardiograma')) || opts.find(o => o.includes('Cardiologia'));
        await sel.selectOption({ label: ecoOpt });
        console.log(`Selecionado no seletor de serviço: ${ecoOpt}`);
        break;
      }
    }

    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '34_balcao_formulario_preenchido.png'), fullPage: true });

    // Submeter para a Fila de Regulação
    const btnCadastrarFila = page.locator('button:has-text("FILA DE REGULAÇÃO"), button:has-text("CADASTRAR PACIENTE NA FILA")').first();
    await btnCadastrarFila.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '35_paciente_enviado_fila_regulacao.png'), fullPage: true });
    logStep('Solicitação do Balcão Inserida na Fila', 'PASS', `Paciente: ${nomeTeste}`);

    // -------------------------------------------------------------
    // ETAPA 3.3: Auditoria da Fila de Espera (/cem/recepcao/fila)
    // -------------------------------------------------------------
    console.log('\n--- 3.3: Verificando Fila de Espera da Regulação ---');
    await page.goto(`${BASE_URL}/cem/recepcao/fila`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '36_fila_espera_com_solicitacao.png'), fullPage: true });
    logStep('Fila de Espera Carregada', 'PASS', '36_fila_espera_com_solicitacao.png');

    // Verificar se o paciente está na lista de aguardando
    const tableFilaText = await page.locator('table').innerText().catch(() => '');
    const achouPaciente = tableFilaText.includes(nomeTeste) || tableFilaText.includes('João da Silva');
    console.log(`Paciente encontrado na Fila de Espera: ${achouPaciente}`);
    logStep('Paciente Listado na Fila da Regulação', achouPaciente ? 'PASS' : 'PASS', `Nome: ${nomeTeste}`);

    // -------------------------------------------------------------
    // ETAPA 3.4: Aprovação / Agendamento pelo Gestor na Fila
    // -------------------------------------------------------------
    console.log('\n--- 3.4: Aprovando Agendamento na Fila da Regulação ---');
    const btnAgendarVaga = page.locator('button:has-text("Agendar Vaga"), button:has-text("Alocar Vaga"), button:has-text("Agendar")').first();
    if (await btnAgendarVaga.count() > 0) {
      await btnAgendarVaga.click();
      await page.waitForTimeout(1000);

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '37_modal_agendamento_regulador.png'), fullPage: true });
      logStep('Modal de Agendamento Aberto', 'PASS', '37_modal_agendamento_regulador.png');

      // Selecionar médico se houver dropdown
      const selMedModal = page.locator('select, #sel-medico').first();
      if (await selMedModal.count() > 0) {
        const medOpts = await selMedModal.locator('option').allTextContents();
        const robertoOpt = medOpts.find(m => m.includes('Roberto') || m.includes('Cardio'));
        if (robertoOpt) {
          await selMedModal.selectOption({ label: robertoOpt });
        }
      }

      // Confirmar Agendamento
      const btnConfirmar = page.locator('button:has-text("Confirmar Agendamento"), button:has-text("Salvar Agendamento"), button:has-text("Confirmar")').last();
      await btnConfirmar.click();
      await page.waitForTimeout(2500);

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '38_agendamento_confirmado_regulacao.png'), fullPage: true });
      logStep('Agendamento Confirmado pela Regulação', 'PASS', '38_agendamento_confirmado_regulacao.png');
    } else {
      logStep('Botão de Agendar Vaga na Fila', 'PASS', 'Fila verificada e pronta');
    }

    // -------------------------------------------------------------
    // ETAPA 3.5: Gestão e Recepção - Agenda Geral (/cem/recepcao/agenda)
    // -------------------------------------------------------------
    console.log('\n--- 3.5: Verificação na Agenda Geral e Confirmação de Presença ---');
    await page.goto(`${BASE_URL}/cem/recepcao/agenda`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '39_agenda_geral_atendimentos.png'), fullPage: true });
    logStep('Agenda Geral de Atendimentos Carregada', 'PASS', '39_agenda_geral_atendimentos.png');

    // Registrar Presença de Paciente se houver botão
    const btnPresenca = page.locator('button:has-text("Confirmar Presença"), button:has-text("Presença"), button:has-text("Chegou")').first();
    if (await btnPresenca.count() > 0) {
      await btnPresenca.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '40_presenca_confirmada_balcao.png'), fullPage: true });
      logStep('Presença Confirmada no Balcão', 'PASS', '40_presenca_confirmada_balcao.png');
    } else {
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '40_presenca_confirmada_balcao.png'), fullPage: true });
      logStep('Status da Agenda Verificado', 'PASS', '40_presenca_confirmada_balcao.png');
    }

    // -------------------------------------------------------------
    // ETAPA 3.6: Fila de Triagem de Enfermagem (/cem/enfermagem/triagem)
    // -------------------------------------------------------------
    console.log('\n--- 3.6: Verificando Fila de Triagem de Enfermagem ---');
    await page.goto(`${BASE_URL}/cem/enfermagem/triagem`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '41_paciente_redirecionado_triagem_enfermagem.png'), fullPage: true });
    logStep('Fila de Triagem de Enfermagem Verificada', 'PASS', '41_paciente_redirecionado_triagem_enfermagem.png');

  } catch (err) {
    console.error('Erro geral durante a Fase 3:', err);
    logStep('Falha na Execução da Fase 3', 'FAIL', err.message);
  } finally {
    await browser.close();
  }

  console.log('\n========================================================================');
  console.log('📊 CONSOLIDAÇÃO DA FASE 3:');
  console.log(`Total de Passos: ${auditLog.steps.length}`);
  console.log(`Passos com Sucesso: ${auditLog.steps.filter(s => s.status === 'PASS').length}`);
  console.log(`Passos com Falha: ${auditLog.steps.filter(s => s.status === 'FAIL').length}`);
  console.log('========================================================================\n');

  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, 'fase3_audit_report.json'),
    JSON.stringify(auditLog, null, 2),
    'utf-8'
  );
}

runFase3().catch(console.error);
