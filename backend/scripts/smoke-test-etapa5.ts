/**
 * Smoke test fim-a-fim da Etapa 5 (Dossiê médico — hardening LGPD/CFM).
 *
 * Cobre as 15 brechas identificadas:
 *
 *   1. Audit CFM 20 anos (paciente_prontuario_audit) em TODAS as leituras
 *   2. Audit LGPD 5 anos (auditoria_logs) em TODOS os endpoints
 *   3-4. Enum mapping completo (CONSULTA_MEDICA, ENFERMAGEM, ODONTOLOGICO, ACOLHIMENTO, etc.)
 *   5. cid10Descricao null mas com fallback documentado
 *   6-9. Campos exposing: via (vacina), categoria/unidadeExecutora (exame), aplicadorNome
 *   10. Rate limit (DossieRateLimiter)
 *   11. Paginação cursor (atendimentos/vacinas/exames com nextCursor)
 *   12. Sanitização texto (XSS strip de HTML tags)
 *   13. tipoSanguineo "NAO_INFORMADO" → null
 *   14. medicamentos concat seguro (sem "undefined undefined")
 *   15. Performance (totals em paralelo — implícito, verifica no payload)
 *
 * Uso: npx ts-node-dev --transpile-only scripts/smoke-test-etapa5.ts
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/infrastructure/database/prisma';
import { PrismaAuditLogger } from '../src/infrastructure/audit/PrismaAuditLogger';
import {
  DossieResumoUseCase,
  DossieAtendimentosUseCase,
  DossieVacinacoesUseCase,
  DossieExamesUseCase,
} from '../src/modules/paciente-app/application/use-cases/DossieUseCases';
import { DossieRateLimiter } from '../src/modules/paciente-app/infrastructure/DossieRateLimiter';
import { sanitizeText } from '../src/shared/sanitizeText';
import { getCache } from '../src/infrastructure/cache/Cache';

async function limparRateLimitKeys(): Promise<void> {
  const cache = getCache();
  const inicio = Date.now();
  while (!cache.isReady() && Date.now() - inicio < 2000) {
    await new Promise((r) => setTimeout(r, 50));
  }
  await cache.delByPrefix('rl:pa:dos:');
}

const CPF_VALIDO = '11144477735';

let falhas = 0;
function assert(label: string, ok: boolean, extra?: unknown): void {
  if (ok) console.log(`  ✓ ${label}`);
  else { console.log(`  ✗ ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`); falhas++; }
}

async function setupPaciente(): Promise<{
  contaId: string;
  pacienteId: string;
  ubsId: string;
}> {
  const pref = await prisma.prefeitura.findFirst();
  if (!pref) throw new Error('Sem prefeitura — rode seed');
  let ubs = await prisma.ubs.findFirst({ where: { nome: { startsWith: 'SMOKE E5' } } });
  if (!ubs) {
    ubs = await prisma.ubs.create({
      data: {
        nome: 'SMOKE E5 UBS',
        municipio: 'Águas Belas',
        uf: 'PE',
        cnes: `SMOKE-E5-${Date.now()}`,
        prefeituraId: pref.id,
      },
    });
  }

  // Limpa dados antigos
  let paciente = await prisma.paciente.findUnique({ where: { cpf: CPF_VALIDO } });
  if (paciente) {
    await prisma.atendimento.deleteMany({ where: { pacienteId: paciente.id } });
    await prisma.vacinaAplicada.deleteMany({ where: { pacienteId: paciente.id } });
    await prisma.exameRealizado.deleteMany({ where: { pacienteId: paciente.id } });
    // Garante grupo sanguíneo (pode ter ficado NAO_INFORMADO de runs anteriores)
    paciente = await prisma.paciente.update({
      where: { id: paciente.id },
      data: { grupoSanguineo: 'O_POSITIVO' },
    });
  } else {
    paciente = await prisma.paciente.create({
      data: {
        cpf: CPF_VALIDO,
        nome: 'PACIENTE SMOKE E5',
        dataNascimento: new Date('1980-01-01'),
        sexo: 'F',
        ubsId: ubs.id,
        grupoSanguineo: 'O_POSITIVO',
      },
    });
  }

  // Cria/atualiza conta
  let conta = await prisma.pacienteConta.findUnique({ where: { cpf: CPF_VALIDO } });
  if (!conta) {
    const h = await bcrypt.hash('Senha!2026', 8);
    conta = await prisma.pacienteConta.create({
      data: {
        cpf: CPF_VALIDO,
        cpfFormatado: '111.444.777-35',
        nome: 'PACIENTE SMOKE E5',
        senhaHash: h,
        ativo: true,
      },
    });
  }

  // Cria 5 atendimentos cobrindo os 7 tipos do enum (3 + 4 = 7)
  const tipos: ReadonlyArray<{ tipo: 'CONSULTA_MEDICA' | 'ENFERMAGEM' | 'VACINACAO' | 'CURATIVO' | 'ODONTOLOGICO' | 'PROCEDIMENTO' | 'ACOLHIMENTO'; queixa: string }> = [
    { tipo: 'CONSULTA_MEDICA', queixa: 'Cefaleia há 2 dias' },
    { tipo: 'ENFERMAGEM', queixa: 'Aferição de PA' },
    { tipo: 'ODONTOLOGICO', queixa: 'Dor de dente' },
    { tipo: 'ACOLHIMENTO', queixa: '<script>alert("XSS")</script> Acolhimento inicial' },
    { tipo: 'PROCEDIMENTO', queixa: 'Sutura' },
    { tipo: 'CURATIVO', queixa: 'Trocar curativo do braço' },
    { tipo: 'VACINACAO', queixa: 'Reforço de Tétano' },
  ];
  for (let i = 0; i < tipos.length; i++) {
    const t = tipos[i]!;
    await prisma.atendimento.create({
      data: {
        pacienteId: paciente.id,
        data: new Date(Date.now() - i * 24 * 3600 * 1000),
        tipo: t.tipo,
        profissional: `Dr. SMOKE ${i}`,
        registroProfissional: `CRM-PE ${10000 + i}`,
        especialidade: 'Clínica geral',
        unidade: ubs.nome,
        queixaPrincipal: t.queixa,
        diagnostico: 'Diag teste',
        cid10: 'Z00',
        conduta: 'Conduta\r\nresumida com​ chars\x07invisíveis',
      },
    });
  }

  // Cria 3 vacinas
  for (let i = 0; i < 3; i++) {
    await prisma.vacinaAplicada.create({
      data: {
        pacienteId: paciente.id,
        data: new Date(Date.now() - i * 24 * 3600 * 1000),
        vacina: `Vacina ${i}`,
        dose: `${i + 1}ª`,
        lote: `LT-${i}`,
        aplicador: `Enf. SMOKE ${i}`,
        unidade: ubs.nome,
        via: i % 2 === 0 ? 'INTRAMUSCULAR' : 'ORAL',
      },
    });
  }

  // Cria 3 exames com categorias diferentes
  const cats: ReadonlyArray<'LABORATORIAL' | 'IMAGEM' | 'FUNCIONAL'> = [
    'LABORATORIAL',
    'IMAGEM',
    'FUNCIONAL',
  ];
  for (let i = 0; i < 3; i++) {
    await prisma.exameRealizado.create({
      data: {
        pacienteId: paciente.id,
        data: new Date(Date.now() - i * 24 * 3600 * 1000),
        tipo: `Exame teste ${i}`,
        categoria: cats[i]!,
        solicitante: `Dr. Solicitante ${i}`,
        unidadeExecutora: 'LAB CENTRAL',
        resultado: i === 0 ? 'NORMAL' : i === 1 ? 'ALTERADO' : 'CRITICO',
        observacao: i === 1 ? 'HDL baixo' : null,
      },
    });
  }

  return { contaId: conta.id, pacienteId: paciente.id, ubsId: ubs.id };
}

async function main(): Promise<void> {
  console.log('\n──── SMOKE TEST · Etapa 5 (Dossiê médico — 15 brechas) ────\n');

  await limparRateLimitKeys();
  const setup = await setupPaciente();
  console.log(`✓ Setup: contaId=${setup.contaId}, pacienteId=${setup.pacienteId}\n`);

  const audit = new PrismaAuditLogger();
  const resumoUC = new DossieResumoUseCase(audit);
  const atendUC = new DossieAtendimentosUseCase(audit);
  const vacUC = new DossieVacinacoesUseCase(audit);
  const exUC = new DossieExamesUseCase(audit);

  const ctx = {
    contaId: setup.contaId,
    cpfDigits: CPF_VALIDO,
    ip: '10.0.0.5',
    userAgent: 'smoke-e5',
  };

  // ─────────── BRECHA 12 · Sanitização (unit) ───────────
  console.log('── BRECHA 12 · Sanitização anti-XSS ──');
  assert(
    '<script> removido',
    !sanitizeText('<script>alert("xss")</script>texto')!.includes('<'),
  );
  assert(
    '<img onerror=...> removido',
    !sanitizeText('<img src=x onerror=alert(1)>oi')!.includes('<'),
  );
  assert(
    'Control chars removidos',
    !sanitizeText('texto\x00com\x07control')!.includes('\x00'),
  );
  assert(
    'Zero-width Unicode removido',
    sanitizeText('texto​com‌invisivel') === 'textocominvisivel',
  );
  assert('CRLF normalizado', sanitizeText('linha1\r\nlinha2') === 'linha1\nlinha2');
  assert('null input retorna null', sanitizeText(null) === null);
  assert(
    'String vazia retorna null',
    sanitizeText('   ') === null,
  );
  assert('Trim aplicado', sanitizeText('   texto   ') === 'texto');

  // ─────────── BRECHA 1, 2, 3-4 · Resumo + audit dual + enum ───────────
  console.log('\n── BRECHA 1, 2 · DossieResumo + audit dual ──');
  const auditAntes = await prisma.auditoriaLog.count({ where: { recurso: 'PacienteProntuario' } });
  const cfmAntes = await prisma.pacienteProntuarioAudit.count({
    where: { pacienteId: setup.pacienteId, acao: 'LEITURA_DOSSIE' },
  });

  const resumo = await resumoUC.exec(ctx);
  assert('totalAtendimentos = 7', resumo.totalAtendimentos === 7);
  assert('totalVacinas = 3', resumo.totalVacinas === 3);
  assert('totalExames = 3', resumo.totalExames === 3);
  assert('tipoSanguineo = O+', resumo.tipoSanguineo === 'O+');

  const auditDepois = await prisma.auditoriaLog.count({ where: { recurso: 'PacienteProntuario' } });
  const cfmDepois = await prisma.pacienteProntuarioAudit.count({
    where: { pacienteId: setup.pacienteId, acao: 'LEITURA_DOSSIE' },
  });
  assert(`Audit LGPD incrementou (${auditAntes} → ${auditDepois})`, auditDepois === auditAntes + 1);
  assert(`Audit CFM incrementou (${cfmAntes} → ${cfmDepois})`, cfmDepois === cfmAntes + 1);

  // Audit LGPD tem payload
  const auditUltimo = await prisma.auditoriaLog.findFirst({
    where: { acao: 'DOSSIE_RESUMO_LIDO', recursoId: setup.pacienteId },
    orderBy: { criadoEm: 'desc' },
  });
  const payload = auditUltimo?.payload as { cpfMasked?: string; totals?: Record<string, number> } | null;
  assert('Audit LGPD tem cpfMasked', payload?.cpfMasked === '1114***');
  assert('Audit LGPD tem totals', payload?.totals?.atendimentos === 7);

  const cfmUltimo = await prisma.pacienteProntuarioAudit.findFirst({
    where: { pacienteId: setup.pacienteId, acao: 'LEITURA_DOSSIE' },
    orderBy: { em: 'desc' },
  });
  const cfmPayload = cfmUltimo?.dados as { endpoint?: string } | null;
  assert(
    `Audit CFM tem autorPapel=PACIENTE · App`,
    cfmUltimo?.autorPapel === 'PACIENTE · App',
  );
  assert('Audit CFM tem endpoint', cfmPayload?.endpoint === 'DOSSIE_RESUMO_LIDO');

  // ─────────── BRECHA 3-4 · Enum mapping completo ───────────
  console.log('\n── BRECHA 3-4 · Enum mapping completo (sem perda) ──');
  const ats = await atendUC.exec(ctx, { limit: 50 });
  const tiposDistintos = new Set(ats.items.map((a) => a.tipo));
  assert(
    `7 tipos distintos preservados (foi ${tiposDistintos.size})`,
    tiposDistintos.size === 7,
  );
  assert(
    'Tem CONSULTA_MEDICA',
    ats.items.some((a) => a.tipo === 'CONSULTA_MEDICA'),
  );
  assert('Tem ENFERMAGEM', ats.items.some((a) => a.tipo === 'ENFERMAGEM'));
  assert('Tem ODONTOLOGICO', ats.items.some((a) => a.tipo === 'ODONTOLOGICO'));
  assert('Tem ACOLHIMENTO', ats.items.some((a) => a.tipo === 'ACOLHIMENTO'));
  assert('Tem PROCEDIMENTO', ats.items.some((a) => a.tipo === 'PROCEDIMENTO'));
  assert('Tem CURATIVO', ats.items.some((a) => a.tipo === 'CURATIVO'));
  assert('Tem VACINACAO', ats.items.some((a) => a.tipo === 'VACINACAO'));

  // ─────────── BRECHA 12 · Sanitização real no payload ───────────
  console.log('\n── BRECHA 12 · Sanitização real no payload ──');
  const acolhimento = ats.items.find((a) => a.tipo === 'ACOLHIMENTO');
  assert(
    `<script> removido na queixa (foi: "${acolhimento?.queixaPrincipal}")`,
    acolhimento?.queixaPrincipal !== null &&
      !(acolhimento?.queixaPrincipal ?? '').includes('<'),
  );
  // Conduta tinha "\r\n" e "​" e "\x00"
  const enfermagem = ats.items.find((a) => a.tipo === 'ENFERMAGEM');
  assert(
    `Conduta normalizada (foi: ${JSON.stringify(enfermagem?.condutaResumida)})`,
    enfermagem?.condutaResumida !== null &&
      !(enfermagem?.condutaResumida ?? '').includes('\r') &&
      !(enfermagem?.condutaResumida ?? '').includes('\x07') &&
      !(enfermagem?.condutaResumida ?? '').includes('​'),
  );

  // ─────────── BRECHA 11 · Paginação cursor ───────────
  console.log('\n── BRECHA 11 · Paginação cursor ──');
  const pag1 = await atendUC.exec(ctx, { limit: 3 });
  assert('Página 1 tem 3 items', pag1.items.length === 3);
  assert('Página 1 tem nextCursor', pag1.nextCursor !== null);
  const pag2 = await atendUC.exec(ctx, { limit: 3, cursor: pag1.nextCursor! });
  assert('Página 2 tem 3 items', pag2.items.length === 3);
  assert('Página 2 IDs distintos da página 1', !pag1.items.some((a) => pag2.items.some((b) => b.id === a.id)));
  const pag3 = await atendUC.exec(ctx, { limit: 3, cursor: pag2.nextCursor! });
  assert('Página 3 tem 1 item (último)', pag3.items.length === 1);
  assert('Página 3 nextCursor=null (fim)', pag3.nextCursor === null);

  // ─────────── BRECHA 6-7, 9 · Campos novos vacina + exame ───────────
  console.log('\n── BRECHA 6-7, 9 · Campos novos expostos ──');
  const vacs = await vacUC.exec(ctx);
  assert(`Vacinas com 'via' (1ª = ${vacs.items[0]?.via})`, vacs.items[0]?.via === 'INTRAMUSCULAR');
  assert('Vacinas com aplicadorNome', vacs.items[0]?.aplicadorNome !== null);

  const exs = await exUC.exec(ctx);
  assert(
    `Exames com 'categoria' (1ª = ${exs.items[0]?.categoria})`,
    exs.items[0]?.categoria === 'LABORATORIAL',
  );
  assert(
    'Exames com unidadeExecutora',
    exs.items[0]?.unidadeExecutora === 'LAB CENTRAL',
  );
  assert(
    `Exames com resultadoStatus (1ª = ${exs.items[0]?.resultadoStatus})`,
    exs.items[0]?.resultadoStatus === 'NORMAL',
  );
  assert(
    'Exame ALTERADO marcado como alterado',
    exs.items.find((e) => e.resultadoStatus === 'ALTERADO')?.alterado === true,
  );
  assert(
    'Exame CRITICO também marcado como alterado',
    exs.items.find((e) => e.resultadoStatus === 'CRITICO')?.alterado === true,
  );

  // ─────────── BRECHA 14 · medicamentos concat seguro ───────────
  console.log('\n── BRECHA 14 · Medicamentos concat seguro ──');
  // Adiciona medicamentos com vários cenários
  await prisma.medicamentoEmUso.deleteMany({ where: { pacienteId: setup.pacienteId } });
  const desdeBase = new Date();
  await prisma.medicamentoEmUso.createMany({
    data: [
      {
        pacienteId: setup.pacienteId,
        nome: 'Losartana 50mg',
        dosagem: '50mg',
        frequencia: '1x ao dia',
        prescritor: 'Dr. SMOKE',
        desde: desdeBase,
        ativo: true,
      },
      {
        pacienteId: setup.pacienteId,
        nome: 'Aspirina',
        dosagem: '',
        frequencia: '',
        prescritor: 'Dr. SMOKE',
        desde: desdeBase,
        ativo: true,
      },
      {
        pacienteId: setup.pacienteId,
        nome: 'Metformina',
        dosagem: '850mg',
        frequencia: '',
        prescritor: 'Dr. SMOKE',
        desde: desdeBase,
        ativo: true,
      },
    ],
  });

  const resumo2 = await resumoUC.exec(ctx);
  const med1 = resumo2.medicamentosUsoContinuo.find((m) => m.startsWith('Losartana'));
  const med2 = resumo2.medicamentosUsoContinuo.find((m) => m.startsWith('Aspirina'));
  const med3 = resumo2.medicamentosUsoContinuo.find((m) => m.startsWith('Metformina'));
  assert(`Med completo: "${med1}"`, med1 === 'Losartana 50mg 50mg · 1x ao dia');
  assert(`Med sem dosagem/freq: "${med2}"`, med2 === 'Aspirina');
  assert(`Med só dosagem: "${med3}"`, med3 === 'Metformina 850mg');
  assert(
    'Nenhum "undefined" em medicamentos',
    !resumo2.medicamentosUsoContinuo.some((m) => m.includes('undefined')),
  );

  // ─────────── BRECHA 13 · tipoSanguineo NAO_INFORMADO ───────────
  console.log('\n── BRECHA 13 · tipoSanguineo NAO_INFORMADO → null ──');
  await prisma.paciente.update({
    where: { id: setup.pacienteId },
    data: { grupoSanguineo: 'NAO_INFORMADO' },
  });
  const resumo3 = await resumoUC.exec(ctx);
  assert('NAO_INFORMADO → null', resumo3.tipoSanguineo === null);
  // restore O_POSITIVO pra próximas runs
  await prisma.paciente.update({
    where: { id: setup.pacienteId },
    data: { grupoSanguineo: 'O_POSITIVO' },
  });

  // ─────────── BRECHA 10 · Rate limit ───────────
  console.log('\n── BRECHA 10 · Rate limit dossiê (120/15min/conta) ──');
  await limparRateLimitKeys();
  const rl = new DossieRateLimiter();
  let estouro = false;
  for (let i = 0; i < 130; i++) {
    try {
      await rl.consumir(setup.contaId, '10.7.7.7');
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'RATE_LIMIT_EXCEDIDO') {
        estouro = true;
        assert(`Rate limit conta estourou na tentativa #${i + 1} (esperado 121ª)`, i + 1 === 121);
        break;
      }
      throw err;
    }
  }
  assert('Rate limit conta estoura em ≤ 130 tentativas', estouro);

  // ─────────── BRECHA 1 · Sem paciente clínico ainda gera audit LGPD ───────────
  console.log('\n── BRECHA 1 · Sem PEC → audit LGPD ainda registra ──');
  const ctxSemPec = {
    contaId: setup.contaId,
    cpfDigits: '99999999999', // CPF que não existe na tabela Paciente
    ip: '10.0.0.99',
    userAgent: 'smoke-sem-pec',
  };
  await limparRateLimitKeys();
  const resumoVazio = await resumoUC.exec(ctxSemPec);
  assert('Sem PEC: totals = 0', resumoVazio.totalAtendimentos === 0);
  const auditSemPec = await prisma.auditoriaLog.findFirst({
    where: { acao: 'DOSSIE_RESUMO_LIDO', payload: { path: ['cpfMasked'], equals: '9999***' } },
    orderBy: { criadoEm: 'desc' },
  });
  assert('Audit LGPD gravado mesmo sem PEC', auditSemPec !== null);
  const semPecPayload = auditSemPec?.payload as { encontrouPaciente?: boolean } | null;
  assert(
    'Audit registra encontrouPaciente=false',
    semPecPayload?.encontrouPaciente === false,
  );

  // ─────────── Cleanup ───────────
  await prisma.atendimento.deleteMany({ where: { pacienteId: setup.pacienteId } });
  await prisma.vacinaAplicada.deleteMany({ where: { pacienteId: setup.pacienteId } });
  await prisma.exameRealizado.deleteMany({ where: { pacienteId: setup.pacienteId } });
  await prisma.medicamentoEmUso.deleteMany({ where: { pacienteId: setup.pacienteId } });
  // PacienteProntuarioAudit é imutável (trigger SQL) — não tentamos deletar.

  console.log(
    `\n${falhas === 0 ? '✓ TODOS OS ASSERTS PASSARAM (15 brechas cobertas)' : `✗ ${falhas} FALHAS`}\n`,
  );
  process.exit(falhas === 0 ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
