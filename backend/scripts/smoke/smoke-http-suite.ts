import bcrypt from 'bcryptjs';
import { prisma } from '../../src/infrastructure/database/prisma';

const CPF_PACIENTE = '12345678909';
const SENHA_PACIENTE = CPF_PACIENTE;
const DEV_LOGIN = 'DEV-MATEUS';
const DEV_SENHA = 'Aguasbelas#!';
const MOTORISTA_LOGIN = 'MOT-SMOKE';
const MOTORISTA_SENHA = '12345678';

interface Fixture {
  prefeituraId: string;
  ubsId: string;
  pacienteId: string;
  motoristaId: string;
  viagemId: string;
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
    console.log(`  ✓ ${label}`);
    return;
  }
  failed += 1;
  const suffix = extra === undefined ? '' : ` — ${JSON.stringify(extra).slice(0, 600)}`;
  console.log(`  ✗ ${label}${suffix}`);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const apiKey = process.env.API_KEY;
  const apiHeader = process.env.API_KEY_HEADER || 'x-api-key';
  if (apiKey) headers[apiHeader] = apiKey;
  return headers;
}

async function request(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; rawHeaders?: Record<string, string> } = {},
): Promise<HttpResult> {
  const base = process.env.BASE ?? `http://localhost:${process.env.PORT ?? '3334'}/v1`;
  const headers = apiHeaders(options.rawHeaders ?? {});
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: unknown = text;
  if (text.length > 0 && response.headers.get('content-type')?.includes('application/json')) {
    body = JSON.parse(text);
  }
  return { status: response.status, body, text, headers: response.headers };
}

async function ensureFixtures(): Promise<Fixture> {
  const devHash = await bcrypt.hash(DEV_SENHA, 10);
  const motoristaHash = await bcrypt.hash(MOTORISTA_SENHA, 10);
  const pacienteHash = await bcrypt.hash(SENHA_PACIENTE, 10);

  const prefeitura = await prisma.prefeitura.upsert({
    where: { cnpj: '99000000000101' },
    update: { ativa: true, deletadoEm: null },
    create: {
      nome: 'Prefeitura Smoke HTTP',
      municipio: 'Smoke',
      uf: 'PE',
      cnpj: '99000000000101',
      ativa: true,
    },
  });

  const ubs = await prisma.ubs.upsert({
    where: { cnes: '9900001' },
    update: {
      ativa: true,
      deletadoEm: null,
      prefeituraId: prefeitura.id,
      whatsapp: '5587999999999',
    },
    create: {
      nome: 'UBS Smoke HTTP',
      municipio: 'Smoke',
      uf: 'PE',
      cnes: '9900001',
      endereco: 'Rua Smoke, 100',
      whatsapp: '5587999999999',
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
      nome: 'Paciente Smoke HTTP',
      ubsId: ubs.id,
      deletadoEm: null,
    },
    create: {
      nome: 'Paciente Smoke HTTP',
      cpf: CPF_PACIENTE,
      cartaoSus: '700000000000001',
      dataNascimento: new Date('1995-08-12T00:00:00.000Z'),
      sexo: 'M',
      telefone: '87999999999',
      endereco: 'Rua Smoke Paciente',
      bairro: 'Centro',
      municipio: 'Smoke',
      uf: 'PE',
      cep: '55400000',
      ubsId: ubs.id,
    },
  });

  await prisma.pacienteConta.upsert({
    where: { cpf: CPF_PACIENTE },
    update: {
      nome: 'Paciente Smoke HTTP',
      cpfFormatado: '123.456.789-09',
      senhaHash: pacienteHash,
      senhaProvisoria: true,
      ativo: true,
      ubsVinculadaId: ubs.id,
    },
    create: {
      cpf: CPF_PACIENTE,
      cpfFormatado: '123.456.789-09',
      nome: 'Paciente Smoke HTTP',
      senhaHash: pacienteHash,
      senhaProvisoria: true,
      ativo: true,
      ubsVinculadaId: ubs.id,
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
      nome: 'Motorista Smoke HTTP',
      email: 'motorista-smoke@unisism.local',
      cpf: '99000000001',
      senhaHash: motoristaHash,
      cargo: 'Motorista TFD',
      funcao: 'Motorista Smoke',
      role: 'MOTORISTA_TFD',
      ativo: true,
      prefeituraId: prefeitura.id,
    },
  });

  let motorista = await prisma.motoristaTFD.findFirst({ where: { cpf: '99000000001' } });
  if (motorista) {
    motorista = await prisma.motoristaTFD.update({
      where: { id: motorista.id },
      data: {
        prefeituraId: prefeitura.id,
        nome: 'Motorista Smoke HTTP',
        status: 'ATIVO',
        atendenteId: motoristaAtendente.id,
        primeiroLogin: false,
        deletadoEm: null,
      },
    });
  } else {
    motorista = await prisma.motoristaTFD.create({
      data: {
        prefeituraId: prefeitura.id,
        nome: 'Motorista Smoke HTTP',
        cpf: '99000000001',
        cnh: '12345678901',
        categoriaCnh: 'D',
        validadeCnh: new Date(Date.now() + 365 * 86400_000),
        telefone: '87999999998',
        status: 'ATIVO',
        atendenteId: motoristaAtendente.id,
        primeiroLogin: false,
        criadoPorId: dev.id,
      },
    });
  }

  let veiculo = await prisma.veiculoTFD.findFirst({ where: { placa: 'SMK1A23' } });
  if (veiculo) {
    veiculo = await prisma.veiculoTFD.update({
      where: { id: veiculo.id },
      data: {
        prefeituraId: prefeitura.id,
        status: 'ATIVO',
        deletadoEm: null,
        capacidade: 16,
      },
    });
  } else {
    veiculo = await prisma.veiculoTFD.create({
      data: {
        prefeituraId: prefeitura.id,
        placa: 'SMK1A23',
        modelo: 'Van Smoke',
        tipo: 'VAN',
        capacidade: 16,
        ano: 2024,
        combustivel: 'DIESEL',
        consumoMedioKml: 8.5,
        criadoPorId: dev.id,
      },
    });
  }

  const dataViagem = new Date(Date.now() + 2 * 86400_000);
  dataViagem.setUTCHours(0, 0, 0, 0);

  let viagem = await prisma.viagemFrota.findFirst({
    where: {
      prefeituraId: prefeitura.id,
      motoristaId: motorista.id,
      observacoes: 'SMOKE HTTP VIAGEM',
    },
  });
  if (viagem) {
    viagem = await prisma.viagemFrota.update({
      where: { id: viagem.id },
      data: {
        data: dataViagem,
        status: 'AGENDADA',
        veiculoId: veiculo.id,
        vagasTotais: 16,
      },
    });
  } else {
    viagem = await prisma.viagemFrota.create({
      data: {
        prefeituraId: prefeitura.id,
        data: dataViagem,
        horaSaida: '08:00',
        horaPrevistaRetorno: '18:00',
        veiculoId: veiculo.id,
        motoristaId: motorista.id,
        destino: 'Garanhuns',
        unidadeDestino: 'Hospital Smoke',
        rotaResumo: 'Smoke -> Garanhuns',
        kmEstimados: 120,
        vagasTotais: 16,
        observacoes: 'SMOKE HTTP VIAGEM',
        status: 'AGENDADA',
        criadaPorId: dev.id,
      },
    });
  }

  return {
    prefeituraId: prefeitura.id,
    ubsId: ubs.id,
    pacienteId: paciente.id,
    motoristaId: motorista.id,
    viagemId: viagem.id,
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

async function loginMotorista(): Promise<string> {
  const response = await request('POST', '/motorista-app/auth/login', {
    body: { matricula: MOTORISTA_LOGIN, senha: MOTORISTA_SENHA },
  });
  const body = asObject(response.body);
  assert('motorista login retorna 200', response.status === 200, response.body);
  assert('motorista login retorna token JWT', typeof body['token'] === 'string', response.body);
  return String(body['token'] ?? '');
}

async function runAdminSmoke(token: string): Promise<void> {
  console.log('\n[HTTP admin]');
  const config = await request('GET', '/admin/configuracoes', { token });
  assert('GET /admin/configuracoes', config.status === 200 && typeof config.body === 'object', config.body);

  const ubs = await request('GET', '/admin/ubs', { token });
  assert('GET /admin/ubs retorna array', ubs.status === 200 && Array.isArray(ubs.body), ubs.body);

  const usuarios = await request('GET', '/admin/usuarios', { token });
  assert('GET /admin/usuarios retorna array', usuarios.status === 200 && Array.isArray(usuarios.body), usuarios.body);
}

async function runTfdSmoke(token: string, fixture: Fixture): Promise<void> {
  console.log('\n[HTTP TFD gestao]');
  const query = `prefeituraId=${encodeURIComponent(fixture.prefeituraId)}`;
  const veiculos = await request('GET', `/tfd/veiculos?${query}`, { token });
  assert('GET /tfd/veiculos', veiculos.status === 200 && Array.isArray(veiculos.body), veiculos.body);

  const motoristas = await request('GET', `/tfd/motoristas?${query}`, { token });
  assert('GET /tfd/motoristas', motoristas.status === 200 && Array.isArray(motoristas.body), motoristas.body);

  const viagens = await request('GET', `/tfd/viagens?${query}`, { token });
  assert('GET /tfd/viagens', viagens.status === 200 && Array.isArray(viagens.body), viagens.body);

  const auditoria = await request('GET', `/tfd/auditoria/verificar?${query}`, { token });
  const body = asObject(auditoria.body);
  assert('GET /tfd/auditoria/verificar', auditoria.status === 200 && Array.isArray(body['corrompidos']), auditoria.body);
}

async function runCentroSmoke(token: string): Promise<void> {
  console.log('\n[HTTP centro]');
  const dashboard = await request('GET', '/centro/gestao/dashboard', { token });
  assert('GET /centro/gestao/dashboard', dashboard.status === 200 && typeof dashboard.body === 'object', dashboard.body);

  const fila = await request('GET', '/centro/recepcao/fila-espera', { token });
  const filaBody = asObject(fila.body);
  assert('GET /centro/recepcao/fila-espera', fila.status === 200 && Array.isArray(filaBody['encaminhamentos']), fila.body);

  const especialidades = await request('GET', '/centro/gestao/especialidades', { token });
  assert('GET /centro/gestao/especialidades', especialidades.status === 200 && Array.isArray(especialidades.body), especialidades.body);
}

async function runProntuarioSmoke(token: string, fixture: Fixture): Promise<void> {
  console.log('\n[HTTP prontuario]');
  const getPaciente = await request('GET', `/pacientes/por-cpf/${CPF_PACIENTE}`, { token });
  const getPacienteBody = asObject(getPaciente.body);
  assert('GET /pacientes/por-cpf/:cpf', getPaciente.status === 200 && getPacienteBody['existe'] === true, getPaciente.body);

  const substancia = `Smoke HTTP ${Date.now()}`;
  const create = await request('POST', `/pacientes/${fixture.pacienteId}/alergias`, {
    token,
    body: {
      substancia,
      tipo: 'OUTRO',
      gravidade: 'LEVE',
      observacao: 'Criado pelo smoke HTTP e removido em seguida.',
    },
  });
  const createBody = asObject(create.body);
  const alergias = Array.isArray(createBody['alergias']) ? createBody['alergias'] : [];
  const criada = alergias
    .map((item) => asObject(item))
    .find((item) => item['substancia'] === substancia);
  assert('POST /pacientes/:id/alergias retorna 201', create.status === 201 && typeof criada?.['id'] === 'string', create.body);

  if (typeof criada?.['id'] === 'string') {
    const remove = await request('DELETE', `/pacientes/${fixture.pacienteId}/alergias/${criada['id']}`, { token });
    assert('DELETE /pacientes/:id/alergias/:id', remove.status === 200 && typeof remove.body === 'object', remove.body);
  }
}

async function runMotoristaSmoke(token: string): Promise<void> {
  console.log('\n[HTTP motorista app]');
  const me = await request('GET', '/motorista-app/auth/me', { token });
  assert('GET /motorista-app/auth/me', me.status === 200 && typeof asObject(me.body)['matricula'] === 'string', me.body);

  const viagens = await request('GET', '/motorista-app/minhas-viagens', { token });
  assert('GET /motorista-app/minhas-viagens', viagens.status === 200 && Array.isArray(viagens.body), viagens.body);

  const ajudas = await request('GET', '/motorista-app/ajudas-custo', { token });
  assert('GET /motorista-app/ajudas-custo', ajudas.status === 200 && Array.isArray(ajudas.body), ajudas.body);
}

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  UNISISM · HTTP smoke suite');
  console.log(`  Backend: ${process.env.BASE ?? `http://localhost:${process.env.PORT ?? '3334'}/v1`}`);
  console.log('═══════════════════════════════════════════════════════════════');

  const fixture = await ensureFixtures();
  const adminToken = await loginDev();
  const motoristaToken = await loginMotorista();

  await runAdminSmoke(adminToken);
  await runTfdSmoke(adminToken, fixture);
  await runCentroSmoke(adminToken);
  await runProntuarioSmoke(adminToken, fixture);
  await runMotoristaSmoke(motoristaToken);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Resultado HTTP smoke: ${passed} passaram · ${failed} falharam`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (failed > 0) process.exit(1);
}

main()
  .catch((err: unknown) => {
    console.error('Falha inesperada no HTTP smoke:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
