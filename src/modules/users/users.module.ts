import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { Role } from '../rbac/infrastructure/entities/role.entity';
import { VerificationModule } from '../verification/verification.module';
import { AvatarCleanupService } from './application/avatar-cleanup.service';
import { AvatarService } from './application/avatar.service';
import { UserDeletionListener } from './application/listeners/user-deletion.listener';
import { UsersService } from './application/users.service';
import { AvatarCleanupScheduler } from './infrastructure/avatar-cleanup.scheduler';
import { AvatarCleanupTaskEntity } from './infrastructure/entity/avatar-cleanup-task.entity';
import { UserDeletionJob } from './infrastructure/entity/user-deletion-job.entity';
import { User } from './infrastructure/entity/user.entity';
import { UsersContoller } from './presentation/users.controller';
import { AVATAR_CLEANUP_TASK_REPOSITORY } from './application/ports/avatar-cleanup-task-repository.port';
import { AVATAR_IMAGE_PROCESSOR } from './application/ports/avatar-image-processor.port';
import { AVATAR_STORAGE } from './application/ports/avatar-storage.port';
import { USER_DELETION_JOB_REPOSITORY } from './application/ports/deletion-job-repository.port';
import { USER_REPOSITORY } from './application/ports/user-repository.port';
import { USER_ROLE_REPOSITORY } from './application/ports/role-repository.port';
import { SharpAvatarImageProcessor } from './infrastructure/images/sharp-avatar-image.processor';
import { TypeOrmAvatarCleanupTaskRepository } from './infrastructure/repositories/typeorm-avatar-cleanup-task.repository';
import { TypeOrmDeletionJobRepository } from './infrastructure/repositories/typeorm-deletion-job.repository';
import { TypeOrmUserRepository } from './infrastructure/repositories/typeorm-user.repository';
import { TypeOrmUserRoleRepository } from './infrastructure/repositories/typeorm-user-role.repository';
import { SupabaseAvatarStorage } from './infrastructure/storage/supabase-avatar.storage';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserDeletionJob,
      Role,
      AvatarCleanupTaskEntity,
    ]),
    VerificationModule,
    MailModule,
  ],
  controllers: [UsersContoller],
  providers: [
    UsersService,
    AvatarService,
    AvatarCleanupService,
    AvatarCleanupScheduler,
    UserDeletionListener,
    { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
    { provide: USER_ROLE_REPOSITORY, useClass: TypeOrmUserRoleRepository },
    {
      provide: USER_DELETION_JOB_REPOSITORY,
      useClass: TypeOrmDeletionJobRepository,
    },
    {
      provide: AVATAR_CLEANUP_TASK_REPOSITORY,
      useClass: TypeOrmAvatarCleanupTaskRepository,
    },
    { provide: AVATAR_STORAGE, useClass: SupabaseAvatarStorage },
    {
      provide: AVATAR_IMAGE_PROCESSOR,
      useFactory: () => new SharpAvatarImageProcessor(),
    },
  ],
  exports: [UsersService],
})
export class UsersModule {}
