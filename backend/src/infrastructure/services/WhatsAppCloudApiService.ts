import { logger } from '../logger';

export interface EnviarMensagemTextoParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
}

export interface EnviarBotoesInterativosParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  bodyText: string;
  buttons: Array<{ id: string; title: string }>;
}

export interface TestarConexaoParams {
  phoneNumberId: string;
  accessToken: string;
}

export interface MetaApiResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  details?: any;
}

export class WhatsAppCloudApiService {
  private readonly baseUrl = 'https://graph.facebook.com/v20.0';

  /**
   * Normaliza um telefone para o formato padrão E.164 exigido pela Meta:
   * 55 + DDD (2 dígitos) + 9 dígitos (ex: 5575988887777).
   */
  public normalizarTelefoneE164(telefone: string): string {
    const digits = telefone.replace(/\D+/g, '');
    if (digits.length === 10 || digits.length === 11) {
      return `55${digits}`;
    }
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
      return digits;
    }
    return digits;
  }

  /**
   * Envia uma mensagem de texto simples pelo WhatsApp Cloud API.
   */
  async sendTextMessage(params: EnviarMensagemTextoParams): Promise<MetaApiResponse> {
    const cleanTo = this.normalizarTelefoneE164(params.to);

    // Se o token for mock / sandbox local, simula o envio sem quebrar
    if (!params.accessToken || params.accessToken.startsWith('MOCK_') || params.phoneNumberId.startsWith('MOCK_')) {
      const mockWamid = `wamid.HBg${Date.now()}SIMULATED${Math.floor(Math.random() * 10000)}`;
      logger.info(`[WhatsAppCloudApi] Mock envio para ${cleanTo}: "${params.text.slice(0, 40)}..."`);
      return { success: true, messageId: mockWamid };
    }

    const url = `${this.baseUrl}/${params.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'text',
      text: {
        preview_url: false,
        body: params.text,
      },
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg = data?.error?.message || `Erro HTTP ${res.status}: ${res.statusText}`;
        logger.error(`[WhatsAppCloudApi] Erro ao enviar mensagem para ${cleanTo}: ${errorMsg}`, data);
        return { success: false, error: errorMsg, details: data };
      }

      const messageId = data?.messages?.[0]?.id;
      logger.info(`[WhatsAppCloudApi] Mensagem enviada com sucesso para ${cleanTo}. Wamid: ${messageId}`);
      return { success: true, messageId, details: data };
    } catch (err: any) {
      logger.error(`[WhatsAppCloudApi] Exceção de rede ao enviar para ${cleanTo}: ${err?.message}`);
      return { success: false, error: err?.message || 'Falha de conexão com a API da Meta' };
    }
  }

  /**
   * Envia botões interativos (ex: "Confirmar" e "Reagendar")
   */
  async sendInteractiveButtons(params: EnviarBotoesInterativosParams): Promise<MetaApiResponse> {
    const cleanTo = this.normalizarTelefoneE164(params.to);

    if (!params.accessToken || params.accessToken.startsWith('MOCK_') || params.phoneNumberId.startsWith('MOCK_')) {
      const mockWamid = `wamid.HBg${Date.now()}BUTTONS${Math.floor(Math.random() * 10000)}`;
      logger.info(`[WhatsAppCloudApi] Mock envio de botões para ${cleanTo}`);
      return { success: true, messageId: mockWamid };
    }

    const url = `${this.baseUrl}/${params.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: params.bodyText,
        },
        action: {
          buttons: params.buttons.slice(0, 3).map((btn) => ({
            type: 'reply',
            reply: {
              id: btn.id,
              title: btn.title.slice(0, 20),
            },
          })),
        },
      },
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg = data?.error?.message || `Erro HTTP ${res.status}`;
        logger.error(`[WhatsAppCloudApi] Erro ao enviar botões para ${cleanTo}: ${errorMsg}`, data);
        return { success: false, error: errorMsg, details: data };
      }

      const messageId = data?.messages?.[0]?.id;
      return { success: true, messageId, details: data };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Falha de conexão com a API da Meta' };
    }
  }

  /**
   * Valida as credenciais da Meta consultando os dados do Phone Number ID.
   */
  async testConnection(params: TestarConexaoParams): Promise<{
    valid: boolean;
    name?: string;
    displayPhoneNumber?: string;
    qualityRating?: string;
    error?: string;
  }> {
    if (!params.accessToken || !params.phoneNumberId) {
      return { valid: false, error: 'Phone Number ID e Access Token são obrigatórios.' };
    }

    if (params.accessToken.startsWith('MOCK_') || params.phoneNumberId.startsWith('MOCK_')) {
      return {
        valid: true,
        name: 'UNISISM Central (Modo Sandbox)',
        displayPhoneNumber: '+55 75 99999-0000',
        qualityRating: 'GREEN',
      };
    }

    const url = `${this.baseUrl}/${params.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status`;

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg = data?.error?.message || `Erro HTTP ${res.status}`;
        return { valid: false, error: errorMsg };
      }

      return {
        valid: true,
        name: data.verified_name || 'Número WhatsApp Verificado',
        displayPhoneNumber: data.display_phone_number,
        qualityRating: data.quality_rating,
      };
    } catch (err: any) {
      return { valid: false, error: err?.message || 'Não foi possível conectar aos servidores da Meta.' };
    }
  }
}
