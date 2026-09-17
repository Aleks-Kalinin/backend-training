import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { Role } from '../rbac/infrastructure/entities/role.entity';
import { VerificationModule } from '../verification/verification.module';
import { UserDeletionListener } from './application/listeners/user-deletion.listener';
import { UsersService } from './application/users.service';
import { UserDeletionJob } from './infrastructure/entity/user-deletion-job.entity';
import { User } from './infrastructure/entity/user.entity';
import { UsersContoller } from './presentation/users.controller';

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
