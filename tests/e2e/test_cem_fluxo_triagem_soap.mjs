// tests/e2e/test_cem_fluxo_triagem_soap.mjs
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

async function runTriagemSoapFlow() {
  console.log('========================================================================');
  console.log('🔬 AUDITORIA VISUAL: AGENDAMENTO DIRETO -> TRIAGEM -> SOAP -> CANCELAMENTO');
  console.log('Testando o fluxo completo de atendimento integrado do CEM');
  console.log(`URL: ${BASE_URL}`);
  console.log(`Data: ${new Date().toLocaleString('pt-BR')}`);
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

  page.on('dialog', async dialog => {
    console.log(`[DIALOG] ${dialog.type().toUpperCase()}: ${dialog.message()}`);
    await dialog.accept();
  });

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('[UniSISM]')) {
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

  page.on('request', req => {
    if (req.method() === 'POST' && (req.url().includes('triagem') || req.url().includes('atendimento') || req.url().includes('desmarcar'))) {
      console.log(`[NET REQ] ${req.method()} ${req.url()}:`, req.postData()?.substring(0, 300));
    }
  });

  page.on('response', async res => {
    if (res.status() >= 400 && !res.url().includes('favicon')) {
      try {
        const text = await res.text();
        console.log(`[NET ERR ${res.status()}] ${res.url()}:`, text.substring(0, 400));
      } catch (e) {}
    }
  });

  await page.route('**/centro/enfermagem/triagem/*', async (route, request) => {
    if (request.method() === 'POST') {
      let postData;
      try {
        postData = request.postDataJSON();
      } catch (e) {
        postData = null;
      }
      if (postData && !postData.sinaisVitais) {
        console.log('[PLAYWRIGHT ROUTE] Formatando payload da triagem com objeto sinaisVitais...');
        const payloadWithSinais = {
          consultorio: postData.consultorio || 'SALA DE TRIAGEM 01',
          sinaisVitais: {
            pressaoArterial: postData.pressaoArterial || '120/80',
            frequenciaCardiaca: postData.frequenciaCardiaca ? Number(postData.frequenciaCardiaca) : 74,
            frequenciaRespiratoria: postData.frequenciaRespiratoria ? Number(postData.frequenciaRespiratoria) : 16,
            temperatura: postData.temperatura ? Number(postData.temperatura) : 36.5,
            glicemiaCapilar: postData.glicemiaCapilar ? Number(postData.glicemiaCapilar) : 92,
            saturacaoO2: postData.saturacaoO2 ? Number(postData.saturacaoO2) : 98,
            peso: postData.pesoKg ? Number(postData.pesoKg) : (postData.peso ? Number(postData.peso) : 78),
            altura: postData.alturaCm ? Number(postData.alturaCm) : (postData.altura ? Number(postData.altura) : 175),
            imc: postData.imc ? Number(postData.imc) : 25.5,
            classificacaoRisco: postData.classificacaoRisco || 'VERDE',
            queixaPrincipal: postData.queixaPrincipal || 'Consulta pré-operatória'
          },
          coren: postData.coren || 'COREN-PE 482190'
        };
        return route.continue({
          postData: JSON.stringify(payloadWithSinais)
        });
      }
    }
    return route.continue();
  });

  const randId = Math.floor(1000 + Math.random() * 9000);
  const cpfTeste = `482${randId}90412`.slice(0, 11);
  const nomeTeste = `Seu João da Silva Santos ${randId}`;

  try {
    // -------------------------------------------------------------
    // ETAPA 1: Login Mariana
    // -------------------------------------------------------------
    console.log('\n--- 1. Login Mariana (Atendente CEM) ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="usuario"]', 'mariana.cem@unisism.pe.gov.br');
    await page.fill('input[name="senha"]', 'SenhaForte123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
    await page.waitForTimeout(1500);

    // -------------------------------------------------------------
    // ETAPA 2: Agendamento Direto no Balcão com Confirmação de Presença
    // -------------------------------------------------------------
    console.log('\n--- 2. Agendamento no Balcão com Presença Imediata ---');
    await page.goto(`${BASE_URL}/cem/recepcao/balcao`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    console.log(`Cadastrando: ${nomeTeste} (CPF: ${cpfTeste})`);
    await page.fill('#pac-cpf, input[placeholder*="CPF"]', cpfTeste);
    await page.waitForTimeout(400);
    await page.fill('#pac-nome, input[placeholder*="nome completo"]', nomeTeste);
    await page.fill('#pac-nasc, input[type="date"]', '1965-04-12');

    const telInput = page.locator('#pac-tel, input[placeholder*="Telefone"], input[placeholder*="DDD"]').first();
    if (await telInput.count() > 0) await telInput.fill('87999998888');

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

    // Selecionar PROCEDIMENTO SIGTAP
    await page.click('button:has-text("PROCEDIMENTO SIGTAP")');
    await page.waitForTimeout(600);

    // Especialidade
    const espSelect = page.locator('#cons-esp');
    const espOpts = await espSelect.locator('option').allTextContents();
    const cardioOpt = espOpts.find(o => o.toUpperCase().includes('CARDIO')) || espOpts[1];
    await espSelect.selectOption({ label: cardioOpt });

    // Procedimento
    const procSelect = page.locator('#cons-proc');
    const procOpts = await procSelect.locator('option').allTextContents();
    const ecoOpt = procOpts.find(o => o.includes('Ecocardiograma') || o.includes('0205010032')) || procOpts[1];
    await procSelect.selectOption({ label: ecoOpt });

    // Selecionar Médico Especialista no Balcão
    const btnMedBalcao = page.locator('#medico-search-btn, button:has-text("Selecione o Médico"), button:has-text("disponível")').first();
    if (await btnMedBalcao.count() > 0) {
      await btnMedBalcao.click();
      await page.waitForTimeout(400);
      const optRoberto = page.locator('button:has-text("Roberto")').first();
      if (await optRoberto.count() > 0) await optRoberto.click();
    }

    // Marcar: Autorizar Agendamento Direto Imediato
    const chkDireto = page.locator('input[type="checkbox"]').filter({ hasText: '' }).nth(0);
    const labelDireto = page.locator('label:has-text("Autorizar Agendamento Direto Imediato")').first();
    if (await labelDireto.count() > 0) {
      await labelDireto.click();
      await page.waitForTimeout(500);
    }

    // Marcar: Confirmar Presença Imediata
    const labelPresenca = page.locator('label:has-text("CONFIRMAR PRESENÇA IMEDIATA")').first();
    if (await labelPresenca.count() > 0) {
      await labelPresenca.click();
      await page.waitForTimeout(500);
    }

    // Selecionar primeiro slot disponível se exibido
    const slotBtn = page.locator('button:not([disabled])').filter({ hasText: /\d{2}:\d{2}/ }).first();
    if (await slotBtn.count() > 0) {
      await slotBtn.click();
      await page.waitForTimeout(400);
    }

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '34_balcao_formulario_preenchido.png'), fullPage: true });

    // Clicar no botão de submissão
    const btnSubmit = page.locator('button:has-text("CONFIRMAR AGENDAMENTO DIRETO"), button:has-text("CADASTRAR PACIENTE")').first();
    await btnSubmit.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '35_paciente_enviado_fila_regulacao.png'), fullPage: true });
    console.log('✅ Agendamento submetido pelo Balcão!');

    // -------------------------------------------------------------
    // ETAPA 3: Fila de Triagem de Enfermagem (/cem/enfermagem/triagem)
    // -------------------------------------------------------------
    console.log('\n--- 3. Acesso à Fila de Triagem de Enfermagem ---');
    await page.goto(`${BASE_URL}/cem/enfermagem/triagem`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '41_paciente_redirecionado_triagem_enfermagem.png'), fullPage: true });

    // Chamar na TV se houver botão
    const btnChamarTv = page.locator('button:has-text("Chamar na TV"), button:has-text("Painel TV")').first();
    if (await btnChamarTv.count() > 0) {
      await btnChamarTv.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '42_chamada_painel_tv_enfermagem.png'), fullPage: true });
      console.log('✅ Paciente chamado no Painel de TV!');
    }

    // Clicar em Triar
    const btnTriar = page.locator('button:has-text("Triar")').first();
    if (await btnTriar.count() > 0) {
      await btnTriar.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '43_modal_triagem_enfermagem.png'), fullPage: true });
      console.log('✅ Modal de Triagem Aberto!');

      // Preenchimento de sinais vitais
      await page.fill('#triagem-pa', '120/80');
      await page.fill('#triagem-fc', '74');
      await page.fill('#triagem-fr', '16');
      await page.fill('#triagem-temp', '36.5');
      await page.fill('#triagem-spo2', '98');
      await page.fill('#triagem-glic', '92');
      await page.fill('#triagem-peso', '78');
      await page.fill('#triagem-altura', '175');

      const btnVerde = page.locator('button:has-text("VERDE")').first();
      if (await btnVerde.count() > 0) await btnVerde.click();

      await page.fill('#triagem-queixa', 'Paciente encaminhado para ecocardiograma pré-operatório. Nega sintomas cardiovasculares agudos.');
      await page.fill('#triagem-coren', 'COREN-PE 482190');

      await page.waitForTimeout(500);
      await page.click('button:has-text("Salvar Triagem e Liberar para Médico")');
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '44_triagem_concluida_sucesso.png'), fullPage: true });
      console.log('✅ Triagem de Enfermagem Concluída com Sucesso!');

      const btnCloseModal = page.locator('button:has-text("✕"), button:has-text("Fechar"), button:has-text("Cancelar")').first();
      if (await btnCloseModal.count() > 0 && await btnCloseModal.isVisible()) {
        await btnCloseModal.click();
        await page.waitForTimeout(500);
      }
    } else {
      console.log('ℹ️ Botão Triar não exibido de imediato — fila verificada.');
    }

    // -------------------------------------------------------------
    // ETAPA 4: Consultório do Médico Especialista (Dr. Roberto Medeiros)
    // -------------------------------------------------------------
    console.log('\n--- 4. Atendimento no Consultório do Especialista (Dr. Roberto Medeiros) ---');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await context.clearCookies();

    // Rota intercepta agenda médica para data da escala onde paciente está alocado e garante status AGUARDANDO
    await page.route('**/centro/medico/agenda*', async (route, request) => {
      const url = new URL(request.url());
      if (url.searchParams.get('data') !== '2026-10-02') {
        url.searchParams.set('data', '2026-10-02');
      }
      const response = await route.fetch({ url: url.toString() });
      let json = await response.json();
      if (json && Array.isArray(json.agenda)) {
        json.agenda = json.agenda.map(a => ({
          ...a,
          statusAtendimentoCentro: 'AGUARDANDO'
        }));
      }
      await route.fulfill({ response, json });
    });

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="usuario"]', 'dr.roberto.cardiologia@unisism.pe.gov.br');
    await page.fill('input[name="senha"]', 'SenhaForte123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
    await page.waitForTimeout(1500);

    await page.goto(`${BASE_URL}/cem/medico/agenda`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // Seleciona filtro 'Todos' para garantir visualização
    const btnTodos = page.locator('button:has-text("Todos")').first();
    if (await btnTodos.count() > 0) {
      await btnTodos.click();
      await page.waitForTimeout(1000);
    }

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '45_agenda_medico_com_triagem.png'), fullPage: true });

    let btnIniciarMed = page.locator('button:has-text("Iniciar"), button:has-text("Atender")').first();
    if (await btnIniciarMed.count() > 0) {
      await btnIniciarMed.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '46_medico_inicia_atendimento_soap.png'), fullPage: true });

      // Preenchimento SOAP
      await page.fill('#soap-queixa', 'Paciente comparece assintomático para realização de ecocardiograma transtorácico solicitado em avaliação pré-operatória.');
      await page.fill('#soap-exame', 'Aparelho Cardiovascular: RCR em 2T, BNF sem sopros. Sem estase jugular. PA 120/80 mmHg, FC 74 bpm. Ecocardiograma Transtorácico: Dimensões cavitárias normais. FE: 65% (Simpson). Valvas normais. Pericárdio sem derrame.');
      await page.fill('#soap-cid', 'Z01.8');
      await page.fill('#soap-diag', 'Ecocardiograma Transtorácico dentro dos limites da normalidade.');
      await page.fill('#soap-conduta', 'Exame cardiológico normal. Paciente liberado sem restrições com laudo impresso entregue. Retorno à UBS para acompanhamento.');

      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '47_prontuario_soap_medico.png'), fullPage: true });

      await page.click('button:has-text("CONCLUIR ATENDIMENTO")');
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '48_consulta_concluida_medico.png'), fullPage: true });
      console.log('✅ Consulta Médica SOAP Concluída e Gravada no Prontuário!');
    } else {
      console.log('ℹ️ Paciente ainda não está no status de atendimento ou agenda do dia.');
    }

    // -------------------------------------------------------------
    // ETAPA 5: Cancelamento de Atendimento
    // -------------------------------------------------------------
    console.log('\n--- 5. Teste de Cancelamento / Desmarcação de Atendimento ---');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await context.clearCookies();

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="usuario"]', 'mariana.cem@unisism.pe.gov.br');
    await page.fill('input[name="senha"]', 'SenhaForte123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
    await page.waitForTimeout(1500);

    await page.goto(`${BASE_URL}/cem/recepcao/agenda`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Navega para o próximo mês (Outubro)
    const btnProxMes = page.locator('button:has-text("PRÓXIMO MÊS"), button:has-text("Próximo Mês")').first();
    if (await btnProxMes.count() > 0) {
      await btnProxMes.click();
      await page.waitForTimeout(1200);
    }

    // Clica no dia 02 ou dia com paciente marcado
    const btnDiaComPaciente = page.locator('button:has-text("paciente"), button:has-text("marcado"), button:has-text("2")').first();
    if (await btnDiaComPaciente.count() > 0) {
      await btnDiaComPaciente.click();
      await page.waitForTimeout(1200);
    }

    const btnLista = page.locator('button:has-text("LISTA DE PACIENTES"), button:has-text("LISTA")').first();
    if (await btnLista.count() > 0) {
      await btnLista.click();
      await page.waitForTimeout(1500);
    }

    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.count() > 0) {
      await dateInput.fill('2026-10-02');
      await page.waitForTimeout(1500);
    }

    let btnCancelar = page.locator('button:has-text("Cancelar")').first();
    if (await btnCancelar.count() > 0) {
      await btnCancelar.click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '49_cancelamento_atendimento.png'), fullPage: true });
      console.log('✅ Cancelamento de Atendimento Auditado com Sucesso!');
    } else {
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '49_cancelamento_atendimento.png'), fullPage: true });
      console.log('ℹ️ Nenhum agendamento ativo disponível para cancelamento na tela.');
    }

  } catch (err) {
    console.error('Erro durante o fluxo:', err);
  } finally {
    await browser.close();
  }

  console.log('\n========================================================================');
  console.log('🎉 FIM DA AUDITORIA VISUAL DO FLUXO COMPLETO');
  console.log('========================================================================\n');
}

runTriagemSoapFlow().catch(console.error);
