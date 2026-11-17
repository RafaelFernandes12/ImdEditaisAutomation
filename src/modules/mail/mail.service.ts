import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import nodemailer, { type Transporter } from 'nodemailer';
import { ScopedLogger } from '../../utils/scoped-logger.js';

/**
 * Envia emails via SMTP. Sem SMTP_HOST ou ALERT_EMAIL configurados, vira
 * no-op (só loga), para o app rodar normalmente em dev sem servidor de email.
 */
@Injectable()
export class MailService {
  private readonly transporter?: Transporter;
  private readonly from?: string;
  private readonly alertTo?: string;

  constructor(
    @InjectPinoLogger(MailService.name)
    private readonly logger: PinoLogger,
  ) {
    const host = process.env.SMTP_HOST;
    this.alertTo = process.env.ALERT_EMAIL;
    if (!host || !this.alertTo) return;

    const port = Number(process.env.SMTP_PORT ?? 587);
    this.transporter = nodemailer.createTransport({
      host,
      port,
      // 465 é TLS direto; 587/25 sobem para TLS via STARTTLS.
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    this.from = process.env.MAIL_FROM ?? process.env.SMTP_USER ?? this.alertTo;
  }

  private get log() {
    return new ScopedLogger(this.logger, 'mail');
  }

  /** Manda um alerta para ALERT_EMAIL. Nunca lança: falha de email só loga. */
  async sendAlert(subject: string, text: string) {
    if (!this.transporter) {
      this.log.warn(
        'alert.skipped',
        'SMTP_HOST/ALERT_EMAIL não configurados, alerta não enviado',
        { subject },
      );
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: this.alertTo,
        subject,
        text,
      });
      this.log.info('alert.sent', 'Alerta enviado por email', { subject });
    } catch (err: unknown) {
      this.log.error('alert.failed', 'Falha ao enviar alerta por email', {
        subject,
        err,
      });
    }
  }
}
