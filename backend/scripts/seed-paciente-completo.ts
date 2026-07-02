/**
 * Seed completo do paciente Mateus Santana — pronto pra demo do app.
 *
 * Idempotente: pode rodar várias vezes sem duplicar.
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from '../src/infrastructure/database/prisma';

const CPF = '53474131826';
const CPF_FMT = '534.741.318-26';
const NOME = 'Mateus Santana';
const NASCIMENTO = new Date('2004-07-10T00:00:00Z');

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Seed completo · ' + NOME + ' · CPF ' + CPF_FMT);
  console.log('═══════════════════════════════════════════════════════════\n');

  // ─── 1) Admin DEV-001 (criadoPorId pra VeiculoTFD/ViagemFrota) ───
  const adminDev = await prisma.atendente.findFirst({ where: { matricula: 'DEV-001' } });
  if (!adminDev) {
    throw new Error('DEV-001 não existe — rode seed-admin-only.ts antes');
  }

  // ─── 2) Prefeitura + UBS ─────────────────────────────────────
  const prefeitura = await prisma.prefeitura.upsert({
    where: { cnpj: '00000000000191' },
    update: {},
    create: {
      nome: 'Prefeitura Municipal de Águas Belas',
      municipio: 'Águas Belas',
      uf: 'PE',
      cnpj: '00000000000191',
      ativa: true,
    },
  });

  const ubs = await prisma.ubs.upsert({
    where: { cnes: '0000001' },
    update: {
      bairro: 'Centro',
      telefone: '8737411100',
      whatsapp: '5587998765432',
      email: 'ubs.central@aguasbelas.pe.gov.br',
      latitude: -9.11,
      longitude: -37.12,
    },
    create: {
      nome: 'UBS Centro Águas Belas',
      municipio: 'Águas Belas',
      uf: 'PE',
      cnes: '0000001',
      endereco: 'Praça Central, s/n · Centro',
      bairro: 'Centro',
      telefone: '8737411100',
      whatsapp: '5587998765432',
      email: 'ubs.central@aguasbelas.pe.gov.br',
      latitude: -9.11,
      longitude: -37.12,
      ativa: true,
      prefeituraId: prefeitura.id,
    },
  });
  console.log(`✓ UBS: ${ubs.nome}`);

  // ─── 3) Paciente clínico (10/07/2004 · A−) ───────────────────
  const senhaHash = await bcrypt.hash(CPF, 10);
  const paciente = await prisma.paciente.upsert({
    where: { cpf: CPF },
    update: {
      nome: NOME,
      dataNascimento: NASCIMENTO,
      grupoSanguineo: 'A_NEGATIVO',
      ubsId: ubs.id,
    },
    create: {
      nome: NOME,
      cpf: CPF,
      cartaoSus: '700000000000000',
      dataNascimento: NASCIMENTO,
      sexo: 'M',
      telefone: '87999999999',
      endereco: 'Rua das Acácias, 123',
      bairro: 'Centro',
      municipio: 'Águas Belas',
      uf: 'PE',
      cep: '55400000',
      grupoSanguineo: 'A_NEGATIVO',
      ubsId: ubs.id,
    },
  });
  console.log(`✓ Paciente: ${paciente.nome} · A− · 10/07/2004`);

  // ─── 4) Conta app ────────────────────────────────────────────
  const conta = await prisma.pacienteConta.upsert({
    where: { cpf: CPF },
    update: { nome: NOME, ubsVinculadaId: ubs.id, ativo: true, senhaProvisoria: true, senhaHash },
    create: {
      cpf: CPF,
      cpfFormatado: CPF_FMT,
      nome: NOME,
      senhaHash,
      senhaProvisoria: true,
      ativo: true,
      ubsVinculadaId: ubs.id,
    },
  });

  // ─── 5) Histórico médico ─────────────────────────────────────
  await prisma.alergia.deleteMany({ where: { pacienteId: paciente.id } });
  await prisma.alergia.createMany({
    data: [
      { pacienteId: paciente.id, tipo: 'MEDICAMENTO', substancia: 'Dipirona', gravidade: 'MODERADA', observacao: 'Urticária generalizada' },
      { pacienteId: paciente.id, tipo: 'ALIMENTO', substancia: 'Camarão', gravidade: 'GRAVE', observacao: 'Choque anafilático' },
    ],
  });

  await prisma.condicaoCronica.deleteMany({ where: { pacienteId: paciente.id } });
  await prisma.condicaoCronica.create({
    data: {
      pacienteId: paciente.id,
      cid10: 'I10',
      descricao: 'Hipertensão arterial sistêmica',
      desde: new Date('2022-03-01'),
      ativo: true,
    },
  });

  await prisma.medicamentoEmUso.deleteMany({ where: { pacienteId: paciente.id } });
  await prisma.medicamentoEmUso.create({
    data: {
      pacienteId: paciente.id,
      nome: 'Losartana',
      dosagem: '50mg',
      frequencia: '1x ao dia · manhã',
      desde: new Date('2024-01-15'),
      prescritor: 'Dr. Ricardo Santos · CRM-PE 28471',
      ativo: true,
    },
  });
  console.log(`✓ Histórico: 2 alergias · 1 condição crônica · 1 medicamento`);

  // ─── 6) Atendimento ──────────────────────────────────────────
  await prisma.atendimento.deleteMany({ where: { pacienteId: paciente.id } });
  await prisma.atendimento.create({
    data: {
      pacienteId: paciente.id,
      data: new Date('2026-04-15T10:30:00Z'),
      tipo: 'CONSULTA_MEDICA',
      profissional: 'Dr. Ricardo Santos',
      registroProfissional: 'CRM-PE 28471',
      especialidade: 'Clínica geral',
      unidade: ubs.nome,
      queixaPrincipal: 'Pressão arterial elevada nos últimos dias',
      diagnostico: 'Hipertensão arterial — descompensada',
      cid10: 'I10',
      conduta: 'Aumentar Losartana para 100mg/dia. Reavaliar em 30 dias.',
      prescricaoResumo: 'Losartana 50mg · 2x ao dia',
    },
  });
  console.log(`✓ Atendimento (Dr. Ricardo · Clínica geral)`);

  // ─── 7) Vacina ───────────────────────────────────────────────
  await prisma.vacinaAplicada.deleteMany({ where: { pacienteId: paciente.id } });
  await prisma.vacinaAplicada.create({
    data: {
      pacienteId: paciente.id,
      data: new Date('2026-04-12T14:00:00Z'),
      vacina: 'Influenza tetravalente',
      dose: 'Anual',
      lote: 'BR224-2026',
      aplicador: 'Enf. Carla Mendes',
      unidade: ubs.nome,
      via: 'INTRAMUSCULAR',
    },
  });
  console.log(`✓ Vacina (Influenza Butantan · 12/04/2026)`);

  // ─── 8) Exame ────────────────────────────────────────────────
  await prisma.exameRealizado.deleteMany({ where: { pacienteId: paciente.id } });
  await prisma.exameRealizado.create({
    data: {
      pacienteId: paciente.id,
      data: new Date('2026-05-05T09:00:00Z'),
      tipo: 'Hemoglobina glicada (HbA1c)',
      categoria: 'LABORATORIAL',
      solicitante: 'Dr. Ricardo Santos · CRM-PE 28471',
      unidadeExecutora: 'Laboratório Municipal Águas Belas',
      resultado: 'ALTERADO',
      observacao: 'HbA1c = 8,4% (acima do alvo de 7%). Reforçar adesão e revisar dieta.',
    },
  });
  console.log(`✓ Exame (HbA1c ALTERADO)`);

  // ─── 9) Encaminhamentos × 3 ──────────────────────────────────
  await prisma.encaminhamento.deleteMany({ where: { pacienteId: paciente.id } });

  const encA = await prisma.encaminhamento.create({
    data: {
      protocolo: 'UBS-2026-100137',
      status: 'APROVADO',
      paciente: { connect: { id: paciente.id } },
      pacienteNome: paciente.nome,
      pacienteCpf: CPF,
      pacienteCartaoSus: paciente.cartaoSus ?? '',
      pacienteDataNascimento: NASCIMENTO,
      pacienteSexo: 'M',
      pacienteTelefone: paciente.telefone ?? '',
      pacienteEndereco: 'Rua das Acácias, 123 · Centro',
      medicoSolicitante: 'Dr. Ricardo Santos',
      crm: 'CRM-PE 28471',
      especialidadeSolicitada: 'Cardiologia',
      cid10: 'I10',
      cidDescricao: 'Hipertensão essencial',
      justificativaClinica: 'Paciente com HAS descompensada apesar do tratamento. Necessita avaliação cardiológica especializada.',
      prioridade: 'PRIORITARIA',
      dataSolicitacao: new Date('2026-04-22'),
      observacoesRegulacao: 'Trazer ECG recente e exames complementares',
      agendamentoPrevisto: new Date('2026-06-08T09:30:00Z'),
      localAgendamento: 'CEM Águas Belas · Sala 3 · Av. Senhor dos Passos, 1422',
      profissionalAgendado: 'Dra. Beatriz Lima · CRM-PE 22189',
      cidadeAgendamento: 'Águas Belas',
      ufAgendamento: 'PE',
      ubs: { connect: { id: ubs.id } },
      atendente: { connect: { id: adminDev.id } },
      unidadeOrigem: ubs.nome,
      atendenteResponsavel: 'ATENDENTE DE REGULAÇÃO',
      recomendacoes: ['Trazer ECG recente', 'Trazer lista de medicamentos', 'Comparecer 30 min antes'],
    },
  });

  const encB = await prisma.encaminhamento.create({
    data: {
      protocolo: 'UBS-2026-100138',
      status: 'PENDENCIA_DOCUMENTO',
      paciente: { connect: { id: paciente.id } },
      pacienteNome: paciente.nome,
      pacienteCpf: CPF,
      pacienteCartaoSus: paciente.cartaoSus ?? '',
      pacienteDataNascimento: NASCIMENTO,
      pacienteSexo: 'M',
      pacienteTelefone: paciente.telefone ?? '',
      pacienteEndereco: 'Rua das Acácias, 123 · Centro',
      medicoSolicitante: 'Dr. Ricardo Santos',
      crm: 'CRM-PE 28471',
      especialidadeSolicitada: 'Oftalmologia',
      cid10: 'H52.4',
      cidDescricao: 'Presbiopia',
      justificativaClinica: 'Paciente com queixa de dificuldade visual para perto e cansaço ocular.',
      prioridade: 'ELETIVA',
      dataSolicitacao: new Date('2026-05-10'),
      observacoesRegulacao: 'Faltou cartão SUS legível. Procure sua UBS para regularizar.',
      ubs: { connect: { id: ubs.id } },
      atendente: { connect: { id: adminDev.id } },
      unidadeOrigem: ubs.nome,
      atendenteResponsavel: 'ATENDENTE DE REGULAÇÃO',
    },
  });

  const encC = await prisma.encaminhamento.create({
    data: {
      protocolo: 'UBS-2026-100139',
      status: 'AGUARDANDO_REGULACAO',
      paciente: { connect: { id: paciente.id } },
      pacienteNome: paciente.nome,
      pacienteCpf: CPF,
      pacienteCartaoSus: paciente.cartaoSus ?? '',
      pacienteDataNascimento: NASCIMENTO,
      pacienteSexo: 'M',
      pacienteTelefone: paciente.telefone ?? '',
      pacienteEndereco: 'Rua das Acácias, 123 · Centro',
      medicoSolicitante: 'Dr. Ricardo Santos',
      crm: 'CRM-PE 28471',
      especialidadeSolicitada: 'Endocrinologia',
      cid10: 'E11.9',
      cidDescricao: 'Diabetes mellitus tipo 2 sem complicações',
      justificativaClinica: 'HbA1c alterada (8,4%). Necessita avaliação especializada para ajuste terapêutico.',
      prioridade: 'PRIORITARIA',
      dataSolicitacao: new Date('2026-05-26'),
      ubs: { connect: { id: ubs.id } },
      atendente: { connect: { id: adminDev.id } },
      unidadeOrigem: ubs.nome,
      atendenteResponsavel: 'ATENDENTE DE REGULAÇÃO',
    },
  });

  console.log(`✓ 3 encaminhamentos: APROVADO+AGENDADO · PENDÊNCIA · AGUARDANDO`);

  // ─── 10) Anexos por encaminhamento ───────────────────────────
  for (const enc of [encA, encB, encC]) {
    await prisma.anexoDocumento.create({
      data: {
        encaminhamentoId: enc.id,
        tipo: 'SOLICITACAO',
        nome: `solicitacao-${enc.protocolo}.pdf`,
        mimeType: 'application/pdf',
        tamanhoKb: 142,
        sha256: crypto.randomBytes(32).toString('hex'),
        caminho: `encaminhamentos/2026-05/${crypto.randomBytes(16).toString('hex')}.pdf`,
        scanStatus: 'LIMPO',
      },
    });
  }
  console.log(`✓ 3 anexos (PDF · scan LIMPO)`);

  // ─── 11) Timeline ───────────────────────────────────────────
  const baseA = new Date('2026-04-22T14:32:00Z');
  await prisma.eventoTimeline.createMany({
    data: [
      { encaminhamentoId: encA.id, tipo: 'CRIADO', titulo: 'Encaminhamento criado', descricao: 'Enviado à regulação SMS', em: baseA, autor: 'Dr. Ricardo Santos', autorPapel: 'Médico solicitante' },
      { encaminhamentoId: encA.id, tipo: 'DOCUMENTO_ANEXADO', titulo: 'Solicitação anexada', descricao: 'Solicitação médica em PDF', em: new Date(baseA.getTime() + 5 * 60_000), autor: 'Dr. Ricardo Santos', autorPapel: 'Médico solicitante' },
      { encaminhamentoId: encA.id, tipo: 'ENVIADO_REGULACAO', titulo: 'Enviado à regulação', descricao: 'Aguardando análise', em: new Date(baseA.getTime() + 60 * 60_000), autor: 'Sistema', autorPapel: 'UBS' },
      { encaminhamentoId: encA.id, tipo: 'APROVADO', titulo: 'Aprovado pela regulação', descricao: 'Prioridade clínica confirmada', em: new Date('2026-05-26T08:00:00Z'), autor: 'Reg. SMS', autorPapel: 'Regulador SMS' },
      { encaminhamentoId: encA.id, tipo: 'AGENDADO', titulo: 'Consulta agendada', descricao: 'Dra. Beatriz Lima · CEM · 08/06/2026 09:30', em: new Date('2026-05-26T08:05:00Z'), autor: 'Reg. SMS', autorPapel: 'Regulador SMS' },
    ],
  });
  const baseB = new Date('2026-05-10T11:00:00Z');
  await prisma.eventoTimeline.createMany({
    data: [
      { encaminhamentoId: encB.id, tipo: 'CRIADO', titulo: 'Encaminhamento criado', descricao: 'Oftalmologia', em: baseB, autor: 'Dr. Ricardo Santos', autorPapel: 'Médico solicitante' },
      { encaminhamentoId: encB.id, tipo: 'PENDENCIA_REGISTRADA', titulo: 'Pendência de documento', descricao: 'Cartão SUS ilegível. Procure sua UBS.', em: new Date(baseB.getTime() + 24 * 3600_000), autor: 'Reg. SMS', autorPapel: 'Regulador SMS' },
    ],
  });
  await prisma.eventoTimeline.create({
    data: { encaminhamentoId: encC.id, tipo: 'CRIADO', titulo: 'Encaminhamento criado', descricao: 'Endocrinologia', em: new Date('2026-05-26T10:00:00Z'), autor: 'Dr. Ricardo Santos', autorPapel: 'Médico solicitante' },
  });
  console.log(`✓ Timeline (5+2+1 eventos)`);

  // ─── 12) Notificações (3) ───────────────────────────────────
  await prisma.notificacaoPaciente.deleteMany({ where: { contaId: conta.id } });
  await prisma.notificacaoPaciente.createMany({
    data: [
      {
        contaId: conta.id,
        pacienteCpf: CPF,
        tipo: 'APROVADO',
        titulo: 'Sua consulta foi marcada! 🎉',
        corpo: 'Cardiologia · 08/06/2026 · 09:30 · CEM Águas Belas Sala 3',
        encaminhamentoId: encA.id,
        criadaEm: new Date('2026-05-26T08:05:00Z'),
        pushStatus: 'ENVIADO',
      },
      {
        contaId: conta.id,
        pacienteCpf: CPF,
        tipo: 'PENDENCIA_REGISTRADA',
        titulo: 'Falta um documento',
        corpo: 'Cartão SUS ilegível. Procure sua UBS para regularizar.',
        encaminhamentoId: encB.id,
        criadaEm: new Date('2026-05-11T11:00:00Z'),
        pushStatus: 'ENVIADO',
      },
      {
        contaId: conta.id,
        pacienteCpf: CPF,
        tipo: 'ENCAMINHAMENTO_CRIADO',
        titulo: 'Novo encaminhamento criado',
        corpo: 'Endocrinologia · aguardando análise da regulação SMS.',
        encaminhamentoId: encC.id,
        criadaEm: new Date('2026-05-26T10:00:00Z'),
        pushStatus: 'ENVIADO',
      },
    ],
  });
  console.log(`✓ 3 notificações`);

  // ─── 13) Banner SMS ─────────────────────────────────────────
  await prisma.smsBanner.deleteMany({ where: { prefeituraId: prefeitura.id } });
  await prisma.smsBanner.create({
    data: {
      prefeituraId: prefeitura.id,
      titulo: 'Campanha de vacinação contra Influenza',
      corpo: 'Procure sua UBS para receber a dose anual gratuita. Grupos prioritários: idosos, gestantes, crianças.',
      tone: 'CAMPANHA',
      ativo: true,
      publicadoEm: new Date('2026-05-26T08:00:00Z'),
      expiraEm: new Date('2026-07-26T00:00:00Z'),
      ctaLabel: 'Saiba mais',
      ctaUrl: 'https://www.aguasbelas.pe.gov.br/saude/influenza',
      prioridadeOrdem: 100,
      criadoPorId: adminDev.id,
    },
  });
  console.log(`✓ 1 banner SMS (Campanha Influenza)`);

  // ─── 14) Frota TFD: motorista + veículo ─────────────────────
  let motAtendente = await prisma.atendente.findFirst({ where: { matricula: 'MOT-000001' } });
  if (!motAtendente) {
    const motHash = await bcrypt.hash('12345678', 10);
    motAtendente = await prisma.atendente.create({
      data: {
        nome: 'João Pedro Lima',
        cpf: '11122233344',
        matricula: 'MOT-000001',
        email: 'motorista.001@aguasbelas.pe.gov.br',
        senhaHash: motHash,
        role: 'MOTORISTA_TFD',
        prefeituraId: prefeitura.id,
        cargo: 'MOTORISTA TFD',
        funcao: 'Condução de viagens TFD',
        ativo: true,
      },
    });
  }

  let motorista = await prisma.motoristaTFD.findFirst({ where: { atendenteId: motAtendente.id } });
  if (!motorista) {
    motorista = await prisma.motoristaTFD.create({
      data: {
        prefeituraId: prefeitura.id,
        atendenteId: motAtendente.id,
        nome: 'João Pedro Lima',
        cpf: '11122233344',
        cnh: '11111111111',
        categoriaCnh: 'D',
        validadeCnh: new Date('2030-01-01'),
        telefone: '87988887777',
        status: 'ATIVO',
        criadoPorId: adminDev.id,
      },
    });
  }

  let veiculo = await prisma.veiculoTFD.findFirst({ where: { placa: 'PEH7E84', prefeituraId: prefeitura.id } });
  if (!veiculo) {
    veiculo = await prisma.veiculoTFD.create({
      data: {
        prefeituraId: prefeitura.id,
        placa: 'PEH7E84',
        modelo: 'Mercedes-Benz Sprinter 416',
        tipo: 'VAN',
        capacidade: 14,
        ano: 2023,
        combustivel: 'DIESEL',
        consumoMedioKml: 7.5,
        hodometroAtualKm: BigInt(142_350),
        status: 'ATIVO',
        criadoPorId: adminDev.id,
      },
    });
  }
  console.log(`✓ Frota: veículo PEH-7E84 + motorista João Pedro`);

  // ─── 15) Viagens TFD futuras ────────────────────────────────
  // ⚠ FK: tfd_paciente_solicitacoes referencia viagemFrota — deletar dependentes antes
  await prisma.tfdPacienteSolicitacao.deleteMany({
    where: { viagem: { prefeituraId: prefeitura.id } },
  });
  await prisma.viagemFrota.deleteMany({ where: { prefeituraId: prefeitura.id } });

  const viagemRecife = await prisma.viagemFrota.create({
    data: {
      prefeituraId: prefeitura.id,
      data: new Date('2026-06-08T00:00:00Z'),
      horaSaida: '06:30',
      horaPrevistaRetorno: '20:00',
      veiculoId: veiculo.id,
      motoristaId: motorista.id,
      destino: 'Recife',
      unidadeDestino: 'CEM · Av. Conde da Boa Vista',
      rotaResumo: 'Águas Belas → Garanhuns → Recife',
      kmEstimados: 285,
      kmInicialHodometro: BigInt(142_350),
      vagasTotais: 12,
      observacoes: 'Saída do Terminal Rodoviário · Plataforma B',
      status: 'AGENDADA',
      criadaPorId: adminDev.id,
    },
  });

  await prisma.viagemFrota.create({
    data: {
      prefeituraId: prefeitura.id,
      data: new Date('2026-06-15T00:00:00Z'),
      horaSaida: '05:00',
      horaPrevistaRetorno: '21:00',
      veiculoId: veiculo.id,
      motoristaId: motorista.id,
      destino: 'Petrolina',
      unidadeDestino: 'Hospital Universitário Dom Malan',
      rotaResumo: 'Águas Belas → Arcoverde → Petrolina',
      kmEstimados: 480,
      vagasTotais: 10,
      status: 'AGENDADA',
      criadaPorId: adminDev.id,
    },
  });
  console.log(`✓ 2 viagens TFD: Recife (08/06 06:30) · Petrolina (15/06 05:00)`);

  // ─── 16) Solicitação TFD aprovada do paciente ────────────────
  await prisma.tfdPacienteSolicitacao.deleteMany({ where: { contaId: conta.id } });
  await prisma.tfdPacienteSolicitacao.create({
    data: {
      contaId: conta.id,
      viagemId: viagemRecife.id,
      status: 'APROVADA',
      prioridade: 'PRIORITARIA',
      justificativaPaciente: 'Consulta com cardiologista agendada — encaminhamento UBS-2026-100137',
      encaminhamentoId: encA.id,
      encaminhamentoProtocolo: encA.protocolo,
      numeroAssento: '07',
      operadorId: adminDev.id,
      operadorNome: adminDev.nome,
      operadorMatricula: adminDev.matricula,
      aprovadaEm: new Date('2026-05-27T10:00:00Z'),
    },
  });
  console.log(`✓ 1 solicitação TFD APROVADA (assento 07 · viagem Recife)`);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  ✅ SEED COMPLETO');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Login no app:`);
  console.log(`    CPF      : ${CPF}  (ou ${CPF_FMT})`);
  console.log(`    Senha    : ${CPF}    (provisória — app força troca)`);
  console.log(`  Tipo sang : A−`);
  console.log(`  Nascimento: 10/07/2004`);
  console.log(`  Conteúdo:`);
  console.log(`    Home     : 3 encaminhamentos (1 agendado, 1 pendência, 1 fila)`);
  console.log(`    Notif    : 3 (1 SUCCESS, 1 WARNING, 1 INFO)`);
  console.log(`    Dossiê   : 2 alergias · 1 condição · 1 medicamento · 1 atendimento · 1 vacina · 1 exame`);
  console.log(`    Banners  : 1 ativo (Campanha Influenza)`);
  console.log(`    TFD      : 2 viagens · 1 solicitação aprovada (assento 07 · Recife 08/06)`);
  console.log(`    UBS      : ${ubs.nome} · WhatsApp 5587998765432`);
  console.log('═══════════════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('✗ falha:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
