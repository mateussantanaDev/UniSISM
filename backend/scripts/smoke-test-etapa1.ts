/**
 * Smoke test fim-a-fim da Etapa 1.
 *
 * Cria os atores necessários, simula o fluxo UBS→SMS→APP e valida que:
 *   - `localAgendamento` + `profissionalAgendado` chegam no app
 *   - `motivoRejeicao` (em outro encaminhamento) chega flat
 *   - `pendenciasAbertas` derivada corretamente
 *   - `podeSolicitarTfd` derivada corretamente
 *   - `recomendacoes` por especialidade chegam
 *
 * Uso: npx ts-node-dev --transpile-only scripts/smoke-test-etapa1.ts
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/infrastructure/database/prisma';
import {
  formatarCpf,
  normalizarCpf,
} from '../src/infrastructure/services/NotificacaoPacienteService';

const CPF_TESTE = '12345678909';
const CPF_FMT = '123.456.789-09';

async function ensureUbs(prefeituraId: string) {
  let ubs = await prisma.ubs.findFirst({
    where: { nome: 'UBS Águas Belas Centro', prefeituraId },
  });
  if (!ubs) {
    ubs = await prisma.ubs.create({
      data: {
        nome: 'UBS Águas Belas Centro',
        municipio: 'Águas Belas',
        uf: 'PE',
        cnes: '7654321',
        endereco: 'Praça Central, 100',
        prefeituraId,
      },
    });
  }
  return ubs;
}

async function ensureAtendente(ubs: { id: string; prefeituraId: string }) {
  let at = await prisma.atendente.findUnique({ where: { matricula: 'SMOKE-UBS-001' } });
  if (!at) {
    const hash = await bcrypt.hash('senha123', 10);
    at = await prisma.atendente.create({
      data: {
        matricula: 'SMOKE-UBS-001',
        nome: 'ATENDENTE SMOKE TEST',
        email: 'smoke-ubs@example.com',
        senhaHash: hash,
        cpf: '99988877766',
        role: 'ATENDENTE_UBS',
        ubsId: ubs.id,
        prefeituraId: ubs.prefeituraId,
      },
    });
  }
  return at;
}

async function ensurePaciente(ubsId: string) {
  let p = await prisma.paciente.findUnique({ where: { cpf: CPF_TESTE } });
  if (!p) {
    p = await prisma.paciente.create({
      data: {
        nome: 'MARIA APARECIDA SOUZA',
        cpf: CPF_TESTE,
        dataNascimento: new Date('1963-04-14T00:00:00.000Z'),
        sexo: 'F',
        telefone: '75999998877',
        ubsId,
      },
    });
  }
  return p;
}

async function ensureRecomendacaoCardiologia(atendenteId: string) {
  await prisma.especialidadeRecomendacao.upsert({
    where: { especialidade: 'Cardiologia' },
    create: {
      especialidade: 'Cardiologia',
      recomendacoes: [
        'Levar documento com foto e Cartão SUS.',
        'Levar exames cardiológicos recentes, se houver.',
        'Chegar com 30 minutos de antecedência.',
      ],
      criadoPorId: atendenteId,
    },
    update: {
      ativo: true,
      recomendacoes: [
        'Levar documento com foto e Cartão SUS.',
        'Levar exames cardiológicos recentes, se houver.',
        'Chegar com 30 minutos de antecedência.',
      ],
    },
  });
}

async function criarEncaminhamento(
  ubsId: string,
  atendenteId: string,
  pacienteId: string,
  especialidade: string,
  status: 'AGUARDANDO_REGULACAO' | 'APROVADO' | 'REJEITADO' | 'PENDENCIA_DOCUMENTO',
  cenario: string,
) {
  // Próximo protocolo
  const ano = new Date().getUTCFullYear();
  const seq = await prisma.sequencialProtocolo.upsert({
    where: { chave: `UBS-${ano}` },
    create: { chave: `UBS-${ano}`, valor: 1 },
    update: { valor: { increment: 1 } },
  });
  const protocolo = `UBS-${ano}-${String(seq.valor).padStart(6, '0')}`;

  const enc = await prisma.encaminhamento.create({
    data: {
      protocolo,
      status,
      pacienteId,
      pacienteNome: 'MARIA APARECIDA SOUZA',
      pacienteCpf: CPF_FMT,
      pacienteCartaoSus: '702 8004 5391 0023',
      pacienteDataNascimento: new Date('1963-04-14T00:00:00.000Z'),
      pacienteSexo: 'F',
      pacienteTelefone: '75999998877',
      pacienteEndereco: 'Rua Central, 100',
      medicoSolicitante: 'DR. CARLOS MENDES',
      crm: 'CRM-PE 28471',
      especialidadeSolicitada: especialidade,
      cid10: 'I10',
      cidDescricao: 'Hipertensão essencial',
      justificativaClinica: 'Smoke test — cenário: ' + cenario,
      prioridade: 'PRIORITARIA',
      dataSolicitacao: new Date(),
      unidadeOrigem: 'UBS Águas Belas Centro',
      atendenteResponsavel: 'ATENDENTE SMOKE TEST',
      ubsId,
      atendenteId,
    },
  });
  await prisma.eventoTimeline.create({
    data: {
      encaminhamentoId: enc.id,
      tipo: 'CRIADO',
      titulo: 'Encaminhamento criado',
      descricao: `Criado pela UBS · cenário "${cenario}"`,
      autor: 'ATENDENTE SMOKE TEST',
      autorPapel: 'Atendente UBS',
    },
  });
  return enc;
}

async function main(): Promise<void> {
  console.log('\n──── SMOKE TEST · Etapa 1 (Campos Encaminhamento) ────\n');

  // 1. Pré-requisitos
  const pref = await prisma.prefeitura.findFirst();
  if (!pref) {
    console.error('✗ Nenhuma prefeitura — rode: criar prefeitura via API DEV primeiro.');
    process.exit(1);
  }
  const ubs = await ensureUbs(pref.id);
  const atendente = await ensureAtendente(ubs);
  const paciente = await ensurePaciente(ubs.id);
  await ensureRecomendacaoCardiologia(atendente.id);
  console.log(`✓ Pré-requisitos: prefeitura=${pref.id}, ubs=${ubs.id}, atendente=${atendente.id}, paciente=${paciente.id}`);

  // 2. Garantir PacienteConta
  let conta = await prisma.pacienteConta.findUnique({ where: { cpf: CPF_TESTE } });
  if (!conta) {
    const hash = await bcrypt.hash(CPF_TESTE, 10);
    conta = await prisma.pacienteConta.create({
      data: {
        cpf: CPF_TESTE,
        cpfFormatado: CPF_FMT,
        nome: 'MARIA APARECIDA SOUZA',
        senhaHash: hash,
        ativo: true,
        senhaProvisoria: true,
      },
    });
  }
  console.log(`✓ PacienteConta: ${conta.id}`);

  // 3. Limpa encaminhamentos antigos do smoke test pra começar limpo
  const protAntigo = await prisma.encaminhamento.findMany({
    where: {
      pacienteCpf: CPF_FMT,
      justificativaClinica: { startsWith: 'Smoke test' },
    },
    select: { id: true },
  });
  if (protAntigo.length > 0) {
    await prisma.eventoTimeline.deleteMany({
      where: { encaminhamentoId: { in: protAntigo.map((e) => e.id) } },
    });
    await prisma.encaminhamento.deleteMany({
      where: { id: { in: protAntigo.map((e) => e.id) } },
    });
    console.log(`· Limpou ${protAntigo.length} encaminhamento(s) antigo(s)`);
  }

  // 4. Cria 4 cenários cobrindo todos os campos novos
  console.log('\n→ Criando 4 encaminhamentos cobrindo todos cenários...');

  // 4.1 APROVADO COM local + profissional + cidadeAgendamento EXPLÍCITA + recomendações
  //     Especialidade "Cardiología" (com acento) — testa Brecha 2.
  const enc1 = await criarEncaminhamento(
    ubs.id,
    atendente.id,
    paciente.id,
    'Cardiología', // BRECHA 2: com acento — deve bater no seed "Cardiologia"
    'AGUARDANDO_REGULACAO',
    'aprovado-cardio-com-detalhes',
  );

  // Simula aprovação (via use case interno por simplicidade — UI faria HTTP)
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 14);
  await prisma.encaminhamento.update({
    where: { id: enc1.id },
    data: {
      status: 'APROVADO',
      agendamentoPrevisto: amanha,
      localAgendamento: 'CEM · Sala 3 · Av. Getúlio Vargas, 1100 - Centro',
      profissionalAgendado: 'Dra. Beatriz Lima · CRM-PE 22189',
      // BRECHA 1: cidade EXPLÍCITA (Recife ≠ Águas Belas) → podeSolicitarTfd=true
      cidadeAgendamento: 'Recife',
      ufAgendamento: 'PE',
    },
  });
  await prisma.eventoTimeline.create({
    data: {
      encaminhamentoId: enc1.id,
      tipo: 'APROVADO',
      titulo: 'Encaminhamento aprovado',
      descricao: 'Aprovado pela Regulação',
      autor: 'Reg. Smoke',
      autorPapel: 'Regulação SMS',
    },
  });

  // 4.2 REJEITADO com motivoRejeicao flat
  const enc2 = await criarEncaminhamento(
    ubs.id,
    atendente.id,
    paciente.id,
    'Oftalmologia',
    'AGUARDANDO_REGULACAO',
    'rejeitado-oftalmo',
  );
  await prisma.encaminhamento.update({
    where: { id: enc2.id },
    data: {
      status: 'REJEITADO',
      motivoRejeicao:
        'Paciente não atende aos critérios protocolares — sem laudo de acuidade visual recente.',
    },
  });
  await prisma.eventoTimeline.create({
    data: {
      encaminhamentoId: enc2.id,
      tipo: 'REJEITADO',
      titulo: 'Encaminhamento rejeitado',
      descricao:
        'Paciente não atende aos critérios protocolares — sem laudo de acuidade visual recente.',
      autor: 'Reg. Smoke',
      autorPapel: 'Regulação SMS',
    },
  });

  // 4.3 PENDENCIA_DOCUMENTO (testa pendenciasAbertas)
  const enc3 = await criarEncaminhamento(
    ubs.id,
    atendente.id,
    paciente.id,
    'Ortopedia',
    'AGUARDANDO_REGULACAO',
    'pendencia-ortopedia',
  );
  await prisma.encaminhamento.update({
    where: { id: enc3.id },
    data: { status: 'PENDENCIA_DOCUMENTO' },
  });
  await prisma.eventoTimeline.create({
    data: {
      encaminhamentoId: enc3.id,
      tipo: 'PENDENCIA_REGISTRADA',
      titulo: 'Documento pendente',
      descricao: 'Anexar raio-X com data inferior a 90 dias.',
      autor: 'Reg. Smoke',
      autorPapel: 'Regulação SMS',
    },
  });

  // 4.4 APROVADO mesma cidade EXPLÍCITA (testa podeSolicitarTfd=false sem heurística)
  const enc4 = await criarEncaminhamento(
    ubs.id,
    atendente.id,
    paciente.id,
    'Endocrinologia',
    'AGUARDANDO_REGULACAO',
    'aprovado-endo-mesma-cidade',
  );
  const amanha2 = new Date();
  amanha2.setDate(amanha2.getDate() + 10);
  await prisma.encaminhamento.update({
    where: { id: enc4.id },
    data: {
      status: 'APROVADO',
      agendamentoPrevisto: amanha2,
      localAgendamento: 'UBS Águas Belas Centro · Consultório 2',
      // BRECHA 1: cidade EXPLÍCITA com variação de caixa e acento
      // ("ÁGUAS belas" vs "Águas Belas" no Ubs.municipio) → normalização canônica deve bater
      cidadeAgendamento: 'ÁGUAS belas',
      ufAgendamento: 'PE',
    },
  });

  console.log(`  · enc1 (Cardio APROVADO + local + prof + futuro)`);
  console.log(`  · enc2 (Oftalmo REJEITADO + motivo flat)`);
  console.log(`  · enc3 (Ortopedia PENDENCIA_DOCUMENTO)`);
  console.log(`  · enc4 (Endocrino APROVADO + local mesma cidade → podeSolicitarTfd=false)`);

  // 5. Validar via use case do app paciente
  console.log('\n→ Lendo via ListarMeusEncaminhamentosUseCase...');
  const { ListarMeusEncaminhamentosUseCase } = await import(
    '../src/modules/paciente-app/application/use-cases/ListarMeusEncaminhamentosUseCase'
  );
  const uc = new ListarMeusEncaminhamentosUseCase();
  const lista = await uc.exec(CPF_TESTE, CPF_FMT);

  console.log(`✓ Listados ${lista.length} encaminhamentos`);

  // 6. Asserts
  const byProt = (p: string) => lista.find((e) => e.id === p);
  let falhas = 0;

  const e1 = byProt(enc1.id);
  console.log('\n── ENC1 (Cardio APROVADO) ──');
  if (e1?.localAgendamento === 'CEM · Sala 3 · Av. Getúlio Vargas, 1100 - Centro') {
    console.log('  ✓ localAgendamento OK');
  } else {
    console.log(`  ✗ localAgendamento FALHOU: ${e1?.localAgendamento}`); falhas++;
  }
  if (e1?.profissionalAgendado === 'Dra. Beatriz Lima · CRM-PE 22189') {
    console.log('  ✓ profissionalAgendado OK');
  } else {
    console.log(`  ✗ profissionalAgendado FALHOU: ${e1?.profissionalAgendado}`); falhas++;
  }
  if (e1?.podeSolicitarTfd === true) {
    console.log('  ✓ podeSolicitarTfd=true (cidade diferente)');
  } else {
    console.log(`  ✗ podeSolicitarTfd esperado true: ${e1?.podeSolicitarTfd}`); falhas++;
  }
  if ((e1?.recomendacoes?.length ?? 0) >= 3) {
    console.log(`  ✓ recomendacoes presentes (${e1?.recomendacoes?.length} itens Cardiologia)`);
  } else {
    console.log(`  ✗ recomendacoes vazias: ${JSON.stringify(e1?.recomendacoes)}`); falhas++;
  }
  if (e1?.pendenciasAbertas === 0) {
    console.log('  ✓ pendenciasAbertas=0');
  } else {
    console.log(`  ✗ pendenciasAbertas esperado 0: ${e1?.pendenciasAbertas}`); falhas++;
  }

  const e2 = byProt(enc2.id);
  console.log('\n── ENC2 (Oftalmo REJEITADO) ──');
  if (e2?.motivoRejeicao?.includes('critérios protocolares')) {
    console.log('  ✓ motivoRejeicao flat presente');
  } else {
    console.log(`  ✗ motivoRejeicao FALHOU: ${e2?.motivoRejeicao}`); falhas++;
  }
  if (e2?.podeSolicitarTfd === false) {
    console.log('  ✓ podeSolicitarTfd=false (status REJEITADO)');
  } else {
    console.log(`  ✗ podeSolicitarTfd esperado false: ${e2?.podeSolicitarTfd}`); falhas++;
  }

  const e3 = byProt(enc3.id);
  console.log('\n── ENC3 (Ortopedia PENDENCIA_DOCUMENTO) ──');
  if (e3?.pendenciasAbertas === 1) {
    console.log('  ✓ pendenciasAbertas=1');
  } else {
    console.log(`  ✗ pendenciasAbertas esperado 1: ${e3?.pendenciasAbertas}`); falhas++;
  }
  if (e3?.podeSolicitarTfd === false) {
    console.log('  ✓ podeSolicitarTfd=false (status PENDENCIA)');
  } else {
    console.log(`  ✗ podeSolicitarTfd esperado false: ${e3?.podeSolicitarTfd}`); falhas++;
  }

  const e4 = byProt(enc4.id);
  console.log('\n── ENC4 (Endo APROVADO mesma cidade EXPLÍCITA + acento + caixa diferente) ──');
  if (e4?.podeSolicitarTfd === false) {
    console.log('  ✓ podeSolicitarTfd=false (normalização canônica: ÁGUAS belas ≡ Águas Belas)');
  } else {
    console.log(`  ✗ podeSolicitarTfd esperado false (cidade canônica): ${e4?.podeSolicitarTfd}`); falhas++;
  }
  if (e4?.cidadeAgendamento === 'ÁGUAS belas') {
    console.log('  ✓ cidadeAgendamento persistida tal qual (original mantido)');
  } else {
    console.log(`  ✗ cidadeAgendamento: ${e4?.cidadeAgendamento}`); falhas++;
  }

  // ─── BRECHA 1: cidadeAgendamento EXPLÍCITA passou pelo round-trip ───
  console.log('\n── BRECHA 1 · cidadeAgendamento + ufAgendamento explícitos ──');
  if (e1?.cidadeAgendamento === 'Recife' && e1?.ufAgendamento === 'PE') {
    console.log('  ✓ enc1 cidadeAgendamento=Recife · ufAgendamento=PE');
  } else {
    console.log(`  ✗ enc1 cidade/uf esperados Recife/PE: ${e1?.cidadeAgendamento}/${e1?.ufAgendamento}`); falhas++;
  }

  // ─── BRECHA 2: recomendações com acento (Cardiología → bate Cardiologia) ───
  console.log('\n── BRECHA 2 · Recomendações case+accent-insensitive ──');
  if ((e1?.recomendacoes?.length ?? 0) >= 3) {
    console.log(`  ✓ "Cardiología" (com acento) → ${e1?.recomendacoes?.length} recomendações de Cardiologia`);
  } else {
    console.log(`  ✗ Recomendações vazias para "Cardiología" (com acento) — normalização falhou: ${JSON.stringify(e1?.recomendacoes)}`); falhas++;
  }

  // ─── BRECHA 3: audit log no CRUD admin de recomendações ───
  console.log('\n── BRECHA 3 · Audit log no CRUD admin de recomendações ──');
  const {
    CriarRecomendacaoUseCase,
    AtualizarRecomendacaoUseCase,
    DeletarRecomendacaoUseCase,
  } = await import('../src/application/admin/RecomendacoesEspecialidadeUseCases');
  const { PrismaAuditLogger } = await import(
    '../src/infrastructure/audit/PrismaAuditLogger'
  );
  const audit = new PrismaAuditLogger();
  const auditCtx = { atendenteId: atendente.id, ip: '127.0.0.1', userAgent: 'smoke-test' };

  // Limpa especialidade de teste se sobrou
  await prisma.especialidadeRecomendacao.deleteMany({ where: { especialidade: 'SmokeBrecha3' } });
  await prisma.auditoriaLog.deleteMany({
    where: { recurso: 'EspecialidadeRecomendacao', payload: { path: ['especialidade'], equals: 'SmokeBrecha3' } },
  });

  const criar = new CriarRecomendacaoUseCase(audit);
  const novo = await criar.exec(
    { especialidade: 'SmokeBrecha3', recomendacoes: ['Levar exame X', 'Jejum de 8h'] },
    auditCtx,
  );

  const atualizar = new AtualizarRecomendacaoUseCase(audit);
  await atualizar.exec(novo.id, { recomendacoes: ['Versão atualizada A', 'Versão atualizada B'] }, auditCtx);

  const deletar = new DeletarRecomendacaoUseCase(audit);
  await deletar.exec(novo.id, auditCtx);

  const auditsCount = await prisma.auditoriaLog.count({
    where: {
      recurso: 'EspecialidadeRecomendacao',
      recursoId: novo.id,
    },
  });
  if (auditsCount === 3) {
    console.log('  ✓ 3 audit logs gravados (CRIAR + ATUALIZAR + DELETAR)');
  } else {
    console.log(`  ✗ Esperado 3 audit logs, recebido ${auditsCount}`); falhas++;
  }

  const acoes = await prisma.auditoriaLog.findMany({
    where: { recurso: 'EspecialidadeRecomendacao', recursoId: novo.id },
    select: { acao: true, atendenteId: true, ip: true, payload: true },
    orderBy: { criadoEm: 'asc' },
  });
  const acoesEsperadas = [
    'CRIAR_RECOMENDACAO_ESPECIALIDADE',
    'ATUALIZAR_RECOMENDACAO_ESPECIALIDADE',
    'DELETAR_RECOMENDACAO_ESPECIALIDADE',
  ];
  const acoesOk = acoesEsperadas.every((a, i) => acoes[i]?.acao === a);
  if (acoesOk) {
    console.log('  ✓ Ações registradas em ordem: CRIAR → ATUALIZAR → DELETAR');
  } else {
    console.log(`  ✗ Ordem das ações: ${JSON.stringify(acoes.map((a) => a.acao))}`); falhas++;
  }
  const todasComAtendente = acoes.every((a) => a.atendenteId === atendente.id);
  if (todasComAtendente) {
    console.log('  ✓ Todos audit logs contêm atendenteId correto');
  } else {
    console.log(`  ✗ atendenteId inconsistente: ${JSON.stringify(acoes.map((a) => a.atendenteId))}`); falhas++;
  }
  const todasComIp = acoes.every((a) => a.ip === '127.0.0.1');
  if (todasComIp) {
    console.log('  ✓ Todos audit logs contêm IP');
  } else {
    console.log(`  ✗ IP faltando em algum log: ${JSON.stringify(acoes.map((a) => a.ip))}`); falhas++;
  }
  // UPDATE deve ter snapshot antes/depois
  const updatePayload = acoes[1]?.payload as { antes?: { recomendacoes?: unknown }; depois?: { recomendacoes?: unknown } } | null;
  const temAntesDepois =
    updatePayload &&
    Array.isArray(updatePayload.antes?.recomendacoes) &&
    Array.isArray(updatePayload.depois?.recomendacoes);
  if (temAntesDepois) {
    console.log('  ✓ Audit UPDATE inclui snapshot antes/depois');
  } else {
    console.log(`  ✗ Audit UPDATE sem antes/depois: ${JSON.stringify(updatePayload)}`); falhas++;
  }

  // Limpa lixo do teste
  await prisma.auditoriaLog.deleteMany({
    where: { recurso: 'EspecialidadeRecomendacao', recursoId: novo.id },
  });

  // ─── PATCH 0.10.3 · Race no CREATE → catch P2002 ───
  console.log('\n── PATCH 0.10.3 · Race CREATE → ESPECIALIDADE_DUPLICADA ──');
  // Limpa especialidade
  await prisma.especialidadeRecomendacao.deleteMany({
    where: { especialidade: 'SmokeBrechaRace' },
  });
  const criarRace = new CriarRecomendacaoUseCase(audit);
  // 2 creates concorrentes pra mesma especialidade
  const [r1, r2] = await Promise.allSettled([
    criarRace.exec(
      { especialidade: 'SmokeBrechaRace', recomendacoes: ['A'] },
      auditCtx,
    ),
    criarRace.exec(
      { especialidade: 'SmokeBrechaRace', recomendacoes: ['B'] },
      auditCtx,
    ),
  ]);
  const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
  const rejected = [r1, r2].filter((r) => r.status === 'rejected');
  if (fulfilled.length === 1 && rejected.length === 1) {
    console.log('  ✓ Race: 1 sucesso + 1 erro (UNIQUE constraint do DB)');
  } else {
    console.log(`  ✗ Race resultado inesperado: ${fulfilled.length} OK, ${rejected.length} erro`); falhas++;
  }
  const rej = rejected[0];
  if (rej?.status === 'rejected') {
    const code = (rej.reason as { code?: string }).code;
    if (code === 'ESPECIALIDADE_DUPLICADA') {
      console.log('  ✓ Erro mapeado para ESPECIALIDADE_DUPLICADA (P2002 capturado)');
    } else {
      console.log(`  ✗ Erro esperado ESPECIALIDADE_DUPLICADA, recebido: ${code}`); falhas++;
    }
  }
  // Cleanup
  await prisma.especialidadeRecomendacao.deleteMany({
    where: { especialidade: 'SmokeBrechaRace' },
  });

  console.log(`\n${falhas === 0 ? '✓ TODOS OS ASSERTS PASSARAM (incluindo brechas + patch 0.10.3)' : `✗ ${falhas} FALHAS`}\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

// Suprime warnings de imports utility
void normalizarCpf;
void formatarCpf;
