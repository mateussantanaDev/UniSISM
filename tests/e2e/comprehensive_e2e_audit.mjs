// tests/e2e/comprehensive_e2e_audit.mjs
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
  categories: {
    isolamentoCemCeo: { passed: 0, failed: 0, tests: [] },
    procedimentosEspecialidades: { passed: 0, failed: 0, tests: [] },
    fluxoClinicoE2E: { passed: 0, failed: 0, tests: [] },
    auditoriaRotasAliases: { passed: 0, failed: 0, tests: [] },
  },
};

function recordAudit(categoryKey, name, passed, details = null) {
  const cat = auditReport.categories[categoryKey];
  if (passed) {
    cat.passed++;
    auditReport.totalPassed++;
    console.log(`\x1b[32m✔ [PASS]\x1b[0m [${categoryKey}] ${name}`);
  } else {
    cat.failed++;
    auditReport.totalFailed++;
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m [${categoryKey}] ${name}`);
    if (details) console.error('   ↳ Details:', typeof details === 'object' ? JSON.stringify(details, null, 2) : details);
  }
  cat.tests.push({ name, passed, details });
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

async function runCompleteAudit() {
  console.log('========================================================================');
  console.log('🏥 2ª RODADA DE AUDITORIA COMPLETA & VARREDURA AUTOMATIZADA — CEM vs CEO');
  console.log(`Ambiente em Produção: ${PROD_URL}`);
  console.log(`Backend API: ${API_BASE}`);
  console.log(`Data/Hora da Execução: ${new Date().toLocaleString('pt-BR')}`);
  console.log('========================================================================\n');

  // 1. Obter Token de Autenticação via API
  const authRes = await apiRequest('/auth/login', 'POST', { login: USER_EMAIL, senha: USER_PASS });
  const token = authRes.data?.token;

  if (!token) {
    console.error('Falha crítica na autenticação com a API de produção.');
    return auditReport;
  }

  // ---------------------------------------------------------------------------
  // CATEGORIA 1: SEPARAÇÃO TOTAL E ISOLAMENTO CEM vs CEO
  // ---------------------------------------------------------------------------
  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log('📋 1. SEPARAÇÃO TOTAL E ISOLAMENTO CEM vs CEO');
  console.log('════════════════════════════════════════════════════════════════════════');

  // A. Pareamento de TV & Terminais
  const parearCem = await apiRequest('/centro/tv/parear', 'POST', { pin: 'CEM-2026' });
  recordAudit('isolamentoCemCeo', 'Pareamento TV PIN CEM-2026 reconhece CEM, tema Azul e CONSULTÓRIO', 
    parearCem.ok && parearCem.data?.centro === 'CEM' && parearCem.data?.tipoLocal === 'CONSULTÓRIO' && parearCem.data?.corTema === 'blue',
    parearCem.data
  );

  const parearCeo = await apiRequest('/centro/tv/parear', 'POST', { pin: 'CEO-2026' });
  recordAudit('isolamentoCemCeo', 'Pareamento TV PIN CEO-2026 reconhece CEO, tema Esmeralda e CADEIRA ODONTOLÓGICA', 
    parearCeo.ok && parearCeo.data?.centro === 'CEO' && parearCeo.data?.tipoLocal === 'CADEIRA ODONTOLÓGICA' && parearCeo.data?.corTema === 'emerald',
    parearCeo.data
  );

  // B. TV Chamadas CEM vs CEO
  const tvChamadasCem = await apiRequest('/centro/tv/chamadas?centro=CEM');
  const tvChamadasCeo = await apiRequest('/centro/tv/chamadas?centro=CEO');

  recordAudit('isolamentoCemCeo', 'Endpoint TV Chamadas CEM (/centro/tv/chamadas?centro=CEM) responde metadados exclusivos do CEM', 
    tvChamadasCem.ok && tvChamadasCem.data?.centro === 'CEM' && tvChamadasCem.data?.tipoLocal === 'CONSULTÓRIO',
    tvChamadasCem.data
  );

  recordAudit('isolamentoCemCeo', 'Endpoint TV Chamadas CEO (/centro/tv/chamadas?centro=CEO) responde metadados exclusivos do CEO', 
    tvChamadasCeo.ok && tvChamadasCeo.data?.centro === 'CEO' && tvChamadasCeo.data?.tipoLocal === 'CADEIRA ODONTOLÓGICA',
    tvChamadasCeo.data
  );

  // C. Especialidades Isolamento
  const espCem = await apiRequest('/centro/gestao/especialidades?centro=CEM', 'GET', null, token);
  const espCeo = await apiRequest('/centro/gestao/especialidades?centro=CEO', 'GET', null, token);

  const odontoTerms = ['odonto', 'endodont', 'periodont', 'bucomaxilo', 'bucal', 'prótese', 'protese', 'estomatol', 'pne'];
  const cemSemOdonto = Array.isArray(espCem.data) && espCem.data.length > 0 && espCem.data.every(e => !odontoTerms.some(kw => (e.nome || '').toLowerCase().includes(kw)));
  const ceoComOdonto = Array.isArray(espCeo.data) && espCeo.data.length > 0 && espCeo.data.every(e => odontoTerms.some(kw => (e.nome || '').toLowerCase().includes(kw)));

  recordAudit('isolamentoCemCeo', 'Catálogo CEM não contém especialidades odontológicas', cemSemOdonto, espCem.data);
  recordAudit('isolamentoCemCeo', 'Catálogo CEO contém exclusivamente especialidades odontológicas', ceoComOdonto, espCeo.data);

  // D. Salas e Infraestrutura Isolamento
  const salasCem = await apiRequest('/centro/gestao/salas?centro=CEM', 'GET', null, token);
  const salasCeo = await apiRequest('/centro/gestao/salas?centro=CEO', 'GET', null, token);

  const cemApenasConsultorios = Array.isArray(salasCem.data) && salasCem.data.length > 0 && salasCem.data.every(s => {
    const cod = (s.codigo || '').toLowerCase();
    const nome = (s.nome || '').toLowerCase();
    const esp = (s.especialidadePrincipal || '').toLowerCase();
    return !cod.startsWith('cad') && !nome.includes('cadeira') && !odontoTerms.some(kw => esp.includes(kw));
  });

  const ceoApenasCadeiras = Array.isArray(salasCeo.data) && salasCeo.data.length > 0 && salasCeo.data.every(s => {
    const cod = (s.codigo || '').toLowerCase();
    const nome = (s.nome || '').toLowerCase();
    const esp = (s.especialidadePrincipal || '').toLowerCase();
    return cod.startsWith('cad') || nome.includes('cadeira') || odontoTerms.some(kw => esp.includes(kw));
  });

  recordAudit('isolamentoCemCeo', 'Infraestrutura CEM contém exclusivamente CONSULTÓRIOS MÉDICOS', cemApenasConsultorios, salasCem.data);
  recordAudit('isolamentoCemCeo', 'Infraestrutura CEO contém exclusivamente CADEIRAS ODONTOLÓGICAS', ceoApenasCadeiras, salasCeo.data);

  // E. Escalas Profissionais Isolamento
  const escalasCem = await apiRequest('/centro/gestao/escalas?centro=CEM', 'GET', null, token);
  const escalasCeo = await apiRequest('/centro/gestao/escalas?centro=CEO', 'GET', null, token);

  const cemEscalasMed = Array.isArray(escalasCem.data) && escalasCem.data.length > 0;
  const ceoEscalasDent = Array.isArray(escalasCeo.data) && escalasCeo.data.length > 0;

  recordAudit('isolamentoCemCeo', 'Escalas do CEM listadas com sucesso da API', cemEscalasMed, escalasCem.data);
  recordAudit('isolamentoCemCeo', 'Escalas do CEO listadas com sucesso da API', ceoEscalasDent, escalasCeo.data);

  // ---------------------------------------------------------------------------
  // CATEGORIA 2: PROCEDIMENTOS E ESPECIALIDADES (DADOS REAIS NO BANCO)
  // ---------------------------------------------------------------------------
  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log('💉 2. PROCEDIMENTOS E ESPECIALIDADES (PERSISTÊNCIA REAL NO BANCO)');
  console.log('════════════════════════════════════════════════════════════════════════');

  const randomSuffix = Math.floor(1000 + Math.random() * 9000);

  // 1. Cadastrar nova especialidade médica no CEM
  const novaEspMedica = {
    nome: `Neurologia Clínica Avançada ${randomSuffix}`,
    codigoSigtap: `03.01.01.00${randomSuffix.toString().substring(0, 2)}`,
    tempoPadraoMinutos: 30,
    valorTabelaBrl: 110.0,
    documentosObrigatorios: ['Tomografia / Ressonância de Crânio', 'Eletroencefalograma'],
    preparoRequerido: 'Paciente deve comparecer com acompanhante e exames de imagem anteriores.',
    ativa: true,
  };

  const createEspMed = await apiRequest('/centro/gestao/especialidades', 'POST', novaEspMedica, token);
  recordAudit('procedimentosEspecialidades', `Criação de nova especialidade médica no banco (${novaEspMedica.nome})`, 
    createEspMed.status === 201 && !!createEspMed.data?.id,
    createEspMed.data
  );

  // 2. Cadastrar nova especialidade odontológica no CEO
  const novaEspOdonto = {
    nome: `Endodontia de Molares Trirradiculares ${randomSuffix}`,
    codigoSigtap: `03.07.02.00${randomSuffix.toString().substring(0, 2)}`,
    tempoPadraoMinutos: 45,
    valorTabelaBrl: 150.0,
    documentosObrigatorios: ['Radiografia Periapical Inicial', 'Ficha Clínica da UBS'],
    preparoRequerido: 'Profilaxia e isolamento absoluto prévio.',
    ativa: true,
  };

  const createEspOdo = await apiRequest('/centro/gestao/especialidades', 'POST', novaEspOdonto, token);
  recordAudit('procedimentosEspecialidades', `Criação de nova especialidade odontológica no banco (${novaEspOdonto.nome})`, 
    createEspOdo.status === 201 && !!createEspOdo.data?.id,
    createEspOdo.data
  );

  // 3. Validar segregação estrita no catálogo
  const checkEspCem = await apiRequest('/centro/gestao/especialidades?centro=CEM', 'GET', null, token);
  const checkEspCeo = await apiRequest('/centro/gestao/especialidades?centro=CEO', 'GET', null, token);

  const medNoCem = checkEspCem.data?.some(e => e.nome === novaEspMedica.nome);
  const medForaCeo = !checkEspCeo.data?.some(e => e.nome === novaEspMedica.nome);
  const odoNoCeo = checkEspCeo.data?.some(e => e.nome === novaEspOdonto.nome);
  const odoForaCem = !checkEspCem.data?.some(e => e.nome === novaEspOdonto.nome);

  recordAudit('procedimentosEspecialidades', 'Nova especialidade médica aparece no CEM e é excluída do CEO', medNoCem && medForaCeo);
  recordAudit('procedimentosEspecialidades', 'Nova especialidade odontológica aparece no CEO e é excluída do CEM', odoNoCeo && odoForaCem);

  // ---------------------------------------------------------------------------
  // CATEGORIA 3: FLUXO CLÍNICO COMPLETO E2E NO CEO
  // ---------------------------------------------------------------------------
  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log('🦷 3. FLUXO CLÍNICO COMPLETO E2E NO CEO (ESCALA -> BALCÃO -> TV -> PEC -> SOAP)');
  console.log('════════════════════════════════════════════════════════════════════════');

  // Passo 1: Criar escala odontológica para Dra. Camila no CEO
  const novaEscalaCeo = {
    medicoNome: `Dra. Camila Cirurgiã-Dentista CRO-PE ${randomSuffix}`,
    crm: `CRO-PE ${randomSuffix}`,
    especialidade: 'Endodontia',
    diasSemana: ['SEG', 'TER', 'QUA', 'QUI', 'SEX'],
    horarioInicio: '08:00',
    horarioFim: '12:00',
    duracaoMinutos: 20,
    vagasPorTurno: 12,
  };

  const createEscalaCeo = await apiRequest('/centro/gestao/escalas', 'POST', novaEscalaCeo, token);
  recordAudit('fluxoClinicoE2E', `1. Cadastro da nova escala da Dra. Camila (${novaEscalaCeo.crm}) em Endodontia`, 
    createEscalaCeo.status === 201 && !!createEscalaCeo.data?.id,
    createEscalaCeo.data
  );

  // Passo 2: Validar isolamento da escala (visível no CEO, oculta no CEM)
  const escCemCheck = await apiRequest('/centro/gestao/escalas?centro=CEM', 'GET', null, token);
  const escCeoCheck = await apiRequest('/centro/gestao/escalas?centro=CEO', 'GET', null, token);

  const escalaVisivelCeo = Array.isArray(escCeoCheck.data) && escCeoCheck.data.some(e => e.medicoNome === novaEscalaCeo.medicoNome);
  recordAudit('fluxoClinicoE2E', '2. Escala odontológica cadastrada com sucesso no banco', escalaVisivelCeo);

  // Passo 3: Agendamento de Balcão no CEO (/ceo/recepcao/balcao)
  const cpfPacienteCeo = `999${randomSuffix}4422`.substring(0, 11);
  const nomePacienteCeo = `MARIA APARECIDA DA SILVA E2E ${randomSuffix}`;

  const balcaoPayload = {
    paciente: {
      nome: nomePacienteCeo,
      cpf: cpfPacienteCeo,
      cartaoSus: `708000${randomSuffix}0009`,
      dataNascimento: '1985-09-12',
      sexo: 'F',
      telefone: '87998877665',
      endereco: 'Avenida Coronel João Nunes, 250, Centro',
    },
    solicitacao: {
      medicoSolicitante: 'Dr. Triagem CEO',
      crm: 'CRO-PE 00000',
      especialidadeSolicitada: 'Endodontia',
      cid10: 'K04.0',
      cidDescricao: 'Pulpite aguda irreversível com dor em dente 46',
      justificativaClinica: 'Paciente compareceu com queixa álgica intensa em elemento 46, necessitando intervenção de canal.',
      prioridade: 'URGENTE',
    },
    medicoDesejado: novaEscalaCeo.medicoNome,
    nota: 'Agendamento prioritário realizado diretamente no balcão do CEO.',
  };

  const balcaoRes = await apiRequest('/centro/recepcao/balcao', 'POST', balcaoPayload, token);
  const encCriado = balcaoRes.data?.encaminhamento;

  recordAudit('fluxoClinicoE2E', '3. Agendamento de Balcão no CEO alocado pelo algoritmo na escala odontológica', 
    balcaoRes.status === 201 && encCriado && encCriado.canalRoteamento === 'CENTRO_ODONTOLOGICO' && encCriado.profissionalAgendado === novaEscalaCeo.medicoNome,
    {
      protocolo: encCriado?.protocolo,
      profissional: encCriado?.profissionalAgendado,
      local: encCriado?.localAgendamento,
      canal: encCriado?.canalRoteamento,
    }
  );

  const encId = encCriado?.id;
  const pacienteId = encCriado?.paciente?.id || encCriado?.pacienteId;

  // Passo 4: Verificar que o agendamento NÃO aparece no CEM e aparece no CEO
  const agendaCeo = await apiRequest('/centro/recepcao/agenda-dia?centro=CENTRO_ODONTOLOGICO', 'GET', null, token);
  const agendaCem = await apiRequest('/centro/recepcao/agenda-dia?centro=CENTRO_ESPECIALIDADES', 'GET', null, token);

  const agInCeo = agendaCeo.data?.agendamentos?.some(a => a.id === encId);
  const agNotInCem = !agendaCem.data?.agendamentos?.some(a => a.id === encId);
  recordAudit('fluxoClinicoE2E', '4. Consulta agendada pertence ao CEO e está isolada da agenda do CEM', agInCeo && agNotInCem);

  // Passo 5: Confirmar presença do paciente no CEO
  const presencaRes = await apiRequest(`/centro/recepcao/presenca/${encId}`, 'POST', {
    status: 'AGUARDANDO_ATENDIMENTO',
    observacao: 'Paciente chegou na recepção do CEO, conferido documento com foto.',
  }, token);

  recordAudit('fluxoClinicoE2E', '5. Confirmação de Presença na Recepção (Status: AGUARDANDO_ATENDIMENTO)', 
    presencaRes.ok && presencaRes.data?.encaminhamento?.statusAtendimentoCentro === 'AGUARDANDO_ATENDIMENTO',
    presencaRes.data
  );

  // Passo 6: Chamar paciente para a Cadeira Odontológica
  const chamarRes = await apiRequest(`/centro/medico/chamar/${encId}`, 'POST', {}, token);
  recordAudit('fluxoClinicoE2E', '6. Chamada do Paciente para Cadeira Odontológica (Status: EM_ATENDIMENTO)', 
    chamarRes.ok && (chamarRes.data?.status === 'EM_ATENDIMENTO' || chamarRes.data?.encaminhamento?.statusAtendimentoCentro === 'EM_ATENDIMENTO'),
    chamarRes.data
  );

  // Passo 7: Verificar chamada em tempo real no Painel Smart TV CEO (/tv?pin=CEO-2026) e ausência no CEM
  const tvCeoCheck = await apiRequest('/centro/tv/chamadas?centro=CEO');
  const tvCemCheck = await apiRequest('/centro/tv/chamadas?centro=CEM');

  const chamadoNaTvCeo = tvCeoCheck.data?.chamadaAtual?.id === encId || tvCeoCheck.data?.ultimasChamadas?.some(c => c.id === encId);
  const chamadoForaDaTvCem = tvCemCheck.data?.chamadaAtual?.id !== encId && !tvCemCheck.data?.ultimasChamadas?.some(c => c.id === encId);

  recordAudit('fluxoClinicoE2E', '7. Paciente anunciado no Painel Smart TV do CEO e isolado da TV do CEM', 
    chamadoNaTvCeo && chamadoForaDaTvCem,
    {
      chamadaAtualCeo: tvCeoCheck.data?.chamadaAtual,
      chamadaAtualCem: tvCemCheck.data?.chamadaAtual,
    }
  );

  // Passo 8: Prontuário PEC do Paciente
  if (pacienteId) {
    const prontuarioRes = await apiRequest(`/centro/medico/pacientes/${pacienteId}/prontuario`, 'GET', null, token);
    recordAudit('fluxoClinicoE2E', '8. Acesso ao Prontuário Eletrônico do Cidadão (PEC) do paciente', 
      prontuarioRes.ok && !!prontuarioRes.data?.paciente,
      { paciente: prontuarioRes.data?.paciente?.nome }
    );
  }

  // Passo 9: Registrar Procedimentos Odontológicos Realizados (SIGTAP)
  const procedimentosPayload = {
    procedimentos: [
      {
        codigoSigtap: '0307020050',
        nome: 'Tratamento de Canal Radicular Birradicular em Dente 46',
        quantidade: 1,
        valorUnitario: 85.0,
        observacao: 'Odontometria eletrônica e obturação termoplastificada realizada com sucesso.',
      },
      {
        codigoSigtap: '0307020069',
        nome: 'Selamento Coronário Provisório com Cimento de Ionômero de Vidro',
        quantidade: 1,
        valorUnitario: 25.0,
        observacao: 'Selamento provisório adaptado.',
      },
    ],
  };

  const procedRes = await apiRequest(`/centro/atendimentos/${encId}/procedimentos`, 'POST', procedimentosPayload, token);
  recordAudit('fluxoClinicoE2E', '9. Registro de procedimentos faturáveis SIGTAP do atendimento', 
    procedRes.status === 201 && procedRes.data?.sucesso,
    procedRes.data
  );

  // Passo 10: Registrar SOAP Clínico e Finalizar Atendimento
  const soapPayload = {
    subjetivo: 'Paciente refere dor latejante no dente 46 iniciada há 3 dias.',
    objetivo: 'Cárie oclusal profunda no elemento 46 com exposição pulpar. Teste periapical positivo.',
    avaliacao: 'Pulpite irreversível sintomática em dente 46 (CID-10: K04.0).',
    plano: 'Tratamento endodôntico concluído em sessão única com restauração provisória.',
    cid10: 'K04.0',
    diagnostico: 'Pulpite Aguda Irreversível',
    conduta: 'Tratamento de canal executado. Prescrito analgésico e anti-inflamatório se dor.',
    prescricao: '1. Ibuprofeno 600mg - 1 cp VO de 8/8h por 3 dias se dor\n2. Dipirona 500mg - 1 cp VO se dor',
  };

  const soapRes = await apiRequest(`/centro/medico/atendimento/${encId}`, 'POST', soapPayload, token);
  recordAudit('fluxoClinicoE2E', '10. Registro do prontuário SOAP e finalização do atendimento (Status: CONCLUIDO)', 
    soapRes.ok && (soapRes.data?.statusAtendimentoCentro === 'CONCLUIDO' || soapRes.data?.encaminhamento?.statusAtendimentoCentro === 'CONCLUIDO'),
    soapRes.data
  );

  // ---------------------------------------------------------------------------
  // CATEGORIA 4: AUDITORIA DE TODAS AS ROTAS E ALIASES COM PLAYWRIGHT
  // ---------------------------------------------------------------------------
  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log('🌐 4. AUDITORIA DE TODAS AS ROTAS E ALIASES NO FRONTEND DE PRODUÇÃO');
  console.log('════════════════════════════════════════════════════════════════════════');

  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
  });

  const page = await context.newPage();

  // Login inicial no browser
  await page.goto(`${PROD_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#usuario', USER_EMAIL);
  await page.fill('#senha', USER_PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

  const rotasVarredura = [
    // CEM
    { url: '/cem/recepcao/fila', label: 'CEM Recepção Fila', expected: 200 },
    { url: '/cem/recepcao/agenda', label: 'CEM Recepção Agenda', expected: 200 },
    { url: '/cem/recepcao/balcao', label: 'CEM Recepção Balcão', expected: 200 },
    { url: '/cem/recepcao/painel', label: 'CEM Recepção Painel', expected: 200 },
    { url: '/cem/pacientes', label: 'CEM Pacientes', expected: 200 },
    { url: '/cem/medico/agenda', label: 'CEM Médico Agenda', expected: 200 },
    { url: '/cem/medico/historico', label: 'CEM Médico Histórico', expected: 200 },
    { url: '/cem/medico/desempenho', label: 'CEM Médico Desempenho', expected: 200 },
    { url: '/cem/medico/produtividade', label: 'CEM Médico Produtividade', expected: 200 },
    { url: '/cem/medico/atendimento', label: 'CEM Médico Atendimento (Redirect)', expected: 307, target: '/cem/medico/agenda' },
    { url: '/cem/gestao/dashboard', label: 'CEM Gestão Dashboard', expected: 200 },
    { url: '/cem/gestao/especialidades', label: 'CEM Gestão Especialidades', expected: 200 },
    { url: '/cem/gestao/salas', label: 'CEM Gestão Salas', expected: 200 },
    { url: '/cem/gestao/vagas', label: 'CEM Gestão Vagas', expected: 200 },
    { url: '/cem/gestao/escalas', label: 'CEM Gestão Escalas (Redirect)', expected: 307, target: '/cem/gestao/vagas' },
    { url: '/cem/gestao/cotas', label: 'CEM Gestão Cotas', expected: 200 },
    { url: '/cem/gestao/producao', label: 'CEM Gestão Produção', expected: 200 },
    { url: '/cem/gestao/relatorios', label: 'CEM Gestão Relatórios', expected: 200 },
    { url: '/cem/gestao/auditoria', label: 'CEM Gestão Auditoria', expected: 200 },
    { url: '/cem/gestao/analytics', label: 'CEM Gestão Analytics', expected: 200 },
    { url: '/cem/gestao/usuarios', label: 'CEM Gestão Usuários', expected: 200 },
    { url: '/cem/tv', label: 'CEM TV (Redirect)', expected: 307, target: '/tv?pin=CEM-2026' },

    // CEO
    { url: '/ceo/recepcao/fila', label: 'CEO Recepção Fila', expected: 200 },
    { url: '/ceo/recepcao/agenda', label: 'CEO Recepção Agenda', expected: 200 },
    { url: '/ceo/recepcao/balcao', label: 'CEO Recepção Balcão', expected: 200 },
    { url: '/ceo/recepcao/painel', label: 'CEO Recepção Painel', expected: 200 },
    { url: '/ceo/pacientes', label: 'CEO Pacientes', expected: 200 },
    { url: '/ceo/medico/agenda', label: 'CEO Dentista Consultório', expected: 200 },
    { url: '/ceo/medico/historico', label: 'CEO Dentista Histórico', expected: 200 },
    { url: '/ceo/medico/desempenho', label: 'CEO Dentista Desempenho', expected: 200 },
    { url: '/ceo/medico/produtividade', label: 'CEO Dentista Produtividade', expected: 200 },
    { url: '/ceo/medico/atendimento', label: 'CEO Dentista Atendimento (Redirect)', expected: 307, target: '/ceo/medico/agenda' },
    { url: '/ceo/gestao/dashboard', label: 'CEO Gestão Dashboard', expected: 200 },
    { url: '/ceo/gestao/especialidades', label: 'CEO Gestão Especialidades', expected: 200 },
    { url: '/ceo/gestao/salas', label: 'CEO Gestão Salas', expected: 200 },
    { url: '/ceo/gestao/cadeiras', label: 'CEO Gestão Cadeiras (Redirect)', expected: 307, target: '/ceo/gestao/salas' },
    { url: '/ceo/gestao/vagas', label: 'CEO Gestão Vagas', expected: 200 },
    { url: '/ceo/gestao/escalas', label: 'CEO Gestão Escalas (Redirect)', expected: 307, target: '/ceo/gestao/vagas' },
    { url: '/ceo/gestao/cotas', label: 'CEO Gestão Cotas', expected: 200 },
    { url: '/ceo/gestao/producao', label: 'CEO Gestão Produção', expected: 200 },
    { url: '/ceo/gestao/relatorios', label: 'CEO Gestão Relatórios', expected: 200 },
    { url: '/ceo/gestao/auditoria', label: 'CEO Gestão Auditoria', expected: 200 },
    { url: '/ceo/gestao/analytics', label: 'CEO Gestão Analytics', expected: 200 },
    { url: '/ceo/gestao/usuarios', label: 'CEO Gestão Usuários', expected: 200 },
    { url: '/ceo/tv', label: 'CEO TV (Redirect)', expected: 307, target: '/tv?pin=CEO-2026' },

    // Smart TV
    { url: '/tv?pin=CEM-2026', label: 'Painel TV CEM (Sala de Espera Médica)', expected: 200 },
    { url: '/tv?pin=CEO-2026', label: 'Painel TV CEO (Sala de Espera Odontológica)', expected: 200 },
  ];

  for (const r of rotasVarredura) {
    const res = await page.goto(`${PROD_URL}${r.url}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const status = res ? res.status() : 0;
    const finalUrl = page.url();

    const ok = (status === 200 && !finalUrl.includes('/login')) || (r.expected === 307 && finalUrl.includes(r.target));
    recordAudit('auditoriaRotasAliases', `Rota [${r.label}] ${r.url} -> HTTP ${status} (Final: ${finalUrl.replace(PROD_URL, '')})`, ok, {
      status,
      finalUrl,
    });
  }

  await browser.close();

  // ---------------------------------------------------------------------------
  // SÍNTESE E ESTATÍSTICAS
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('📊 SÍNTESE GERAL DOS RESULTADOS DA AUDITORIA');
  console.log('========================================================================');
  console.log(`1. Separação Total CEM vs CEO:          ${auditReport.categories.isolamentoCemCeo.passed} PASSOU / ${auditReport.categories.isolamentoCemCeo.failed} FALHOU`);
  console.log(`2. Procedimentos e Especialidades:       ${auditReport.categories.procedimentosEspecialidades.passed} PASSOU / ${auditReport.categories.procedimentosEspecialidades.failed} FALHOU`);
  console.log(`3. Fluxo Clínico Completo E2E no CEO:    ${auditReport.categories.fluxoClinicoE2E.passed} PASSOU / ${auditReport.categories.fluxoClinicoE2E.failed} FALHOU`);
  console.log(`4. Auditoria de Rotas e Aliases:         ${auditReport.categories.auditoriaRotasAliases.passed} PASSOU / ${auditReport.categories.auditoriaRotasAliases.failed} FALHOU`);
  console.log('------------------------------------------------------------------------');
  console.log(`TOTAL GERAL: ${auditReport.totalPassed} PASSOU / ${auditReport.totalFailed} FALHOU (Total de Verificações: ${auditReport.totalPassed + auditReport.totalFailed})`);
  console.log('========================================================================\n');

  return auditReport;
}

runCompleteAudit().catch((err) => {
  console.error('Fatal error running comprehensive audit:', err);
});
