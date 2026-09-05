import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Transporter, createTransport } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

@Injectable()
export class MailService {
  private transporter: Transporter;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    const secure = process.env.SMTP_SECURE === 'true';

    if (!host || !user || !pass || !Number.isInteger(port)) {
      throw new Error('SMTP configuration is incomplete or invalid');
    }

    const transportOptions: SMTPTransport.Options = {
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    };

    this.transporter = createTransport(transportOptions);
  }

  async sendVerificationOtp(toEmail: string, otp: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || '"App Support" <no-reply@yourapp.com>',
        to: toEmail,
        subject: 'Verify Your Email Address',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Email Verification</h2>
            <p>Your verification code is:</p>
            <h1 style="letter-spacing: 4px; color: #4F46E5;">${otp}</h1>
            <p>This code expires in 10 minutes. If you did not request this, please ignore this email.</p>
          </div>
        `,
      });
    } catch (error) {
      // Avoid exposing raw SMTP errors to the client
      console.error('Error sending verification email:', error);
      throw new InternalServerErrorException(
        'Failed to dispatch verification email',
      );
    }
  }
}
