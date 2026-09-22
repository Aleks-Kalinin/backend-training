import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DeletionJobStatus } from '../../domain/deletion';
import { USER_DELETION_JOB_REPOSITORY } from '../ports/deletion-job-repository.port';
import type { UserDeletionJobRepository } from '../ports/deletion-job-repository.port';
import { USER_REPOSITORY } from '../ports/user-repository.port';
import type { UserRepository } from '../ports/user-repository.port';

export interface UserDeletionEventPayload {
  jobId: string;
  userId: string;
}

@Injectable()
export class UserDeletionListener {
  private readonly logger = new Logger(UserDeletionListener.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly usersRepository: UserRepository,
    @Inject(USER_DELETION_JOB_REPOSITORY)
    private readonly userDeletionJobRepository: UserDeletionJobRepository,
  ) {}

  @OnEvent('user.delete.request', { async: true })
  async handleUserSoftDeleted(payload: UserDeletionEventPayload) {
    const { jobId, userId } = payload;

    const job = await this.userDeletionJobRepository.findLatestByUserId(userId);
    const user = await this.usersRepository.findById(userId);

    if (!job || !user) {
      this.logger.error(`Job or User not found for deletion event`);
      return;
    }
    try {
      job.status = DeletionJobStatus.IN_PROGRESS;
      await this.userDeletionJobRepository.save(job);

      await this.usersRepository.remove(user);
      job.status = DeletionJobStatus.DONE;
      this.logger.log(`Successfully processed user deletion for ${userId}`);
    } catch (error) {
      job.status = DeletionJobStatus.FAILED;
      job.errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error during user deletion';
      this.logger.error(
        `Failed to process user deletion for ${userId}: ${job.errorMessage}`,
      );
    } finally {
      await this.userDeletionJobRepository.save(job);
    }
  }
}
