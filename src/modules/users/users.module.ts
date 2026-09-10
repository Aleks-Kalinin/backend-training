import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './application/users.service';
import { User } from './infrastructure/entity/user.entity';
import { UsersContoller } from './presentation/users.controller';
import { MailModule } from '../mail/mail.module';
import { VerificationModule } from '../verification/verification.module';
import { UserDeletionJob } from './infrastructure/entity/user-deletion-job.entity';
import { UserDeletionListener } from './application/listeners/user-deletion.listener';

import { Role } from '../rbac/infrastructure/entities/role.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserDeletionJob, Role]),
    VerificationModule,
    MailModule,
  ],
  controllers: [UsersContoller],
  providers: [UsersService, UserDeletionListener],
  exports: [UsersService],
})
export class UsersModule {}
