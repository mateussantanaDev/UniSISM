// tests/e2e/api_audit.mjs
const API_BASE = 'http://184.107.179.209:3333/v1';
const API_KEY = 'unisism-frontend-2026-4f2b8d9e';
const CREDENTIALS = {
  login: 'mateushenrivieira@gmail.com',
  senha: 'Aguasbelas#1',
};

const results = {
  passed: 0,
  failed: 0,
  tests: [],
};

function recordTest(name, passed, details = null) {
  if (passed) {
    results.passed++;
    console.log(`\x1b[32m✔ [PASS]\x1b[0m ${name}`);
  } else {
    results.failed++;
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m ${name}`);
    if (details) console.error('  Details:', typeof details === 'object' ? JSON.stringify(details, null, 2) : details);
  }
  results.tests.push({ name, passed, details });
}

async function apiRequest(endpoint, method = 'GET', body = null, token = null) {
  const headers = {
    'Accept': 'application/json',
    'x-api-key': API_KEY,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

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
  console.log('\n======================================================');
  console.log('🔍 INICIANDO AUDITORIA E2E DA API — CEM vs CEO');
  console.log(`Base URL: ${API_BASE}`);
  console.log('======================================================\n');

  // 1. Healthcheck & Auth
  const health = await apiRequest('/health');
  recordTest('API Healthcheck responde HTTP 200', health.status === 200, health.data);

  const authRes = await apiRequest('/auth/login', 'POST', CREDENTIALS);
  recordTest('Autenticação API com credenciais de produção', authRes.ok && !!authRes.data?.token, authRes.data);
  const token = authRes.data?.token;

  if (!token) {
    console.error('Falha crítica na autenticação. Abortando.');
    return results;
  }

  const meRes = await apiRequest('/auth/me', 'GET', null, token);
  recordTest('Verificação de perfil (/auth/me)', meRes.ok && meRes.data?.role === 'DESENVOLVEDOR', meRes.data);

  // 2. ISOLAMENTO TV & PAREAMENTO
  console.log('\n--- 1. SEPARAÇÃO & ISOLAMENTO PAINEL TV CEM vs CEO ---');
  
  const parearCem = await apiRequest('/centro/tv/parear', 'POST', { pin: 'CEM-2026' });
  recordTest(
    'Parear TV com PIN CEM-2026 -> CEM (Azul, Consultório)',
    parearCem.ok && parearCem.data?.centro === 'CEM' && parearCem.data?.tipoLocal === 'CONSULTÓRIO' && parearCem.data?.corTema === 'blue',
    parearCem.data
  );

  const parearCeo = await apiRequest('/centro/tv/parear', 'POST', { pin: 'CEO-2026' });
  recordTest(
    'Parear TV com PIN CEO-2026 -> CEO (Esmeralda, Cadeira Odontológica)',
    parearCeo.ok && parearCeo.data?.centro === 'CEO' && parearCeo.data?.tipoLocal === 'CADEIRA ODONTOLÓGICA' && parearCeo.data?.corTema === 'emerald',
    parearCeo.data
  );

  const parearInvalido = await apiRequest('/centro/tv/parear', 'POST', { pin: 'INVALIDO-999' });
  recordTest(
    'Parear TV com PIN Inválido -> 401 SENHA_INVALIDA',
    parearInvalido.status === 401,
    parearInvalido.data
  );

  const tvCem = await apiRequest('/centro/tv/chamadas?centro=CEM', 'GET');
  recordTest(
    'TV CEM Chamadas (/centro/tv/chamadas?centro=CEM) -> centro CEM e tipo CONSULTÓRIO',
    tvCem.ok && tvCem.data?.centro === 'CEM' && tvCem.data?.tipoLocal === 'CONSULTÓRIO',
    tvCem.data
  );

  const tvCeo = await apiRequest('/centro/tv/chamadas?centro=CEO', 'GET');
  recordTest(
    'TV CEO Chamadas (/centro/tv/chamadas?centro=CEO) -> centro CEO e tipo CADEIRA ODONTOLÓGICA',
    tvCeo.ok && tvCeo.data?.centro === 'CEO' && tvCeo.data?.tipoLocal === 'CADEIRA ODONTOLÓGICA',
    tvCeo.data
  );

  // 3. ISOLAMENTO DE ESCALAS, SALAS E ESPECIALIDADES
  console.log('\n--- 2. SEPARAÇÃO & ISOLAMENTO DE ESCALAS, SALAS E ESPECIALIDADES ---');

  // Especialidades
  const espCem = await apiRequest('/centro/gestao/especialidades?centro=CEM', 'GET', null, token);
  const espCeo = await apiRequest('/centro/gestao/especialidades?centro=CEO', 'GET', null, token);

  const odontoKeywords = ['odonto', 'endodont', 'periodont', 'bucomaxilo', 'bucal', 'prótese', 'protese', 'estomatol', 'pne'];
  
  const cemHasNoOdonto = Array.isArray(espCem.data) && espCem.data.length > 0 && espCem.data.every(e => {
    const nome = (e.nome || '').toLowerCase();
    return !odontoKeywords.some(kw => nome.includes(kw));
  });

  const ceoHasOnlyOdonto = Array.isArray(espCeo.data) && espCeo.data.length > 0 && espCeo.data.every(e => {
    const nome = (e.nome || '').toLowerCase();
    return odontoKeywords.some(kw => nome.includes(kw));
  });

  recordTest(
    'CEM Especialidades (/centro/gestao/especialidades?centro=CEM) contém ZERO especialidades odontológicas',
    cemHasNoOdonto,
    { total: espCem.data?.length, items: espCem.data?.map(e => e.nome) }
  );

  recordTest(
    'CEO Especialidades (/centro/gestao/especialidades?centro=CEO) contém APENAS especialidades odontológicas',
    ceoHasOnlyOdonto,
    { total: espCeo.data?.length, items: espCeo.data?.map(e => e.nome) }
  );

  // Salas e Consultórios / Cadeiras
  const salasCem = await apiRequest('/centro/gestao/salas?centro=CEM', 'GET', null, token);
  const salasCeo = await apiRequest('/centro/gestao/salas?centro=CEO', 'GET', null, token);

  const cemSalasAreConsultorios = Array.isArray(salasCem.data) && salasCem.data.length > 0 && salasCem.data.every(s => {
    const cod = (s.codigo || '').toLowerCase();
    const nome = (s.nome || '').toLowerCase();
    const esp = (s.especialidadePrincipal || '').toLowerCase();
    return !cod.startsWith('cad') && !nome.includes('cadeira') && !odontoKeywords.some(kw => esp.includes(kw));
  });

  const ceoSalasAreCadeiras = Array.isArray(salasCeo.data) && salasCeo.data.length > 0 && salasCeo.data.every(s => {
    const cod = (s.codigo || '').toLowerCase();
    const nome = (s.nome || '').toLowerCase();
    const esp = (s.especialidadePrincipal || '').toLowerCase();
    return cod.startsWith('cad') || nome.includes('cadeira') || odontoKeywords.some(kw => esp.includes(kw));
  });

  recordTest(
    'CEM Salas (/centro/gestao/salas?centro=CEM) contém apenas CONSULTÓRIOS MÉDICOS',
    cemSalasAreConsultorios,
    { total: salasCem.data?.length, items: salasCem.data?.map(s => `${s.codigo} - ${s.nome}`) }
  );

  recordTest(
    'CEO Salas (/centro/gestao/salas?centro=CEO) contém apenas CADEIRAS ODONTOLÓGICAS',
    ceoSalasAreCadeiras,
    { total: salasCeo.data?.length, items: salasCeo.data?.map(s => `${s.codigo} - ${s.nome}`) }
  );

  // Escalas
  const escalasCem = await apiRequest('/centro/escalas?centro=CEM', 'GET', null, token);
  const escalasCeo = await apiRequest('/centro/escalas?centro=CEO', 'GET', null, token);

  const cemEscalasMedicalOnly = Array.isArray(escalasCem.data) && escalasCem.data.length > 0 && escalasCem.data.every(e => {
    const esp = (e.especialidade || '').toLowerCase();
    return !odontoKeywords.some(kw => esp.includes(kw));
  });

  const ceoEscalasDentalOnly = Array.isArray(escalasCeo.data) && escalasCeo.data.length > 0 && escalasCeo.data.every(e => {
    const esp = (e.especialidade || '').toLowerCase();
    return odontoKeywords.some(kw => esp.includes(kw));
  });

  recordTest(
    'CEM Escalas (/centro/escalas?centro=CEM) contém apenas MÉDICOS ESPECIALISTAS',
    cemEscalasMedicalOnly,
    { total: escalasCem.data?.length, items: escalasCem.data?.map(e => `${e.medicoNome} (${e.especialidade})`) }
  );

  recordTest(
    'CEO Escalas (/centro/escalas?centro=CEO) contém apenas CIRURGIÕES-DENTISTAS',
    ceoEscalasDentalOnly,
    { total: escalasCeo.data?.length, items: escalasCeo.data?.map(e => `${e.medicoNome} (${e.especialidade})`) }
  );

  // 4. CADASTRO DE PROCEDIMENTOS / ESPECIALIDADES
  console.log('\n--- 3. CADASTRO DE PROCEDIMENTOS / ESPECIALIDADES NO BANCO ---');

  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const novaEspMedica = {
    nome: `Reumatologia Clínica Especializada ${randomSuffix}`,
    codigoSigtap: `03010100${randomSuffix.toString().substring(0, 2)}`,
    tempoPadraoMinutos: 30,
    valorTabelaBrl: 110.0,
    documentosObrigatorios: ['Hemograma completo', 'Fator Reumatoide', 'VHS'],
    preparoRequerido: 'Jejum de 8 horas para exames laboratoriais complementares.',
    ativa: true,
  };

  const createEspMedRes = await apiRequest('/centro/gestao/especialidades', 'POST', novaEspMedica, token);
  recordTest(
    `Criar nova especialidade médica no banco de dados (${novaEspMedica.nome})`,
    createEspMedRes.status === 201 && !!createEspMedRes.data?.id,
    createEspMedRes.data
  );

  const novaEspOdonto = {
    nome: `Periodontia e Cirurgia Periodontal Avançada ${randomSuffix}`,
    codigoSigtap: `03070200${randomSuffix.toString().substring(0, 2)}`,
    tempoPadraoMinutos: 40,
    valorTabelaBrl: 140.0,
    documentosObrigatorios: ['Radiografia Periapical', 'Periodontograma'],
    preparoRequerido: 'Profilaxia prévia na UBS de origem.',
    ativa: true,
  };

  const createEspOdoRes = await apiRequest('/centro/gestao/especialidades', 'POST', novaEspOdonto, token);
  recordTest(
    `Criar nova especialidade odontológica no banco de dados (${novaEspOdonto.nome})`,
    createEspOdoRes.status === 201 && !!createEspOdoRes.data?.id,
    createEspOdoRes.data
  );

  // Re-check isolation after creation
  const checkEspCem = await apiRequest('/centro/gestao/especialidades?centro=CEM', 'GET', null, token);
  const checkEspCeo = await apiRequest('/centro/gestao/especialidades?centro=CEO', 'GET', null, token);

  const medInCem = checkEspCem.data?.some(e => e.nome === novaEspMedica.nome);
  const medNotInCeo = !checkEspCeo.data?.some(e => e.nome === novaEspMedica.nome);
  const odoInCeo = checkEspCeo.data?.some(e => e.nome === novaEspOdonto.nome);
  const odoNotInCem = !checkEspCem.data?.some(e => e.nome === novaEspOdonto.nome);

  recordTest(
    'Especialidade médica aparece no CEM e NÃO aparece no CEO',
    medInCem && medNotInCeo,
    { medInCem, medNotInCeo }
  );

  recordTest(
    'Especialidade odontológica aparece no CEO e NÃO aparece no CEM',
    odoInCeo && odoNotInCem,
    { odoInCeo, odoNotInCem }
  );

  // 5. FLUXO CLÍNICO COMPLETO E2E NO CEO
  console.log('\n--- 4. FLUXO CLÍNICO COMPLETO E2E NO CEO ---');

  // A. Criar nova escala odontológica
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

  const createEscalaRes = await apiRequest('/centro/gestao/escalas', 'POST', novaEscalaCeo, token);
  recordTest(
    `Criar nova escala de Endodontia no CEO (${novaEscalaCeo.medicoNome})`,
    createEscalaRes.status === 201 && !!createEscalaRes.data?.id,
    createEscalaRes.data
  );
  const escalaCeoId = createEscalaRes.data?.id;

  // B. Verificar que escala NÃO aparece no CEM e aparece no CEO
  const verEscalasCem = await apiRequest('/centro/escalas?centro=CEM', 'GET', null, token);
  const verEscalasCeo = await apiRequest('/centro/escalas?centro=CEO', 'GET', null, token);

  const escalaInCeo = verEscalasCeo.data?.some(e => e.medicoNome === novaEscalaCeo.medicoNome);
  const escalaNotInCem = !verEscalasCem.data?.some(e => e.medicoNome === novaEscalaCeo.medicoNome);

  recordTest(
    'Nova escala odontológica aparece no CEO e NÃO aparece no CEM',
    escalaInCeo && escalaNotInCem,
    { escalaInCeo, escalaNotInCem }
  );

  // C. Agendamento de Balcão no CEO
  const cpfPacienteCeo = `888${randomSuffix}5510`.substring(0, 11).padEnd(11, '0');
  const balcaoPayload = {
    paciente: {
      nome: `Paciente Teste E2E CEO ${randomSuffix}`,
      cpf: cpfPacienteCeo,
      cartaoSus: `708000${randomSuffix}0001`,
      dataNascimento: '1988-05-14',
      sexo: 'F',
      telefone: '87999887766',
      endereco: 'Rua das Flores, 120, Centro',
    },
    solicitacao: {
      medicoSolicitante: 'Dr. Dentista Balcão',
      crm: 'CRO-PE 00000',
      especialidadeSolicitada: 'Endodontia',
      cid10: 'K04.0',
      cidDescricao: 'Pulpite aguda irreversível',
      justificativaClinica: 'Paciente com dor aguda intensa em dente 46, necessita tratamento endodôntico.',
      prioridade: 'URGENTE',
    },
    medicoDesejado: novaEscalaCeo.medicoNome,
    nota: 'Agendamento prioritário realizado no balcão do CEO',
  };

  const balcaoRes = await apiRequest('/centro/recepcao/balcao', 'POST', balcaoPayload, token);
  const encCriado = balcaoRes.data?.encaminhamento;

  recordTest(
    'Agendamento de Balcão CEO com alocação inteligente na escala de Endodontia',
    balcaoRes.status === 201 && encCriado && !!encCriado.id && encCriado.canalRoteamento === 'CENTRO_ODONTOLOGICO',
    {
      id: encCriado?.id,
      protocolo: encCriado?.protocolo,
      profissionalAgendado: encCriado?.profissionalAgendado,
      localAgendamento: encCriado?.localAgendamento,
      canalRoteamento: encCriado?.canalRoteamento,
    }
  );

  const encId = encCriado?.id;
  const pacienteId = encCriado?.paciente?.id || encCriado?.pacienteId;

  // D. Verificar isolamento de Agendas: Aparece na Agenda CEO e NÃO no CEM
  const agendaCem = await apiRequest('/centro/recepcao/agenda-dia?centro=CENTRO_ESPECIALIDADES', 'GET', null, token);
  const agendaCeo = await apiRequest('/centro/recepcao/agenda-dia?centro=CENTRO_ODONTOLOGICO', 'GET', null, token);

  const agInCeo = agendaCeo.data?.agendamentos?.some(a => a.id === encId);
  const agNotInCem = !agendaCem.data?.agendamentos?.some(a => a.id === encId);

  recordTest(
    'Agendamento aparece na Agenda do Dia do CEO e NÃO aparece na Agenda do CEM',
    agInCeo && agNotInCem,
    { agInCeo, agNotInCem }
  );

  // E. Confirmar presença do paciente no CEO
  const presencaRes = await apiRequest(`/centro/recepcao/presenca/${encId}`, 'POST', {
    status: 'AGUARDANDO_ATENDIMENTO',
    observacao: 'Paciente presente na recepção do CEO, documento validado.',
  }, token);

  recordTest(
    'Confirmação de Presença no CEO (status: AGUARDANDO_ATENDIMENTO)',
    presencaRes.ok && presencaRes.data?.encaminhamento?.statusAtendimentoCentro === 'AGUARDANDO_ATENDIMENTO',
    presencaRes.data
  );

  // F. Chamar paciente para Cadeira Odontológica
  const chamarRes = await apiRequest(`/centro/medico/chamar/${encId}`, 'POST', {}, token);
  recordTest(
    'Chamar Paciente no Consultório/Cadeira Odontológica (POST /centro/medico/chamar/:id)',
    chamarRes.ok && (chamarRes.data?.status === 'EM_ATENDIMENTO' || chamarRes.data?.encaminhamento?.statusAtendimentoCentro === 'EM_ATENDIMENTO'),
    chamarRes.data
  );

  // G. Verificar chamada no Painel TV (/centro/tv/chamadas?centro=CEO) e ausência no CEM
  const tvCeoVer = await apiRequest('/centro/tv/chamadas?centro=CEO', 'GET');
  const tvCemVer = await apiRequest('/centro/tv/chamadas?centro=CEM', 'GET');

  const chamadoInTvCeo = tvCeoVer.data?.chamadaAtual?.id === encId || tvCeoVer.data?.ultimasChamadas?.some(c => c.id === encId);
  const chamadoNotInTvCem = tvCemVer.data?.chamadaAtual?.id !== encId && !tvCemVer.data?.ultimasChamadas?.some(c => c.id === encId);

  recordTest(
    'Chamada refletida na TV do CEO (/tv?pin=CEO-2026) e ISOLADA da TV do CEM (/tv?pin=CEM-2026)',
    chamadoInTvCeo && chamadoNotInTvCem,
    {
      chamadoInTvCeo,
      chamadoNotInTvCem,
      chamadaAtualCeo: tvCeoVer.data?.chamadaAtual,
      chamadaAtualCem: tvCemVer.data?.chamadaAtual,
    }
  );

  // H. Consultar Prontuário PEC do Paciente
  if (pacienteId) {
    const prontuarioRes = await apiRequest(`/centro/medico/pacientes/${pacienteId}/prontuario`, 'GET', null, token);
    recordTest(
      'Acessar Prontuário Eletrônico (PEC) do paciente no CEO',
      prontuarioRes.ok && !!prontuarioRes.data?.paciente,
      { paciente: prontuarioRes.data?.paciente?.nome }
    );
  }

  // I. Registrar Procedimentos Odontológicos Realizados
  const procedPayload = {
    procedimentos: [
      {
        codigoSigtap: '0307020050',
        nome: 'Tratamento de Canal Radicular Birradicular (Dente 46)',
        quantidade: 1,
        valorUnitario: 85.0,
        observacao: 'Realizada odontometria eletrônica e obturação termoplastificada.',
      },
      {
        codigoSigtap: '0307020069',
        nome: 'Selamento Coronário Provisório com Ionômero de Vidro',
        quantidade: 1,
        valorUnitario: 25.0,
        observacao: 'Curativo selado sem intercorrências.',
      },
    ],
  };

  const procedRes = await apiRequest(`/centro/atendimentos/${encId}/procedimentos`, 'POST', procedPayload, token);
  recordTest(
    'Registrar procedimentos odontológicos faturáveis SIGTAP (/centro/atendimentos/:id/procedimentos)',
    procedRes.status === 201 && procedRes.data?.sucesso,
    procedRes.data
  );

  // J. Registrar SOAP e Finalizar Atendimento
  const soapPayload = {
    subjetivo: 'Paciente refere dor latejante no dente 46 com início há 3 dias.',
    objetivo: 'Ao exame clínico, cárie profunda na oclusal do elemento 46 com exposição pulpar. Teste de percussão positivo.',
    avaliacao: 'Pulpite irreversível sintomática no elemento 46 (CID-10: K04.0).',
    plano: 'Tratamento endodôntico concluído com sucesso em sessão única.',
    cid10: 'K04.0',
    diagnostico: 'Pulpite Aguda Irreversível',
    conduta: 'Tratamento de canal executado. Prescrito Ibuprofeno 600mg 8/8h por 3 dias e Dipirona 500mg se dor.',
    prescricao: '1. Ibuprofeno 600mg - 1 cp VO de 8 em 8 horas por 3 dias se dor\n2. Dipirona 500mg - 1 cp VO se dor de 6 em 6 horas',
  };

  const soapRes = await apiRequest(`/centro/medico/atendimento/${encId}`, 'POST', soapPayload, token);
  recordTest(
    'Registrar consulta SOAP e finalizar atendimento clínico (status: CONCLUIDO)',
    soapRes.ok && (soapRes.data?.statusAtendimentoCentro === 'CONCLUIDO' || soapRes.data?.encaminhamento?.statusAtendimentoCentro === 'CONCLUIDO'),
    soapRes.data
  );

  console.log('\n======================================================');
  console.log(`📊 RESUMO DA AUDITORIA API: ${results.passed} PASSOU / ${results.failed} FALHOU (TOTAL: ${results.tests.length})`);
  console.log('======================================================\n');
  return results;
}

runAudit().catch(err => {
  console.error('Erro na execução do script:', err);
});
