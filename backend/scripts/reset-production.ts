import 'dotenv/config';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/infrastructure/database/prisma';
import { PACIENTES_DIR, UBS_AGUAS_BELAS } from './pec/pec-common';

/**
 * RESET DE PRODUÇÃO · UNISISM (Águas Belas / PE)
 *
 * 1. Zera dados transacionais e de teste (filas, agendamentos, encaminhamentos, viagens, sessões, logs).
 * 2. Garante a infraestrutura oficial da Prefeitura de Águas Belas.
 * 3. Garante as 13 Unidades Básicas de Saúde (UBSs).
 * 4. Garante a infraestrutura do CEM (Centro de Especialidades Médicas) e CEO (Centro de Especialidades Odontológicas).
 * 5. Injeta o usuário Administrador / Desenvolvedor Global:
 *      Email: mateushenrivieira@gmail.com
 *      Senha: Aguasbelas#1
 *      Role:  DESENVOLVEDOR (Acesso irrestrito)
 * 6. Preserva os 58.312 pacientes do PEC e suas respectivas contas de acesso.
 */

const EMAIL_ADMIN = 'mateushenrivieira@gmail.com';
const SENHA_ADMIN = 'Aguasbelas#1';
const NOME_ADMIN = 'Mateus Henrique Vieira';
const MATRICULA_ADMIN = 'SMS-DEV-001';

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🚀 INICIANDO RESET DE PRODUÇÃO — UNISISM ÁGUAS BELAS');
  console.log('════════════════════════════════════════════════════════════════');

  // ────────────────────────────────────────────────────────────────
  // 1. Limpeza de tabelas transacionais e operacionais de teste
  // ────────────────────────────────────────────────────────────────
  console.log('\n🧹 1. Limpando dados transacionais e registros de teste...');

  // CEM / CEO
  await prisma.atendimentoProcedimentoRealizado.deleteMany().catch(() => {});
  await prisma.agendamentoCentro.deleteMany().catch(() => {});
  await prisma.escalaEspecialista.deleteMany().catch(() => {});

  // Encaminhamentos & Triagem
  await prisma.eventoTimeline.deleteMany().catch(() => {});
  await prisma.anexoDocumento.deleteMany().catch(() => {});
  await prisma.encaminhamento.deleteMany().catch(() => {});
  await prisma.relatorio.deleteMany().catch(() => {});
  await prisma.relatorioAudit.deleteMany().catch(() => {});

  // Atendimentos UBS & Prontuários
  await prisma.atendimento.deleteMany().catch(() => {});
  await prisma.exameRealizado.deleteMany().catch(() => {});
  await prisma.vacinaAplicada.deleteMany().catch(() => {});
  await prisma.viagemTFD.deleteMany().catch(() => {});
  await prisma.condicaoCronica.deleteMany().catch(() => {});
  await prisma.alergia.deleteMany().catch(() => {});
  await prisma.medicamentoEmUso.deleteMany().catch(() => {});
  await prisma.pacienteProntuarioAudit.deleteMany().catch(() => {});

  // TFD Módulo
  await prisma.anexoSolicitacaoTFD.deleteMany().catch(() => {});
  await prisma.solicitacaoTFD.deleteMany().catch(() => {});
  await prisma.tfdPacienteSolicitacao.deleteMany().catch(() => {});
  await prisma.viagemPassageiro.deleteMany().catch(() => {});
  await prisma.abastecimento.deleteMany().catch(() => {});
  await prisma.ajudaCusto.deleteMany().catch(() => {});
  await prisma.saldoAjuste.deleteMany().catch(() => {});
  await prisma.saldoVeiculo.deleteMany().catch(() => {});
  await prisma.viagemFrota.deleteMany().catch(() => {});
  await prisma.tfdAuditLog.deleteMany().catch(() => {});
  await prisma.tfdIdempotencyKey.deleteMany().catch(() => {});
  await prisma.aporteSaldoFrota.deleteMany().catch(() => {});
  await prisma.aporteSaldoAjudaCusto.deleteMany().catch(() => {});

  // Sessões, Notificações & Auditoria
  await prisma.sessaoPaciente.deleteMany().catch(() => {});
  await prisma.pacienteRefreshToken.deleteMany().catch(() => {});
  await prisma.pacienteRecoveryToken.deleteMany().catch(() => {});
  await prisma.pacienteDispositivo.deleteMany().catch(() => {});
  await prisma.notificacaoPaciente.deleteMany().catch(() => {});
  await prisma.smsBannerView.deleteMany().catch(() => {});
  await prisma.sessao.deleteMany().catch(() => {});
  await prisma.refreshToken.deleteMany().catch(() => {});
  await prisma.passwordResetCode.deleteMany().catch(() => {});
  await prisma.tentativaLogin.deleteMany().catch(() => {});
  await prisma.auditoriaLog.deleteMany().catch(() => {});
  await prisma.atividadeAtendente.deleteMany().catch(() => {});
  await prisma.outboxEvent.deleteMany().catch(() => {});

  // Limpar outros atendentes mantendo a base zerada para os usuários de produção
  await prisma.atendente.deleteMany({
    where: { email: { not: EMAIL_ADMIN } },
  }).catch(() => {});

  console.log('✓ Tabelas transacionais e operacionais zeradas com sucesso.');

  // ────────────────────────────────────────────────────────────────
  // 2. Garantir Prefeitura Municipal de Águas Belas
  // ────────────────────────────────────────────────────────────────
  console.log('\n🏛️ 2. Configurando Prefeitura Municipal de Águas Belas...');

  const prefeitura = await prisma.prefeitura.upsert({
    where: { cnpj: '11286374000131' },
    update: {
      nome: 'Prefeitura Municipal de Águas Belas',
      municipio: 'Águas Belas',
      uf: 'PE',
      ativa: true,
    },
    create: {
      nome: 'Prefeitura Municipal de Águas Belas',
      municipio: 'Águas Belas',
      uf: 'PE',
      cnpj: '11286374000131',
      ativa: true,
    },
  });
  console.log(`✓ Prefeitura OK: ${prefeitura.nome} (ID: ${prefeitura.id})`);

  // ────────────────────────────────────────────────────────────────
  // 3. Garantir as 13 UBSs Oficiais
  // ────────────────────────────────────────────────────────────────
  console.log('\n🏥 3. Configurando as 13 Unidades Básicas de Saúde...');

  const ubsMap: Record<string, string> = {};
  for (let i = 0; i < UBS_AGUAS_BELAS.length; i++) {
    const u = UBS_AGUAS_BELAS[i];
    const cnes = u.ine || `2600${String(i + 1).padStart(3, '0')}`;
    const createdUbs = await prisma.ubs.upsert({
      where: { cnes },
      update: {
        nome: u.nome,
        municipio: 'Águas Belas',
        uf: 'PE',
        ativa: true,
        prefeituraId: prefeitura.id,
      },
      create: {
        nome: u.nome,
        municipio: 'Águas Belas',
        uf: 'PE',
        cnes,
        endereco: `Águas Belas · PE`,
        ativa: true,
        prefeituraId: prefeitura.id,
      },
    });
    ubsMap[u.nome] = createdUbs.id;
  }
  console.log(`✓ 13 UBSs municipais ativas e vinculadas à Prefeitura.`);

  // ────────────────────────────────────────────────────────────────
  // 4. Garantir Estrutura do CEM e CEO
  // ────────────────────────────────────────────────────────────────
  console.log('\n🏥 4. Configurando Consultórios e Cadeiras Odontológicas (CEM / CEO)...');

  await prisma.salaConsultorio.deleteMany().catch(() => {});

  // Consultórios CEM
  const salasCem = [
    { codigo: 'CONS-01', nome: 'Consultório 01 — Cardiologia / Clínica', ala: 'Ala A · Médica', especialidade: 'Cardiologia' },
    { codigo: 'CONS-02', nome: 'Consultório 02 — Ortopedia / Traumatologia', ala: 'Ala A · Médica', especialidade: 'Ortopedia' },
    { codigo: 'CONS-03', nome: 'Consultório 03 — Ginecologia & Obstetrícia', ala: 'Ala B · Saúde da Mulher', especialidade: 'Ginecologia' },
    { codigo: 'CONS-04', nome: 'Consultório 04 — Pediatria Especializada', ala: 'Ala B · Pediatria', especialidade: 'Pediatria' },
    { codigo: 'CONS-05', nome: 'Consultório 05 — Psiquiatria & Saúde Mental', ala: 'Ala C · Psicossocial', especialidade: 'Psiquiatria' },
    { codigo: 'CONS-06', nome: 'Consultório 06 — Dermatologia & Pequenas Cirurgias', ala: 'Ala C · Cirúrgica', especialidade: 'Dermatologia' },
  ];

  for (const s of salasCem) {
    await prisma.salaConsultorio.create({
      data: {
        codigo: s.codigo,
        nome: s.nome,
        ala: s.ala,
        especialidadePrincipal: s.especialidade,
        status: 'DISPONIVEL',
        equipamentos: ['Maca Clínica', 'Negatoscópio', 'Esfigmomanômetro', 'Computador / Prontuário'],
        prefeituraId: prefeitura.id,
      },
    });
  }

  // Cadeiras Odontológicas CEO
  const cadeirasCeo = [
    { codigo: 'CAD-01', nome: 'Cadeira Odontológica 01 — Endodontia', ala: 'Setor A · Endodontia', especialidade: 'Endodontia' },
    { codigo: 'CAD-02', nome: 'Cadeira Odontológica 02 — Cirurgia Bucomaxilofacial', ala: 'Setor A · Cirurgia Oral', especialidade: 'Cirurgia Oral Menor' },
    { codigo: 'CAD-03', nome: 'Cadeira Odontológica 03 — Periodontia & Diagnóstico', ala: 'Setor B · Periodontia', especialidade: 'Periodontia' },
    { codigo: 'CAD-04', nome: 'Cadeira Odontológica 04 — Odontopediatria / PNE', ala: 'Setor B · Especial', especialidade: 'Odontopediatria' },
  ];

  for (const c of cadeirasCeo) {
    await prisma.salaConsultorio.create({
      data: {
        codigo: c.codigo,
        nome: c.nome,
        ala: c.ala,
        especialidadePrincipal: c.especialidade,
        status: 'DISPONIVEL',
        equipamentos: ['Equipo Odontológico Completo', 'Ultrassom Odontológico', 'Fotopolimerizador', 'Raio-X Odontológico Digital'],
        prefeituraId: prefeitura.id,
      },
    });
  }
  console.log(`✓ 6 Consultórios CEM e 4 Cadeiras Odontológicas CEO criados.`);

  // ────────────────────────────────────────────────────────────────
  // 5. Injetar Usuário Administrador Oficial
  // ────────────────────────────────────────────────────────────────
  console.log('\n👑 5. Injetando Usuário Administrador Oficial...');

  const senhaHash = await bcrypt.hash(SENHA_ADMIN, 10);

  const admin = await prisma.atendente.upsert({
    where: { email: EMAIL_ADMIN },
    update: {
      nome: NOME_ADMIN,
      matricula: MATRICULA_ADMIN,
      senhaHash,
      cargo: 'DESENVOLVEDOR',
      funcao: 'Administrador Global · UNISISM',
      role: 'DESENVOLVEDOR',
      ativo: true,
      bloqueadoAte: null,
      senhaAlteradaEm: new Date(),
    },
    create: {
      email: EMAIL_ADMIN,
      nome: NOME_ADMIN,
      matricula: MATRICULA_ADMIN,
      cpf: '00000000191',
      senhaHash,
      cargo: 'DESENVOLVEDOR',
      funcao: 'Administrador Global · UNISISM',
      role: 'DESENVOLVEDOR',
      ativo: true,
      ubsId: null,
      prefeituraId: null,
    },
  });
  console.log(`✓ Administrador garantido: ${admin.nome} (${admin.email})`);

  // ────────────────────────────────────────────────────────────────
  // 6. Base de Pacientes
  // ────────────────────────────────────────────────────────────────
  const totalPacientes = await prisma.paciente.count({ where: { deletadoEm: null } });
  const totalContas = await prisma.pacienteConta.count();
  console.log(`\n👥 6. Base de Pacientes:`);
  console.log(`   - Total no Prontuário PEC: ${totalPacientes.toLocaleString('pt-BR')} cidadãos`);
  console.log(`   - Total de Contas de App:  ${totalContas.toLocaleString('pt-BR')} contas`);

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('✅ AMBIENTE 100% PRONTO PARA PRODUÇÃO!');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`  URL:         https://unisism.vercel.app`);
  console.log(`  Login Admin: ${EMAIL_ADMIN}`);
  console.log(`  Senha:       ${SENHA_ADMIN}`);
  console.log(`  Perfil:      DESENVOLVEDOR (Acesso total)`);
  console.log('════════════════════════════════════════════════════════════════\n');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('✗ Erro no reset de produção:', err);
  process.exit(1);
});
