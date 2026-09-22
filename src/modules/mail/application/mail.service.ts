import { Inject, Injectable, Logger } from '@nestjs/common';
import { MailDeliveryError } from '../domain/mail.errors';
import { MAIL_TRANSPORT } from './ports/mail-transport.port';
import type { MailTransport } from './ports/mail-transport.port';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  constructor(
    @Inject(MAIL_TRANSPORT)
    private readonly transport: MailTransport,
  ) {}

  async sendVerificationOtp(toEmail: string, otp: string): Promise<void> {
    try {
      await this.transport.send({
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

      this.logger.log(`Verification email sent to ${toEmail}`);
    } catch (error) {
      this.logger.error(`Failed to dispatch verification email: ${error}`);
      throw new MailDeliveryError();
    }
  }
}
