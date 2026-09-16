import type { Request, Response } from 'express';
import { z } from 'zod';
import { paramString } from '../../../../shared/http';
import { scopeFromRequest } from '../../../../shared/requestScope';
import type { IAtendenteRepository } from '../../../../domain/repositories/IAtendenteRepository';
import type { WhatsAppCrmUseCase } from '../../application/use-cases/WhatsAppCrmUseCase';
import { logger } from '../../../../infrastructure/logger';

const salvarConfigSchema = z.object({
  phoneNumberId: z.string().min(1),
  wabaId: z.string().optional(),
  accessToken: z.string().min(1),
  webhookVerifyToken: z.string().min(1),
  businessPhoneNumber: z.string().optional(),
  nomeExibicao: z.string().optional(),
  ativo: z.boolean().optional(),
  mensagemBoasVindas: z.string().optional(),
  mensagemForaHorario: z.string().optional(),
  mensagemConfirmacao: z.string().optional(),
  horarioInicio: z.string().optional(),
  horarioFim: z.string().optional(),
});

const enviarMensagemSchema = z.object({
  corpo: z.string().min(1),
  tipo: z.enum(['TEXTO', 'IMAGEM', 'DOCUMENTO', 'TEMPLATE']).optional(),
  mediaUrl: z.string().url().optional(),
});

const enviarTemplateSchema = z.object({
  tipoTemplate: z.enum([
    'CONFIRMACAO_CONSULTA',
    'LEMBRETE_VESPERA',
    'VAGA_LIBERADA',
    'ORIENTACOES_PREPARO',
    'PERSONALIZADO',
  ]),
  variaveis: z.object({
    nome: z.string().optional(),
    especialidade: z.string().optional(),
    medico: z.string().optional(),
    data: z.string().optional(),
    hora: z.string().optional(),
    local: z.string().optional(),
    protocolo: z.string().optional(),
    textoExtra: z.string().optional(),
  }),
});

const transferirSchema = z.object({
  novoAtendenteId: z.string().min(1),
  novoAtendenteNome: z.string().min(1),
});

const finalizarSchema = z.object({
  motivo: z.string().optional(),
});

const atualizarTagsSchema = z.object({
  tags: z.array(z.string()),
});

export class WhatsAppCrmController {
  constructor(
    private readonly whatsAppCrmUC: WhatsAppCrmUseCase,
    private readonly atendentes: IAtendenteRepository,
  ) {}

  private async getAtendenteDados(req: Request) {
    const atendenteId = req.auth?.sub || 'ATENDENTE_ANONIMO';
    let atendenteNome = 'Atendente Central';
    try {
      if (req.auth?.sub) {
        const at = await this.atendentes.buscarPorId(req.auth.sub);
        if (at?.nome) atendenteNome = at.nome;
      }
    } catch {
      // Fallback para nome padrão
    }
    return { atendenteId, atendenteNome };
  }

  private getPrefeituraId(scope: any): string | undefined {
    return scope.kind === 'PREFEITURA' ? scope.prefeituraId : undefined;
  }

  getConfig = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const config = await this.whatsAppCrmUC.obterConfig(this.getPrefeituraId(scope));
    res.json(config);
  };

  saveConfig = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const body = salvarConfigSchema.parse(req.body);
    const saved = await this.whatsAppCrmUC.salvarConfig(body, this.getPrefeituraId(scope));
    res.json(saved);
  };

  testConnection = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const resultado = await this.whatsAppCrmUC.testarConexao(this.getPrefeituraId(scope));
    res.json(resultado);
  };

  listConversas = async (req: Request, res: Response): Promise<void> => {
    const scope = scopeFromRequest(req);
    const { atendenteId } = await this.getAtendenteDados(req);

    const aba = req.query.aba as 'MINHAS' | 'PENDENTES' | 'TODAS' | 'RESOLVIDAS' | undefined;
    const busca = req.query.busca as string | undefined;
    const centroTipo = req.query.centroTipo as 'CEM' | 'CEO' | 'TODOS' | undefined;
    const tag = req.query.tag as string | undefined;
    const limite = req.query.limite ? Number(req.query.limite) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;

    const result = await this.whatsAppCrmUC.listarConversas(
      { aba, busca, centroTipo, tag, limite, offset },
      scope,
      atendenteId,
    );

    res.json(result);
  };

  getConversa = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const conversa = await this.whatsAppCrmUC.obterConversaPorId(id);
    res.json(conversa);
  };

  assumirConversa = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const { atendenteId, atendenteNome } = await this.getAtendenteDados(req);
    const conversa = await this.whatsAppCrmUC.assumirConversa(id, atendenteId, atendenteNome);
    res.json(conversa);
  };

  transferirConversa = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const { atendenteNome: transferidoPor } = await this.getAtendenteDados(req);
    const body = transferirSchema.parse(req.body);

    const conversa = await this.whatsAppCrmUC.transferirConversa(
      id,
      body.novoAtendenteId,
      body.novoAtendenteNome,
      transferidoPor,
    );
    res.json(conversa);
  };

  enviarMensagem = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const { atendenteId, atendenteNome } = await this.getAtendenteDados(req);
    const body = enviarMensagemSchema.parse(req.body);

    const mensagem = await this.whatsAppCrmUC.enviarMensagem(
      {
        conversaId: id,
        corpo: body.corpo,
        tipo: body.tipo,
        mediaUrl: body.mediaUrl,
      },
      atendenteId,
      atendenteNome,
    );

    res.json(mensagem);
  };

  enviarTemplate = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const { atendenteId, atendenteNome } = await this.getAtendenteDados(req);
    const body = enviarTemplateSchema.parse(req.body);

    const mensagem = await this.whatsAppCrmUC.enviarTemplate(
      {
        conversaId: id,
        tipoTemplate: body.tipoTemplate,
        variaveis: body.variaveis,
      },
      atendenteId,
      atendenteNome,
    );

    res.json(mensagem);
  };

  finalizarConversa = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const { atendenteId, atendenteNome } = await this.getAtendenteDados(req);
    const body = finalizarSchema.parse(req.body);

    const conversa = await this.whatsAppCrmUC.finalizarConversa(
      id,
      atendenteId,
      atendenteNome,
      body.motivo,
    );

    res.json(conversa);
  };

  atualizarTags = async (req: Request, res: Response): Promise<void> => {
    const id = paramString(req, 'id');
    const body = atualizarTagsSchema.parse(req.body);
    const conversa = await this.whatsAppCrmUC.atualizarTags(id, body.tags);
    res.json(conversa);
  };

  /**
   * Endpoint público de verificação de Webhook exigido pela Meta Cloud API:
   * GET /api/v1/whatsapp/webhook
   */
  getWebhookVerification = async (req: Request, res: Response): Promise<void> => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    try {
      const config = await this.whatsAppCrmUC.obterConfig();
      if (mode === 'subscribe' && token === config.webhookVerifyToken) {
        logger.info('[WhatsAppWebhook] Handshake de verificação da Meta aceito com sucesso!');
        res.status(200).send(challenge);
        return;
      }
      logger.warn('[WhatsAppWebhook] Falha de verificação no handshake da Meta (token inválido)');
      res.sendStatus(403);
    } catch {
      res.sendStatus(500);
    }
  };

  /**
   * Endpoint público de recebimento de mensagens e eventos da Meta Cloud API:
   * POST /api/v1/whatsapp/webhook
   */
  postWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      // Responde HTTP 200 imediatamente para a Meta não reenviar
      res.status(200).send('EVENT_RECEIVED');

      // Processa de forma assíncrona
      void this.whatsAppCrmUC.processarWebhook(req.body).catch((err) => {
        logger.error(`[WhatsAppWebhook] Erro no processamento assíncrono: ${err?.message}`);
      });
    } catch (err: any) {
      logger.error(`[WhatsAppWebhook] Erro ao receber webhook: ${err?.message}`);
      res.sendStatus(500);
    }
  };
}
