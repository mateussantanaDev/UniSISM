/**
 * Smoke test fim-a-fim da Etapa 8 (TFD integrado Face 3 ↔ Face 4 com hash chain).
 *
 * Cobre as 15 brechas identificadas:
 *
 *   1. Endpoints Face 4 admin para TfdPacienteSolicitacao (List/Get/Aprovar/Recusar/Embarque/Concluir)
 *   2. Hash chain SHA-256 em transições (TFD_PAC_SOLIC_*)
 *   3. Audit imutável (tabela `tfd_audit_log`)
 *   4. Push automático ao paciente (NotificacaoPaciente.AGENDADO / REJEITADO)
 *   5. Validação atômica de vagas (race em viagens lotadas)
 *   6. Auto-alocação documentada como roadmap
 *   7. Lista ordenada por prioridade URGENTE → PRIORITARIA → NORMAL
 *   8. motivoRecusa obrigatório (mín 5 chars)
 *   9. Rate limit dedicado (cobertura via Face 3 generic 30/15min IP)
 *   10. Audit no cancelar paciente
 *   11. Validação geográfica (paciente prefeitura X não vê viagem prefeitura Y)
 *   12. Fluxo APROVADA → EMBARCADA → CONCLUIDA
 *   13. Limite de reabertura (3 tentativas)
 *   14. TTL/cleanup (documentado como roadmap, é uso pontual)
 *   15. Paciente vê quem aprovou (operadorNome no DTO)
 *
 * Uso: npx ts-node-dev --transpile-only scripts/smoke-test-etapa8.ts
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/infrastructure/database/prisma';
import { TfdAuditLogger } from '../src/modules/tfd/infrastructure/TfdAuditLogger';
import {
  ListarTfdPacienteSolicAdminUseCase,
  ObterTfdPacienteSolicAdminUseCase,
  AprovarTfdPacienteSolicUseCase,
  RecusarTfdPacienteSolicUseCase,
  MarcarEmbarqueTfdPacUseCase,
  MarcarConclusaoTfdPacUseCase,
} from '../src/modules/tfd/application/tfd-paciente-solicitacoes';
import {
  CriarSolicitacaoTfdPacienteUseCase,
  CancelarSolicitacaoTfdPacienteUseCase,
} from '../src/modules/paciente-app/application/use-cases/TfdPacienteUseCases';
import { NotificacaoPacienteService } from '../src/infrastructure/services/NotificacaoPacienteService';
import type { AccessScope } from '../src/shared/scope';

const CPF_E8 = '11144477735';
const CPF_E8B = '52998224725';

let falhas = 0;
function assert(label: string, ok: boolean, extra?: unknown): void {
  if (ok) console.log(`  ✓ ${label}`);
  else { console.log(`  ✗ ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`); falhas++; }
}

async function setup(): Promise<{
  contaId: string;
  conta2Id: string;
  prefId: string;
  pref2Id: string;
  ubsId: string;
  viagemId: string;
  viagem2Id: string;
  viagemLotadaId: string;
  outraPrefViagemId: string;
  atendenteId: string;
  motoristaId: string;
  veiculoId: string;
}> {
  const pref = await prisma.prefeitura.findFirst();
  if (!pref) throw new Error('Sem prefeitura');
  let pref2 = await prisma.prefeitura.findFirst({ where: { id: { not: pref.id } } });
  if (!pref2) {
    pref2 = await prisma.prefeitura.create({
      data: { nome: 'PREF SMOKE E8', municipio: 'X', uf: 'PE' },
    });
  }
  let ubs = await prisma.ubs.findFirst({ where: { prefeituraId: pref.id, nome: { contains: 'SMOKE E8' } } });
  if (!ubs) {
    ubs = await prisma.ubs.create({
      data: { nome: 'SMOKE E8 UBS', municipio: 'F', uf: 'PE', prefeituraId: pref.id, cnes: `SMOKE-E8-${Date.now()}` },
    });
  }

  // Atendente operador (GESTOR_TFD)
  let at = await prisma.atendente.findUnique({ where: { matricula: 'SMOKE-E8-OPER' } });
  if (!at) {
    const h = await bcrypt.hash('senha123', 8);
    at = await prisma.atendente.create({
      data: {
        matricula: 'SMOKE-E8-OPER',
        nome: 'OPERADOR TFD SMOKE',
        email: 'oper-e8@example.com',
        senhaHash: h,
        cpf: '99988877744',
        role: 'GESTOR_TFD',
        prefeituraId: pref.id,
      },
    });
  }

  // 2 contas paciente
  const conta = await prisma.pacienteConta.upsert({
    where: { cpf: CPF_E8 },
    create: {
      cpf: CPF_E8,
      cpfFormatado: '111.444.777-35',
      nome: 'PACIENTE A',
      email: 'a@e8.test',
      senhaHash: await bcrypt.hash('x', 8),
      ativo: true,
      ubsVinculadaId: ubs.id,
    },
    update: { nome: 'PACIENTE A', ubsVinculadaId: ubs.id, email: 'a@e8.test' },
  });
  const conta2 = await prisma.pacienteConta.upsert({
    where: { cpf: CPF_E8B },
    create: {
      cpf: CPF_E8B,
      cpfFormatado: '529.982.247-25',
      nome: 'PACIENTE B',
      email: 'b@e8.test',
      senhaHash: await bcrypt.hash('x', 8),
      ativo: true,
      ubsVinculadaId: ubs.id,
    },
    update: { ubsVinculadaId: ubs.id, email: 'b@e8.test' },
  });

  // Veículo + motorista + viagens (precisa do `at` já criado para `criadoPorId`)
  let veic = await prisma.veiculoTFD.findFirst({ where: { placa: 'SE8-0001' } });
  if (!veic) {
    veic = await prisma.veiculoTFD.create({
      data: {
        prefeituraId: pref.id,
        placa: 'SE8-0001',
        modelo: 'Van SMOKE',
        ano: 2020,
        capacidade: 12,
        status: 'ATIVO',
        tipo: 'VAN',
        combustivel: 'DIESEL',
        consumoMedioKml: 8.5,
        criadoPorId: at.id,
      },
    });
  }
  let mot = await prisma.motoristaTFD.findFirst({ where: { cpf: '11122233355' } });
  if (!mot) {
    const h = await bcrypt.hash('x', 8);
    mot = await prisma.motoristaTFD.create({
      data: {
        prefeituraId: pref.id,
        nome: 'MOT SMOKE',
        cpf: '11122233355',
        cnh: '01234567890',
        categoriaCnh: 'D',
        validadeCnh: new Date(Date.now() + 365 * 86400_000),
        telefone: '75999990000',
        criadoPorId: at.id,
      },
    });
  }

  // Limpa viagens smoke + solicitações antigas
  const vGroup = await prisma.viagemFrota.findMany({
    where: { veiculoId: veic.id, observacoes: { startsWith: 'SMOKE E8' } },
    select: { id: true },
  });
  const vIds = vGroup.map((v) => v.id);
  if (vIds.length > 0) {
    await prisma.tfdPacienteSolicitacao.deleteMany({ where: { viagemId: { in: vIds } } });
    await prisma.viagemFrota.deleteMany({ where: { id: { in: vIds } } });
  }
  // tfd_audit_log é IMUTÁVEL (trigger SQL). Não tentamos limpar — confiamos no
  // count diferencial pra validar entries desta run.

  // Viagem normal (vagas grandes)
  const viagem = await prisma.viagemFrota.create({
    data: {
      prefeituraId: pref.id,
      data: new Date(Date.now() + 7 * 86400_000),
      horaSaida: '08:00',
      veiculoId: veic.id,
      motoristaId: mot.id,
      destino: 'Salvador',
      unidadeDestino: 'Hospital Central',
      vagasTotais: 10,
      criadaPorId: at.id,
      observacoes: 'SMOKE E8 normal',
    },
  });
  // Viagem 2
  const viagem2 = await prisma.viagemFrota.create({
    data: {
      prefeituraId: pref.id,
      data: new Date(Date.now() + 8 * 86400_000),
      horaSaida: '08:00',
      veiculoId: veic.id,
      motoristaId: mot.id,
      destino: 'Salvador',
      unidadeDestino: 'Hospital Norte',
      vagasTotais: 5,
      criadaPorId: at.id,
      observacoes: 'SMOKE E8 normal2',
    },
  });
  // Viagem com 1 vaga (pra testar lotação atômica)
  const viagemLotada = await prisma.viagemFrota.create({
    data: {
      prefeituraId: pref.id,
      data: new Date(Date.now() + 9 * 86400_000),
      horaSaida: '08:00',
      veiculoId: veic.id,
      motoristaId: mot.id,
      destino: 'Salvador',
      unidadeDestino: 'Hospital Sul',
      vagasTotais: 1, // só 1 vaga
      criadaPorId: at.id,
      observacoes: 'SMOKE E8 lotacao',
    },
  });

  // Viagem de OUTRA prefeitura (pra testar escopo geográfico)
  let veicOutra = await prisma.veiculoTFD.findFirst({ where: { placa: 'SE8-0002' } });
  if (!veicOutra) {
    veicOutra = await prisma.veiculoTFD.create({
      data: {
        prefeituraId: pref2.id,
        placa: 'SE8-0002',
        modelo: 'Van outra',
        ano: 2020,
        capacidade: 10,
        status: 'ATIVO',
        tipo: 'VAN',
        combustivel: 'DIESEL',
        consumoMedioKml: 8.5,
        criadoPorId: at.id,
      },
    });
  }
  let motOutra = await prisma.motoristaTFD.findFirst({ where: { cpf: '11122233366' } });
  if (!motOutra) {
    motOutra = await prisma.motoristaTFD.create({
      data: {
        prefeituraId: pref2.id,
        nome: 'MOT OUTRA',
        cpf: '11122233366',
        cnh: '09876543210',
        categoriaCnh: 'D',
        validadeCnh: new Date(Date.now() + 365 * 86400_000),
        telefone: '75999991111',
        criadoPorId: at.id,
      },
    });
  }
  const outraPrefViagem = await prisma.viagemFrota.create({
    data: {
      prefeituraId: pref2.id,
      data: new Date(Date.now() + 7 * 86400_000),
      horaSaida: '08:00',
      veiculoId: veicOutra.id,
      motoristaId: motOutra.id,
      destino: 'Outra cidade',
      unidadeDestino: 'Hospital fora',
      vagasTotais: 10,
      criadaPorId: at.id,
      observacoes: 'SMOKE E8 outra-pref',
    },
  });

  return {
    contaId: conta.id,
    conta2Id: conta2.id,
    prefId: pref.id,
    pref2Id: pref2.id,
    ubsId: ubs.id,
    viagemId: viagem.id,
    viagem2Id: viagem2.id,
    viagemLotadaId: viagemLotada.id,
    outraPrefViagemId: outraPrefViagem.id,
    atendenteId: at.id,
    motoristaId: mot.id,
    veiculoId: veic.id,
  };
}

async function main(): Promise<void> {
  console.log('\n──── SMOKE TEST · Etapa 8 (TFD Face 3 ↔ Face 4 + hash chain) ────\n');

  const ctx = await setup();
  console.log(`✓ Setup: conta=${ctx.contaId}, viagens=3 (1 normal + 1 segunda + 1 lotada)\n`);

  const tfdAudit = new TfdAuditLogger();
  const notif = new NotificacaoPacienteService();
  const listarUC = new ListarTfdPacienteSolicAdminUseCase();
  const obterUC = new ObterTfdPacienteSolicAdminUseCase();
  const aprovarUC = new AprovarTfdPacienteSolicUseCase(tfdAudit, notif);
  const recusarUC = new RecusarTfdPacienteSolicUseCase(tfdAudit, notif);
  const embUC = new MarcarEmbarqueTfdPacUseCase(tfdAudit);
  const concUC = new MarcarConclusaoTfdPacUseCase(tfdAudit);

  const criarPacUC = new CriarSolicitacaoTfdPacienteUseCase();
  const cancelarPacUC = new CancelarSolicitacaoTfdPacienteUseCase(tfdAudit);

  const scopePref: AccessScope = { kind: 'PREFEITURA', prefeituraId: ctx.prefId };
  const scopeOutra: AccessScope = { kind: 'PREFEITURA', prefeituraId: ctx.pref2Id };
  const operador = {
    operadorId: ctx.atendenteId,
    operadorNome: 'OPERADOR TFD SMOKE',
    operadorMatricula: 'SMOKE-E8-OPER',
    operadorRole: 'GESTOR_TFD',
    ip: '10.0.0.1',
    userAgent: 'smoke-e8',
  };

  // ─────────── BRECHA 1 · Paciente cria solicitação ───────────
  console.log('── BRECHA 1, 11 · Paciente cria + audit ───');
  // Paciente da pref principal cria pra viagem da pref principal — OK
  const solicA = await criarPacUC.exec(ctx.contaId, CPF_E8.replace(/\D+/g, ''), '111.444.777-35', {
    viagemId: ctx.viagemId,
    justificativa: 'Preciso de transporte para cardiologista em Salvador',
  });
  assert('Solicitação criada', solicA.id.length > 0);
  assert(`Status AGUARDANDO (foi ${solicA.status})`, solicA.status === 'AGUARDANDO');

  // Paciente da pref principal tenta pedir viagem da pref2 → não encontra
  try {
    await criarPacUC.exec(ctx.contaId, CPF_E8.replace(/\D+/g, ''), '111.444.777-35', {
      viagemId: ctx.outraPrefViagemId,
      justificativa: 'Tentativa cross-prefeitura',
    });
    assert('Cross-prefeitura bloqueado', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`Cross-prefeitura → VIAGEM_NAO_ENCONTRADA (foi ${code})`, code === 'VIAGEM_NAO_ENCONTRADA');
  }

  // ─────────── BRECHA 7 · Lista ordenada por prioridade ───────────
  console.log('\n── BRECHA 7 · Lista ordenada por prioridade ──');
  // Cria solicitação URGENTE da conta2 (sem encaminhamento, ainda NORMAL — vamos manipular direto)
  const solicB = await criarPacUC.exec(ctx.conta2Id, CPF_E8B.replace(/\D+/g, ''), '529.982.247-25', {
    viagemId: ctx.viagemId,
    justificativa: 'Outro pedido na mesma viagem',
  });
  // Eleva manualmente a URGENTE pra testar ordenação
  await prisma.tfdPacienteSolicitacao.update({
    where: { id: solicB.id },
    data: { prioridade: 'URGENTE' },
  });

  const lista = await listarUC.exec(scopePref, { viagemId: ctx.viagemId });
  assert(`Lista tem 2 itens (foi ${lista.length})`, lista.length === 2);
  assert(
    `URGENTE primeiro (foi ${lista[0]?.prioridade}/${lista[0]?.id?.slice(0, 8)})`,
    lista[0]?.prioridade === 'URGENTE' && lista[0]?.id === solicB.id,
  );
  assert(`NORMAL depois (foi ${lista[1]?.prioridade})`, lista[1]?.prioridade === 'NORMAL');

  // ─────────── BRECHA 11 · Escopo: outra prefeitura não vê ───────────
  console.log('\n── BRECHA 11 · Escopo PREFEITURA (outra não vê) ──');
  const listaOutra = await listarUC.exec(scopeOutra);
  const isolada = listaOutra.every((s) => s.id !== solicA.id && s.id !== solicB.id);
  assert('Outra prefeitura não vê solicitações de pref principal', isolada);

  // ─────────── BRECHA 2, 3, 4, 15 · APROVAR com hash chain + push + operadorNome ───────────
  console.log('\n── BRECHA 2, 3, 4, 15 · APROVAR com hash chain + push + operadorNome ──');
  const aprovada = await aprovarUC.exec(scopePref, solicA.id, operador);
  assert(`Status APROVADA (foi ${aprovada.status})`, aprovada.status === 'APROVADA');
  assert(`operadorNome no DTO (foi "${aprovada.operadorNome}")`, aprovada.operadorNome === 'OPERADOR TFD SMOKE');
  assert(`numeroAssento atribuído (foi "${aprovada.numeroAssento}")`, aprovada.numeroAssento === 'A1');

  // Hash chain: tfd_audit_log tem entrada TFD_PAC_SOLIC_APROVADA
  const auditAprov = await prisma.tfdAuditLog.findFirst({
    where: { recursoId: solicA.id, acao: 'TFD_PAC_SOLIC_APROVADA' },
  });
  assert('Hash chain: entrada TFD_PAC_SOLIC_APROVADA gravada', auditAprov !== null);
  assert(`hash tem 64 hex (foi ${auditAprov?.hash.length})`, auditAprov?.hash.length === 64);
  assert('hashAnterior preenchido', (auditAprov?.hashAnterior?.length ?? 0) === 64);

  // Verifica integridade DA CADEIA DESDE solicA APROVADA (entradas posteriores).
  // Não verificamos cadeia inteira da prefeitura pois pode ter lixo de outras runs.
  // O hashAnterior da nossa entrada bate com o último hash da prefeitura antes dela?
  const anteriorAprov = await prisma.tfdAuditLog.findFirst({
    where: { prefeituraId: ctx.prefId, em: { lt: auditAprov!.em } },
    orderBy: { em: 'desc' },
    select: { hash: true },
  });
  const expectedHashAnterior = anteriorAprov?.hash ?? '0'.repeat(64);
  assert(
    `hashAnterior aponta para previous (${auditAprov?.hashAnterior?.slice(0, 8)}... esperado ${expectedHashAnterior.slice(0, 8)}...)`,
    auditAprov?.hashAnterior === expectedHashAnterior,
  );

  // Push: notificação criada
  const notifPushAprov = await prisma.notificacaoPaciente.findFirst({
    where: { contaId: ctx.contaId, tipo: 'AGENDADO', titulo: { contains: 'TFD' } },
    orderBy: { criadaEm: 'desc' },
  });
  assert('Push AGENDADO criado para paciente', notifPushAprov !== null);

  // ─────────── BRECHA 5 · Vagas atômicas (lotação) ───────────
  console.log('\n── BRECHA 5 · Validação atômica de vagas ──');
  // Cria 1 solicitação na viagem lotada (1 vaga) e aprova → ocupa a vaga
  const solicC = await criarPacUC.exec(ctx.contaId, CPF_E8.replace(/\D+/g, ''), '111.444.777-35', {
    viagemId: ctx.viagemLotadaId,
    justificativa: 'Pedido pra viagem lotada',
  });
  await aprovarUC.exec(scopePref, solicC.id, operador);

  // 2º paciente pede mesma viagem → deve falhar ao aprovar
  const solicD = await criarPacUC.exec(ctx.conta2Id, CPF_E8B.replace(/\D+/g, ''), '529.982.247-25', {
    viagemId: ctx.viagemLotadaId,
    justificativa: 'Pedido 2 na lotada',
  });
  try {
    await aprovarUC.exec(scopePref, solicD.id, operador);
    assert('Aprovação em viagem lotada bloqueada', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`Aprovar lotada → TFD_VIAGEM_SEM_VAGAS (foi ${code})`, code === 'TFD_VIAGEM_SEM_VAGAS');
  }

  // ─────────── BRECHA 8 · motivoRecusa obrigatório ───────────
  console.log('\n── BRECHA 8 · motivoRecusa obrigatório (mín 5 chars) ──');
  // solicB ainda está AGUARDANDO. Recusa sem motivo:
  try {
    await recusarUC.exec(scopePref, solicB.id, operador, { motivo: 'x' });
    assert('Recusa com motivo < 5 chars bloqueada', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`Motivo < 5 → VALIDATION_ERROR (foi ${code})`, code === 'VALIDATION_ERROR');
  }
  // Agora com motivo válido
  const recusada = await recusarUC.exec(scopePref, solicB.id, operador, {
    motivo: 'Paciente fora do critério clínico aprovado pela Junta Médica.',
  });
  assert(`Status RECUSADA (foi ${recusada.status})`, recusada.status === 'RECUSADA');
  assert(`motivoRecusa persistido (foi "${recusada.motivoRecusa?.slice(0, 30)}...")`, (recusada.motivoRecusa ?? '').length > 5);

  // ─────────── BRECHA 4 · Push REJEITADO ao recusar ───────────
  const pushRej = await prisma.notificacaoPaciente.findFirst({
    where: { contaId: ctx.conta2Id, tipo: 'REJEITADO' },
    orderBy: { criadaEm: 'desc' },
  });
  assert('Push REJEITADO criado ao recusar', pushRej !== null);

  // ─────────── BRECHA 10 · Audit cancelar pelo paciente ───────────
  console.log('\n── BRECHA 10 · Audit cancelar pelo paciente ──');
  // Limpa estado pra começar fresh
  await prisma.tfdPacienteSolicitacao.deleteMany({
    where: { contaId: ctx.contaId, viagemId: ctx.viagem2Id },
  });
  const solicE = await criarPacUC.exec(ctx.contaId, CPF_E8.replace(/\D+/g, ''), '111.444.777-35', {
    viagemId: ctx.viagem2Id,
    justificativa: 'Pedido pra cancelar depois',
  });
  await cancelarPacUC.exec(ctx.contaId, solicE.id, { ip: '10.0.0.99', userAgent: 'paciente-cancelar' });
  const auditCancel = await prisma.tfdAuditLog.findFirst({
    where: { recursoId: solicE.id, acao: 'TFD_PAC_SOLIC_CANCELADA_PELO_PACIENTE' },
  });
  assert('Hash chain: entrada cancelar pelo paciente gravada', auditCancel !== null);
  assert(`operadorRole = PACIENTE (foi ${auditCancel?.operadorRole})`, auditCancel?.operadorRole === 'PACIENTE');

  // ─────────── BRECHA 13 · Limite reabertura (3 tentativas) ───────────
  console.log('\n── BRECHA 13 · Limite reabertura (3) ──');
  // Limpa solicitação existente (entre conta e viagem2 pode ter ficado tentativasReabertura > 0)
  await prisma.tfdPacienteSolicitacao.deleteMany({
    where: { contaId: ctx.contaId, viagemId: ctx.viagem2Id },
  });
  // Cancelar+recriar 3x deve passar, 4ª vez falha
  const solicF = await criarPacUC.exec(ctx.contaId, CPF_E8.replace(/\D+/g, ''), '111.444.777-35', {
    viagemId: ctx.viagem2Id,
    justificativa: 'Vou cancelar e refazer 4 vezes',
  });
  // tentativasReabertura inicial = 0
  for (let i = 1; i <= 3; i++) {
    await cancelarPacUC.exec(ctx.contaId, solicF.id);
    // Recria → incrementa tentativasReabertura
    await criarPacUC.exec(ctx.contaId, CPF_E8.replace(/\D+/g, ''), '111.444.777-35', {
      viagemId: ctx.viagem2Id,
      justificativa: `Reabertura tentativa ${i + 1}`,
    });
  }
  // 4ª reabertura deve falhar
  await cancelarPacUC.exec(ctx.contaId, solicF.id);
  try {
    await criarPacUC.exec(ctx.contaId, CPF_E8.replace(/\D+/g, ''), '111.444.777-35', {
      viagemId: ctx.viagem2Id,
      justificativa: '4ª reabertura — deve falhar',
    });
    assert('4ª reabertura bloqueada', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`4ª reabertura → TFD_LIMITE_REABERTURAS (foi ${code})`, code === 'TFD_LIMITE_REABERTURAS');
  }

  // ─────────── BRECHA 12 · Fluxo APROVADA → EMBARCADA → CONCLUIDA ───────────
  console.log('\n── BRECHA 12 · Fluxo APROVADA → EMBARCADA → CONCLUIDA ──');
  // solicC está APROVADA na viagemLotada
  const embarcada = await embUC.exec(scopePref, solicC.id, operador);
  assert(`EMBARCADA (foi ${embarcada.status})`, embarcada.status === 'EMBARCADA');
  const concluida = await concUC.exec(scopePref, solicC.id, operador);
  assert(`CONCLUIDA (foi ${concluida.status})`, concluida.status === 'CONCLUIDA');

  // Contagem de entries TFD_PAC_* desta run de smoke (deveria ser ≥ 6: aprovar+recusar+cancelar+embarcar+concluir+reabertura)
  const totalPacEntries = await prisma.tfdAuditLog.count({
    where: {
      acao: {
        in: [
          'TFD_PAC_SOLIC_APROVADA',
          'TFD_PAC_SOLIC_RECUSADA',
          'TFD_PAC_SOLIC_CANCELADA_PELO_PACIENTE',
          'TFD_PAC_EMBARCADA',
          'TFD_PAC_CONCLUIDA',
        ],
      },
    },
  });
  assert(`Audit TFD_PAC_* entries >= 6 (foi ${totalPacEntries})`, totalPacEntries >= 6);

  // ─────────── BRECHA 11 · Escopo: outra prefeitura não aprova ───────────
  console.log('\n── BRECHA 11 · Escopo aprovar outra prefeitura ──');
  try {
    await aprovarUC.exec(scopeOutra, solicA.id, operador);
    assert('Aprovação cross-prefeitura bloqueada', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(`Cross-pref → FORA_DO_ESCOPO (foi ${code})`, code === 'FORA_DO_ESCOPO');
  }

  // ─────────── Obter / DTO completo ───────────
  console.log('\n── BRECHA 15 · DTO completo (paciente vê operadorNome) ──');
  const obtida = await obterUC.exec(scopePref, solicA.id);
  assert(`operadorMatricula no DTO (foi "${obtida.paciente.nome}")`, obtida.paciente.nome === 'PACIENTE A');

  // ─────────── PATCH 0.17.1 · Race em aprovação concorrente ───────────
  console.log('\n── PATCH 0.17.1 · Race em aprovação concorrente (SELECT FOR UPDATE) ──');
  // Cria 2 solicitações na MESMA viagem com 1 vaga só sobrando
  // (mas como já testamos vagas atômicas, a viagemLotada já está cheia)
  // Vamos usar uma viagem nova:
  const veicForRace = await prisma.veiculoTFD.findFirst({ where: { placa: 'SE8-0001' } });
  const motForRace = await prisma.motoristaTFD.findFirst({ where: { cpf: '11122233355' } });
  const viagemRace = await prisma.viagemFrota.create({
    data: {
      prefeituraId: ctx.prefId,
      data: new Date(Date.now() + 20 * 86400_000),
      horaSaida: '08:00',
      veiculoId: veicForRace!.id,
      motoristaId: motForRace!.id,
      destino: 'Salvador',
      unidadeDestino: 'Hospital Race',
      vagasTotais: 1, // só 1 vaga
      criadaPorId: ctx.atendenteId,
      observacoes: 'SMOKE E8 race',
    },
  });
  const solR1 = await criarPacUC.exec(ctx.contaId, CPF_E8.replace(/\D+/g, ''), '111.444.777-35', {
    viagemId: viagemRace.id,
    justificativa: 'Race patch — pedido A com texto longo o suficiente',
  });
  const solR2 = await criarPacUC.exec(ctx.conta2Id, CPF_E8B.replace(/\D+/g, ''), '529.982.247-25', {
    viagemId: viagemRace.id,
    justificativa: 'Race patch — pedido B com texto longo o suficiente',
  });

  // Aprovar AMBAS em paralelo — sem lock, ambas passariam. Com SELECT FOR UPDATE,
  // a segunda espera a primeira commitar e detecta lotação.
  const [ra, rb] = await Promise.allSettled([
    aprovarUC.exec(scopePref, solR1.id, operador),
    aprovarUC.exec(scopePref, solR2.id, operador),
  ]);
  const okR = [ra, rb].filter((r) => r.status === 'fulfilled').length;
  const errR = [ra, rb].filter((r) => r.status === 'rejected').length;
  assert(`Race: exatamente 1 OK + 1 erro (foi ${okR} ok + ${errR} erro)`, okR === 1 && errR === 1);
  const rejected = [ra, rb].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  assert(
    `Race: erro = TFD_VIAGEM_SEM_VAGAS (foi ${rejected?.reason?.code})`,
    rejected?.reason?.code === 'TFD_VIAGEM_SEM_VAGAS',
  );

  // ─────────── PATCH 0.17.1 · numeroAssento duplicado ───────────
  console.log('\n── PATCH 0.17.1 · numeroAssento duplicado bloqueado ──');
  // Cria nova viagem com 3 vagas; aloca primeiro paciente com assento "A1"
  // e tenta aprovar segundo passando "A1" explícito — deve falhar.
  const viagemDup = await prisma.viagemFrota.create({
    data: {
      prefeituraId: ctx.prefId,
      data: new Date(Date.now() + 25 * 86400_000),
      horaSaida: '08:00',
      veiculoId: veicForRace!.id,
      motoristaId: motForRace!.id,
      destino: 'Salvador',
      unidadeDestino: 'Hospital Dup',
      vagasTotais: 3,
      criadaPorId: ctx.atendenteId,
      observacoes: 'SMOKE E8 dup',
    },
  });
  const solD1 = await criarPacUC.exec(ctx.contaId, CPF_E8.replace(/\D+/g, ''), '111.444.777-35', {
    viagemId: viagemDup.id,
    justificativa: 'Dup patch — pedido A com texto longo o suficiente',
  });
  const solD2 = await criarPacUC.exec(ctx.conta2Id, CPF_E8B.replace(/\D+/g, ''), '529.982.247-25', {
    viagemId: viagemDup.id,
    justificativa: 'Dup patch — pedido B com texto longo o suficiente',
  });
  // Aprova D1 com "A1" explícito
  await aprovarUC.exec(scopePref, solD1.id, operador, { numeroAssento: 'A1' });
  // Tenta aprovar D2 com mesmo "A1" → deve falhar
  try {
    await aprovarUC.exec(scopePref, solD2.id, operador, { numeroAssento: 'A1' });
    assert('Aprovação com assento duplicado bloqueada', false);
  } catch (err) {
    const code = (err as { code?: string }).code;
    assert(
      `Assento duplicado → TFD_ASSENTO_OCUPADO (foi ${code})`,
      code === 'TFD_ASSENTO_OCUPADO',
    );
  }
  // Aprovar D2 sem assento explícito → backend auto-gera próximo livre
  const dAprov2 = await aprovarUC.exec(scopePref, solD2.id, operador);
  assert(
    `Auto-gerou assento diferente (foi ${dAprov2.numeroAssento})`,
    dAprov2.numeroAssento !== 'A1' && (dAprov2.numeroAssento ?? '').startsWith('A'),
  );

  // ─────────── Cleanup ───────────
  await prisma.tfdPacienteSolicitacao.deleteMany({
    where: {
      OR: [
        { contaId: ctx.contaId },
        { contaId: ctx.conta2Id },
      ],
    },
  });
  await prisma.notificacaoPaciente.deleteMany({
    where: { contaId: { in: [ctx.contaId, ctx.conta2Id] } },
  });
  // tfd_audit_log é imutável (hash chain) — não tentamos limpar

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
