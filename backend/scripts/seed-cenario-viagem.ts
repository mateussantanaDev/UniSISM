/**
 * Cenário de teste: viagem Águas Belas → Garanhuns com 43 passageiros.
 * Cria UBS + Veículo + 43 Pacientes + 43 Solicitações ALOCADAS + 2 Viagens.
 *
 * Idempotente — busca/reutiliza entidades existentes quando possível.
 */
import { prisma } from '../src/infrastructure/database/prisma';

const PREF_ID = 'd0245fff-691c-40b0-8e60-522fbc88d3f9';
const MOTORISTA_ID = '7c32a5cb-9768-4e1f-9db9-f031b35df06f'; // JOAO DA SILVA (MOT-224725)
const DEV_ATENDENTE_ID = 'c8d261e5-4b6d-4e5f-a182-b25a84172114'; // DEV-MATEUS

const NOMES = [
  'ANA SOUZA','BRUNO ALVES','CARLA MEDEIROS','DIEGO LOPES','ELENA BARROS',
  'FELIPE COSTA','GABRIELA NUNES','HENRIQUE LIMA','ISABELA REIS','JOSE MORAES',
  'KARINA PINTO','LUCAS GOMES','MARIA CONCEICAO','NATALIA FREITAS','OTAVIO MONTEIRO',
  'PATRICIA ROCHA','QUITERIA SANTOS','RAFAEL ARAUJO','SOFIA DUARTE','TIAGO CAVALCANTI',
  'URIEL FERREIRA','VANESSA OLIVEIRA','WALTER MELO','XENIA AMORIM','YASMIN BORGES',
  'ZILDA CARDOSO','ANDRE PESSOA','BEATRIZ TORRES','CESAR BANDEIRA','DANIELA PRADO',
  'EDUARDO CABRAL','FERNANDA MACEDO','GUSTAVO LEAL','HELENA ROSA','IGOR VIEIRA',
  'JULIA TEIXEIRA','KAUE DIAS','LARA BATISTA','MARCOS PEREIRA','NICOLE MORENO',
  'OSCAR XAVIER','PAULA QUEIROZ','RICARDO MENDES',
];

async function main(): Promise<void> {
  // ─────────── UBS ───────────
  let ubs = await prisma.ubs.findFirst({
    where: { prefeituraId: PREF_ID, nome: 'UBS Águas Belas Centro', deletadoEm: null },
  });
  if (!ubs) {
    ubs = await prisma.ubs.create({
      data: {
        nome: 'UBS Águas Belas Centro',
        municipio: 'Águas Belas',
        uf: 'PE',
        cnes: '7654321',
        endereco: 'Praça Central, 100',
        prefeituraId: PREF_ID,
      },
    });
    console.log('✓ UBS criada:', ubs.id);
  } else {
    console.log('· UBS já existe:', ubs.id);
  }

  // ─────────── Veículo ───────────
  let veic = await prisma.veiculoTFD.findFirst({
    where: { prefeituraId: PREF_ID, placa: 'OKL3A52', deletadoEm: null },
  });
  if (!veic) {
    veic = await prisma.veiculoTFD.create({
      data: {
        placa: 'OKL3A52',
        modelo: 'Mercedes-Benz O500',
        tipo: 'ONIBUS',
        capacidade: 50,
        ano: 2022,
        combustivel: 'DIESEL',
        consumoMedioKml: 3.5 as unknown as never, // Decimal aceita number
        hodometroAtualKm: 0n,
        prefeituraId: PREF_ID,
        criadoPorId: DEV_ATENDENTE_ID,
      },
    });
    console.log('✓ Veículo criado:', veic.placa, '(', veic.id, ')');
  } else {
    console.log('· Veículo já existe:', veic.placa);
  }

  // ─────────── 43 Pacientes ───────────
  const pacienteIds: string[] = [];
  for (let i = 0; i < 43; i++) {
    const cpf = String(99100000000 + i); // 11 dígitos únicos
    const nome = NOMES[i]!;
    const sexo = (i % 2 === 0 ? 'F' : 'M') as 'F' | 'M';
    const ano = 1940 + (i % 50);
    const mes = (i % 12) + 1;
    const dia = (i % 27) + 1;
    const dataNasc = new Date(`${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}T00:00:00.000Z`);

    const existing = await prisma.paciente.findUnique({ where: { cpf } });
    if (existing) {
      pacienteIds.push(existing.id);
      continue;
    }
    const p = await prisma.paciente.create({
      data: {
        nome,
        cpf,
        dataNascimento: dataNasc,
        sexo,
        telefone: `75999${String(100000 + i).padStart(6, '0')}`,
        ubsId: ubs.id,
      },
    });
    pacienteIds.push(p.id);
  }
  console.log(`✓ ${pacienteIds.length} pacientes prontos`);

  // ─────────── 43 Solicitações TFD ───────────
  // Cria com status APROVADA pra poder alocar direto. Cada solicitação dura uma viagem.
  const solicitacaoIds: string[] = [];
  for (let i = 0; i < pacienteIds.length; i++) {
    const pacId = pacienteIds[i]!;
    // gera próximo protocolo
    const ano = new Date().getUTCFullYear();
    const seq = await prisma.sequencialProtocolo.upsert({
      where: { chave: `TFD-${ano}` },
      create: { chave: `TFD-${ano}`, valor: 1 },
      update: { valor: { increment: 1 } },
    });
    const protocolo = `TFD-${ano}-${String(seq.valor).padStart(6, '0')}`;

    const s = await prisma.solicitacaoTFD.create({
      data: {
        protocolo,
        prefeituraId: PREF_ID,
        pacienteId: pacId,
        ubsId: ubs.id,
        destino: 'Garanhuns',
        unidadeDestino: 'Hospital Regional de Garanhuns',
        especialidade: 'Consulta Especializada',
        motivo: 'Atendimento ambulatorial em Garanhuns',
        dataDesejada: new Date(),
        acompanhanteNecessario: false,
        prioridade: 'ELETIVA',
        status: 'APROVADA',
        decididaEm: new Date(),
        decididaPorId: DEV_ATENDENTE_ID,
      },
    });
    solicitacaoIds.push(s.id);
  }
  console.log(`✓ ${solicitacaoIds.length} solicitações APROVADAS prontas`);

  // ─────────── Viagem 1: HOJE 17:00 com 43 passageiros ───────────
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);

  // Limpa viagem antiga do mesmo motorista no mesmo dia, se houver
  const v1Existente = await prisma.viagemFrota.findFirst({
    where: {
      motoristaId: MOTORISTA_ID,
      data: hoje,
      horaSaida: '17:00',
    },
  });
  if (v1Existente) {
    console.log('· Viagem 1 já existe:', v1Existente.id, '— pulando');
  } else {
    const viagem1 = await prisma.viagemFrota.create({
      data: {
        prefeituraId: PREF_ID,
        data: hoje,
        horaSaida: '17:00',
        horaPrevistaRetorno: '23:30',
        veiculoId: veic.id,
        motoristaId: MOTORISTA_ID,
        destino: 'Garanhuns',
        unidadeDestino: 'Hospital Regional de Garanhuns',
        rotaResumo: 'Águas Belas → Garanhuns (BR-423)',
        kmEstimados: 110,
        vagasTotais: 50,
        observacoes: 'Saída em frente à UBS Centro. Trazer documentos.',
        status: 'AGENDADA',
        criadaPorId: DEV_ATENDENTE_ID,
      },
    });

    // Aloca 43 passageiros na viagem 1
    await prisma.$transaction(
      solicitacaoIds.map((solId, idx) =>
        prisma.viagemPassageiro.create({
          data: {
            viagemId: viagem1.id,
            solicitacaoId: solId,
            pacienteId: pacienteIds[idx]!,
            numeroAssento: idx + 1, // 1..43
            acompanhante: false,
          },
        }),
      ),
    );
    // Marca solicitações como ALOCADA
    await prisma.solicitacaoTFD.updateMany({
      where: { id: { in: solicitacaoIds } },
      data: { status: 'ALOCADA', viagemId: viagem1.id },
    });
    console.log(`✓ Viagem 1 criada (${viagem1.id}) — HOJE 17:00, 43/50 lugares`);
  }

  // ─────────── Viagem 2: amanhã 06:00 (próxima viagem, sem passageiros ainda) ───────────
  const amanha = new Date();
  amanha.setUTCDate(amanha.getUTCDate() + 1);
  amanha.setUTCHours(0, 0, 0, 0);

  const v2Existente = await prisma.viagemFrota.findFirst({
    where: {
      motoristaId: MOTORISTA_ID,
      data: amanha,
      horaSaida: '06:00',
    },
  });
  if (v2Existente) {
    console.log('· Viagem 2 já existe:', v2Existente.id, '— pulando');
  } else {
    const viagem2 = await prisma.viagemFrota.create({
      data: {
        prefeituraId: PREF_ID,
        data: amanha,
        horaSaida: '06:00',
        horaPrevistaRetorno: '14:00',
        veiculoId: veic.id,
        motoristaId: MOTORISTA_ID,
        destino: 'Recife',
        unidadeDestino: 'Hospital das Clínicas - UFPE',
        rotaResumo: 'Águas Belas → Recife (BR-423 / BR-232)',
        kmEstimados: 310,
        vagasTotais: 50,
        observacoes: 'Próxima viagem — passageiros serão alocados conforme aprovação.',
        status: 'AGENDADA',
        criadaPorId: DEV_ATENDENTE_ID,
      },
    });
    console.log(`✓ Viagem 2 criada (${viagem2.id}) — AMANHÃ 06:00, 0/50 lugares (Recife)`);
  }

  console.log('\n✓ Cenário pronto. Login no app: MOT-224725 / <senha que você definiu no app>');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
