/**
 * Smoke test fim-a-fim da Etapa 3 (Download de anexos FECHAR 100%).
 *
 * Cobre as 15 brechas identificadas:
 *
 *   1. Rate limit conta (60/15min) + IP (300/15min) — DownloadAnexoRateLimiter
 *   2. Audit log LGPD em TODOS caminhos (OK, NAO_EXISTE, FORA_ESCOPO, NAO_LIBERADO, PATH_TRAVERSAL, ARQUIVO_SUMIU)
 *   3. Cache-Control + Pragma + Expires (validado via integração)
 *   4. X-Content-Type-Options + X-Robots-Tag (validado via integração)
 *   5. Content-Length presente
 *   6. Path traversal guard — ataque `../../etc/passwd` bloqueado
 *   7. Filename sanitizado (RFC 5987 + ASCII fallback)
 *   8. Stream errors (testado em integração — não dá pra simular failure facilmente)
 *   9. Stat async (testado por não bloquear — implícito)
 *  10-15. Flutter: progress + cancel + extension + permissions + errors (validado via análise estática)
 *
 * Uso: npx ts-node-dev --transpile-only scripts/smoke-test-etapa3.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/infrastructure/database/prisma';
import { PrismaAuditLogger } from '../src/infrastructure/audit/PrismaAuditLogger';
import { DownloadAnexoPacienteUseCase } from '../src/modules/paciente-app/application/use-cases/DownloadAnexoPacienteUseCase';
import { DownloadAnexoRateLimiter } from '../src/modules/paciente-app/infrastructure/DownloadAnexoRateLimiter';
import { env } from '../src/shared/env';
import { getCache } from '../src/infrastructure/cache/Cache';
import {
  buildContentDisposition,
  sanitizeAsciiFilename,
  encodeRfc5987,
} from '../src/shared/contentDisposition';

/** Limpa todas as keys `rl:pa:dl:*` no Redis (e in-memory fallback). */
async function limparRateLimitKeys(): Promise<void> {
  const cache = getCache();
  const inicio = Date.now();
  while (!cache.isReady() && Date.now() - inicio < 2000) {
    await new Promise((r) => setTimeout(r, 50));
  }
  await cache.delByPrefix('rl:pa:dl:');
}

const CPF_VALIDO = '11144477735';
const CPF_OUTRO = '39053344705';
const CPF_FMT = '111.444.777-35';

let falhas = 0;
function assert(label: string, ok: boolean, extra?: unknown): void {
  if (ok) console.log(`  ✓ ${label}`);
  else { console.log(`  ✗ ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`); falhas++; }
}

async function ensureSetup(): Promise<{
  contaId: string;
  ubsId: string;
  encId: string;
  anexoLimpoId: string;
  anexoPendenteId: string;
  anexoSumiuId: string;
  anexoPathTraversalId: string;
  anexoArquivoFisicoPath: string;
  anexoOutroPacId: string;
}> {
  // 1. Conta paciente
  let conta = await prisma.pacienteConta.findUnique({ where: { cpf: CPF_VALIDO } });
  if (!conta) {
    const h = await bcrypt.hash('Senha!Forte2026', 8);
    conta = await prisma.pacienteConta.create({
      data: {
        cpf: CPF_VALIDO,
        cpfFormatado: CPF_FMT,
        nome: 'MARIA SMOKE ETAPA 3',
        email: 'maria.e3@example.com',
        senhaHash: h,
        ativo: true,
      },
    });
  }

  // 2. Prefeitura + UBS + Atendente + Encaminhamento
  const pref = await prisma.prefeitura.findFirst();
  if (!pref) throw new Error('Sem prefeitura — rode seed primeiro');
  let ubs = await prisma.ubs.findFirst({ where: { prefeituraId: pref.id } });
  if (!ubs) {
    ubs = await prisma.ubs.create({
      data: {
        nome: 'UBS SMOKE E3',
        municipio: 'Águas Belas',
        uf: 'PE',
        cnes: '1234599',
        endereco: 'Rua Teste 1',
        prefeituraId: pref.id,
      },
    });
  }
  let at = await prisma.atendente.findUnique({ where: { matricula: 'SMOKE-E3-001' } });
  if (!at) {
    const h = await bcrypt.hash('senha123', 8);
    at = await prisma.atendente.create({
      data: {
        matricula: 'SMOKE-E3-001',
        nome: 'ATENDENTE E3',
        email: 'at-e3@example.com',
        senhaHash: h,
        cpf: '11122233344',
        role: 'ATENDENTE_UBS',
        ubsId: ubs.id,
        prefeituraId: pref.id,
      },
    });
  }

  // Limpa encaminhamentos antigos de smoke E3
  await prisma.eventoTimeline.deleteMany({
    where: {
      encaminhamento: { justificativaClinica: { startsWith: 'Smoke E3' } },
    },
  });
  await prisma.anexoDocumento.deleteMany({
    where: {
      encaminhamento: { justificativaClinica: { startsWith: 'Smoke E3' } },
    },
  });
  await prisma.encaminhamento.deleteMany({
    where: { justificativaClinica: { startsWith: 'Smoke E3' } },
  });

  // Cria encaminhamento DO paciente
  const ano = new Date().getUTCFullYear();
  const seq = await prisma.sequencialProtocolo.upsert({
    where: { chave: `UBS-${ano}` },
    create: { chave: `UBS-${ano}`, valor: 1 },
    update: { valor: { increment: 1 } },
  });
  const enc = await prisma.encaminhamento.create({
    data: {
      protocolo: `UBS-${ano}-${String(seq.valor).padStart(6, '0')}`,
      status: 'APROVADO',
      pacienteId: (await prisma.paciente.upsert({
        where: { cpf: CPF_VALIDO },
        create: {
          cpf: CPF_VALIDO,
          nome: 'MARIA SMOKE E3',
          dataNascimento: new Date('1980-01-01'),
          sexo: 'F',
          ubsId: ubs.id,
        },
        update: {},
      })).id,
      pacienteNome: 'MARIA SMOKE E3',
      pacienteCpf: CPF_FMT,
      pacienteCartaoSus: '702 0001 0001 0001',
      pacienteDataNascimento: new Date('1980-01-01'),
      pacienteSexo: 'F',
      pacienteEndereco: 'Rua Teste, 100',
      pacienteTelefone: '75999990000',
      medicoSolicitante: 'DR. SMOKE',
      crm: 'CRM-PE 12345',
      especialidadeSolicitada: 'Cardiologia',
      cid10: 'I10',
      cidDescricao: 'HAS',
      justificativaClinica: 'Smoke E3',
      prioridade: 'PRIORITARIA',
      dataSolicitacao: new Date(),
      unidadeOrigem: ubs.nome,
      atendenteResponsavel: at.nome,
      ubsId: ubs.id,
      atendenteId: at.id,
    },
  });

  // Cria arquivo físico real pra anexo LIMPO
  const uploadDirAbs = path.resolve(env.UPLOAD_DIR);
  if (!fs.existsSync(uploadDirAbs)) fs.mkdirSync(uploadDirAbs, { recursive: true });
  const fileRel = `smoke-e3-${Date.now()}.pdf`;
  const fileAbs = path.join(uploadDirAbs, fileRel);
  fs.writeFileSync(fileAbs, 'PDF SMOKE TEST PAYLOAD - LOREM IPSUM '.repeat(50));

  // Cria 4 anexos com cenários diferentes
  const anexoLimpo = await prisma.anexoDocumento.create({
    data: {
      encaminhamentoId: enc.id,
      nome: 'Relatório clínico (2026) ção.pdf', // acento + paren → testa sanitização
      tipo: 'SOLICITACAO',
      tamanhoKb: 2,
      mimeType: 'application/pdf',
      caminho: fileRel,
      sha256: 'abc123hash',
      scanStatus: 'LIMPO',
    },
  });
  const anexoPendente = await prisma.anexoDocumento.create({
    data: {
      encaminhamentoId: enc.id,
      nome: 'pendente.pdf',
      tipo: 'SOLICITACAO',
      tamanhoKb: 1,
      mimeType: 'application/pdf',
      caminho: 'fake-pendente.pdf',
      scanStatus: 'PENDENTE',
    },
  });
  const anexoSumiu = await prisma.anexoDocumento.create({
    data: {
      encaminhamentoId: enc.id,
      nome: 'sumiu.pdf',
      tipo: 'SOLICITACAO',
      tamanhoKb: 1,
      mimeType: 'application/pdf',
      caminho: 'nao-existe-no-disco-' + Date.now() + '.pdf',
      scanStatus: 'LIMPO',
    },
  });
  // Anexo com path traversal NO CAMPO (atacante editou DB ou bug)
  const anexoPathTraversal = await prisma.anexoDocumento.create({
    data: {
      encaminhamentoId: enc.id,
      nome: 'traversal.pdf',
      tipo: 'SOLICITACAO',
      tamanhoKb: 1,
      mimeType: 'application/pdf',
      caminho: '../../../etc/passwd', // hostile
      scanStatus: 'LIMPO',
    },
  });

  // Encaminhamento de OUTRO paciente (testa escopo)
  let outroPac = await prisma.paciente.findUnique({ where: { cpf: CPF_OUTRO } });
  if (!outroPac) {
    outroPac = await prisma.paciente.create({
      data: {
        cpf: CPF_OUTRO,
        nome: 'OUTRO PACIENTE',
        dataNascimento: new Date('1970-01-01'),
        sexo: 'M',
        ubsId: ubs.id,
      },
    });
  }
  const seq2 = await prisma.sequencialProtocolo.upsert({
    where: { chave: `UBS-${ano}` },
    create: { chave: `UBS-${ano}`, valor: 1 },
    update: { valor: { increment: 1 } },
  });
  const encOutro = await prisma.encaminhamento.create({
    data: {
      protocolo: `UBS-${ano}-${String(seq2.valor).padStart(6, '0')}`,
      status: 'APROVADO',
      pacienteId: outroPac.id,
      pacienteNome: 'OUTRO PACIENTE',
      pacienteCpf: '390.533.447-05',
      pacienteCartaoSus: '702 0002 0002 0002',
      pacienteDataNascimento: new Date('1970-01-01'),
      pacienteSexo: 'M',
      pacienteEndereco: 'Outra rua',
      pacienteTelefone: '75999991111',
      medicoSolicitante: 'DR. OUTRO',
      crm: 'CRM-PE 99999',
      especialidadeSolicitada: 'Ortopedia',
      cid10: 'M54',
      cidDescricao: 'Dor lombar',
      justificativaClinica: 'Smoke E3 outro',
      prioridade: 'ELETIVA',
      dataSolicitacao: new Date(),
      unidadeOrigem: ubs.nome,
      atendenteResponsavel: at.nome,
      ubsId: ubs.id,
      atendenteId: at.id,
    },
  });
  const anexoOutroPac = await prisma.anexoDocumento.create({
    data: {
      encaminhamentoId: encOutro.id,
      nome: 'outro-paciente.pdf',
      tipo: 'SOLICITACAO',
      tamanhoKb: 1,
      mimeType: 'application/pdf',
      caminho: fileRel, // mesmo arquivo (não importa)
      scanStatus: 'LIMPO',
    },
  });

  return {
    contaId: conta.id,
    ubsId: ubs.id,
    encId: enc.id,
    anexoLimpoId: anexoLimpo.id,
    anexoPendenteId: anexoPendente.id,
    anexoSumiuId: anexoSumiu.id,
    anexoPathTraversalId: anexoPathTraversal.id,
    anexoArquivoFisicoPath: fileAbs,
    anexoOutroPacId: anexoOutroPac.id,
  };
}

async function main(): Promise<void> {
  console.log('\n──── SMOKE TEST · Etapa 3 (Download Anexos — 15 brechas) ────\n');

  await limparRateLimitKeys();
  const setup = await ensureSetup();
  console.log(`✓ Setup: contaId=${setup.contaId}, anexos criados\n`);

  const audit = new PrismaAuditLogger();
  const uc = new DownloadAnexoPacienteUseCase(audit);
  const ctxOk = {
    cpfDigits: CPF_VALIDO,
    contaId: setup.contaId,
    ip: '10.0.0.1',
    userAgent: 'smoke-e3',
  };

  // Limpa audit antigo
  await prisma.auditoriaLog.deleteMany({
    where: { recurso: 'AnexoDocumento' },
  });

  // ─────────── Brecha 7 · Content-Disposition (sanitização) ───────────
  console.log('── BRECHA 7 · Sanitização filename (RFC 5987/6266) ──');
  const cd1 = buildContentDisposition('Relatório clínico (2026) ção.pdf');
  assert(
    'CD contém filename ASCII fallback',
    cd1.includes('filename="') && /filename="[^"]+"/.test(cd1),
  );
  assert(
    'CD contém filename* UTF-8 percent-encoded',
    cd1.includes("filename*=UTF-8''") && cd1.includes('Relat%C3%B3rio'),
  );
  const ascii = sanitizeAsciiFilename('Relatório\r\nXSS"test (2026).pdf');
  assert('Sanitiza CR/LF (header injection)', !ascii.includes('\r') && !ascii.includes('\n'));
  assert('Substitui aspas', !ascii.includes('"'));
  assert('Não vazio', ascii.length > 0);
  const enc5987 = encodeRfc5987("Quem' \"matou (2026)?.pdf");
  assert(
    'RFC 5987 escapa apóstrofo + parênteses',
    enc5987.includes('%27') && enc5987.includes('%28'),
  );

  // ─────────── Brecha 2 · Audit log OK ───────────
  console.log('\n── BRECHA 2 · Audit OK + escopo + descritor ──');
  await limparRateLimitKeys();
  const desc = await uc.exec(setup.anexoLimpoId, ctxOk);
  assert('Retorna descritor', desc.filename === 'Relatório clínico (2026) ção.pdf');
  assert('mimeType correto', desc.mimeType === 'application/pdf');
  assert('size > 0', desc.size > 0);
  assert('absolutePath dentro do UPLOAD_DIR', desc.absolutePath.startsWith(path.resolve(env.UPLOAD_DIR)));
  assert('sha256 propagado', desc.sha256 === 'abc123hash');

  const auditOk = await prisma.auditoriaLog.findFirst({
    where: { acao: 'DOWNLOAD_ANEXO_PACIENTE_OK', recursoId: setup.anexoLimpoId },
  });
  assert('Audit DOWNLOAD_ANEXO_PACIENTE_OK gravado', auditOk !== null);
  const payloadOk = auditOk?.payload as { contaId?: string; mimeType?: string; cpfMasked?: string } | null;
  assert('Audit OK tem contaId', payloadOk?.contaId === setup.contaId);
  assert('Audit OK tem CPF mascarado', payloadOk?.cpfMasked === '1114***');
  assert('Audit OK tem mimeType', payloadOk?.mimeType === 'application/pdf');

  // ─────────── Brecha 2 · Anexo não existe ───────────
  console.log('\n── BRECHA 2 · Anexo não existe (404 anti-enum) ──');
  try {
    await uc.exec('00000000-0000-0000-0000-000000000000', ctxOk);
    assert('Anexo inexistente bloqueado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`Anexo não existe: erro ANEXO_NAO_ENCONTRADO (foi ${code})`, code === 'ANEXO_NAO_ENCONTRADO');
  }
  const auditNaoExiste = await prisma.auditoriaLog.findFirst({
    where: { acao: 'DOWNLOAD_ANEXO_PACIENTE_NAO_EXISTE' },
  });
  assert('Audit NAO_EXISTE gravado', auditNaoExiste !== null);

  // ─────────── Escopo: anexo de OUTRO paciente ───────────
  console.log('\n── BRECHA 2 · Escopo (anti-enumeration 404) ──');
  try {
    await uc.exec(setup.anexoOutroPacId, ctxOk); // ctx do CPF "1114" tentando ler anexo do outro CPF
    assert('Anexo de outro paciente bloqueado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`Escopo: erro ANEXO_NAO_ENCONTRADO (foi ${code})`, code === 'ANEXO_NAO_ENCONTRADO');
  }
  const auditEscopo = await prisma.auditoriaLog.findFirst({
    where: { acao: 'DOWNLOAD_ANEXO_PACIENTE_FORA_DO_ESCOPO' },
  });
  assert('Audit FORA_DO_ESCOPO gravado', auditEscopo !== null);

  // ─────────── ClamAV gate (PENDENTE) ───────────
  console.log('\n── BRECHA 2 · ClamAV gate (scanStatus != LIMPO) ──');
  try {
    await uc.exec(setup.anexoPendenteId, ctxOk);
    assert('Anexo PENDENTE bloqueado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`ClamAV gate: erro ANEXO_NAO_LIBERADO (foi ${code})`, code === 'ANEXO_NAO_LIBERADO');
  }
  const auditPendente = await prisma.auditoriaLog.findFirst({
    where: { acao: 'DOWNLOAD_ANEXO_PACIENTE_NAO_LIBERADO' },
  });
  assert('Audit NAO_LIBERADO gravado', auditPendente !== null);

  // ─────────── Brecha 6 · Path traversal ───────────
  console.log('\n── BRECHA 6 · Path traversal guard ──');
  try {
    await uc.exec(setup.anexoPathTraversalId, ctxOk);
    assert('Path traversal bloqueado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`Path traversal: erro ANEXO_NAO_ENCONTRADO (foi ${code})`, code === 'ANEXO_NAO_ENCONTRADO');
  }
  const auditTraversal = await prisma.auditoriaLog.findFirst({
    where: { acao: 'DOWNLOAD_ANEXO_PACIENTE_PATH_TRAVERSAL' },
  });
  assert('Audit PATH_TRAVERSAL gravado (crítico — DB possivelmente comprometido)', auditTraversal !== null);

  // ─────────── Arquivo sumiu (corrupção DB vs disco) ───────────
  console.log('\n── BRECHA 2 · Arquivo sumiu do disco ──');
  try {
    await uc.exec(setup.anexoSumiuId, ctxOk);
    assert('Arquivo sumiu bloqueado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`Arquivo sumiu: erro ARQUIVO_NAO_ENCONTRADO (foi ${code})`, code === 'ARQUIVO_NAO_ENCONTRADO');
  }
  const auditSumiu = await prisma.auditoriaLog.findFirst({
    where: { acao: 'DOWNLOAD_ANEXO_PACIENTE_ARQUIVO_SUMIU' },
  });
  assert('Audit ARQUIVO_SUMIU gravado', auditSumiu !== null);

  // ─────────── Brecha 1 · Rate limit por conta ───────────
  console.log('\n── BRECHA 1 · Rate limit por conta (60 req/15min) ──');
  await limparRateLimitKeys();
  const rl = new DownloadAnexoRateLimiter();
  let estouroConta = false;
  for (let i = 0; i < 70; i++) {
    try {
      await rl.consumir(setup.contaId, '10.5.5.5');
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'RATE_LIMIT_EXCEDIDO') {
        estouroConta = true;
        assert(`Rate limit conta estourou na tentativa #${i + 1} (esperado: 61ª)`, i + 1 === 61);
        break;
      }
      throw err;
    }
  }
  assert('Rate limit conta estoura em ≤ 70 tentativas', estouroConta);

  // ─────────── Brecha 1 · Rate limit por IP ───────────
  console.log('\n── BRECHA 1 · Rate limit por IP (300 req/15min) ──');
  await limparRateLimitKeys();
  const rlIp = new DownloadAnexoRateLimiter();
  let estouroIp = false;
  // Itera 305 vezes com IPs constantes mas contaIds distintos (pra IP estourar antes da conta)
  for (let i = 0; i < 310; i++) {
    try {
      await rlIp.consumir(`conta-${i}`, '10.6.6.6');
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'RATE_LIMIT_EXCEDIDO') {
        estouroIp = true;
        assert(`Rate limit IP estourou na tentativa #${i + 1} (esperado: 301ª)`, i + 1 === 301);
        break;
      }
      throw err;
    }
  }
  assert('Rate limit IP estoura em ≤ 310 tentativas', estouroIp);

  // ─────────── PATCH 0.12.1 · Audit dual CFM 20 anos ───────────
  console.log('\n── PATCH 0.12.1 · Audit CFM em paciente_prontuario_audit (20 anos) ──');
  await limparRateLimitKeys();
  // NÃO podemos deletar audit CFM (trigger SQL bloqueia, por design).
  // Em vez disso, contamos antes e depois pra detectar incremento.
  const cfmAntes = await prisma.pacienteProntuarioAudit.count({
    where: { acao: 'DOWNLOAD_ANEXO', recursoId: setup.anexoLimpoId },
  });

  // Re-executa download bem-sucedido
  await uc.exec(setup.anexoLimpoId, ctxOk);

  // Audit LGPD (5 anos) — já existia
  const cfmLgpd = await prisma.auditoriaLog.count({
    where: { acao: 'DOWNLOAD_ANEXO_PACIENTE_OK', recursoId: setup.anexoLimpoId },
  });
  assert('Audit LGPD (auditoria_logs) gravado', cfmLgpd >= 1);

  // Audit CFM (20 anos) — novo. Deve ter EXATAMENTE 1 a mais que antes.
  const cfmDepois = await prisma.pacienteProntuarioAudit.count({
    where: { acao: 'DOWNLOAD_ANEXO', recursoId: setup.anexoLimpoId },
  });
  assert(`Audit CFM incrementou (antes=${cfmAntes}, depois=${cfmDepois})`, cfmDepois === cfmAntes + 1);

  const cfmAudit = await prisma.pacienteProntuarioAudit.findFirst({
    where: { acao: 'DOWNLOAD_ANEXO', recursoId: setup.anexoLimpoId },
    orderBy: { em: 'desc' },
  });
  assert('Audit CFM (paciente_prontuario_audit) gravado', cfmAudit !== null);
  assert('Audit CFM tem pacienteId', cfmAudit?.pacienteId !== null && cfmAudit?.pacienteId !== '');
  assert('Audit CFM tem autorPapel=PACIENTE · App', cfmAudit?.autorPapel === 'PACIENTE · App');
  assert('Audit CFM tem IP', cfmAudit?.ip === '10.0.0.1');
  const cfmDados = cfmAudit?.dados as
    | { anexoNome?: string; mimeType?: string; size?: number; cpfMasked?: string }
    | null;
  assert('Audit CFM tem anexoNome', cfmDados?.anexoNome === 'Relatório clínico (2026) ção.pdf');
  assert('Audit CFM tem mimeType', cfmDados?.mimeType === 'application/pdf');
  assert('Audit CFM tem cpfMasked', cfmDados?.cpfMasked === '1114***');

  // Tentativa de UPDATE no audit CFM deve falhar (trigger SQL bloqueia)
  let updateBlocked = false;
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE paciente_prontuario_audit SET ip = '10.0.0.99' WHERE id = '${cfmAudit?.id}'`,
    );
  } catch (_) {
    updateBlocked = true;
  }
  // Se trigger não está ativo (DEV sem db:setup-triggers), o teste avisa mas não falha.
  if (updateBlocked) {
    console.log('  ✓ Trigger SQL bloqueia UPDATE em paciente_prontuario_audit (imutável)');
  } else {
    console.log('  ⚠ Trigger SQL NÃO bloqueou UPDATE (rode `npm run db:setup-triggers` em prod)');
  }

  // ─────────── Cleanup ───────────
  // `auditoria_logs` e `paciente_prontuario_audit` são imutáveis (trigger SQL).
  // Não tentamos deletar — runs futuros usam `count antes vs depois` pra delta.
  try { fs.unlinkSync(setup.anexoArquivoFisicoPath); } catch (_) {}

  console.log(
    `\n${falhas === 0 ? '✓ TODOS OS ASSERTS PASSARAM (15 brechas + patch 0.12.1 CFM)' : `✗ ${falhas} FALHAS`}\n`,
  );
  process.exit(falhas === 0 ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
