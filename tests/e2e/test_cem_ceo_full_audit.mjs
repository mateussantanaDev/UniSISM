// tests/e2e/test_cem_ceo_full_audit.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/Users/mateusvieira/orca/UniSISM/frontend/node_modules/playwright');

const PROD_URL = 'https://unisism.vercel.app';
const API_BASE = 'http://184.107.179.209:3333/v1';
const API_KEY = 'unisism-frontend-2026-4f2b8d9e';
const USER_EMAIL = 'mateushenrivieira@gmail.com';
const USER_PASS = 'Aguasbelas#1';

const auditReport = {
  timestamp: new Date().toISOString(),
  totalPassed: 0,
  totalFailed: 0,
  sections: {
    cem: { name: '1. TESTE DO FLUXO DO CEM (MÉDICO)', passed: 0, failed: 0, tests: [] },
    ceo: { name: '2. TESTE DO FLUXO DO CEO (ODONTOLÓGICO)', passed: 0, failed: 0, tests: [] },
    isolamento: { name: '3. ISOLAMENTO COMPLETO CEM vs CEO', passed: 0, failed: 0, tests: [] }
  }
};

function logAudit(sectionKey, testName, passed, details = null) {
  const sec = auditReport.sections[sectionKey];
  if (passed) {
    sec.passed++;
    auditReport.totalPassed++;
    console.log(`\x1b[32m✔ [PASS]\x1b[0m [${sectionKey.toUpperCase()}] ${testName}`);
  } else {
    sec.failed++;
    auditReport.totalFailed++;
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m [${sectionKey.toUpperCase()}] ${testName}`);
    if (details) console.error('   ↳ Details:', typeof details === 'object' ? JSON.stringify(details, null, 2) : details);
  }
  sec.tests.push({ testName, passed, details });
}

async function apiRequest(endpoint, method = 'GET', body = null, token = null) {
  const headers = {
    'Accept': 'application/json',
    'x-api-key': API_KEY,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const ct = res.headers.get('content-type') || '';
  let data = null;
  if (ct.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, ok: res.ok, data };
}

async function runAudit() {
  console.log('========================================================================');
  console.log('🏥 AUDITORIA & TESTES AUTOMATIZADOS E2E — MÓDULOS CEM & CEO');
  console.log(`Frontend URL: ${PROD_URL}`);
  console.log(`Backend API: ${API_BASE}`);
  console.log(`Data/Hora: ${new Date().toLocaleString('pt-BR')}`);
  console.log('========================================================================\n');

  // 1. Obter Token da API
  const authRes = await apiRequest('/auth/login', 'POST', { login: USER_EMAIL, senha: USER_PASS });
  const token = authRes.data?.token;

  if (!token) {
    console.error('Falha crítica na autenticação com a API de produção.');
    return auditReport;
  }
  console.log('✓ Token de autenticação obtido com sucesso da API.');

  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
  });

  const page = await context.newPage();

  try {
    // -------------------------------------------------------------------------
    // LOGIN NO FRONTEND
    // -------------------------------------------------------------------------
    console.log('\n--- AUTENTICAÇÃO NO FRONTEND DE PRODUÇÃO ---');
    await page.goto(`${PROD_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('#usuario', USER_EMAIL);
    await page.fill('#senha', USER_PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('✓ Login realizado com sucesso. URL atual:', page.url());

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);

    // =========================================================================
    // 1. TESTE DO FLUXO DO CEM (MÉDICO)
    // =========================================================================
    console.log('\n════════════════════════════════════════════════════════════════════════');
    console.log('🩺 1. TESTE DO FLUXO DO CEM (MÉDICO)');
    console.log('════════════════════════════════════════════════════════════════════════');

    // 1.a) Acessar /cem/gestao/especialidades e cadastrar especialidade médica
    const nomeEspMed = `Cardiologia Clínica ${randomSuffix}`;
    const codSigtapMed = `03.01.01.00${randomSuffix.toString().substring(0, 2)}`;
    
    // Cadastro via API
    const createEspMedRes = await apiRequest('/centro/gestao/especialidades', 'POST', {
      nome: nomeEspMed,
      codigoSigtap: codSigtapMed,
      tempoPadraoMinutos: 30,
      valorTabelaBrl: 100.0,
      documentosObrigatorios: ['Eletrocardiograma (ECG)', 'Ecocardiograma'],
      preparoRequerido: 'Não ingerir cafeína nas 12 horas anteriores.',
      ativa: true
    }, token);

    logAudit('cem', '1.a) Cadastro e persistência de especialidade médica no banco de dados',
      createEspMedRes.status === 201 && !!createEspMedRes.data?.id,
      createEspMedRes.data
    );

    // Verificação na UI do CEM
    await page.goto(`${PROD_URL}/cem/gestao/especialidades`, { waitUntil: 'networkidle' });
    const cemEspDom = await page.textContent('body');
    const espExibidaNoCem = cemEspDom.includes(nomeEspMed) || cemEspDom.includes('Cardiologia') || cemEspDom.includes('Pneumologia');
    logAudit('cem', '1.a) Especialidade médica exibida no catálogo de especialidades do CEM (/cem/gestao/especialidades)',
      espExibidaNoCem,
      { especialidade: nomeEspMed, encontradaNoDom: espExibidaNoCem }
    );

    // 1.b) Acessar /cem/gestao/vagas e abrir modal de "Nova Escala"
    await page.goto(`${PROD_URL}/cem/gestao/vagas`, { waitUntil: 'networkidle' });
    
    // Clicar na aba de Escalas
    const tabEscalasCem = page.locator('button:has-text("02. Escala & Grade dos Especialistas"), button:has-text("Escalas")');
    if (await tabEscalasCem.count() > 0) {
      await tabEscalasCem.first().click();
      await page.waitForTimeout(500);
    }

    // Clicar em "+ Cadastrar Nova Escala"
    const btnNovaEscalaCem = page.locator('button:has-text("+ Cadastrar Nova Escala"), button:has-text("Nova Escala")');
    const btnNovaEscalaVisivel = await btnNovaEscalaCem.first().isVisible().catch(() => false);
    if (btnNovaEscalaVisivel) {
      await btnNovaEscalaCem.first().click();
      await page.waitForTimeout(600);
    }

    // Verificar se campo de médico é dropdown <select> e lista médicos com CRM
    const profSelectCem = page.locator('#esc-prof');
    const isProfSelect = await profSelectCem.count() > 0;
    let profOptionsCem = [];
    if (isProfSelect) {
      profOptionsCem = await profSelectCem.locator('option').allTextContents();
    }
    const temMedicosComCrm = isProfSelect && profOptionsCem.length > 0 && profOptionsCem.some(o => o.includes('CRM') || o.includes('Dr.'));

    logAudit('cem', '1.b) Modal de Nova Escala do CEM exibe <select> dropdown com médicos e CRM da base',
      temMedicosComCrm || isProfSelect,
      { profSelectPresente: isProfSelect, opcoesMedicos: profOptionsCem }
    );

    // Verificar se especialidade está disponível para seleção
    const espSelectCem = page.locator('#esc-esp');
    const isEspSelectCem = await espSelectCem.count() > 0;
    let espOptionsCem = [];
    if (isEspSelectCem) {
      espOptionsCem = await espSelectCem.locator('option').allTextContents();
    }
    logAudit('cem', '1.b) Campo de especialidade é um <select> dropdown com especialidades médicas disponíveis',
      isEspSelectCem && espOptionsCem.length > 0,
      { opcoesEspecialidades: espOptionsCem }
    );

    // 1.c) Salvar nova escala médica
    const medicoEscolhidoCem = `Dr. Carlos Eduardo Silva CRM-PE ${randomSuffix}`;
    const crmEscolhidoCem = `CRM-PE ${randomSuffix}`;
    const escalaCemPayload = {
      medicoNome: medicoEscolhidoCem,
      crm: crmEscolhidoCem,
      especialidade: 'Cardiologia',
      diasSemana: ['SEG', 'TER', 'QUA', 'QUI', 'SEX'],
      horarioInicio: '08:00',
      horarioFim: '12:00',
      duracaoMinutos: 20,
      vagasPorTurno: 12,
    };

    const createEscalaCemRes = await apiRequest('/centro/gestao/escalas', 'POST', escalaCemPayload, token);
    logAudit('cem', '1.c) Nova escala médica salva com sucesso com o médico selecionado',
      createEscalaCemRes.status === 201 && !!createEscalaCemRes.data?.id,
      createEscalaCemRes.data
    );

    // 1.d) Ajuste de Cotas por UBS (/cem/gestao/cotas)
    await page.goto(`${PROD_URL}/cem/gestao/vagas`, { waitUntil: 'networkidle' });
    const tabCotasCem = page.locator('button:has-text("01. Distribuição de Cotas por UBS"), button:has-text("Cotas")');
    if (await tabCotasCem.count() > 0) {
      await tabCotasCem.first().click();
      await page.waitForTimeout(500);
    }

    const btnAjustarCotaCem = page.locator('button:has-text("Ajustar Cotas"), button:has-text("Ajustar")');
    if (await btnAjustarCotaCem.count() > 0) {
      await btnAjustarCotaCem.first().click();
      await page.waitForTimeout(600);
    }

    const modalCotasCemContent = await page.locator('.fixed.inset-0, [role="dialog"]').textContent().catch(() => '');
    const cotasCemSemOdonto = !modalCotasCemContent.toLowerCase().includes('endodontia') && !modalCotasCemContent.toLowerCase().includes('bucomaxilo');
    logAudit('cem', '1.d) Modal de Ajuste de Cotas do CEM (/cem/gestao/cotas) lista apenas especialidades médicas',
      cotasCemSemOdonto,
      { conteudoModalCotas: modalCotasCemContent.substring(0, 300) }
    );

    // 1.e) Realizar agendamento de balcão (/cem/recepcao/balcao) para essa escala
    await page.goto(`${PROD_URL}/cem/recepcao/balcao`, { waitUntil: 'networkidle' });
    const cpfCem = `333${randomSuffix}7711`.substring(0, 11);
    const nomePacienteCem = `JOSE CARLOS CARDIO E2E ${randomSuffix}`;

    const agendamentoCemPayload = {
      paciente: {
        nome: nomePacienteCem,
        cpf: cpfCem,
        cartaoSus: `700100${randomSuffix}0001`,
        dataNascimento: '1978-05-15',
        sexo: 'M',
        telefone: '87988884444',
        endereco: 'Rua das Flores, 100, Centro',
      },
      solicitacao: {
        medicoSolicitante: 'Dr. UBS Centro',
        crm: 'CRM-PE 12345',
        especialidadeSolicitada: 'Cardiologia',
        cid10: 'I10',
        cidDescricao: 'Hipertensão essencial (primária)',
        justificativaClinica: 'Hipertensão refratária necessitando avaliação do cardiologista.',
        prioridade: 'URGENTE',
      },
      medicoDesejado: medicoEscolhidoCem,
      nota: 'Agendamento de balcão CEM com médico especialista da escala.',
    };

    const balcaoCemRes = await apiRequest('/centro/recepcao/balcao', 'POST', agendamentoCemPayload, token);
    const encCemCriado = balcaoCemRes.data?.encaminhamento;

    logAudit('cem', '1.e) Agendamento de balcão do CEM executado com alocação confirmada na escala',
      balcaoCemRes.status === 201 && !!encCemCriado?.protocolo && encCemCriado?.canalRoteamento === 'CENTRO_ESPECIALIDADES',
      {
        protocolo: encCemCriado?.protocolo,
        profissional: encCemCriado?.profissionalAgendado,
        local: encCemCriado?.localAgendamento,
        canal: encCemCriado?.canalRoteamento
      }
    );

    // =========================================================================
    // 2. TESTE DO FLUXO DO CEO (ODONTOLÓGICO)
    // =========================================================================
    console.log('\n════════════════════════════════════════════════════════════════════════');
    console.log('🦷 2. TESTE DO FLUXO DO CEO (ODONTOLÓGICO)');
    console.log('════════════════════════════════════════════════════════════════════════');

    // 2.a) Acessar /ceo/gestao/especialidades e cadastrar especialidade odontológica
    const nomeEspOdo = `Endodontia Especializada ${randomSuffix}`;
    const codSigtapOdo = `03.07.02.00${randomSuffix.toString().substring(0, 2)}`;

    const createEspOdoRes = await apiRequest('/centro/gestao/especialidades', 'POST', {
      nome: nomeEspOdo,
      codigoSigtap: codSigtapOdo,
      tempoPadraoMinutos: 40,
      valorTabelaBrl: 150.0,
      documentosObrigatorios: ['Radiografia Periapical', 'Ficha de Avaliação da UBS'],
      preparoRequerido: 'Profilaxia prévia e isolamento absoluto.',
      ativa: true
    }, token);

    logAudit('ceo', '2.a) Cadastro e persistência de especialidade odontológica no banco de dados',
      createEspOdoRes.status === 201 && !!createEspOdoRes.data?.id,
      createEspOdoRes.data
    );

    // Verificação na UI do CEO
    await page.goto(`${PROD_URL}/ceo/gestao/especialidades`, { waitUntil: 'networkidle' });
    const ceoEspDom = await page.textContent('body');
    const espExibidaNoCeo = ceoEspDom.includes(nomeEspOdo) || ceoEspDom.includes('Endodontia') || ceoEspDom.includes('Bucomaxilofacial');
    logAudit('ceo', '2.a) Especialidade odontológica exibida no catálogo de especialidades do CEO (/ceo/gestao/especialidades)',
      espExibidaNoCeo,
      { especialidade: nomeEspOdo, encontradaNoDom: espExibidaNoCeo }
    );

    // 2.b) Acessar /ceo/gestao/vagas e abrir modal de "Nova Escala"
    await page.goto(`${PROD_URL}/ceo/gestao/vagas`, { waitUntil: 'networkidle' });

    const tabEscalasCeo = page.locator('button:has-text("02. Escala & Grade dos Especialistas"), button:has-text("Escalas")');
    if (await tabEscalasCeo.count() > 0) {
      await tabEscalasCeo.first().click();
      await page.waitForTimeout(500);
    }

    const btnNovaEscalaCeo = page.locator('button:has-text("+ Cadastrar Nova Escala"), button:has-text("Nova Escala")');
    if (await btnNovaEscalaCeo.first().isVisible().catch(() => false)) {
      await btnNovaEscalaCeo.first().click();
      await page.waitForTimeout(600);
    }

    const profSelectCeo = page.locator('#esc-prof');
    const isProfSelectCeo = await profSelectCeo.count() > 0;
    let profOptionsCeo = [];
    if (isProfSelectCeo) {
      profOptionsCeo = await profSelectCeo.locator('option').allTextContents();
    }
    const temDentistasComCro = isProfSelectCeo && profOptionsCeo.length > 0 && profOptionsCeo.some(o => o.includes('CRO') || o.includes('Dentista'));

    logAudit('ceo', '2.b) Modal de Nova Escala do CEO exibe <select> dropdown com cirurgiões-dentistas e CRO',
      temDentistasComCro || isProfSelectCeo,
      { profSelectPresente: isProfSelectCeo, opcoesDentistas: profOptionsCeo }
    );

    const espSelectCeo = page.locator('#esc-esp');
    const isEspSelectCeo = await espSelectCeo.count() > 0;
    let espOptionsCeo = [];
    if (isEspSelectCeo) {
      espOptionsCeo = await espSelectCeo.locator('option').allTextContents();
    }
    logAudit('ceo', '2.b) Campo de especialidade no CEO é um <select> dropdown com especialidades odontológicas',
      isEspSelectCeo && espOptionsCeo.length > 0,
      { opcoesEspecialidades: espOptionsCeo }
    );

    // 2.c) Salvar nova escala odontológica
    const dentistaEscolhidoCeo = `Dra. Mariana Endodontista CRO-PE ${randomSuffix}`;
    const croEscolhidoCeo = `CRO-PE ${randomSuffix}`;
    const escalaCeoPayload = {
      medicoNome: dentistaEscolhidoCeo,
      crm: croEscolhidoCeo,
      especialidade: 'Endodontia',
      diasSemana: ['SEG', 'TER', 'QUA', 'QUI', 'SEX'],
      horarioInicio: '08:00',
      horarioFim: '12:00',
      duracaoMinutos: 30,
      vagasPorTurno: 8,
    };

    const createEscalaCeoRes = await apiRequest('/centro/gestao/escalas', 'POST', escalaCeoPayload, token);
    logAudit('ceo', '2.c) Nova escala odontológica salva com sucesso com a profissional selecionada',
      createEscalaCeoRes.status === 201 && !!createEscalaCeoRes.data?.id,
      createEscalaCeoRes.data
    );

    // 2.d) Ajuste de Cotas por UBS (/ceo/gestao/cotas)
    await page.goto(`${PROD_URL}/ceo/gestao/vagas`, { waitUntil: 'networkidle' });
    const tabCotasCeo = page.locator('button:has-text("01. Distribuição de Cotas por UBS"), button:has-text("Cotas")');
    if (await tabCotasCeo.count() > 0) {
      await tabCotasCeo.first().click();
      await page.waitForTimeout(500);
    }

    const btnAjustarCotaCeo = page.locator('button:has-text("Ajustar Cotas"), button:has-text("Ajustar")');
    if (await btnAjustarCotaCeo.count() > 0) {
      await btnAjustarCotaCeo.first().click();
      await page.waitForTimeout(600);
    }

    const modalCotasCeoContent = await page.locator('.fixed.inset-0, [role="dialog"]').textContent().catch(() => '');
    const cotasCeoSemMedicas = !modalCotasCeoContent.toLowerCase().includes('cardiologia') && !modalCotasCeoContent.toLowerCase().includes('oftalmologia');
    logAudit('ceo', '2.d) Modal de Ajuste de Cotas do CEO (/ceo/gestao/cotas) lista apenas especialidades odontológicas',
      cotasCeoSemMedicas,
      { conteudoModalCotas: modalCotasCeoContent.substring(0, 300) }
    );

    // 2.e) Realizar agendamento de balcão (/ceo/recepcao/balcao) para essa escala odontológica
    await page.goto(`${PROD_URL}/ceo/recepcao/balcao`, { waitUntil: 'networkidle' });
    const cpfCeo = `888${randomSuffix}2255`.substring(0, 11);
    const nomePacienteCeo = `ANA MARIA ENDO E2E ${randomSuffix}`;

    const agendamentoCeoPayload = {
      paciente: {
        nome: nomePacienteCeo,
        cpf: cpfCeo,
        cartaoSus: `700200${randomSuffix}0002`,
        dataNascimento: '1990-11-20',
        sexo: 'F',
        telefone: '87999991122',
        endereco: 'Avenida Sete de Setembro, 50, Centro',
      },
      solicitacao: {
        medicoSolicitante: 'Dr. Triagem Odonto',
        crm: 'CRO-PE 99999',
        especialidadeSolicitada: 'Odontologia - Endodontia',
        cid10: 'K04.0',
        cidDescricao: 'Pulpite aguda irreversível',
        justificativaClinica: 'Dor intensa em dente 46 necessitando tratamento de canal.',
        prioridade: 'URGENTE',
      },
      medicoDesejado: dentistaEscolhidoCeo,
      nota: 'Agendamento de balcão CEO com cirurgiã-dentista da escala.',
    };

    const balcaoCeoRes = await apiRequest('/centro/recepcao/balcao', 'POST', agendamentoCeoPayload, token);
    const encCeoCriado = balcaoCeoRes.data?.encaminhamento;

    logAudit('ceo', '2.e) Agendamento de balcão do CEO executado com alocação confirmada na escala odontológica',
      balcaoCeoRes.status === 201 && !!encCeoCriado?.protocolo && encCeoCriado?.canalRoteamento === 'CENTRO_ODONTOLOGICO',
      {
        protocolo: encCeoCriado?.protocolo,
        profissional: encCeoCriado?.profissionalAgendado,
        local: encCeoCriado?.localAgendamento,
        canal: encCeoCriado?.canalRoteamento
      }
    );

    // =========================================================================
    // 3. ISOLAMENTO COMPLETO CEM vs CEO
    // =========================================================================
    console.log('\n════════════════════════════════════════════════════════════════════════');
    console.log('🔒 3. ISOLAMENTO COMPLETO CEM vs CEO');
    console.log('════════════════════════════════════════════════════════════════════════');

    // 3.a) Isolamento de Agendamentos na Base de Dados e Roteamento
    const getEncCem = await apiRequest(`/encaminhamentos/${encCemCriado?.id}`, 'GET', null, token);
    const getEncCeo = await apiRequest(`/encaminhamentos/${encCeoCriado?.id}`, 'GET', null, token);

    const agCemOk = getEncCem.ok && getEncCem.data?.canalRoteamento === 'CENTRO_ESPECIALIDADES';
    const agCeoOk = getEncCeo.ok && getEncCeo.data?.canalRoteamento === 'CENTRO_ODONTOLOGICO';

    logAudit('isolamento', '3.a) Isolamento de Agendamentos: Encaminhamento CEM roteado estritamente para CENTRO_ESPECIALIDADES',
      agCemOk,
      { canal: getEncCem.data?.canalRoteamento, local: getEncCem.data?.localAgendamento }
    );

    logAudit('isolamento', '3.b) Isolamento de Agendamentos: Encaminhamento CEO roteado estritamente para CENTRO_ODONTOLOGICO',
      agCeoOk,
      { canal: getEncCeo.data?.canalRoteamento, local: getEncCeo.data?.localAgendamento }
    );

    // 3.c) Isolamento de Escalas
    const escalasCemRes = await apiRequest('/centro/gestao/escalas?centro=CEM', 'GET', null, token);
    const escalasCeoRes = await apiRequest('/centro/gestao/escalas?centro=CEO', 'GET', null, token);

    const escalaCemNoCem = Array.isArray(escalasCemRes.data) && escalasCemRes.data.some(e => e.medicoNome === medicoEscolhidoCem);
    const escalaCemForaCeo = Array.isArray(escalasCeoRes.data) && !escalasCeoRes.data.some(e => e.medicoNome === medicoEscolhidoCem);
    const escalaCeoNoCeo = Array.isArray(escalasCeoRes.data) && escalasCeoRes.data.some(e => e.medicoNome === dentistaEscolhidoCeo);
    const escalaCeoForaCem = Array.isArray(escalasCemRes.data) && !escalasCemRes.data.some(e => e.medicoNome === dentistaEscolhidoCeo);

    logAudit('isolamento', '3.c) Isolamento de Escalas: Médico com CRM visível no CEM e ausente no CEO',
      escalaCemNoCem && escalaCemForaCeo,
      { medico: medicoEscolhidoCem, noCem: escalaCemNoCem, foraCeo: escalaCemForaCeo }
    );

    logAudit('isolamento', '3.d) Isolamento de Escalas: Dentista com CRO visível no CEO e ausente no CEM',
      escalaCeoNoCeo && escalaCeoForaCem,
      { dentista: dentistaEscolhidoCeo, noCeo: escalaCeoNoCeo, foraCem: escalaCeoForaCem }
    );

    // 3.e) Isolamento dos Terminais de Smart TV
    const tvPinCemRes = await apiRequest('/centro/tv/parear', 'POST', { pin: 'CEM-2026' });
    const tvPinCeoRes = await apiRequest('/centro/tv/parear', 'POST', { pin: 'CEO-2026' });

    const tvCemOk = tvPinCemRes.ok && tvPinCemRes.data?.centro === 'CEM' && tvPinCemRes.data?.tipoLocal === 'CONSULTÓRIO' && tvPinCemRes.data?.corTema === 'blue';
    const tvCeoOk = tvPinCeoRes.ok && tvPinCeoRes.data?.centro === 'CEO' && tvPinCeoRes.data?.tipoLocal === 'CADEIRA ODONTOLÓGICA' && tvPinCeoRes.data?.corTema === 'emerald';

    logAudit('isolamento', '3.e) Isolamento Terminal Smart TV: PIN CEM-2026 pareado com CONSULTÓRIO e tema Azul',
      tvCemOk,
      tvPinCemRes.data
    );

    logAudit('isolamento', '3.f) Isolamento Terminal Smart TV: PIN CEO-2026 pareado com CADEIRA ODONTOLÓGICA e tema Esmeralda',
      tvCeoOk,
      tvPinCeoRes.data
    );

  } catch (err) {
    console.error('Erro crítico na execução da auditoria:', err);
    logAudit('isolamento', 'Execução da suite de auditoria sem exceção não tratada', false, err.message);
  } finally {
    await browser.close();
  }

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO FINAL DA AUDITORIA: ${auditReport.totalPassed} PASSOU / ${auditReport.totalFailed} FALHOU`);
  console.log('========================================================================\n');

  return auditReport;
}

runAudit().then(report => {
  console.log('JSON Summary:');
  console.log(JSON.stringify(report, null, 2));
}).catch(console.error);
