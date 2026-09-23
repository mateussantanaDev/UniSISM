import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { prisma } from '../../src/infrastructure/database/prisma';

const CPF_PACIENTE = '98765432100';
const SENHA_PACIENTE = CPF_PACIENTE;
const DEV_LOGIN = 'DEV-MATEUS';
const DEV_SENHA = 'Aguasbelas#!';
const MOTORISTA_LOGIN = 'MOT-CRITICAL';
const MOTORISTA_SENHA = '12345678';
const PROTOCOLO_ENCAMINHAMENTO = 'ENC-SMOKE-CRITICAL-0001';

interface Fixture {
  prefeituraId: string;
  ubsId: string;
  pacienteId: string;
  contaId: string;
  motoristaId: string;
  viagemId: string;
  encaminhamentoId: string;
  anexoId: string;
  notificacaoId: string;
}

interface HttpResult {
  status: number;
  body: unknown;
  text: string;
  headers: Headers;
}

let passed = 0;
let failed = 0;

function assert(label: string, ok: boolean, extra?: unknown): void {
  if (ok) {
    passed += 1;
    console.log(`  OK ${label}`);
    return;
  }
  failed += 1;
  const suffix = extra === undefined ? '' : ` -- ${JSON.stringify(extra).slice(0, 800)}`;
  console.log(`  FAIL ${label}${suffix}`);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const apiKey = process.env.API_KEY;
  const apiHeader = process.env.API_KEY_HEADER || 'x-api-key';
  if (apiKey) headers[apiHeader] = apiKey;
  return headers;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(
  method: string,
  route: string,
  options: { token?: string; body?: unknown; rawHeaders?: Record<string, string> } = {},
): Promise<HttpResult> {
  const base = process.env.BASE ?? `http://localhost:${process.env.PORT ?? '3334'}/v1`;
  const headers = apiHeaders(options.rawHeaders ?? {});
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${base}${route}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: unknown = text;
  if (text.length > 0 && response.headers.get('content-type')?.includes('application/json')) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body, text, headers: response.headers };
}

async function ensureFixtures(): Promise<Fixture> {
  const devHash = await bcrypt.hash(DEV_SENHA, 10);
  const motoristaHash = await bcrypt.hash(MOTORISTA_SENHA, 10);
  const pacienteHash = await bcrypt.hash(SENHA_PACIENTE, 10);

  const prefeitura = await prisma.prefeitura.upsert({
    where: { cnpj: '99000000000109' },
    update: { ativa: true, deletadoEm: null },
    create: {
      nome: 'Prefeitura Smoke Critico',
      municipio: 'Aguas Belas',
      uf: 'PE',
      cnpj: '99000000000109',
      ativa: true,
    },
  });

  const ubs = await prisma.ubs.upsert({
    where: { cnes: '9900009' },
    update: {
      ativa: true,
      deletadoEm: null,
      prefeituraId: prefeitura.id,
      municipio: 'Aguas Belas',
      whatsapp: '5587999999909',
      telefone: '87999999909',
    },
    create: {
      nome: 'UBS Smoke Critico',
      municipio: 'Aguas Belas',
      uf: 'PE',
      cnes: '9900009',
      endereco: 'Rua Smoke Critico, 90',
      whatsapp: '5587999999909',
      telefone: '87999999909',
      prefeituraId: prefeitura.id,
    },
  });

  const dev = await prisma.atendente.upsert({
    where: { matricula: DEV_LOGIN },
    update: {
      senhaHash: devHash,
      ativo: true,
      bloqueadoAte: null,
      role: 'DESENVOLVEDOR',
      ubsId: null,
      prefeituraId: null,
      senhaAlteradaEm: new Date(),
      deletadoEm: null,
    },
    create: {
      matricula: DEV_LOGIN,
      nome: 'DEV SMOKE',
      email: 'dev-smoke@unisism.local',
      cpf: '99000000000',
      senhaHash: devHash,
      cargo: 'Desenvolvedor',
      funcao: 'Smoke HTTP',
      role: 'DESENVOLVEDOR',
      ativo: true,
    },
  });

  const paciente = await prisma.paciente.upsert({
    where: { cpf: CPF_PACIENTE },
    update: {
      nome: 'Paciente Smoke Critico',
      ubsId: ubs.id,
      cartaoSus: '700000000000009',
      grupoSanguineo: 'O_POSITIVO',
      telefone: '87999999909',
      deletadoEm: null,
    },
    create: {
      nome: 'Paciente Smoke Critico',
      cpf: CPF_PACIENTE,
      cartaoSus: '700000000000009',
      dataNascimento: new Date('1990-05-20T00:00:00.000Z'),
      sexo: 'F',
      telefone: '87999999909',
      endereco: 'Rua Paciente Critico',
      bairro: 'Centro',
      municipio: 'Aguas Belas',
      uf: 'PE',
      cep: '55340000',
      grupoSanguineo: 'O_POSITIVO',
      ubsId: ubs.id,
    },
  });

  const conta = await prisma.pacienteConta.upsert({
    where: { cpf: CPF_PACIENTE },
    update: {
      nome: 'Paciente Smoke Critico',
      cpfFormatado: '987.654.321-00',
      senhaHash: pacienteHash,
      senhaProvisoria: true,
      ativo: true,
      telefone: '87999999909',
      ubsVinculadaId: ubs.id,
    },
    create: {
      cpf: CPF_PACIENTE,
      cpfFormatado: '987.654.321-00',
      nome: 'Paciente Smoke Critico',
      senhaHash: pacienteHash,
      senhaProvisoria: true,
      ativo: true,
      telefone: '87999999909',
      ubsVinculadaId: ubs.id,
    },
  });

  await prisma.$transaction([
    prisma.tfdPacienteSolicitacao.deleteMany({ where: { contaId: conta.id } }),
    prisma.notificacaoPaciente.deleteMany({ where: { contaId: conta.id } }),
    prisma.pacienteDispositivo.deleteMany({ where: { contaId: conta.id } }),
    prisma.sessaoPaciente.deleteMany({ where: { contaId: conta.id } }),
    prisma.pacienteRefreshToken.deleteMany({ where: { contaId: conta.id } }),
    prisma.alergia.deleteMany({ where: { pacienteId: paciente.id } }),
    prisma.condicaoCronica.deleteMany({ where: { pacienteId: paciente.id } }),
    prisma.medicamentoEmUso.deleteMany({ where: { pacienteId: paciente.id } }),
    prisma.atendimento.deleteMany({ where: { pacienteId: paciente.id } }),
    prisma.vacinaAplicada.deleteMany({ where: { pacienteId: paciente.id } }),
    prisma.exameRealizado.deleteMany({ where: { pacienteId: paciente.id } }),
  ]);

  await prisma.alergia.create({
    data: {
      pacienteId: paciente.id,
      substancia: 'Dipirona Smoke',
      tipo: 'MEDICAMENTO',
      gravidade: 'LEVE',
      observacao: 'Fixture de fluxo critico.',
    },
  });
  await prisma.condicaoCronica.create({
    data: {
      pacienteId: paciente.id,
      cid10: 'I10',
      descricao: 'Hipertensao arterial smoke',
      desde: new Date('2020-01-01T00:00:00.000Z'),
      ativo: true,
    },
  });
  await prisma.medicamentoEmUso.create({
    data: {
      pacienteId: paciente.id,
      nome: 'Losartana Smoke',
      dosagem: '50mg',
      frequencia: '1x ao dia',
      desde: new Date('2021-01-01T00:00:00.000Z'),
      prescritor: 'Dra Smoke',
      ativo: true,
    },
  });
  await prisma.atendimento.create({
    data: {
      pacienteId: paciente.id,
      data: new Date(),
      tipo: 'CONSULTA_MEDICA',
      profissional: 'Dra Smoke Clinica',
      registroProfissional: 'CRM-PE 0000',
      especialidade: 'Clinica Medica',
      unidade: ubs.nome,
      queixaPrincipal: 'Acompanhamento smoke',
      diagnostico: 'Estavel',
      cid10: 'Z00',
      conduta: 'Manter acompanhamento.',
    },
  });
  await prisma.vacinaAplicada.create({
    data: {
      pacienteId: paciente.id,
      data: new Date(),
      vacina: 'Influenza Smoke',
      dose: 'Dose anual',
      lote: 'SMK2026',
      aplicador: 'Enf Smoke',
      unidade: ubs.nome,
      via: 'INTRAMUSCULAR',
    },
  });
  await prisma.exameRealizado.create({
    data: {
      pacienteId: paciente.id,
      data: new Date(),
      tipo: 'Hemograma Smoke',
      categoria: 'LABORATORIAL',
      solicitante: 'Dra Smoke Clinica',
      unidadeExecutora: 'Laboratorio Smoke',
      resultado: 'NORMAL',
      observacao: 'Sem alteracoes relevantes.',
    },
  });

  const motoristaAtendente = await prisma.atendente.upsert({
    where: { matricula: MOTORISTA_LOGIN },
    update: {
      senhaHash: motoristaHash,
      ativo: true,
      bloqueadoAte: null,
      role: 'MOTORISTA_TFD',
      prefeituraId: prefeitura.id,
      ubsId: null,
      senhaAlteradaEm: new Date(),
      deletadoEm: null,
    },
    create: {
      matricula: MOTORISTA_LOGIN,
      nome: 'Motorista Smoke Critico',
      email: 'motorista-critical@unisism.local',
      cpf: '99000000009',
      senhaHash: motoristaHash,
      cargo: 'Motorista TFD',
      funcao: 'Motorista Smoke Critico',
      role: 'MOTORISTA_TFD',
      ativo: true,
      prefeituraId: prefeitura.id,
    },
  });

  let motorista = await prisma.motoristaTFD.findFirst({ where: { cpf: '99000000009' } });
  if (motorista) {
    motorista = await prisma.motoristaTFD.update({
      where: { id: motorista.id },
      data: {
        prefeituraId: prefeitura.id,
        nome: 'Motorista Smoke Critico',
        status: 'ATIVO',
        atendenteId: motoristaAtendente.id,
        primeiroLogin: false,
        validadeCnh: new Date(Date.now() + 365 * 86400_000),
        deletadoEm: null,
      },
    });
  } else {
    motorista = await prisma.motoristaTFD.create({
      data: {
        prefeituraId: prefeitura.id,
        nome: 'Motorista Smoke Critico',
        cpf: '99000000009',
        cnh: '99999999909',
        categoriaCnh: 'D',
        validadeCnh: new Date(Date.now() + 365 * 86400_000),
        telefone: '87999999908',
        status: 'ATIVO',
        atendenteId: motoristaAtendente.id,
        primeiroLogin: false,
        criadoPorId: dev.id,
      },
    });
  }

  let veiculo = await prisma.veiculoTFD.findFirst({ where: { placa: 'CRT1A09' } });
  if (veiculo) {
    veiculo = await prisma.veiculoTFD.update({
      where: { id: veiculo.id },
      data: {
        prefeituraId: prefeitura.id,
        status: 'ATIVO',
        deletadoEm: null,
        capacidade: 12,
        hodometroAtualKm: BigInt(0),
      },
    });
  } else {
    veiculo = await prisma.veiculoTFD.create({
      data: {
        prefeituraId: prefeitura.id,
        placa: 'CRT1A09',
        modelo: 'Van Critica',
        tipo: 'VAN',
        capacidade: 12,
        ano: 2025,
        combustivel: 'DIESEL',
        consumoMedioKml: 8.5,
        hodometroAtualKm: BigInt(0),
        status: 'ATIVO',
        criadoPorId: dev.id,
      },
    });
  }

  const dataViagem = new Date(Date.now() + 3 * 86400_000);
  dataViagem.setUTCHours(0, 0, 0, 0);
  let viagem = await prisma.viagemFrota.findFirst({
    where: {
      prefeituraId: prefeitura.id,
      observacoes: 'SMOKE CRITICAL VIAGEM',
    },
  });
  if (viagem) {
    viagem = await prisma.viagemFrota.update({
      where: { id: viagem.id },
      data: {
        data: dataViagem,
        status: 'AGENDADA',
        veiculoId: veiculo.id,
        motoristaId: motorista.id,
        vagasTotais: 12,
        kmInicialHodometro: null,
        kmFinalHodometro: null,
        iniciadaEm: null,
        concluidaEm: null,
        motivoCancelamento: null,
      },
    });
  } else {
    viagem = await prisma.viagemFrota.create({
      data: {
        prefeituraId: prefeitura.id,
        data: dataViagem,
        horaSaida: '07:30',
        horaPrevistaRetorno: '18:30',
        veiculoId: veiculo.id,
        motoristaId: motorista.id,
        destino: 'Garanhuns',
        unidadeDestino: 'Hospital Regional Smoke',
        rotaResumo: 'Aguas Belas -> Garanhuns',
        kmEstimados: 130,
        vagasTotais: 12,
        observacoes: 'SMOKE CRITICAL VIAGEM',
        status: 'AGENDADA',
        criadaPorId: dev.id,
      },
    });
  }

  const existingEnc = await prisma.encaminhamento.findUnique({
    where: { protocolo: PROTOCOLO_ENCAMINHAMENTO },
  });
  if (existingEnc) {
    await prisma.anexoDocumento.deleteMany({ where: { encaminhamentoId: existingEnc.id } });
    await prisma.eventoTimeline.deleteMany({ where: { encaminhamentoId: existingEnc.id } });
  }

  const encData = {
    status: 'APROVADO' as const,
    canalRoteamento: 'CENTRO_ESPECIALIDADES' as const,
    destinoRegulacao: 'CENTRO_ESPECIALIDADES' as const,
    dataDisponibilidade: new Date(),
    pacienteId: paciente.id,
    pacienteNome: paciente.nome,
    pacienteCpf: CPF_PACIENTE,
    pacienteCartaoSus: paciente.cartaoSus ?? '700000000000009',
    pacienteDataNascimento: paciente.dataNascimento,
    pacienteSexo: paciente.sexo,
    pacienteTelefone: paciente.telefone ?? '87999999909',
    pacienteEndereco: paciente.endereco ?? 'Rua Paciente Critico',
    medicoSolicitante: 'Dra Smoke Centro',
    crm: '000000',
    especialidadeSolicitada: 'Cardiologia',
    cid10: 'I10',
    cidDescricao: 'Hipertensao essencial',
    justificativaClinica: 'Avaliacao cardiologica para fluxo critico.',
    prioridade: 'URGENTE' as const,
    dataSolicitacao: new Date(Date.now() - 2 * 86400_000),
    observacoesRegulacao: 'Fixture de fluxo critico.',
    agendamentoPrevisto: null,
    statusAtendimentoCentro: 'AGENDADO' as const,
    presencaRegistradaEm: null,
    atendimentoIniciadoEm: null,
    atendimentoConcluidoEm: null,
    localAgendamento: null,
    profissionalAgendado: null,
    cidadeAgendamento: 'Garanhuns',
    ufAgendamento: 'PE',
    recomendacoes: ['Documento com foto', 'Cartao SUS', 'Exames recentes'],
    unidadeOrigem: ubs.nome,
    atendenteResponsavel: dev.nome,
    ubsId: ubs.id,
    atendenteId: dev.id,
    deletadoEm: null,
  };

  const encaminhamento = existingEnc
    ? await prisma.encaminhamento.update({
        where: { id: existingEnc.id },
        data: encData,
      })
    : await prisma.encaminhamento.create({
        data: {
          protocolo: PROTOCOLO_ENCAMINHAMENTO,
          ...encData,
        },
      });

  await prisma.eventoTimeline.createMany({
    data: [
      {
        encaminhamentoId: encaminhamento.id,
        tipo: 'CRIADO',
        titulo: 'Encaminhamento criado',
        descricao: 'Criado para smoke de fluxo critico.',
        autor: dev.nome,
        autorPapel: 'Smoke',
      },
      {
        encaminhamentoId: encaminhamento.id,
        tipo: 'APROVADO',
        titulo: 'Encaminhamento aprovado',
        descricao: 'Aprovado para centro de especialidades.',
        autor: dev.nome,
        autorPapel: 'Regulacao',
      },
    ],
  });

  const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? './uploads-smoke');
  const relPath = path.join('critical', 'encaminhamento-critical.pdf');
  const absPath = path.join(uploadDir, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  const fileBuffer = Buffer.from('%PDF-1.4\n% Smoke critical attachment\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
  await fs.writeFile(absPath, fileBuffer);
  const anexo = await prisma.anexoDocumento.create({
    data: {
      encaminhamentoId: encaminhamento.id,
      nome: 'encaminhamento-critical.pdf',
      tipo: 'LAUDO',
      tamanhoKb: Math.max(1, Math.ceil(fileBuffer.byteLength / 1024)),
      mimeType: 'application/pdf',
      caminho: relPath,
      sha256: crypto.createHash('sha256').update(fileBuffer).digest('hex'),
      scanStatus: 'LIMPO',
      scanEm: new Date(),
    },
  });

  const notificacao = await prisma.notificacaoPaciente.create({
    data: {
      contaId: conta.id,
      pacienteCpf: CPF_PACIENTE,
      encaminhamentoId: encaminhamento.id,
      tipo: 'APROVADO',
      titulo: 'Encaminhamento aprovado',
      corpo: 'Seu encaminhamento foi aprovado para agendamento.',
      payload: {
        protocolo: encaminhamento.protocolo,
        encaminhamentoId: encaminhamento.id,
      },
    },
  });

  return {
    prefeituraId: prefeitura.id,
    ubsId: ubs.id,
    pacienteId: paciente.id,
    contaId: conta.id,
    motoristaId: motorista.id,
    viagemId: viagem.id,
    encaminhamentoId: encaminhamento.id,
    anexoId: anexo.id,
    notificacaoId: notificacao.id,
  };
}

async function loginDev(): Promise<string> {
  const response = await request('POST', '/auth/login', {
    body: { login: DEV_LOGIN, senha: DEV_SENHA },
  });
  const body = asObject(response.body);
  assert('admin login retorna 200', response.status === 200, response.body);
  assert('admin login retorna token', typeof body['token'] === 'string', response.body);
  return String(body['token'] ?? '');
}

async function loginPaciente(): Promise<string> {
  const response = await request('POST', '/auth/paciente/login', {
    body: { cpf: CPF_PACIENTE, senha: SENHA_PACIENTE },
  });
  const body = asObject(response.body);
  assert('paciente login retorna 200', response.status === 200, response.body);
  assert('paciente login retorna token e refresh', typeof body['token'] === 'string' && typeof body['refreshToken'] === 'string', response.body);
  return String(body['token'] ?? '');
}

async function loginMotorista(): Promise<string> {
  const response = await request('POST', '/motorista-app/auth/login', {
    body: { matricula: MOTORISTA_LOGIN, senha: MOTORISTA_SENHA },
  });
  const body = asObject(response.body);
  assert('motorista login retorna 200', response.status === 200, response.body);
  assert('motorista login retorna token', typeof body['token'] === 'string', response.body);
  return String(body['token'] ?? '');
}

async function runPacienteCore(token: string, fixture: Fixture): Promise<void> {
  console.log('\n[Fluxo paciente: perfil, push, encaminhamento, anexos, notificacoes, dossie]');

  const me = await request('GET', '/auth/paciente/me', { token });
  assert('GET /auth/paciente/me retorna perfil canonico', me.status === 200 && asObject(me.body)['cpf'] === CPF_PACIENTE, me.body);

  const push = await request('POST', '/auth/paciente/registrar-dispositivo', {
    token,
    body: { provider: 'NTFY', plataforma: 'android', appVersion: 'smoke-critical' },
  });
  const pushBody = asObject(push.body);
  assert('POST /auth/paciente/registrar-dispositivo registra NTFY', push.status === 201 && typeof pushBody['endpoint'] === 'string', push.body);

  const minhaUbs = await request('GET', '/paciente/ubs/minha', { token });
  assert('GET /paciente/ubs/minha retorna UBS vinculada', minhaUbs.status === 200 && asObject(minhaUbs.body)['id'] === fixture.ubsId, minhaUbs.body);

  const encaminhamentos = await request('GET', '/paciente/encaminhamentos', { token });
  const encList = asArray(encaminhamentos.body).map(asObject);
  const enc = encList.find((item) => item['id'] === fixture.encaminhamentoId);
  assert('GET /paciente/encaminhamentos inclui encaminhamento fixture', encaminhamentos.status === 200 && !!enc, encaminhamentos.body);

  const ativo = await request('GET', '/paciente/encaminhamentos/ativo', { token });
  assert('GET /paciente/encaminhamentos/ativo retorna encaminhamento ativo', ativo.status === 200 && asObject(ativo.body)['id'] === fixture.encaminhamentoId, ativo.body);

  const detalhe = await request('GET', `/paciente/encaminhamentos/${fixture.encaminhamentoId}`, { token });
  assert('GET /paciente/encaminhamentos/:id retorna detalhe', detalhe.status === 200 && asObject(detalhe.body)['protocolo'] === PROTOCOLO_ENCAMINHAMENTO, detalhe.body);

  const anexos = await request('GET', `/paciente/encaminhamentos/${fixture.encaminhamentoId}/anexos`, { token });
  const anexoList = asArray(anexos.body).map(asObject);
  assert('GET /paciente/encaminhamentos/:id/anexos lista anexo limpo', anexos.status === 200 && anexoList.some((item) => item['id'] === fixture.anexoId), anexos.body);

  const timeline = await request('GET', `/paciente/encaminhamentos/${fixture.encaminhamentoId}/timeline`, { token });
  assert('GET /paciente/encaminhamentos/:id/timeline lista eventos', timeline.status === 200 && asArray(timeline.body).length >= 2, timeline.body);

  const download = await request('GET', `/paciente/anexos/${fixture.anexoId}/download`, { token });
  assert('GET /paciente/anexos/:id/download libera arquivo', download.status === 200 && download.headers.get('cache-control')?.includes('no-store'), {
    status: download.status,
    cacheControl: download.headers.get('cache-control'),
    body: download.text.slice(0, 120),
  });

  const notificacoes = await request('GET', '/paciente/notificacoes', { token });
  const notifList = asArray(notificacoes.body).map(asObject);
  assert('GET /paciente/notificacoes lista notificacao', notificacoes.status === 200 && notifList.some((item) => item['id'] === fixture.notificacaoId), notificacoes.body);

  const countAntes = await request('GET', '/paciente/notificacoes/count', { token });
  assert('GET /paciente/notificacoes/count retorna contador', countAntes.status === 200 && typeof asObject(countAntes.body)['count'] === 'number', countAntes.body);

  const marcar = await request('POST', `/paciente/notificacoes/${fixture.notificacaoId}/marcar-lida`, { token });
  assert('POST /paciente/notificacoes/:id/marcar-lida retorna 204', marcar.status === 204, marcar.body);

  const dossieResumo = await request('GET', '/paciente/dossie/resumo', { token });
  const resumo = asObject(dossieResumo.body);
  assert('GET /paciente/dossie/resumo agrega prontuario', dossieResumo.status === 200 && Number(resumo['totalAtendimentos']) >= 1 && asArray(resumo['alergias']).length >= 1, dossieResumo.body);

  const atendimentos = await request('GET', '/paciente/dossie/atendimentos?limit=5', { token });
  assert('GET /paciente/dossie/atendimentos pagina itens', atendimentos.status === 200 && asArray(asObject(atendimentos.body)['items']).length >= 1, atendimentos.body);

  const vacinas = await request('GET', '/paciente/dossie/vacinacoes?limit=5', { token });
  assert('GET /paciente/dossie/vacinacoes pagina itens', vacinas.status === 200 && asArray(asObject(vacinas.body)['items']).length >= 1, vacinas.body);

  const exames = await request('GET', '/paciente/dossie/exames?limit=5', { token });
  assert('GET /paciente/dossie/exames pagina itens', exames.status === 200 && asArray(asObject(exames.body)['items']).length >= 1, exames.body);
}

async function runCentroFlow(adminToken: string, fixture: Fixture): Promise<void> {
  console.log('\n[Fluxo centro: fila, agendamento, presenca]');

  const fila = await request('GET', '/centro/recepcao/fila-espera?centro=CENTRO_ESPECIALIDADES&agendado=false', { token: adminToken });
  const filaBody = asObject(fila.body);
  const filaItems = asArray(filaBody['encaminhamentos']).map(asObject);
  assert('GET /centro/recepcao/fila-espera mostra encaminhamento nao agendado', fila.status === 200 && filaItems.some((item) => item['id'] === fixture.encaminhamentoId), fila.body);

  const agendar = await request('POST', `/centro/recepcao/agendar/${fixture.encaminhamentoId}`, {
    token: adminToken,
    body: {
      profissional: 'Dra Smoke Cardiologia',
      nota: 'Agendamento criado pelo smoke de fluxo critico.',
      localAgendamento: 'CEM Smoke Critico',
    },
  });
  assert('POST /centro/recepcao/agendar/:id agenda consulta', agendar.status === 200 && asObject(asObject(agendar.body)['encaminhamento'])['id'] === fixture.encaminhamentoId, agendar.body);

  const presenca = await request('POST', `/centro/recepcao/presenca/${fixture.encaminhamentoId}`, {
    token: adminToken,
    body: {
      status: 'AGUARDANDO_ATENDIMENTO',
      observacao: 'Presenca registrada pelo smoke critico.',
    },
  });
  assert('POST /centro/recepcao/presenca/:id registra chegada', presenca.status === 200 && asObject(asObject(presenca.body)['encaminhamento'])['id'] === fixture.encaminhamentoId, presenca.body);

  const agendaDia = await request('GET', `/centro/recepcao/agenda-dia?centro=CENTRO_ESPECIALIDADES&busca=${encodeURIComponent(CPF_PACIENTE)}`, { token: adminToken });
  assert('GET /centro/recepcao/agenda-dia responde apos agendamento', agendaDia.status === 200 && Array.isArray(asObject(agendaDia.body)['agendamentos']), agendaDia.body);
}

async function runTfdMotoristaFlow(
  pacienteToken: string,
  adminToken: string,
  motoristaToken: string,
  fixture: Fixture,
): Promise<void> {
  console.log('\n[Fluxo TFD + motorista: pedido, aprovacao, viagem, conclusao]');

  const viagens = await request('GET', '/paciente/tfd/viagens', { token: pacienteToken });
  const viagemList = asArray(viagens.body).map(asObject);
  assert('GET /paciente/tfd/viagens mostra viagem disponivel', viagens.status === 200 && viagemList.some((item) => item['id'] === fixture.viagemId), viagens.body);

  const criarSolic = await request('POST', '/paciente/tfd/solicitacoes', {
    token: pacienteToken,
    body: {
      viagemId: fixture.viagemId,
      encaminhamentoId: fixture.encaminhamentoId,
      justificativa: 'Preciso do transporte para consulta cardiologica agendada.',
      acompanhante: 'Acompanhante Smoke',
    },
  });
  const solicPacienteId = String(asObject(criarSolic.body)['id'] ?? '');
  assert('POST /paciente/tfd/solicitacoes cria pedido', criarSolic.status === 201 && solicPacienteId.length > 0, criarSolic.body);

  const listGestao = await request('GET', `/tfd/solicitacoes-paciente?viagemId=${encodeURIComponent(fixture.viagemId)}`, { token: adminToken });
  const gestaoItems = asArray(listGestao.body).map(asObject);
  assert('GET /tfd/solicitacoes-paciente mostra pedido do app', listGestao.status === 200 && gestaoItems.some((item) => item['id'] === solicPacienteId), listGestao.body);

  const aprovar = await request('POST', `/tfd/solicitacoes-paciente/${solicPacienteId}/aprovar`, {
    token: adminToken,
    body: { numeroAssento: 'A3' },
  });
  assert('POST /tfd/solicitacoes-paciente/:id/aprovar aprova pedido', aprovar.status === 200 && asObject(aprovar.body)['status'] === 'APROVADA', aprovar.body);

  const minhaSolic = await request('GET', `/paciente/tfd/solicitacoes/${solicPacienteId}`, { token: pacienteToken });
  assert('GET /paciente/tfd/solicitacoes/:id reflete aprovacao', minhaSolic.status === 200 && asObject(minhaSolic.body)['status'] === 'APROVADA', minhaSolic.body);

  const motoristaViagens = await request('GET', '/motorista-app/minhas-viagens', { token: motoristaToken });
  const motItems = asArray(motoristaViagens.body).map(asObject);
  const motViagem = motItems.find((item) => item['id'] === fixture.viagemId);
  const passageiros = asArray(motViagem?.['passageiros']).map(asObject);
  assert(
    'GET /motorista-app/minhas-viagens mostra passageiro aprovado pelo app',
    motoristaViagens.status === 200 &&
      passageiros.some((item) => {
        const solicitacao = asObject(item['solicitacao']);
        const paciente = asObject(item['paciente']);
        return solicitacao['id'] === solicPacienteId || paciente['cpf'] === CPF_PACIENTE;
      }),
    motoristaViagens.body,
  );

  const iniciar = await request('POST', `/motorista-app/viagens/${fixture.viagemId}/iniciar`, {
    token: motoristaToken,
    body: { kmInicialHodometro: 1000 },
  });
  assert('POST /motorista-app/viagens/:id/iniciar muda status', iniciar.status === 200 && asObject(iniciar.body)['status'] === 'EM_ANDAMENTO', iniciar.body);

  const embarque = await request('POST', `/tfd/solicitacoes-paciente/${solicPacienteId}/embarque`, { token: adminToken });
  assert('POST /tfd/solicitacoes-paciente/:id/embarque marca embarque', embarque.status === 200 && asObject(embarque.body)['status'] === 'EMBARCADA', embarque.body);

  const concluirViagem = await request('POST', `/motorista-app/viagens/${fixture.viagemId}/concluir`, {
    token: motoristaToken,
    body: { kmFinalHodometro: 1130 },
  });
  assert('POST /motorista-app/viagens/:id/concluir finaliza viagem', concluirViagem.status === 200 && asObject(concluirViagem.body)['status'] === 'CONCLUIDA', concluirViagem.body);

  const concluirSolic = await request('POST', `/tfd/solicitacoes-paciente/${solicPacienteId}/concluir`, { token: adminToken });
  assert('POST /tfd/solicitacoes-paciente/:id/concluir finaliza solicitacao', concluirSolic.status === 200 && asObject(concluirSolic.body)['status'] === 'CONCLUIDA', concluirSolic.body);

  const solicFinal = await request('GET', `/paciente/tfd/solicitacoes/${solicPacienteId}`, { token: pacienteToken });
  assert('GET /paciente/tfd/solicitacoes/:id ve status final', solicFinal.status === 200 && asObject(solicFinal.body)['status'] === 'CONCLUIDA', solicFinal.body);
}

async function runRelatoriosFlow(adminToken: string, fixture: Fixture): Promise<void> {
  console.log('\n[Fluxo relatorios: gerar, listar, baixar]');

  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - 30 * 86400_000);
  const criar = await request('POST', '/relatorios', {
    token: adminToken,
    body: {
      tipo: 'FILA_REGULACAO',
      dataInicial: ymd(inicio),
      dataFinal: ymd(hoje),
      formato: 'CSV',
      filtros: { prefeituraId: fixture.prefeituraId },
    },
  });
  const relId = String(asObject(criar.body)['id'] ?? '');
  assert('POST /relatorios cria job', criar.status === 202 && relId.length > 0, criar.body);

  let status = '';
  for (let i = 0; i < 20; i++) {
    const lista = await request('GET', '/relatorios', { token: adminToken });
    const item = asArray(lista.body).map(asObject).find((row) => row['id'] === relId);
    status = String(item?.['status'] ?? '');
    if (status === 'DISPONIVEL' || status === 'FALHA') break;
    await sleep(500);
  }
  assert('worker deixa relatorio DISPONIVEL', status === 'DISPONIVEL', { relId, status });

  if (status === 'DISPONIVEL') {
    const download = await request('GET', `/relatorios/${relId}/download`, { token: adminToken });
    assert('GET /relatorios/:id/download baixa arquivo', download.status === 200 && download.headers.get('content-disposition')?.includes('.csv'), {
      status: download.status,
      disposition: download.headers.get('content-disposition'),
      body: download.text.slice(0, 120),
    });
  }
}

async function main(): Promise<void> {
  console.log('===============================================================');
  console.log('  UNISISM - HTTP critical flows smoke');
  console.log(`  Backend: ${process.env.BASE ?? `http://localhost:${process.env.PORT ?? '3334'}/v1`}`);
  console.log('===============================================================');

  const fixture = await ensureFixtures();
  const adminToken = await loginDev();
  const pacienteToken = await loginPaciente();
  const motoristaToken = await loginMotorista();

  await runCentroFlow(adminToken, fixture);
  await runPacienteCore(pacienteToken, fixture);
  await runTfdMotoristaFlow(pacienteToken, adminToken, motoristaToken, fixture);
  await runRelatoriosFlow(adminToken, fixture);

  console.log('\n===============================================================');
  console.log(`  Resultado critical flows: ${passed} passaram - ${failed} falharam`);
  console.log('===============================================================');

  if (failed > 0) process.exit(1);
}

main()
  .catch((err: unknown) => {
    console.error('Falha inesperada no critical flows smoke:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
