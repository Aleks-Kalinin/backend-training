import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './application/users.service';
import { User } from './infrastructure/entity/user.entity';
import { UsersContoller } from './presentation/users.controller';
import { MailModule } from '../mail/mail.module';
import { VerificationModule } from '../verification/verification.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), VerificationModule, MailModule],
  controllers: [UsersContoller],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule { }
