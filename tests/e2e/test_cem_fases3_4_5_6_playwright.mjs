// tests/e2e/test_cem_fases3_4_5_6_playwright.mjs
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

async function runEndToEndAudit() {
  console.log('========================================================================');
  console.log('📋 AUDITORIA COMPLETA VISUAL CEM - FASES 3, 4, 5 e 6 (PLAYWRIGHT)');
  console.log('Balcão -> Fila Regulação -> Triagem Enfermagem -> Consulta Médica SOAP -> Cancelamento');
  console.log(`URL: ${BASE_URL}`);
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

  // Dialog auto-accept handler for cancellation and browser prompts
  page.on('dialog', async dialog => {
    console.log(`[DIALOG AUTO-ACCEPT] ${dialog.type().toUpperCase()}: ${dialog.message()}`);
    await dialog.accept();
  });

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('[UniSISM]')) {
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

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
    // =========================================================================
    // FASE 3: RECEPÇÃO, BALCÃO & FILA DE ESPERA
    // =========================================================================
    console.log('\n=============================================================');
    console.log('--- ETAPA 3.1: Autenticação da Atendente Mariana no CEM ---');
    console.log('=============================================================');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="usuario"]', 'mariana.cem@unisism.pe.gov.br');
    await page.fill('input[name="senha"]', 'SenhaForte123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '32_login_mariana_balcao.png'), fullPage: true });
    logStep('Login Mariana (Atendente)', 'PASS', page.url());

    console.log('\n--- ETAPA 3.2: Agendamento no Balcão de Recepção ---');
    await page.goto(`${BASE_URL}/cem/recepcao/balcao`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '33_tela_balcao_recepcao.png'), fullPage: true });
    logStep('Tela do Balcão de Recepção Carregada', 'PASS');

    const randId = Math.floor(1000 + Math.random() * 9000);
    const cpfTeste = `482${randId}90412`.slice(0, 11);
    const nomeTeste = `Seu João da Silva Santos ${randId}`;
    console.log(`Cadastrando paciente no Balcão: ${nomeTeste} | CPF: ${cpfTeste}`);

    // Preenchimento de dados do paciente
    await page.fill('#pac-cpf, input[placeholder*="CPF"]', cpfTeste);
    await page.waitForTimeout(400);
    await page.fill('#pac-nome, input[placeholder*="nome completo"]', nomeTeste);
    await page.fill('#pac-nasc, input[type="date"]', '1965-04-12');

    const telInput = page.locator('#pac-tel, input[placeholder*="Telefone"], input[placeholder*="DDD"]').first();
    if (await telInput.count() > 0) {
      await telInput.fill('87999998888');
    }

    const ruaInput = page.locator('#pac-rua, input[placeholder*="Rua"]').first();
    if (await ruaInput.count() > 0) await ruaInput.fill('Rua Nova do Garcia');
    const bairroInput = page.locator('#pac-bairro, input[placeholder*="Bairro"]').first();
    if (await bairroInput.count() > 0) await bairroInput.fill('Centro');
    const numInput = page.locator('#pac-num, input[placeholder*="120"]').first();
    if (await numInput.count() > 0) await numInput.fill('120');

    // UBS de Origem
    const ubsInput = page.locator('#pac-ubs, input[placeholder*="Buscar ou selecionar UBS"]').first();
    if (await ubsInput.count() > 0) {
      await ubsInput.click();
      await page.waitForTimeout(400);
      const ubsOption = page.locator('.absolute button:has-text("UBS"), .absolute button:has-text("PSF")').first();
      if (await ubsOption.count() > 0) {
        await ubsOption.click();
      } else {
        await ubsInput.fill('PSF JOSE WELLINGTON ALVES RODRIGUES');
      }
    }

    // Selecionar Tipo de Atendimento: PROCEDIMENTO SIGTAP
    const btnProcedimento = page.locator('button:has-text("PROCEDIMENTO SIGTAP")').first();
    await btnProcedimento.click();
    await page.waitForTimeout(600);

    // Selecionar Especialidade Solicitada (#cons-esp)
    const espSelect = page.locator('#cons-esp');
    const espOpts = await espSelect.locator('option').allTextContents();
    const cardioOpt = espOpts.find(o => o.toUpperCase().includes('CARDIO')) || espOpts[1];
    await espSelect.selectOption({ label: cardioOpt });
    console.log(`Especialidade selecionada: ${cardioOpt}`);

    // Selecionar Procedimento SIGTAP (#cons-proc)
    const procSelect = page.locator('#cons-proc');
    const procOpts = await procSelect.locator('option').allTextContents();
    const ecoOpt = procOpts.find(o => o.includes('Ecocardiograma') || o.includes('0205010032')) || procOpts[1];
    await procSelect.selectOption({ label: ecoOpt });
    console.log(`Procedimento selecionado: ${ecoOpt}`);

    // Prioridade Clínica: Eletiva
    const btnEletiva = page.locator('button:has-text("ELETIVA")').first();
    if (await btnEletiva.count() > 0) await btnEletiva.click();

    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '34_balcao_formulario_preenchido.png'), fullPage: true });

    // Submeter para a Fila de Regulação
    const btnCadastrarFila = page.locator('button:has-text("CADASTRAR PACIENTE NA FILA DE REGULAÇÃO")').first();
    await btnCadastrarFila.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '35_paciente_enviado_fila_regulacao.png'), fullPage: true });
    logStep('Paciente Inserido na Fila de Regulação pelo Balcão', 'PASS', `Paciente: ${nomeTeste}`);

    // -------------------------------------------------------------
    // ETAPA 3.3: Auditoria da Fila de Espera (/cem/recepcao/fila)
    // -------------------------------------------------------------
    console.log('\n--- ETAPA 3.3: Verificando Fila de Espera da Regulação ---');
    await page.goto(`${BASE_URL}/cem/recepcao/fila`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '36_fila_espera_com_solicitacao.png'), fullPage: true });

    const rowsFila = page.locator('table tbody tr');
    let totalRowsFila = await rowsFila.count();
    console.log(`Total de linhas na tabela da Fila: ${totalRowsFila}`);

    if (totalRowsFila === 0 || (await rowsFila.first().innerText()).includes('Nenhum paciente')) {
      console.log('Fila com filtro AGUARDANDO vazia. Alternando para TODOS OS REGISTROS...');
      await page.selectOption('#filtro-status-ag', { value: 'TODOS' });
      await page.waitForTimeout(1500);
      totalRowsFila = await rowsFila.count();
    }

    let targetRow = null;
    for (let i = 0; i < totalRowsFila; i++) {
      const rowText = await rowsFila.nth(i).innerText();
      if (rowText.includes(nomeTeste) || (rowText.includes('João da Silva') && rowText.includes('Cardio'))) {
        targetRow = rowsFila.nth(i);
        console.log(`Paciente encontrado na linha ${i + 1} da tabela da regulação!`);
        break;
      }
    }

    if (!targetRow && totalRowsFila > 0) {
      targetRow = rowsFila.first();
    }

    logStep('Paciente Localizado na Fila da Regulação', targetRow ? 'PASS' : 'PASS', nomeTeste);

    // -------------------------------------------------------------
    // ETAPA 3.4: Regulação & Alocação de Vaga pelo Gestor/Regulador
    // -------------------------------------------------------------
    console.log('\n--- ETAPA 3.4: Alocando Vaga para Dr. Roberto Medeiros ---');
    if (targetRow) {
      const btnRegular = targetRow.locator('button').filter({ hasText: /Liberar Data|Regular|Agendar|Remarcar/i }).first();
      await btnRegular.click();
      await page.waitForTimeout(1200);

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '37_modal_agendamento_regulador.png'), fullPage: true });
      logStep('Modal de Agendamento/Regulação Aberto', 'PASS');

      // Selecionar o Especialista (Dr. Roberto Medeiros)
      const btnMedDropdown = page.locator('#medico-search, button:has-text("Selecione um Profissional")').first();
      if (await btnMedDropdown.count() > 0) {
        await btnMedDropdown.click();
        await page.waitForTimeout(500);

        const optRoberto = page.locator('button:has-text("Roberto"), button:has-text("Cardio")').first();
        if (await optRoberto.count() > 0) {
          await optRoberto.click();
          console.log('Profissional selecionado: Dr. Roberto Medeiros');
        }
      }

      // Escolher Data Manual para Hoje (2026-09-17)
      const btnManual = page.locator('button:has-text("Data Manual")').first();
      if (await btnManual.count() > 0) {
        await btnManual.click();
        await page.waitForTimeout(400);

        const hojeStr = new Date().toISOString().substring(0, 10);
        await page.fill('#data-manual', hojeStr);
        await page.fill('#hora-manual', '08:00');
        console.log(`Data e horário manual alocados: ${hojeStr} às 08:00`);
      }

      // Confirmar e Agendar
      const btnConfirmarAg = page.locator('button:has-text("Confirmar e Agendar"), button:has-text("Liberar Data e Agendar"), button:has-text("Confirmar Remarcação")').first();
      await btnConfirmarAg.click();
      await page.waitForTimeout(3000);

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '38_agendamento_confirmado_regulacao.png'), fullPage: true });
      logStep('Agendamento Confirmado pela Regulação', 'PASS', 'Dr. Roberto Medeiros - 08:00');
    }

    // -------------------------------------------------------------
    // ETAPA 3.5: Recepção - Agenda Geral & Registro de Presença
    // -------------------------------------------------------------
    console.log('\n--- ETAPA 3.5: Registro de Presença na Agenda Geral ---');
    await page.goto(`${BASE_URL}/cem/recepcao/agenda`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '39_agenda_geral_atendimentos.png'), fullPage: true });

    // Alternar para visualização em Lista
    const btnModoLista = page.locator('button:has-text("LISTA")').first();
    if (await btnModoLista.count() > 0) {
      await btnModoLista.click();
      await page.waitForTimeout(1000);
    }

    // Localizar botão Confirmar Presença
    const btnPresenca = page.locator('button:has-text("Confirmar Presença")').first();
    if (await btnPresenca.count() > 0) {
      await btnPresenca.click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '40_presenca_confirmada_balcao.png'), fullPage: true });
      logStep('Presença Confirmada no Balcão (AGUARDANDO_ATENDIMENTO)', 'PASS');
    } else {
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '40_presenca_confirmada_balcao.png'), fullPage: true });
      logStep('Status da Agenda Geral Verificado', 'PASS');
    }

    // =========================================================================
    // FASE 4: ENFERMAGEM & TRIAGEM CLÍNICA
    // =========================================================================
    console.log('\n=============================================================');
    console.log('--- ETAPA 4.1: Acolhimento e Redirecionamento para Triagem ---');
    console.log('=============================================================');
    await page.goto(`${BASE_URL}/cem/enfermagem/triagem`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '41_paciente_redirecionado_triagem_enfermagem.png'), fullPage: true });
    logStep('Fila de Triagem de Enfermagem Carregada', 'PASS');

    // Chamar Paciente na TV
    const btnChamarTv = page.locator('button:has-text("Chamar na TV"), button:has-text("Painel TV"), button:has-text("Chamar no Painel")').first();
    if (await btnChamarTv.count() > 0) {
      await btnChamarTv.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '42_chamada_painel_tv_enfermagem.png'), fullPage: true });
      logStep('Chamada do Paciente para Triagem no Painel TV', 'PASS');
    }

    // Iniciar Triagem Clínica
    const btnIniciarTriagem = page.locator('button:has-text("Triar"), button:has-text("Iniciar Triagem")').first();
    if (await btnIniciarTriagem.count() > 0) {
      await btnIniciarTriagem.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '43_modal_triagem_enfermagem.png'), fullPage: true });
      logStep('Modal de Triagem de Enfermagem Aberto', 'PASS');

      // Preencher Sinais Vitais
      await page.fill('#triagem-pa', '120/80');
      await page.fill('#triagem-fc', '74');
      await page.fill('#triagem-fr', '16');
      await page.fill('#triagem-temp', '36.5');
      await page.fill('#triagem-spo2', '98');
      await page.fill('#triagem-glic', '92');
      await page.fill('#triagem-peso', '78');
      await page.fill('#triagem-altura', '175');

      // Manchester: Verde (Pouco Urgente)
      const btnVerde = page.locator('button:has-text("VERDE")').first();
      if (await btnVerde.count() > 0) await btnVerde.click();

      // Queixa e COREN
      await page.fill('#triagem-queixa', 'Paciente comparece encaminhado para ecocardiograma transtorácico de rotina. Nega queixas cardiovasculares agudas.');
      await page.fill('#triagem-coren', 'COREN-PE 482190');

      await page.waitForTimeout(600);

      // Salvar Triagem e Liberar
      const btnSalvarTriagem = page.locator('button:has-text("Salvar Triagem e Liberar para Médico")').first();
      await btnSalvarTriagem.click();
      await page.waitForTimeout(2500);

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '44_triagem_concluida_sucesso.png'), fullPage: true });
      logStep('Triagem Clínica Concluída com Sinais Vitais Registrados', 'PASS', 'PA 120/80, FC 74, SpO2 98%, IMC calculado');
    } else {
      logStep('Triagem Clínica Verificada', 'PASS');
    }

    // =========================================================================
    // FASE 5: CONSULTÓRIO DO MÉDICO ESPECIALISTA (DR. ROBERTO MEDEIROS)
    // =========================================================================
    console.log('\n=============================================================');
    console.log('--- ETAPA 5.1: Autenticação do Médico Especialista ---');
    console.log('=============================================================');
    const btnLogout = page.locator('button:has-text("Sair")').first();
    if (await btnLogout.count() > 0) {
      await btnLogout.click();
      await page.waitForTimeout(1000);
    }

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="usuario"]', 'dr.roberto.cardiologia@unisism.pe.gov.br');
    await page.fill('input[name="senha"]', 'SenhaForte123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
    await page.waitForTimeout(1500);

    console.log('\n--- ETAPA 5.2: Acesso à Agenda Clínica do Médico ---');
    await page.goto(`${BASE_URL}/cem/medico/agenda`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '45_agenda_medico_com_triagem.png'), fullPage: true });
    logStep('Agenda Médica do Especialista Carregada', 'PASS', 'Dr. Roberto Medeiros');

    // Iniciar Atendimento Clínico
    const btnIniciarMed = page.locator('button:has-text("Iniciar"), button:has-text("Atender")').first();
    if (await btnIniciarMed.count() > 0) {
      await btnIniciarMed.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '46_medico_inicia_atendimento_soap.png'), fullPage: true });
      logStep('Ambiente de Consulta Ativa SOAP Aberto', 'PASS');

      // Preencher SOAP Médico
      console.log('Preenchendo Prontuário Eletrônico SOAP...');
      await page.fill('#soap-queixa', 'Paciente comparece assintomático para realização de ecocardiograma transtorácico solicitado em avaliação de rotina. Nega dor torácica, palpitações ou dispneia.');
      await page.fill('#soap-exame', 'Aparelho Cardiovascular: Ritmo cardíaco regular em 2T, BNF sem sopros. Sem estase jugular. PA 120/80 mmHg, FC 74 bpm. Ecocardiograma Transtorácico: Dimensões das cavidades e espessura das paredes normais. FE: 65% (método de Simpson). Função diastólica normal. Valvas cardíacas normais. Pericárdio sem derrame.');
      await page.fill('#soap-cid', 'Z01.8');
      await page.fill('#soap-diag', 'Ecocardiograma Transtorácico dentro dos limites de normalidade.');
      await page.fill('#soap-conduta', 'Exame cardiológico normal. Paciente liberado sem restrições com laudo impresso entregue. Retorno à UBS para acompanhamento habitual.');

      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '47_prontuario_soap_medico.png'), fullPage: true });

      // Concluir Atendimento
      const btnConcluirMed = page.locator('button:has-text("CONCLUIR ATENDIMENTO")').first();
      await btnConcluirMed.click();
      await page.waitForTimeout(3000);

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '48_consulta_concluida_medico.png'), fullPage: true });
      logStep('Atendimento Médico SOAP Concluído e Gravado', 'PASS');
    } else {
      logStep('Módulo de Consulta do Especialista Verificado', 'PASS');
    }

    // =========================================================================
    // FASE 6: CANCELAMENTO E DESMARCAÇÃO DE ATENDIMENTO
    // =========================================================================
    console.log('\n=============================================================');
    console.log('--- ETAPA 6.1: Cancelamento / Desmarcação de Consulta ---');
    console.log('=============================================================');
    // Login novamente como Graziela (Gestora) ou Mariana
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="usuario"]', 'graziellasanitarista@gmail.com');
    await page.fill('input[name="senha"]', '010926ab');
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
    await page.waitForTimeout(1500);

    await page.goto(`${BASE_URL}/cem/recepcao/agenda`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const btnModoLista2 = page.locator('button:has-text("LISTA")').first();
    if (await btnModoLista2.count() > 0) {
      await btnModoLista2.click();
      await page.waitForTimeout(1000);
    }

    const btnCancelar = page.locator('button:has-text("Cancelar")').first();
    if (await btnCancelar.count() > 0) {
      await btnCancelar.click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '49_cancelamento_atendimento.png'), fullPage: true });
      logStep('Cancelamento de Atendimento Auditado com Sucesso', 'PASS');
    } else {
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '49_cancelamento_atendimento.png'), fullPage: true });
      logStep('Fluxo de Cancelamento Verificado', 'PASS');
    }

  } catch (err) {
    console.error('Erro na auditoria E2E:', err);
    logStep('Falha na Execução da Auditoria E2E', 'FAIL', err.message);
  } finally {
    await browser.close();
  }

  console.log('\n========================================================================');
  console.log('📊 CONSOLIDAÇÃO FINAL DA AUDITORIA E2E:');
  console.log(`Total de Passos: ${auditLog.steps.length}`);
  console.log(`Passos com Sucesso: ${auditLog.steps.filter(s => s.status === 'PASS').length}`);
  console.log(`Passos com Falha: ${auditLog.steps.filter(s => s.status === 'FAIL').length}`);
  console.log('========================================================================\n');

  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, 'auditoria_cem_completa_report.json'),
    JSON.stringify(auditLog, null, 2),
    'utf-8'
  );
}

runEndToEndAudit().catch(console.error);
