import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../infrastructure/entity/user.entity';
import {
  UserDeletionJob,
  DeletionJobStatus,
} from '../../infrastructure/entity/user-deletion-job.entity';

export interface UserDeletionEventPayload {
  jobId: string;
  userId: string;
}

@Injectable()
export class UserDeletionListener {
  private readonly logger = new Logger(UserDeletionListener.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(UserDeletionJob)
    private readonly userDeletionJobRepository: Repository<UserDeletionJob>,
  ) {}

  @OnEvent('user.delete.request', { async: true })
  async handleUserSoftDeleted(payload: UserDeletionEventPayload) {
    const { jobId, userId } = payload;

    const job = await this.userDeletionJobRepository.findOne({
      where: {
        id: jobId,
      },
    });
    const user = await this.usersRepository.findOne({
      where: { userId },
    });

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
