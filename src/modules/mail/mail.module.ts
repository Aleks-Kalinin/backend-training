import { Module } from '@nestjs/common';
import { MailService } from './application/mail.service';

@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
