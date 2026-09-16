import { prisma } from '../../../../infrastructure/database/prisma';
import { NotFound, BadRequest } from '../../../../shared/errors';
import type { AccessScope } from '../../../../shared/scope';
import { logger } from '../../../../infrastructure/logger';
import { WhatsAppCloudApiService } from '../../../../infrastructure/services/WhatsAppCloudApiService';

export interface SalvarConfigInput {
  phoneNumberId: string;
  wabaId?: string;
  accessToken: string;
  webhookVerifyToken: string;
  businessPhoneNumber?: string;
  nomeExibicao?: string;
  ativo?: boolean;
  mensagemBoasVindas?: string;
  mensagemForaHorario?: string;
  mensagemConfirmacao?: string;
  horarioInicio?: string;
  horarioFim?: string;
}

export interface ListarConversasInput {
  aba?: 'MINHAS' | 'PENDENTES' | 'TODAS' | 'RESOLVIDAS';
  busca?: string;
  centroTipo?: 'CEM' | 'CEO' | 'TODOS';
  tag?: string;
  limite?: number;
  offset?: number;
}

export interface EnviarMensagemInput {
  conversaId: string;
  corpo: string;
  tipo?: 'TEXTO' | 'IMAGEM' | 'DOCUMENTO' | 'TEMPLATE';
  mediaUrl?: string;
}

export interface EnviarTemplateInput {
  conversaId: string;
  tipoTemplate: 'CONFIRMACAO_CONSULTA' | 'LEMBRETE_VESPERA' | 'VAGA_LIBERADA' | 'ORIENTACOES_PREPARO' | 'PERSONALIZADO';
  variaveis: {
    nome?: string;
    especialidade?: string;
    medico?: string;
    data?: string;
    hora?: string;
    local?: string;
    protocolo?: string;
    textoExtra?: string;
  };
}

export class WhatsAppCrmUseCase {
  constructor(private readonly metaApi: WhatsAppCloudApiService = new WhatsAppCloudApiService()) {}

  /**
   * Obtém a configuração ativa do WhatsApp da prefeitura ou cria um registro padrão inicial.
   */
  async obterConfig(prefeituraId?: string | null) {
    try {
      let config = await prisma.whatsAppConfig.findFirst({
        where: prefeituraId ? { OR: [{ prefeituraId }, { prefeituraId: null }] } : {},
        orderBy: { updatedAt: 'desc' },
      });

      if (!config) {
        config = await prisma.whatsAppConfig.create({
          data: {
            prefeituraId: prefeituraId || null,
            phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || 'MOCK_PHONE_ID_1001',
            wabaId: process.env.WHATSAPP_WABA_ID || 'MOCK_WABA_ID_2001',
            accessToken: process.env.WHATSAPP_ACCESS_TOKEN || 'MOCK_ACCESS_TOKEN_EAAB...',
            webhookVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'unisism_meta_verify_token_2026',
            businessPhoneNumber: '+55 75 99999-0000',
            nomeExibicao: 'Central de Especialidades Médicas e Odontológicas',
            ativo: true,
            horarioInicio: '07:00',
            horarioFim: '18:00',
          },
        });
      }

      // Oculta parte do token de acesso por segurança
      return {
        ...config,
        accessTokenMascarado: config.accessToken
          ? `${config.accessToken.slice(0, 8)}...${config.accessToken.slice(-6)}`
          : '',
      };
    } catch (err: any) {
      logger.warn(`[WhatsAppCrm] Erro ao obter config: ${err?.message}`);
      return {
        id: 'mock-config-id',
        prefeituraId: prefeituraId || null,
        phoneNumberId: 'MOCK_PHONE_ID_1001',
        wabaId: 'MOCK_WABA_ID_2001',
        accessToken: 'MOCK_ACCESS_TOKEN',
        accessTokenMascarado: 'MOCK_ACC...TOKEN',
        webhookVerifyToken: 'unisism_meta_verify_token_2026',
        businessPhoneNumber: '+55 75 99999-0000',
        nomeExibicao: 'Central de Regulação e Especialidades',
        ativo: true,
        horarioInicio: '07:00',
        horarioFim: '18:00',
        mensagemBoasVindas: 'Olá! Bem-vindo(a) ao canal oficial de atendimento do Centro de Especialidades. Como podemos ajudar?',
        mensagemForaHorario: 'Olá! Nosso horário de atendimento é das 07:00 às 18:00. Retornaremos em breve.',
        mensagemConfirmacao: 'Olá, {{nome}}! Confirmamos sua consulta de {{especialidade}} com {{medico}} para o dia {{data}} às {{hora}}. Responda SIM para confirmar ou NÃO para reagendar.',
      };
    }
  }

  /**
   * Salva as credenciais da Meta Cloud API.
   */
  async salvarConfig(input: SalvarConfigInput, prefeituraId?: string | null) {
    if (!input.phoneNumberId || !input.accessToken || !input.webhookVerifyToken) {
      throw new BadRequest('Phone Number ID, Access Token e Webhook Verify Token são obrigatórios.');
    }

    try {
      const configExistente = await prisma.whatsAppConfig.findFirst({
        where: prefeituraId ? { OR: [{ prefeituraId }, { prefeituraId: null }] } : {},
      });

      if (configExistente) {
        return await prisma.whatsAppConfig.update({
          where: { id: configExistente.id },
          data: {
            phoneNumberId: input.phoneNumberId.trim(),
            wabaId: input.wabaId?.trim() || null,
            accessToken: input.accessToken.trim(),
            webhookVerifyToken: input.webhookVerifyToken.trim(),
            businessPhoneNumber: input.businessPhoneNumber?.trim() || null,
            nomeExibicao: input.nomeExibicao?.trim() || null,
            ativo: input.ativo !== undefined ? input.ativo : true,
            mensagemBoasVindas: input.mensagemBoasVindas,
            mensagemForaHorario: input.mensagemForaHorario,
            mensagemConfirmacao: input.mensagemConfirmacao,
            horarioInicio: input.horarioInicio || '07:00',
            horarioFim: input.horarioFim || '18:00',
          },
        });
      }

      return await prisma.whatsAppConfig.create({
        data: {
          prefeituraId: prefeituraId || null,
          phoneNumberId: input.phoneNumberId.trim(),
          wabaId: input.wabaId?.trim() || null,
          accessToken: input.accessToken.trim(),
          webhookVerifyToken: input.webhookVerifyToken.trim(),
          businessPhoneNumber: input.businessPhoneNumber?.trim() || null,
          nomeExibicao: input.nomeExibicao?.trim() || null,
          ativo: input.ativo !== undefined ? input.ativo : true,
          mensagemBoasVindas: input.mensagemBoasVindas,
          mensagemForaHorario: input.mensagemForaHorario,
          mensagemConfirmacao: input.mensagemConfirmacao,
          horarioInicio: input.horarioInicio || '07:00',
          horarioFim: input.horarioFim || '18:00',
        },
      });
    } catch (err: any) {
      logger.error(`[WhatsAppCrm] Erro ao salvar config: ${err?.message}`);
      throw new BadRequest(`Erro ao persistir configuração: ${err?.message}`);
    }
  }

  /**
   * Testa a conectividade com a API oficial da Meta.
   */
  async testarConexao(prefeituraId?: string | null) {
    const config = await this.obterConfig(prefeituraId);
    return await this.metaApi.testConnection({
      phoneNumberId: config.phoneNumberId,
      accessToken: config.accessToken,
    });
  }

  /**
   * Lista as conversas com suporte a abas de múltiplos atendentes, busca e filtros.
   */
  async listarConversas(input: ListarConversasInput, scope: AccessScope, atendenteIdLogado?: string) {
    const aba = input.aba || 'TODAS';
    const where: any = {};

    if (scope.kind === 'PREFEITURA') {
      where.OR = [{ prefeituraId: scope.prefeituraId }, { prefeituraId: null }];
    }

    if (input.centroTipo && input.centroTipo !== 'TODOS') {
      where.centroTipo = input.centroTipo;
    }

    if (input.tag) {
      where.tags = { has: input.tag };
    }

    if (input.busca && input.busca.trim()) {
      const q = input.busca.trim();
      where.OR = [
        { nomeContato: { contains: q, mode: 'insensitive' } },
        { telefone: { contains: q } },
        { cpf: { contains: q } },
        { ultimaMensagemTexto: { contains: q, mode: 'insensitive' } },
      ];
    }

    // Filtros por aba
    if (aba === 'MINHAS' && atendenteIdLogado) {
      where.atendenteId = atendenteIdLogado;
      where.status = { notIn: ['RESOLVIDO', 'FINALIZADO'] };
    } else if (aba === 'PENDENTES') {
      where.status = 'PENDENTE';
    } else if (aba === 'RESOLVIDAS') {
      where.status = { in: ['RESOLVIDO', 'FINALIZADO'] };
    } else if (aba === 'TODAS') {
      // Exibe ativas primeiro ou todas
      where.status = { notIn: ['FINALIZADO'] };
    }

    try {
      const [conversas, totalPendentes, minhasAtivas, totalHoje] = await Promise.all([
        prisma.whatsAppConversa.findMany({
          where,
          orderBy: { ultimaMensagemData: 'desc' },
          take: input.limite || 50,
          skip: input.offset || 0,
          include: {
            paciente: {
              select: { id: true, nome: true, cpf: true, cartaoSus: true, telefone: true, dataNascimento: true },
            },
          },
        }),
        prisma.whatsAppConversa.count({
          where: {
            ...(scope.kind === 'PREFEITURA' ? { prefeituraId: scope.prefeituraId } : {}),
            status: 'PENDENTE',
          },
        }),
        atendenteIdLogado
          ? prisma.whatsAppConversa.count({
              where: {
                atendenteId: atendenteIdLogado,
                status: 'EM_ATENDIMENTO',
              },
            })
          : 0,
        prisma.whatsAppConversa.count({
          where: {
            ...(scope.kind === 'PREFEITURA' ? { prefeituraId: scope.prefeituraId } : {}),
            createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          },
        }),
      ]);

      return {
        conversas,
        metricas: {
          totalPendentes,
          minhasAtivas,
          totalHoje,
        },
      };
    } catch (err: any) {
      logger.warn(`[WhatsAppCrm] Erro listar conversas: ${err?.message}`);
      return {
        conversas: [],
        metricas: { totalPendentes: 0, minhasAtivas: 0, totalHoje: 0 },
      };
    }
  }

  /**
   * Obtém os dados completos de uma conversa e seu histórico de mensagens ordenado.
   */
  async obterConversaPorId(conversaId: string) {
    try {
      const conversa = await prisma.whatsAppConversa.findUnique({
        where: { id: conversaId },
        include: {
          paciente: {
            select: {
              id: true,
              nome: true,
              cpf: true,
              cartaoSus: true,
              telefone: true,
              dataNascimento: true,
              municipio: true,
              bairro: true,
              ubs: { select: { id: true, nome: true } },
            },
          },
          mensagens: {
            orderBy: { enviadoEm: 'asc' },
          },
        },
      });

      if (!conversa) throw new NotFound('Conversa não encontrada.');

      // Zera contador de não lidas quando o operador abre o chat
      if (conversa.naoLidas > 0) {
        await prisma.whatsAppConversa.update({
          where: { id: conversaId },
          data: { naoLidas: 0 },
        });
      }

      // Se conversa tem encaminhamento vinculado, busca resumo
      let encaminhamento = null;
      if (conversa.encaminhamentoId) {
        encaminhamento = await prisma.encaminhamento.findUnique({
          where: { id: conversa.encaminhamentoId },
          select: {
            id: true,
            protocolo: true,
            especialidade: true,
            profissionalAgendado: true,
            agendamentoPrevisto: true,
            status: true,
            prioridade: true,
            salaNumero: true,
          },
        });
      }

      return {
        ...conversa,
        encaminhamento,
      };
    } catch (err: any) {
      if (err instanceof NotFound) throw err;
      throw new BadRequest(`Erro ao obter conversa: ${err?.message}`);
    }
  }

  /**
   * O atendente assume uma conversa da fila.
   */
  async assumirConversa(conversaId: string, atendenteId: string, atendenteNome: string) {
    try {
      const conversa = await prisma.whatsAppConversa.update({
        where: { id: conversaId },
        data: {
          atendenteId,
          atendenteNome,
          status: 'EM_ATENDIMENTO',
        },
      });

      // Registra mensagem de sistema no histórico da conversa
      await prisma.whatsAppMensagem.create({
        data: {
          conversaId,
          direcao: 'SAIDA',
          origem: 'SISTEMA_BOT',
          corpo: `Atendimento iniciado por ${atendenteNome}.`,
          tipo: 'TEXTO',
          statusEnvio: 'ENTREGUE',
        },
      });

      return conversa;
    } catch (err: any) {
      throw new BadRequest(`Erro ao assumir conversa: ${err?.message}`);
    }
  }

  /**
   * Transfere o atendimento para outro colega.
   */
  async transferirConversa(
    conversaId: string,
    novoAtendenteId: string,
    novoAtendenteNome: string,
    transferidoPorNome: string,
  ) {
    try {
      const conversa = await prisma.whatsAppConversa.update({
        where: { id: conversaId },
        data: {
          atendenteId: novoAtendenteId,
          atendenteNome: novoAtendenteNome,
          status: 'EM_ATENDIMENTO',
        },
      });

      await prisma.whatsAppMensagem.create({
        data: {
          conversaId,
          direcao: 'SAIDA',
          origem: 'SISTEMA_BOT',
          corpo: `Atendimento transferido por ${transferidoPorNome} para ${novoAtendenteNome}.`,
          tipo: 'TEXTO',
          statusEnvio: 'ENTREGUE',
        },
      });

      return conversa;
    } catch (err: any) {
      throw new BadRequest(`Erro ao transferir conversa: ${err?.message}`);
    }
  }

  /**
   * Envia uma mensagem de texto pelo atendente via Meta Cloud API.
   */
  async enviarMensagem(input: EnviarMensagemInput, atendenteId: string, atendenteNome: string) {
    if (!input.corpo || !input.corpo.trim()) {
      throw new BadRequest('O corpo da mensagem não pode estar vazio.');
    }

    const conversa = await prisma.whatsAppConversa.findUnique({
      where: { id: input.conversaId },
    });
    if (!conversa) throw new NotFound('Conversa não encontrada.');

    const config = await this.obterConfig(conversa.prefeituraId);

    // 1. Salva mensagem pendente no banco
    const mensagemCriada = await prisma.whatsAppMensagem.create({
      data: {
        conversaId: conversa.id,
        direcao: 'SAIDA',
        origem: 'ATENDENTE',
        atendenteId,
        atendenteNome,
        corpo: input.corpo.trim(),
        tipo: input.tipo || 'TEXTO',
        mediaUrl: input.mediaUrl || null,
        statusEnvio: 'PENDENTE',
      },
    });

    // 2. Dispara via Meta Cloud API
    const envioResult = await this.metaApi.sendTextMessage({
      phoneNumberId: config.phoneNumberId,
      accessToken: config.accessToken,
      to: conversa.telefone,
      text: input.corpo.trim(),
    });

    // 3. Atualiza status da mensagem e resumo da conversa
    const statusFinal = envioResult.success ? 'ENVIADO' : 'FALHA';
    const mensagemAtualizada = await prisma.whatsAppMensagem.update({
      where: { id: mensagemCriada.id },
      data: {
        statusEnvio: statusFinal,
        whatsappMessageId: envioResult.messageId || null,
        erroEnvio: envioResult.error || null,
      },
    });

    await prisma.whatsAppConversa.update({
      where: { id: conversa.id },
      data: {
        ultimaMensagemTexto: input.corpo.trim(),
        ultimaMensagemData: new Date(),
        status: conversa.status === 'PENDENTE' ? 'EM_ATENDIMENTO' : conversa.status,
        atendenteId: conversa.atendenteId || atendenteId,
        atendenteNome: conversa.atendenteNome || atendenteNome,
      },
    });

    return mensagemAtualizada;
  }

  /**
   * Dispara template pré-configurado de agendamento, lembrete ou orientação.
   */
  async enviarTemplate(input: EnviarTemplateInput, atendenteId: string, atendenteNome: string) {
    const conversa = await prisma.whatsAppConversa.findUnique({
      where: { id: input.conversaId },
    });
    if (!conversa) throw new NotFound('Conversa não encontrada.');

    const v = input.variaveis;
    let texto = '';

    switch (input.tipoTemplate) {
      case 'CONFIRMACAO_CONSULTA':
        texto = `Olá, *${v.nome || conversa.nomeContato}*!\n\nConfirmamos o agendamento da sua consulta no *Centro de Especialidades*:\n\n🩺 *Especialidade:* ${v.especialidade || 'Consulta Médica'}\n👨‍⚕️ *Profissional:* ${v.medico || 'Especialista'}\n📅 *Data:* ${v.data || 'A definir'}\n⏰ *Horário:* ${v.hora || 'Conforme agendado'}\n📍 *Local:* ${v.local || 'Centro de Especialidades'}\n\n👉 Por favor, responda com *SIM* para confirmar sua presença ou *NÃO* caso precise reagendar.`;
        break;
      case 'LEMBRETE_VESPERA':
        texto = `🔔 *Lembrete de Atendimento - UNISISM*\n\nOlá, *${v.nome || conversa.nomeContato}*!\nLembramos que sua consulta de *${v.especialidade || 'Especialidades'}* com ${v.medico || 'o especialista'} está marcada para amanhã, às *${v.hora || 'horário agendado'}*.\n\nDocumentos necessários:\n• RG e CPF\n• Cartão SUS\n• Exames anteriores pertinentes\n\nContamos com sua pontualidade!`;
        break;
      case 'VAGA_LIBERADA':
        texto = `🎉 *Boa notícia! Vaga Deferida pela Regulação SUS*\n\nOlá, *${v.nome || conversa.nomeContato}*!\nSeu encaminhamento para *${v.especialidade || 'Especialidades'}* (Protocolo: ${v.protocolo || 'SUS'}) foi aprovado pela Central de Regulação!\n\nVocê já pode comparecer à Recepção do Centro ou responder a esta mensagem para agendarmos o seu atendimento.`;
        break;
      case 'ORIENTACOES_PREPARO':
        texto = `📋 *Orientações de Preparo para Exame / Procedimento*\n\nOlá, *${v.nome || conversa.nomeContato}*!\nPara realização do seu procedimento de *${v.especialidade || 'Especialidades'}*, favor seguir as orientações abaixo:\n\n${v.textoExtra || '• Comparecer com 15 minutos de antecedência.\n• Trazer documentos pessoais e requisição médica.'}`;
        break;
      default:
        texto = v.textoExtra || 'Olá! Esta é uma notificação do Centro de Especialidades.';
    }

    return await this.enviarMensagem(
      {
        conversaId: conversa.id,
        corpo: texto,
        tipo: 'TEMPLATE',
      },
      atendenteId,
      atendenteNome,
    );
  }

  /**
   * Finaliza / resolve a conversa.
   */
  async finalizarConversa(conversaId: string, atendenteId: string, atendenteNome: string, motivo?: string) {
    try {
      const conversa = await prisma.whatsAppConversa.update({
        where: { id: conversaId },
        data: {
          status: 'FINALIZADO',
        },
      });

      await prisma.whatsAppMensagem.create({
        data: {
          conversaId,
          direcao: 'SAIDA',
          origem: 'SISTEMA_BOT',
          corpo: `Atendimento finalizado por ${atendenteNome}${motivo ? `: ${motivo}` : '.'}`,
          tipo: 'TEXTO',
          statusEnvio: 'ENTREGUE',
        },
      });

      return conversa;
    } catch (err: any) {
      throw new BadRequest(`Erro ao finalizar conversa: ${err?.message}`);
    }
  }

  /**
   * Atualiza tags da conversa.
   */
  async atualizarTags(conversaId: string, tags: string[]) {
    return await prisma.whatsAppConversa.update({
      where: { id: conversaId },
      data: { tags },
    });
  }

  /**
   * Processa Webhooks oficiais da Meta WhatsApp Cloud API (mensagens recebidas e status).
   */
  async processarWebhook(payload: any) {
    if (!payload?.entry || !Array.isArray(payload.entry)) {
      return { status: 'ignored' };
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value) continue;

        // 1. Processa status de mensagens enviadas (sent, delivered, read, failed)
        if (value.statuses && Array.isArray(value.statuses)) {
          for (const s of value.statuses) {
            const wamid = s.id;
            const metaStatus = s.status; // 'sent' | 'delivered' | 'read' | 'failed'
            let statusEnvio: any = 'ENVIADO';
            if (metaStatus === 'delivered') statusEnvio = 'ENTREGUE';
            else if (metaStatus === 'read') statusEnvio = 'LIDO';
            else if (metaStatus === 'failed') statusEnvio = 'FALHA';

            try {
              await prisma.whatsAppMensagem.updateMany({
                where: { whatsappMessageId: wamid },
                data: {
                  statusEnvio,
                  ...(s.errors ? { erroEnvio: JSON.stringify(s.errors) } : {}),
                },
              });
            } catch (err: any) {
              logger.warn(`[WhatsAppWebhook] Erro ao atualizar status wamid ${wamid}: ${err?.message}`);
            }
          }
        }

        // 2. Processa mensagens recebidas do paciente
        if (value.messages && Array.isArray(value.messages)) {
          for (const m of value.messages) {
            const fromNumber = m.from; // formato E.164 Ex: 5575999999999
            const messageId = m.id;
            const contactName =
              value.contacts?.find((c: any) => c.wa_id === fromNumber)?.profile?.name ||
              `Paciente ${fromNumber.slice(-4)}`;

            let texto = '';
            let tipo: any = 'TEXTO';
            if (m.type === 'text') {
              texto = m.text?.body || '';
            } else if (m.type === 'interactive') {
              texto = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
            } else if (m.type === 'audio') {
              texto = '[Áudio recebido]';
              tipo = 'AUDIO';
            } else if (m.type === 'image') {
              texto = '[Imagem recebida]';
              tipo = 'IMAGEM';
            } else if (m.type === 'document') {
              texto = `[Documento: ${m.document?.filename || 'arquivo'}]`;
              tipo = 'DOCUMENTO';
            } else {
              texto = `[Mensagem: ${m.type}]`;
            }

            try {
              // Verifica se mensagem já foi registrada (idempotência do webhook)
              const msgExistente = await prisma.whatsAppMensagem.findFirst({
                where: { whatsappMessageId: messageId },
              });
              if (msgExistente) continue;

              // Localiza paciente cadastrado pelo telefone
              const paciente = await prisma.paciente.findFirst({
                where: {
                  OR: [
                    { telefone: { contains: fromNumber.slice(-8) } },
                    { telefoneSecundario: { contains: fromNumber.slice(-8) } },
                  ],
                },
                select: { id: true, nome: true, cpf: true, ubs: { select: { prefeituraId: true } } },
              });

              // Localiza ou cria a conversa
              let conversa = await prisma.whatsAppConversa.findFirst({
                where: { telefone: fromNumber },
              });

              if (!conversa) {
                conversa = await prisma.whatsAppConversa.create({
                  data: {
                    prefeituraId: paciente?.ubs?.prefeituraId || null,
                    centroTipo: 'CEM',
                    pacienteId: paciente?.id || null,
                    telefone: fromNumber,
                    nomeContato: paciente?.nome || contactName,
                    cpf: paciente?.cpf || null,
                    status: 'PENDENTE',
                    ultimaMensagemTexto: texto,
                    ultimaMensagemData: new Date(),
                    naoLidas: 1,
                  },
                });
              } else {
                conversa = await prisma.whatsAppConversa.update({
                  where: { id: conversa.id },
                  data: {
                    ultimaMensagemTexto: texto,
                    ultimaMensagemData: new Date(),
                    naoLidas: { increment: 1 },
                    nomeContato: conversa.nomeContato || contactName,
                    ...(paciente && !conversa.pacienteId
                      ? { pacienteId: paciente.id, cpf: paciente.cpf }
                      : {}),
                    // Se a conversa estava finalizada, reabre para a fila de atendimento
                    ...(conversa.status === 'FINALIZADO' || conversa.status === 'RESOLVIDO'
                      ? { status: 'PENDENTE' }
                      : {}),
                  },
                });
              }

              // Grava a mensagem no histórico
              await prisma.whatsAppMensagem.create({
                data: {
                  conversaId: conversa.id,
                  direcao: 'ENTRADA',
                  origem: 'PACIENTE',
                  corpo: texto,
                  tipo,
                  whatsappMessageId: messageId,
                  statusEnvio: 'RECEBIDO',
                  enviadoEm: new Date(Number(m.timestamp) * 1000 || Date.now()),
                },
              });

              // Lógica de Automação de Palavras-Chave (SIM / CONFIRMAR / NÃO / REAGENDAR)
              const textoUpper = texto.trim().toUpperCase();
              if (['SIM', 'CONFIRMAR', 'CONFIRMO', '1'].includes(textoUpper)) {
                // Adiciona tag CONFIRMADO
                const tagsAtuais = new Set(conversa.tags);
                tagsAtuais.add('CONFIRMADO');
                await prisma.whatsAppConversa.update({
                  where: { id: conversa.id },
                  data: { tags: Array.from(tagsAtuais) },
                });

                // Envia resposta automática de confirmação
                const config = await this.obterConfig(conversa.prefeituraId);
                const msgBot = `✅ Obrigado pela confirmação, *${conversa.nomeContato}*! Sua presença foi registrada no sistema. Nos vemos no atendimento!`;

                await this.metaApi.sendTextMessage({
                  phoneNumberId: config.phoneNumberId,
                  accessToken: config.accessToken,
                  to: fromNumber,
                  text: msgBot,
                });

                await prisma.whatsAppMensagem.create({
                  data: {
                    conversaId: conversa.id,
                    direcao: 'SAIDA',
                    origem: 'SISTEMA_BOT',
                    corpo: msgBot,
                    tipo: 'TEXTO',
                    statusEnvio: 'ENVIADO',
                  },
                });
              } else if (['NÃO', 'NAO', 'CANCELAR', 'REAGENDAR', '2'].includes(textoUpper)) {
                const tagsAtuais = new Set(conversa.tags);
                tagsAtuais.add('REAGENDAMENTO_SOLICITADO');
                await prisma.whatsAppConversa.update({
                  where: { id: conversa.id },
                  data: { tags: Array.from(tagsAtuais), status: 'PENDENTE' },
                });

                const config = await this.obterConfig(conversa.prefeituraId);
                const msgBot = `Aviso registrado! Um atendente da nossa recepção entrará em contato por aqui para verificar uma nova data para você.`;

                await this.metaApi.sendTextMessage({
                  phoneNumberId: config.phoneNumberId,
                  accessToken: config.accessToken,
                  to: fromNumber,
                  text: msgBot,
                });

                await prisma.whatsAppMensagem.create({
                  data: {
                    conversaId: conversa.id,
                    direcao: 'SAIDA',
                    origem: 'SISTEMA_BOT',
                    corpo: msgBot,
                    tipo: 'TEXTO',
                    statusEnvio: 'ENVIADO',
                  },
                });
              }
            } catch (msgErr: any) {
              logger.error(`[WhatsAppWebhook] Erro ao gravar mensagem recebida: ${msgErr?.message}`);
            }
          }
        }
      }
    }

    return { status: 'processed' };
  }

  /**
   * Disparo automatizado chamado por agendamentos ou regulação.
   */
  async dispararNotificacaoAgendamento(params: {
    telefone: string;
    nomePaciente: string;
    especialidade: string;
    medico: string;
    dataIso: string;
    hora: string;
    centroTipo?: 'CEM' | 'CEO';
    encaminhamentoId?: string;
    prefeituraId?: string | null;
  }) {
    if (!params.telefone) return;

    try {
      const config = await this.obterConfig(params.prefeituraId);
      if (!config.ativo) return;

      const cleanPhone = this.metaApi.normalizarTelefoneE164(params.telefone);
      if (cleanPhone.length < 10) return;

      // Localiza ou cria conversa
      let conversa = await prisma.whatsAppConversa.findFirst({
        where: { telefone: cleanPhone },
      });

      if (!conversa) {
        conversa = await prisma.whatsAppConversa.create({
          data: {
            prefeituraId: params.prefeituraId || null,
            centroTipo: params.centroTipo || 'CEM',
            telefone: cleanPhone,
            nomeContato: params.nomePaciente,
            encaminhamentoId: params.encaminhamentoId || null,
            tags: ['AGENDAMENTO'],
            status: 'PENDENTE',
            naoLidas: 0,
          },
        });
      }

      await this.enviarTemplate(
        {
          conversaId: conversa.id,
          tipoTemplate: 'CONFIRMACAO_CONSULTA',
          variaveis: {
            nome: params.nomePaciente,
            especialidade: params.especialidade,
            medico: params.medico,
            data: new Date(params.dataIso).toLocaleDateString('pt-BR'),
            hora: params.hora,
            local: params.centroTipo === 'CEO' ? 'Centro Odontológico Especializado (CEO)' : 'Centro de Especialidades Médicas (CEM)',
          },
        },
        'SISTEMA',
        'Automação UNISISM',
      );
    } catch (err: any) {
      logger.warn(`[WhatsAppCrm] Falha no disparo de notificação: ${err?.message}`);
    }
  }
}
