import { Injectable } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import {
  MailMessage,
  MailTransport,
} from '../application/ports/mail-transport.port';

@Injectable()
export class NodemailerMailTransport implements MailTransport {
  private readonly transporter: Transporter;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    const secure = process.env.SMTP_SECURE === 'true';

    if (!host || !user || !pass || !Number.isInteger(port)) {
      throw new Error('SMTP configuration is incomplete or invalid');
    }

    const options: SMTPTransport.Options = {
      host,
      port,
      secure,
      auth: { user, pass },
    };

    this.transporter = createTransport(options);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      ...message,
      from:
        message.from ||
        process.env.SMTP_FROM ||
        '"App Support" <no-reply@yourapp.com>',
    });
  }
}
