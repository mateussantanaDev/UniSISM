// IMPORT FIRST: OpenTelemetry deve carregar antes de tudo pra instrumentar.
import './tracing';

import { buildApp } from './app';
import { env } from '../shared/env';
import { logger } from '../infrastructure/logger';
import { prisma } from '../infrastructure/database/prisma';
import { getCache } from '../infrastructure/cache/Cache';
import { aplicarTriggersImutabilidade, checarTriggersAtivos } from './bootstrapTriggers';
import { bootstrapAssinaturaTfd } from '../modules/tfd/infrastructure/TfdSignatureService';
import { SaldoMensalCron } from '../modules/tfd/infrastructure/SaldoMensalCron';

async function main() {
  // ----- Production bootstraps (devem rodar ANTES do app subir) -----
  // 1) Triggers de imutabilidade dos audit logs (idempotente).
  await aplicarTriggersImutabilidade();
  const trig = await checarTriggersAtivos();
  if (!trig.tfdAuditOk || !trig.prontuarioAuditOk) {
    if (env.NODE_ENV === 'production') {
      logger.error(trig, '✗ triggers de imutabilidade NÃO ativos em produção');
      process.exit(1);
    }
    logger.warn(trig, '⚠️  triggers de imutabilidade incompletos (DEV)');
  }
  // 2) Cert ICP-Brasil (fail-fast em produção se TFD_SIGN_REQUIRED=true)
  bootstrapAssinaturaTfd();

  const { app, container } = buildApp();

  const server = app.listen(env.PORT, () => {
    logger.info(
      {
        url: `http://localhost:${env.PORT}/v1`,
        metrics: (process.env['METRICS_ENABLED'] ?? 'true') === 'true',
        redis: getCache().isReady(),
        storage: process.env['STORAGE_PROVIDER'] ?? 'disk',
        scanner: container.scanner.isAtivo() ? 'clamav' : 'noop',
      },
      'UNISISM · UBS backend escutando',
    );
  });

  // Outbox publisher — ativar se env permitir
  if ((process.env['OUTBOX_ENABLED'] ?? 'true') === 'true') {
    container.outbox.start();
  }

  // Cron diário de expiração de relatórios (§6 LGPD)
  container.relExpiracaoCron.start(60 * 60 * 1000); // roda de hora em hora

  // Cron mensal de saldos TFD (dia 1º + catch-up no boot)
  const saldoCron = new SaldoMensalCron();
  saldoCron.start();

  // Cron de purga de PacienteRecoveryToken expirados/usados (a cada 6h + catch-up)
  container.recoveryTokenPurgeCron.start();

  // Push dispatcher worker (polling 15s) — envia notificações pendentes via ntfy.sh
  if ((process.env['PUSH_DISPATCHER_ENABLED'] ?? 'true') === 'true') {
    container.pushDispatcher.start();
  }
  // Cron mensal de cleanup de dispositivos push inativos
  container.pushCleanupCron.start();

  const shutdown = async (signal: string) => {
    logger.warn({ signal }, 'graceful shutdown iniciado');
    container.outbox.stop();
    container.relExpiracaoCron.stop();
    saldoCron.stop();
    container.recoveryTokenPurgeCron.stop();
    container.pushCleanupCron.stop();
    void container.pushDispatcher.stop();
    server.close(async (err) => {
      if (err) logger.error({ err }, 'erro ao fechar HTTP server');
      try {
        await getCache().quit();
        await prisma.$disconnect();
      } finally {
        process.exit(err ? 1 : 0);
      }
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Trigger: cria uma viagem para o motorista e um encaminhamento para o paciente cadastrados
  void createTripAndReferralOnStartup();
}

async function createTripAndReferralOnStartup() {
  try {
    // Alinha criadoEm com o evento CRIADO da timeline para consistência histórica
    const todosEncaminhamentos = await prisma.encaminhamento.findMany({
      include: {
        timeline: {
          where: { tipo: 'CRIADO' },
          take: 1,
        }
      }
    });
    for (const e of todosEncaminhamentos) {
      const criadoEvt = e.timeline[0];
      if (criadoEvt && e.criadoEm.getTime() !== criadoEvt.em.getTime()) {
        await prisma.encaminhamento.update({
          where: { id: e.id },
          data: { criadoEm: criadoEvt.em },
        });
      }
    }

    logger.info('→ [Startup Trigger] Buscando motorista e paciente cadastrados...');
    
    // 1) Find the first driver (MotoristaTFD)
    const motorista = await prisma.motoristaTFD.findFirst({
      where: { deletadoEm: null },
      include: { prefeitura: true }
    });
    
    // 2) Find the first patient (Paciente)
    const paciente = await prisma.paciente.findFirst({
      where: { deletadoEm: null },
      include: { ubs: true }
    });

    if (!motorista || !paciente) {
      logger.warn(
        { motorista: !!motorista, paciente: !!paciente },
        '⚠️ [Startup Trigger] Motorista ou paciente não encontrado no banco. Pulando criação automática.'
      );
      return;
    }

    // 3) Find the first vehicle (VeiculoTFD)
    const veiculo = await prisma.veiculoTFD.findFirst({
      where: { prefeituraId: motorista.prefeituraId, status: 'ATIVO', deletadoEm: null }
    });
    if (!veiculo) {
      logger.warn('⚠️ [Startup Trigger] Nenhum veículo ativo encontrado para a prefeitura. Pulando.');
      return;
    }

    // 4) Find the first developer atendente (Atendente) to act as creator
    const atendente = await prisma.atendente.findFirst({
      where: { role: 'DESENVOLVEDOR', ativo: true, deletadoEm: null }
    });
    if (!atendente) {
      logger.warn('⚠️ [Startup Trigger] Nenhum atendente DESENVOLVEDOR ativo encontrado. Pulando.');
      return;
    }

    // 5) Create a new Trip (ViagemFrota)
    const dataViagem = new Date();
    dataViagem.setDate(dataViagem.getDate() + 5); // 5 days in the future
    dataViagem.setUTCHours(0, 0, 0, 0);

    const viagemExistente = await prisma.viagemFrota.findFirst({
      where: {
        motoristaId: motorista.id,
        data: dataViagem,
        destino: 'Caruaru',
        observacoes: 'Viagem criada automaticamente no boot do backend.',
      }
    });

    if (!viagemExistente) {
      const viagem = await prisma.viagemFrota.create({
        data: {
          prefeituraId: motorista.prefeituraId,
          data: dataViagem,
          horaSaida: '08:00',
          horaPrevistaRetorno: '18:00',
          veiculoId: veiculo.id,
          motoristaId: motorista.id,
          destino: 'Caruaru',
          unidadeDestino: 'Hospital Regional do Agreste',
          rotaResumo: 'Águas Belas → Garanhuns → Caruaru',
          kmEstimados: 160,
          vagasTotais: 15,
          observacoes: 'Viagem criada automaticamente no boot do backend.',
          status: 'AGENDADA',
          criadaPorId: atendente.id,
        }
      });
      logger.info({ viagemId: viagem.id }, '✓ [Startup Trigger] Nova viagem criada com sucesso para o motorista João Pedro.');
    } else {
      logger.info({ viagemId: viagemExistente.id }, '· [Startup Trigger] Viagem automática para este motorista nesta data já existe. Pulando.');
    }

    // 6) Create a new Referral (Encaminhamento)
    const encaminhamentoExistente = await prisma.encaminhamento.findFirst({
      where: {
        pacienteId: paciente.id,
        medicoSolicitante: 'Dr. Startup Bot',
        especialidadeSolicitada: 'Ortopedia',
      }
    });

    if (!encaminhamentoExistente) {
      const ano = new Date().getUTCFullYear();
      const chave = `UBS-${ano}`;
      const seq = await prisma.sequencialProtocolo.upsert({
        where: { chave },
        create: { chave, valor: 1 },
        update: { valor: { increment: 1 } },
      });
      const protocolo = `UBS-${ano}-${String(seq.valor).padStart(6, '0')}`;

      const encaminhamento = await prisma.encaminhamento.create({
        data: {
          protocolo,
          status: 'AGUARDANDO_REGULACAO',
          pacienteId: paciente.id,
          pacienteNome: paciente.nome,
          pacienteCpf: paciente.cpf,
          pacienteCartaoSus: paciente.cartaoSus ?? '000000000000000',
          pacienteDataNascimento: paciente.dataNascimento,
          pacienteSexo: paciente.sexo,
          pacienteTelefone: paciente.telefone ?? '',
          pacienteEndereco: paciente.endereco ?? '',
          medicoSolicitante: 'Dr. Startup Bot',
          crm: 'CRM-PE 99999',
          especialidadeSolicitada: 'Ortopedia',
          cid10: 'M54.5',
          cidDescricao: 'Dor lombar baixa',
          justificativaClinica: 'Paciente necessita de avaliação especializada para dor lombar crônica refratária.',
          prioridade: 'ELETIVA',
          dataSolicitacao: new Date(),
          unidadeOrigem: paciente.ubs.nome,
          atendenteResponsavel: atendente.nome,
          ubsId: paciente.ubsId,
          atendenteId: atendente.id,
        }
      });
      logger.info({ encaminhamentoId: encaminhamento.id, protocolo }, '✓ [Startup Trigger] Novo encaminhamento criado com sucesso para o paciente Mateus Santana.');
    } else {
      logger.info(
        { encaminhamentoId: encaminhamentoExistente.id, protocolo: encaminhamentoExistente.protocolo },
        '· [Startup Trigger] Encaminhamento automático para este paciente já existe. Pulando.'
      );
    }

    // 7) Create 12 Historical Referrals for realistic KPI metrics
    const seedReferrals = [
      {
        protocolo: 'UBS-2026-900001',
        status: 'APROVADO',
        especialidade: 'Cardiologia',
        criadoOffsetHours: 5,
        resolvidoOffsetHours: 4,
        tipoFim: 'APROVADO',
      },
      {
        protocolo: 'UBS-2026-900002',
        status: 'APROVADO',
        especialidade: 'Dermatologia',
        criadoOffsetHours: 10,
        resolvidoOffsetHours: 9,
        tipoFim: 'APROVADO',
      },
      {
        protocolo: 'UBS-2026-900003',
        status: 'APROVADO',
        especialidade: 'Ginecologia',
        criadoOffsetHours: 15,
        resolvidoOffsetHours: 13.5,
        tipoFim: 'APROVADO',
      },
      {
        protocolo: 'UBS-2026-900004',
        status: 'REJEITADO',
        especialidade: 'Pediatria',
        criadoOffsetHours: 20,
        resolvidoOffsetHours: 18,
        tipoFim: 'REJEITADO',
      },
      {
        protocolo: 'UBS-2026-900005',
        status: 'APROVADO',
        especialidade: 'Oftalmologia',
        criadoOffsetHours: 25,
        resolvidoOffsetHours: 23,
        tipoFim: 'APROVADO',
      },
      {
        protocolo: 'UBS-2026-900006',
        status: 'APROVADO',
        especialidade: 'Neurologia',
        criadoOffsetHours: 30,
        resolvidoOffsetHours: 27,
        tipoFim: 'APROVADO',
      },
      {
        protocolo: 'UBS-2026-900007',
        status: 'APROVADO',
        especialidade: 'Urologia',
        criadoOffsetHours: 35,
        resolvidoOffsetHours: 31,
        tipoFim: 'APROVADO',
      },
      {
        protocolo: 'UBS-2026-900008',
        status: 'APROVADO',
        especialidade: 'Endocrinologia',
        criadoOffsetHours: 40,
        resolvidoOffsetHours: 35,
        tipoFim: 'APROVADO',
      },
      {
        protocolo: 'UBS-2026-900009',
        status: 'APROVADO',
        especialidade: 'Ortopedia',
        criadoOffsetHours: 45,
        resolvidoOffsetHours: 40,
        tipoFim: 'APROVADO',
      },
      {
        protocolo: 'UBS-2026-900010',
        status: 'PENDENCIA_DOCUMENTO',
        especialidade: 'Psiquiatria',
        criadoOffsetHours: 48,
        resolvidoOffsetHours: 46, // 2 hours wait in queue
        tipoFim: 'PENDENCIA_REGISTRADA',
      },
      {
        protocolo: 'UBS-2026-900011',
        status: 'AGUARDANDO_REGULACAO',
        especialidade: 'Gastrenterologia',
        criadoOffsetHours: 3,
        resolvidoOffsetHours: null,
        tipoFim: null,
      },
      {
        protocolo: 'UBS-2026-900012',
        status: 'APROVADO',
        especialidade: 'Reumatologia',
        criadoOffsetHours: 72,
        resolvidoOffsetHours: 4, // 68 hours wait in queue (outside SLA!)
        tipoFim: 'APROVADO',
      },
    ];

    const now = new Date();
    for (const item of seedReferrals) {
      const criadoEm = new Date(now.getTime() - item.criadoOffsetHours * 60 * 60 * 1000);
      const atualizadoEm = item.resolvidoOffsetHours !== null
        ? new Date(now.getTime() - item.resolvidoOffsetHours * 60 * 60 * 1000)
        : criadoEm;

      const existe = await prisma.encaminhamento.findUnique({
        where: { protocolo: item.protocolo }
      });
      if (existe) continue;

      const timelineData = [
        {
          tipo: 'CRIADO' as const,
          titulo: 'Encaminhamento criado',
          descricao: `Protocolo ${item.protocolo} aberto pelo atendente`,
          autor: atendente.nome,
          autorPapel: `Atendente · ${paciente.ubs.nome}`,
          em: criadoEm,
        },
        {
          tipo: 'ENVIADO_REGULACAO' as const,
          titulo: 'Enviado à Regulação',
          descricao: 'Encaminhamento entrou na fila de regulação',
          autor: 'SISTEMA',
          autorPapel: 'Sistema UNISISM',
          em: criadoEm,
        },
      ];

      if (item.tipoFim) {
        let titulo = '';
        let descricao = '';
        if (item.tipoFim === 'APROVADO') {
          titulo = 'Encaminhamento aprovado';
          descricao = 'Aprovado pela Regulação';
        } else if (item.tipoFim === 'REJEITADO') {
          titulo = 'Encaminhamento rejeitado';
          descricao = 'Rejeitado pela Regulação';
        } else if (item.tipoFim === 'PENDENCIA_REGISTRADA') {
          titulo = 'Pendência registrada pela Regulação';
          descricao = 'Solicitada correção documental';
        }

        timelineData.push({
          tipo: item.tipoFim as any,
          titulo,
          descricao,
          autor: 'Regulador Seed',
          autorPapel: 'Regulação · SMS',
          em: atualizadoEm,
        });
      }

      await prisma.encaminhamento.create({
        data: {
          protocolo: item.protocolo,
          status: item.status as any,
          pacienteId: paciente.id,
          pacienteNome: paciente.nome,
          pacienteCpf: paciente.cpf,
          pacienteCartaoSus: paciente.cartaoSus ?? '000000000000000',
          pacienteDataNascimento: paciente.dataNascimento,
          pacienteSexo: paciente.sexo,
          pacienteTelefone: paciente.telefone ?? '',
          pacienteEndereco: paciente.endereco ?? '',
          medicoSolicitante: 'Dr. Seed Regulacao',
          crm: 'CRM-PE 12345',
          especialidadeSolicitada: item.especialidade,
          cid10: 'M54.5',
          cidDescricao: 'Dor lombar baixa',
          justificativaClinica: 'Solicitação clínica para fins de seed e cálculo de métricas de regulação.',
          prioridade: 'ELETIVA',
          dataSolicitacao: criadoEm,
          unidadeOrigem: paciente.ubs.nome,
          atendenteResponsavel: atendente.nome,
          ubsId: paciente.ubsId,
          atendenteId: atendente.id,
          criadoEm,
          atualizadoEm,
          timeline: {
            create: timelineData,
          },
        },
      });
    }

  } catch (err) {
    logger.error({ err }, '✗ [Startup Trigger] Erro ao criar viagem e encaminhamento no startup');
  }
}

main().catch((err) => {
  logger.error({ err }, 'falha fatal ao iniciar o servidor');
  process.exit(1);
});
