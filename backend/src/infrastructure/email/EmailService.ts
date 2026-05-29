/**
 * Serviço de envio de email — abstração sobre o provider concreto.
 *
 * Providers suportados:
 *   - `smtp` (production): nodemailer + SMTP de qualquer provedor (Brevo,
 *     Resend, SendGrid, Amazon SES, Postfix self-hosted, Gmail App Password)
 *   - `log` (dev): só loga o conteúdo, útil pra dev sem quotas/credenciais
 *
 * Templates de auth ficam aqui pra centralizar look-and-feel + i18n.
 *
 * Recomendação de provedores GRATUITOS (sem cartão):
 *   - Brevo (Sendinblue):  300 emails/dia
 *   - SMTP2GO:             1000 emails/mês
 *   - Resend:              100 emails/dia (precisa cartão pra >100)
 *   - Mailtrap (sandbox):  ilimitado em sandbox (pra testes apenas)
 *   - Gmail App Password:  500/dia, mas pode ir pra spam
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../shared/env';
import { logger } from '../logger';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface IEmailService {
  enviar(msg: EmailMessage): Promise<void>;
  /** Templates curados — facilita evolução visual. */
  enviarCodigoRedefinicao(input: { para: string; nome: string; codigo: string; expiraEm: Date }): Promise<void>;
}

class LogEmailService implements IEmailService {
  async enviar(msg: EmailMessage): Promise<void> {
    logger.info(
      { to: msg.to, subject: msg.subject, body: msg.text.slice(0, 200) },
      '[EMAIL · LOG MODE] (configure EMAIL_PROVIDER=smtp para envio real)',
    );
  }
  async enviarCodigoRedefinicao(input: { para: string; nome: string; codigo: string; expiraEm: Date }): Promise<void> {
    logger.warn(
      { to: input.para, codigo: input.codigo, expiraEm: input.expiraEm.toISOString() },
      '[EMAIL · LOG MODE] código de redefinição (NUNCA logar isso em produção real)',
    );
  }
}

class SmtpEmailService implements IEmailService {
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE, // true em 465 (SMTPS); false em 587 (STARTTLS)
      auth: env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
    });
    return this.transporter;
  }

  async enviar(msg: EmailMessage): Promise<void> {
    const t = this.getTransporter();
    const info = await t.sendMail({
      from: env.EMAIL_FROM,
      to: msg.to,
      ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    });
    logger.info(
      { to: msg.to, subject: msg.subject, messageId: info.messageId, accepted: info.accepted },
      'email enviado',
    );
  }

  async enviarCodigoRedefinicao(input: { para: string; nome: string; codigo: string; expiraEm: Date }): Promise<void> {
    const minutos = Math.round((input.expiraEm.getTime() - Date.now()) / 60_000);
    const subject = 'UNISISM · Código de redefinição de senha';
    const text = [
      `Olá, ${input.nome}.`,
      '',
      `Recebemos uma solicitação de redefinição de senha para sua conta no UNISISM.`,
      '',
      `Seu código de verificação é: ${input.codigo}`,
      '',
      `O código expira em ${minutos} minuto(s).`,
      '',
      'Se você NÃO solicitou esta redefinição, ignore este email — sua senha continuará a mesma.',
      '',
      '— Equipe UNISISM',
    ].join('\n');
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
        <h2 style="color:#0f172a;margin-top:0">UNISISM</h2>
        <p>Olá, <strong>${escapeHtml(input.nome)}</strong>.</p>
        <p>Recebemos uma solicitação de redefinição de senha para sua conta.</p>
        <div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:16px;text-align:center;margin:24px 0">
          <div style="font-size:13px;color:#64748b;margin-bottom:4px">Seu código:</div>
          <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#0f172a">${input.codigo}</div>
          <div style="font-size:12px;color:#64748b;margin-top:8px">expira em ${minutos} min</div>
        </div>
        <p style="font-size:13px;color:#64748b">
          Se você não solicitou esta redefinição, ignore este email — sua senha continuará a mesma.
        </p>
        <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0">
        <p style="font-size:12px;color:#94a3b8">UNISISM · Sistema de regulação ambulatorial · Não responda este email.</p>
      </div>
    `;
    return this.enviar({ to: input.para, subject, text, html });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildEmailService(): IEmailService {
  if (env.EMAIL_PROVIDER === 'smtp' && env.SMTP_HOST) {
    logger.info(
      { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE, from: env.EMAIL_FROM },
      '✓ email: SMTP real configurado',
    );
    return new SmtpEmailService();
  }
  logger.warn('⚠️  email: modo LOG — códigos serão escritos no log (configure EMAIL_PROVIDER=smtp)');
  return new LogEmailService();
}
