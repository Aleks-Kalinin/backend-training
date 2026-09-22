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
import { USER_DELETION_JOB_REPOSITORY } from './application/ports/deletion-job-repository.port';
import { USER_REPOSITORY } from './application/ports/user-repository.port';
import { USER_ROLE_REPOSITORY } from './application/ports/role-repository.port';
import { TypeOrmDeletionJobRepository } from './infrastructure/repositories/typeorm-deletion-job.repository';
import { TypeOrmUserRepository } from './infrastructure/repositories/typeorm-user.repository';
import { TypeOrmUserRoleRepository } from './infrastructure/repositories/typeorm-user-role.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserDeletionJob, Role]),
    VerificationModule,
    MailModule,
  ],
  controllers: [UsersContoller],
  providers: [
    UsersService,
    UserDeletionListener,
    { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
    { provide: USER_ROLE_REPOSITORY, useClass: TypeOrmUserRoleRepository },
    {
      provide: USER_DELETION_JOB_REPOSITORY,
      useClass: TypeOrmDeletionJobRepository,
    },
  ],
  exports: [UsersService],
})
export class UsersModule {}
