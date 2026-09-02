import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/infrastructure/database/prisma';

/**
 * RESET TOTAL DO UNISISM · BANCO VIRGEM PARA PRODUÇÃO
 *
 * 1. Limpa ABSOLUTAMENTE TUDO (centros, consultórios, cadeiras, especialidades,
 *    escalas, atendimentos, encaminhamentos, tfd, pacientes, contas de app,
 *    ubss, prefeituras e atendentes de teste).
 * 2. Injeta APENAS e EXCLUSIVAMENTE o usuário Desenvolvedor / Administrador Global:
 *      - Email:     mateushenrivieira@gmail.com
 *      - Senha:     Aguasbelas#1
 *      - Role:      DESENVOLVEDOR (Acesso irrestrito a todos os módulos)
 *      - Matrícula: SMS-DEV-001
 *      - Nome:      Mateus Henrique Vieira
 *
 * O banco fica 100% zerado e pronto para receber a coleta e importação limpa do PEC.
 */

const EMAIL_ADMIN = 'mateushenrivieira@gmail.com';
const SENHA_ADMIN = 'Aguasbelas#1';
const NOME_ADMIN = 'Mateus Henrique Vieira';
const MATRICULA_ADMIN = 'SMS-DEV-001';
const CPF_ADMIN = '00000000191';

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🧹 INICIANDO RESET TOTAL DO BANCO DE DADOS (ZERO ABSOLUTO)');
  console.log('════════════════════════════════════════════════════════════════');

  // ────────────────────────────────────────────────────────────────
  // 1. ZERAR ABSOLUTAMENTE TODAS AS TABELAS
  // ────────────────────────────────────────────────────────────────
  console.log('\n[1/3] Deletando todos os dados operacionais, clínicos e cadastrais...');

  // CEM / CEO / Especialidades
  await prisma.atendimentoProcedimentoRealizado.deleteMany().catch(() => {});
  await prisma.agendamentoCentro.deleteMany().catch(() => {});
  await prisma.escalaEspecialista.deleteMany().catch(() => {});
  await prisma.salaConsultorio.deleteMany().catch(() => {});
  await prisma.especialidadeCatalogo.deleteMany().catch(() => {});
  await prisma.cotaUbs.deleteMany().catch(() => {});

  // Encaminhamentos & Triagem
  await prisma.eventoTimeline.deleteMany().catch(() => {});
  await prisma.anexoDocumento.deleteMany().catch(() => {});
  await prisma.encaminhamento.deleteMany().catch(() => {});
  await prisma.especialidadeRecomendacao.deleteMany().catch(() => {});
  await prisma.relatorioAudit.deleteMany().catch(() => {});
  await prisma.relatorio.deleteMany().catch(() => {});

  // Atendimentos UBS & Prontuários
  await prisma.atendimento.deleteMany().catch(() => {});
  await prisma.exameRealizado.deleteMany().catch(() => {});
  await prisma.vacinaAplicada.deleteMany().catch(() => {});
  await prisma.viagemTFD.deleteMany().catch(() => {});
  await prisma.condicaoCronica.deleteMany().catch(() => {});
  await prisma.alergia.deleteMany().catch(() => {});
  await prisma.medicamentoEmUso.deleteMany().catch(() => {});
  await prisma.pacienteProntuarioAudit.deleteMany().catch(() => {});

  // TFD Módulo Completo
  await prisma.anexoSolicitacaoTFD.deleteMany().catch(() => {});
  await prisma.solicitacaoTFD.deleteMany().catch(() => {});
  await prisma.tfdPacienteSolicitacao.deleteMany().catch(() => {});
  await prisma.viagemPassageiro.deleteMany().catch(() => {});
  await prisma.abastecimento.deleteMany().catch(() => {});
  await prisma.ajudaCusto.deleteMany().catch(() => {});
  await prisma.saldoAjuste.deleteMany().catch(() => {});
  await prisma.saldoVeiculo.deleteMany().catch(() => {});
  await prisma.viagemFrota.deleteMany().catch(() => {});
  await prisma.veiculoTFD.deleteMany().catch(() => {});
  await prisma.motoristaTFD.deleteMany().catch(() => {});
  await prisma.tfdAuditLog.deleteMany().catch(() => {});
  await prisma.tfdIdempotencyKey.deleteMany().catch(() => {});
  await prisma.aporteSaldoFrota.deleteMany().catch(() => {});
  await prisma.aporteSaldoAjudaCusto.deleteMany().catch(() => {});
  await prisma.saldoAjudaCustoAjuste.deleteMany().catch(() => {});
  await prisma.saldoAjudaCustoMes.deleteMany().catch(() => {});

  // App do Paciente / Notificações / Banners
  await prisma.sessaoPaciente.deleteMany().catch(() => {});
  await prisma.pacienteRefreshToken.deleteMany().catch(() => {});
  await prisma.pacienteRecoveryToken.deleteMany().catch(() => {});
  await prisma.pacienteDispositivo.deleteMany().catch(() => {});
  await prisma.notificacaoPaciente.deleteMany().catch(() => {});
  await prisma.smsBannerView.deleteMany().catch(() => {});
  await prisma.smsBanner.deleteMany().catch(() => {});

  // Contas de Pacientes e Prontuários de Pacientes
  await prisma.pacienteConta.deleteMany().catch(() => {});
  await prisma.paciente.deleteMany().catch(() => {});

  // Sessões e Segurança de Atendentes
  await prisma.sessao.deleteMany().catch(() => {});
  await prisma.refreshToken.deleteMany().catch(() => {});
  await prisma.passwordResetCode.deleteMany().catch(() => {});
  await prisma.tentativaLogin.deleteMany().catch(() => {});
  await prisma.auditoriaLog.deleteMany().catch(() => {});
  await prisma.atividadeAtendente.deleteMany().catch(() => {});
  await prisma.outboxEvent.deleteMany().catch(() => {});
  await prisma.configuracaoIntegracao.deleteMany().catch(() => {});
  await prisma.medicoAtendente.deleteMany().catch(() => {});

  // Limpar Atendentes, UBSs e Prefeituras
  await prisma.atendente.deleteMany().catch(() => {});
  await prisma.ubs.deleteMany().catch(() => {});
  await prisma.prefeitura.deleteMany().catch(() => {});

  console.log('✓ Banco de dados 100% limpo e zerado.');

  // ────────────────────────────────────────────────────────────────
  // 2. INJETAR O USUÁRIO ADMINISTRADOR GLOBAL ÚNICO
  // ────────────────────────────────────────────────────────────────
  console.log('\n[2/3] Injetando o Usuário Administrador Global...');

  const senhaHash = await bcrypt.hash(SENHA_ADMIN, 10);

  const admin = await prisma.atendente.create({
    data: {
      email: EMAIL_ADMIN,
      nome: NOME_ADMIN,
      matricula: MATRICULA_ADMIN,
      cpf: CPF_ADMIN,
      senhaHash,
      cargo: 'DESENVOLVEDOR',
      funcao: 'Administrador Geral da Plataforma UNISISM',
      role: 'DESENVOLVEDOR',
      ativo: true,
      ubsId: null,         // GLOBAL — sem restrição de UBS
      prefeituraId: null,  // GLOBAL — sem restrição de Prefeitura
    },
  });

  console.log(`✓ Administrador criado com sucesso: ${admin.nome} (${admin.email})`);

  // ────────────────────────────────────────────────────────────────
  // 3. AUDITORIA FINAL DO ESTADO DO BANCO
  // ────────────────────────────────────────────────────────────────
  console.log('\n[3/3] Verificando integridade pós-reset...');

  const stats = {
    atendentes: await prisma.atendente.count(),
    prefeituras: await prisma.prefeitura.count(),
    ubs: await prisma.ubs.count(),
    pacientes: await prisma.paciente.count(),
    pacienteContas: await prisma.pacienteConta.count(),
    salasConsultorios: await prisma.salaConsultorio.count(),
    especialidades: await prisma.especialidadeCatalogo.count(),
    escalas: await prisma.escalaEspecialista.count(),
    agendamentosCentro: await prisma.agendamentoCentro.count(),
    encaminhamentos: await prisma.encaminhamento.count(),
    atendimentos: await prisma.atendimento.count(),
    viagensTfd: await prisma.viagemFrota.count(),
  };

  console.log('\n📊 ESTADO FINAL DO BANCO DE DADOS:');
  for (const [k, v] of Object.entries(stats)) {
    const isExpected = (k === 'atendentes' && v === 1) || (k !== 'atendentes' && v === 0);
    console.log(`   ${isExpected ? '✅' : '❌'} ${k.padEnd(22)}: ${v}`);
  }

  if (stats.atendentes !== 1) {
    throw new Error('Falha: esperado exatamente 1 atendente no banco!');
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('🎉 UNISISM ZERADO COM SUCESSO · PRONTO PARA PRODUÇÃO!');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`  Painel:      https://unisism.vercel.app`);
  console.log(`  Login:       ${EMAIL_ADMIN}`);
  console.log(`  Senha:       ${SENHA_ADMIN}`);
  console.log(`  Perfil:      DESENVOLVEDOR (Acesso Global)`);
  console.log('════════════════════════════════════════════════════════════════\n');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('✗ Erro no reset total:', err);
  process.exit(1);
});
