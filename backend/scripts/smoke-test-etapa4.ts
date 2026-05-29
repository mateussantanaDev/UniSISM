/**
 * Smoke test fim-a-fim da Etapa 4 (UBS vinculada — schema completo + ObterMinhaUbs).
 *
 * Cobre as 12 brechas identificadas:
 *
 *   1. Schema com bairro/cep/telefone/whatsapp/email/lat/lng/horarios/observacoes
 *   2. ubsVinculadaId populado automaticamente via NotificacaoPacienteService
 *   3. ObterMinhaUbsUseCase retorna campos reais (não hardcoded)
 *   4. Validação latitude [-90, 90]
 *   5. Validação CEP 8 dígitos
 *   6. Validação telefone/whatsapp 10/11/13 dígitos
 *   7. Validação email regex
 *   8. UpdateUbs aceita novos campos
 *   9. CreateUbs aceita novos campos
 *  10. Audit log antes/depois (snapshot)
 *  11. Race no CREATE UBS (UNIQUE CNES → P2002 → UBS_DUPLICADA)
 *  12. Horários estruturados (JSON) com validação semântica
 *
 * Uso: npx ts-node-dev --transpile-only scripts/smoke-test-etapa4.ts
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/infrastructure/database/prisma';
import { PrismaAuditLogger } from '../src/infrastructure/audit/PrismaAuditLogger';
import { CreateUbsUseCase } from '../src/application/admin/CreateUbsUseCase';
import { UpdateUbsUseCase } from '../src/application/admin/UpdateUbsUseCase';
import { ObterMinhaUbsUseCase } from '../src/modules/paciente-app/application/use-cases/ObterMinhaUbsUseCase';
import { NotificacaoPacienteService } from '../src/infrastructure/services/NotificacaoPacienteService';
import {
  validarCep,
  validarTelefoneBr,
  validarEmail,
  validarLatitude,
  validarLongitude,
  validarHorarios,
  normalizarCep,
  normalizarTelefone,
} from '../src/shared/ubsValidators';
import type { AccessScope } from '../src/shared/scope';

const CPF_VALIDO = '11144477735';
const CPF_FMT = '111.444.777-35';

let falhas = 0;
function assert(label: string, ok: boolean, extra?: unknown): void {
  if (ok) console.log(`  ✓ ${label}`);
  else { console.log(`  ✗ ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`); falhas++; }
}

async function main(): Promise<void> {
  console.log('\n──── SMOKE TEST · Etapa 4 (UBS vinculada — 12 brechas) ────\n');

  // Setup
  const pref = await prisma.prefeitura.findFirst();
  if (!pref) throw new Error('Sem prefeitura — rode seed');
  let atendente = await prisma.atendente.findUnique({ where: { matricula: 'SMOKE-E4-001' } });
  if (!atendente) {
    const h = await bcrypt.hash('senha123', 8);
    atendente = await prisma.atendente.create({
      data: {
        matricula: 'SMOKE-E4-001',
        nome: 'ATENDENTE E4',
        email: 'at-e4@example.com',
        senhaHash: h,
        cpf: '11122233399',
        role: 'ADMIN',
        prefeituraId: pref.id,
      },
    });
  }
  const scope: AccessScope = { kind: 'PREFEITURA', prefeituraId: pref.id };

  // Limpa UBSs smoke E4 antigas (cascade manual: enc → anexo, evento, depois ubs)
  const ubsAntigas = await prisma.ubs.findMany({
    where: { nome: { startsWith: 'SMOKE E4' } },
    select: { id: true },
  });
  if (ubsAntigas.length > 0) {
    const ids = ubsAntigas.map((u) => u.id);
    const encsAntigos = await prisma.encaminhamento.findMany({
      where: { ubsId: { in: ids } },
      select: { id: true },
    });
    const encIds = encsAntigos.map((e) => e.id);
    if (encIds.length > 0) {
      await prisma.eventoTimeline.deleteMany({ where: { encaminhamentoId: { in: encIds } } });
      await prisma.anexoDocumento.deleteMany({ where: { encaminhamentoId: { in: encIds } } });
      await prisma.encaminhamento.deleteMany({ where: { id: { in: encIds } } });
    }
    await prisma.pacienteConta.updateMany({
      where: { ubsVinculadaId: { in: ids } },
      data: { ubsVinculadaId: null },
    });
    // Paciente.ubsId é NOT NULL — apaga pacientes de UBSs smoke
    await prisma.paciente.deleteMany({ where: { ubsId: { in: ids } } });
    await prisma.ubs.deleteMany({ where: { id: { in: ids } } });
  }

  const audit = new PrismaAuditLogger();
  const createUC = new CreateUbsUseCase(audit);
  const updateUC = new UpdateUbsUseCase(audit);
  const obterUC = new ObterMinhaUbsUseCase();

  const auditCtx = { atendenteId: atendente.id, ip: '10.0.0.1', userAgent: 'smoke-e4' };

  // ─────────── BRECHA 4-7: Helpers de validação ───────────
  console.log('── BRECHA 4-7 · Validators unitários ──');

  // CEP
  assert('CEP válido aceito', validarCep('44001-000') === null);
  assert('CEP válido sem hífen aceito', validarCep('44001000') === null);
  assert('CEP curto rejeitado', validarCep('123') !== null);
  assert('CEP vazio aceito (null)', validarCep(null) === null);
  assert('Normaliza CEP', normalizarCep('44001000') === '44001-000');

  // Telefone
  assert('Telefone 10 dígitos aceito', validarTelefoneBr('7530001234') === null);
  assert('Telefone 11 dígitos aceito', validarTelefoneBr('75999998888') === null);
  assert('Telefone E.164 (13) aceito', validarTelefoneBr('5575999998888') === null);
  assert('Telefone 9 dígitos rejeitado', validarTelefoneBr('123456789') !== null);
  assert('Telefone com máscara funciona', validarTelefoneBr('(75) 99999-8888') === null);
  assert('Normaliza telefone', normalizarTelefone('(75) 99999-8888') === '75999998888');

  // Email
  assert('Email válido aceito', validarEmail('ubs@aguasbelas.pe.gov.br') === null);
  assert('Email sem @ rejeitado', validarEmail('semarroba') !== null);
  assert('Email longo rejeitado', validarEmail('a'.repeat(190)) !== null);

  // Lat/Lng
  assert('Latitude válida (12.123)', validarLatitude(12.123) === null);
  assert('Latitude limite -90 aceita', validarLatitude(-90) === null);
  assert('Latitude limite 90 aceita', validarLatitude(90) === null);
  assert('Latitude 90.1 rejeitada', validarLatitude(90.1) !== null);
  assert('Longitude válida (-38.96)', validarLongitude(-38.96) === null);
  assert('Longitude limite -180 aceita', validarLongitude(-180) === null);
  assert('Longitude limite 180 aceita', validarLongitude(180) === null);
  assert('Longitude 180.1 rejeitada', validarLongitude(180.1) !== null);
  assert('Latitude NaN rejeitada', validarLatitude(Number.NaN) !== null);

  // Horários
  assert(
    'Horários válidos aceitos',
    validarHorarios({
      segunda: { abre: '07:00', fecha: '17:00' },
      sabado: null,
    }) === null,
  );
  assert(
    'Dia inválido rejeitado',
    validarHorarios({ lunes: { abre: '07:00', fecha: '17:00' } }) !== null,
  );
  assert(
    'Hora inválida rejeitada (25:00)',
    validarHorarios({ segunda: { abre: '25:00', fecha: '17:00' } }) !== null,
  );
  assert(
    'abre >= fecha rejeitado',
    validarHorarios({ segunda: { abre: '17:00', fecha: '07:00' } }) !== null,
  );
  assert('Horários null/undefined OK', validarHorarios(null) === null);

  // ─────────── BRECHA 1, 9 · Schema + CreateUbs novos campos ───────────
  console.log('\n── BRECHA 1, 9 · CreateUbs com todos os campos novos ──');
  const ubsCriada = await createUC.exec(scope, {
    nome: 'SMOKE E4 UBS Completa',
    municipio: 'Águas Belas',
    uf: 'PE',
    prefeituraId: pref.id,
    endereco: 'Av. Smoke, 100',
    bairro: 'Centro',
    cep: '44001000', // sem hífen — normaliza
    telefone: '(75) 3201-0000',
    whatsapp: '(75) 99999-8888',
    email: 'SMOKE-E4@aguasbelas.pe.gov.br',
    latitude: -12.2664,
    longitude: -38.9663,
    horarios: {
      segunda: { abre: '07:00', fecha: '17:00' },
      terca: { abre: '07:00', fecha: '17:00' },
      quarta: { abre: '07:00', fecha: '17:00' },
      quinta: { abre: '07:00', fecha: '17:00' },
      sexta: { abre: '07:00', fecha: '17:00' },
      sabado: null,
      domingo: null,
    },
    observacoes: 'Ponto de referência: ao lado do mercado',
  }, auditCtx);

  assert('UBS criada com ID', ubsCriada.id.length > 0);
  assert('Bairro persistido', ubsCriada.bairro === 'Centro');
  assert('CEP normalizado com hífen', ubsCriada.cep === '44001-000');
  assert('Telefone normalizado (só dígitos)', ubsCriada.telefone === '7532010000');
  assert('WhatsApp normalizado (só dígitos)', ubsCriada.whatsapp === '75999998888');
  assert('Email lowercase', ubsCriada.email === 'smoke-e4@aguasbelas.pe.gov.br');
  assert('Latitude persistida', Number(ubsCriada.latitude) === -12.2664);
  assert('Longitude persistida', Number(ubsCriada.longitude) === -38.9663);
  assert('Horários persistidos (JSON)', ubsCriada.horarios !== null);
  assert('Observações persistida', ubsCriada.observacoes?.startsWith('Ponto') ?? false);

  // ─────────── BRECHA 10 · Audit CREATE ───────────
  console.log('\n── BRECHA 10 · Audit CREATE ──');
  const auditCreate = await prisma.auditoriaLog.findFirst({
    where: { acao: 'CRIAR_UBS', recursoId: ubsCriada.id },
  });
  assert('Audit CRIAR_UBS gravado', auditCreate !== null);
  const createPayload = auditCreate?.payload as { camposPreenchidos?: string[] } | null;
  assert(
    'Audit CREATE lista campos preenchidos',
    Array.isArray(createPayload?.camposPreenchidos) && createPayload!.camposPreenchidos!.length >= 10,
  );

  // ─────────── BRECHA 4 · Rejeitar lat/lng fora do range ───────────
  console.log('\n── BRECHA 4 · CreateUbs rejeita lat/lng inválidas ──');
  try {
    await createUC.exec(scope, {
      nome: 'SMOKE E4 lat invalida',
      municipio: 'X',
      uf: 'PE',
      prefeituraId: pref.id,
      latitude: 91,
      longitude: 0,
    }, auditCtx);
    assert('Latitude > 90 bloqueada', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`Latitude 91 rejeitada (code=${code})`, code === 'VALIDATION_ERROR');
  }

  // ─────────── BRECHA 5 · CEP inválido ───────────
  console.log('\n── BRECHA 5 · CreateUbs rejeita CEP inválido ──');
  try {
    await createUC.exec(scope, {
      nome: 'SMOKE E4 cep ruim',
      municipio: 'X',
      uf: 'PE',
      prefeituraId: pref.id,
      cep: '123',
    }, auditCtx);
    assert('CEP curto bloqueado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`CEP "123" rejeitado (code=${code})`, code === 'VALIDATION_ERROR');
  }

  // ─────────── BRECHA 8, 10 · UpdateUbs com novos campos + audit antes/depois ───────────
  console.log('\n── BRECHA 8, 10 · UpdateUbs + audit antes/depois ──');
  await updateUC.exec(
    scope,
    atendente.id,
    ubsCriada.id,
    {
      telefone: '7532019999', // mudou
      horarios: {
        segunda: { abre: '08:00', fecha: '18:00' }, // mudou
        terca: { abre: '07:00', fecha: '17:00' },
        quarta: { abre: '07:00', fecha: '17:00' },
        quinta: { abre: '07:00', fecha: '17:00' },
        sexta: { abre: '07:00', fecha: '17:00' },
        sabado: null,
        domingo: null,
      },
    },
    { ip: '10.0.0.2', userAgent: 'smoke-e4-update' },
  );

  const auditUpdate = await prisma.auditoriaLog.findFirst({
    where: { acao: 'EDITAR_UBS', recursoId: ubsCriada.id },
    orderBy: { criadoEm: 'desc' },
  });
  assert('Audit EDITAR_UBS gravado', auditUpdate !== null);
  const updPayload = auditUpdate?.payload as {
    antes?: { telefone?: string };
    depois?: { telefone?: string };
    camposAlterados?: string[];
  } | null;
  assert(
    `Audit antes.telefone = "7532010000" (foi ${updPayload?.antes?.telefone})`,
    updPayload?.antes?.telefone === '7532010000',
  );
  assert(
    `Audit depois.telefone = "7532019999" (foi ${updPayload?.depois?.telefone})`,
    updPayload?.depois?.telefone === '7532019999',
  );
  assert(
    'Audit camposAlterados contém telefone+horarios',
    updPayload?.camposAlterados?.includes('telefone') === true &&
      updPayload?.camposAlterados?.includes('horarios') === true,
  );

  // ─────────── BRECHA 11 · Race no CREATE (CNES duplicado) ───────────
  console.log('\n── BRECHA 11 · Race CREATE UBS (CNES duplicado) ──');
  const cnesUnico = `SMOKE-${Date.now()}`;
  await prisma.ubs.deleteMany({ where: { cnes: cnesUnico } });
  const [ra, rb] = await Promise.allSettled([
    createUC.exec(scope, {
      nome: 'SMOKE E4 Race A',
      municipio: 'X',
      uf: 'PE',
      prefeituraId: pref.id,
      cnes: cnesUnico,
    }, auditCtx),
    createUC.exec(scope, {
      nome: 'SMOKE E4 Race B',
      municipio: 'X',
      uf: 'PE',
      prefeituraId: pref.id,
      cnes: cnesUnico,
    }, auditCtx),
  ]);
  const okCount = [ra, rb].filter((r) => r.status === 'fulfilled').length;
  const errCount = [ra, rb].filter((r) => r.status === 'rejected').length;
  assert(
    `Race CNES: exatamente 1 OK + 1 erro (foi ${okCount}+${errCount})`,
    okCount === 1 && errCount === 1,
  );
  const rejected = [ra, rb].find((r) => r.status === 'rejected') as
    | PromiseRejectedResult
    | undefined;
  assert(
    `Race CNES: erro = UBS_DUPLICADA (P2002 capturado, foi ${rejected?.reason?.code})`,
    rejected?.reason?.code === 'UBS_DUPLICADA',
  );

  // ─────────── BRECHA 2 · ubsVinculadaId populado automaticamente ───────────
  console.log('\n── BRECHA 2 · NotificacaoPacienteService popula ubsVinculadaId ──');
  // Cria encaminhamento + dispara notificação → conta paciente deve receber ubsVinculadaId
  await prisma.pacienteConta.deleteMany({ where: { cpf: CPF_VALIDO } });
  const paciente = await prisma.paciente.upsert({
    where: { cpf: CPF_VALIDO },
    create: {
      cpf: CPF_VALIDO,
      nome: 'PACIENTE SMOKE E4',
      dataNascimento: new Date('1980-01-01'),
      sexo: 'F',
      ubsId: ubsCriada.id,
    },
    update: {},
  });
  const ano = new Date().getUTCFullYear();
  const seq = await prisma.sequencialProtocolo.upsert({
    where: { chave: `UBS-${ano}` },
    create: { chave: `UBS-${ano}`, valor: 1 },
    update: { valor: { increment: 1 } },
  });
  const enc = await prisma.encaminhamento.create({
    data: {
      protocolo: `UBS-${ano}-${String(seq.valor).padStart(6, '0')}`,
      status: 'AGUARDANDO_REGULACAO',
      pacienteId: paciente.id,
      pacienteNome: 'PACIENTE SMOKE E4',
      pacienteCpf: CPF_FMT,
      pacienteCartaoSus: '702 0000 0000 0001',
      pacienteDataNascimento: new Date('1980-01-01'),
      pacienteSexo: 'F',
      pacienteEndereco: 'Rua X',
      pacienteTelefone: '75999990000',
      medicoSolicitante: 'DR.',
      crm: 'CRM-PE 1',
      especialidadeSolicitada: 'Cardiologia',
      cid10: 'I10',
      cidDescricao: 'HAS',
      justificativaClinica: 'Smoke E4',
      prioridade: 'ELETIVA',
      dataSolicitacao: new Date(),
      unidadeOrigem: ubsCriada.nome,
      atendenteResponsavel: atendente.nome,
      ubsId: ubsCriada.id,
      atendenteId: atendente.id,
    },
  });
  const notif = new NotificacaoPacienteService();
  await notif.notificar({
    cpfPaciente: CPF_FMT,
    pacienteNome: 'PACIENTE SMOKE E4',
    encaminhamentoId: enc.id,
    tipo: 'ENCAMINHAMENTO_CRIADO',
    titulo: 'Encaminhamento criado',
    corpo: 'Foi gerado um encaminhamento.',
  });

  const conta = await prisma.pacienteConta.findUnique({
    where: { cpf: CPF_VALIDO },
    select: { id: true, ubsVinculadaId: true },
  });
  assert('Conta criada via notificação', conta !== null);
  assert(
    `ubsVinculadaId populado automaticamente (esperado ${ubsCriada.id}, foi ${conta?.ubsVinculadaId})`,
    conta?.ubsVinculadaId === ubsCriada.id,
  );

  // ─────────── BRECHA 3 · ObterMinhaUbsUseCase retorna campos reais ───────────
  console.log('\n── BRECHA 3 · ObterMinhaUbs retorna campos persistidos ──');
  const minhaUbs = await obterUC.exec(conta!.id);
  assert('Nome retornado', minhaUbs.nome === ubsCriada.nome);
  assert(`Bairro = "Centro" (foi "${minhaUbs.bairro}")`, minhaUbs.bairro === 'Centro');
  assert(`CEP = "44001-000" (foi "${minhaUbs.cep}")`, minhaUbs.cep === '44001-000');
  // Telefone foi atualizado para 7532019999 no update anterior
  assert(`Telefone atualizado (foi "${minhaUbs.telefone}")`, minhaUbs.telefone === '7532019999');
  assert(
    `WhatsApp persistido (foi "${minhaUbs.whatsapp}")`,
    minhaUbs.whatsapp === '75999998888',
  );
  assert(
    `Email persistido (foi "${minhaUbs.email}")`,
    minhaUbs.email === 'smoke-e4@aguasbelas.pe.gov.br',
  );
  assert('Latitude retornada', minhaUbs.latitude === -12.2664);
  assert('Longitude retornada', minhaUbs.longitude === -38.9663);
  assert('Horários estruturados presentes', minhaUbs.horarios !== null);
  assert('Observações retornadas', minhaUbs.observacoes?.startsWith('Ponto') ?? false);

  // ─────────── BRECHA 12 · Resumo de horários humano ───────────
  console.log('\n── BRECHA 12 · Resumo de horários estruturado ──');
  // Update setou segunda 08:00-18:00 e terca-sexta 07:00-17:00 → não bate o agrupamento
  assert(
    `Resumo de horários gerado: "${minhaUbs.horarioFuncionamento}"`,
    minhaUbs.horarioFuncionamento.includes('Segunda') &&
      minhaUbs.horarioFuncionamento.includes('08:00'),
  );

  // ─────────── Cleanup (cascade manual) ───────────
  const ubsLimp = await prisma.ubs.findMany({
    where: { nome: { startsWith: 'SMOKE E4' } },
    select: { id: true },
  });
  const idsLimp = ubsLimp.map((u) => u.id);
  if (idsLimp.length > 0) {
    const encsLimp = await prisma.encaminhamento.findMany({
      where: { ubsId: { in: idsLimp } },
      select: { id: true },
    });
    const encIdsLimp = encsLimp.map((e) => e.id);
    if (encIdsLimp.length > 0) {
      await prisma.eventoTimeline.deleteMany({ where: { encaminhamentoId: { in: encIdsLimp } } });
      await prisma.anexoDocumento.deleteMany({ where: { encaminhamentoId: { in: encIdsLimp } } });
      await prisma.encaminhamento.deleteMany({ where: { id: { in: encIdsLimp } } });
    }
    await prisma.pacienteConta.updateMany({
      where: { ubsVinculadaId: { in: idsLimp } },
      data: { ubsVinculadaId: null },
    });
    await prisma.paciente.deleteMany({ where: { ubsId: { in: idsLimp } } });
    await prisma.ubs.deleteMany({ where: { id: { in: idsLimp } } });
  }
  await prisma.pacienteConta.deleteMany({ where: { cpf: CPF_VALIDO } });

  console.log(
    `\n${falhas === 0 ? '✓ TODOS OS ASSERTS PASSARAM (12 brechas cobertas)' : `✗ ${falhas} FALHAS`}\n`,
  );
  process.exit(falhas === 0 ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
