import { Module } from '@nestjs/common';
import { MailService } from './application/mail.service';
import { MAIL_TRANSPORT } from './application/ports/mail-transport.port';
import { NodemailerMailTransport } from './infrastructure/nodemailer-mail.transport';

@Module({
  providers: [
    MailService,
    { provide: MAIL_TRANSPORT, useClass: NodemailerMailTransport },
  ],
  exports: [MailService],
})
export class MailModule {}
