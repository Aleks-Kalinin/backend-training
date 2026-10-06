import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AVATAR_CLEANUP_BATCH_SIZE,
  AVATAR_CLEANUP_MAX_ATTEMPTS,
  AvatarCleanupReason,
} from '../domain/avatar-cleanup';
import type { AvatarCleanupTaskRepository } from './ports/avatar-cleanup-task-repository.port';
import { AVATAR_CLEANUP_TASK_REPOSITORY } from './ports/avatar-cleanup-task-repository.port';
import type { AvatarStorage } from './ports/avatar-storage.port';
import { AVATAR_STORAGE } from './ports/avatar-storage.port';

/**
 * - `removed`: the object is gone.
 * - `pending`: deletion failed and a retry task was recorded.
 * - `failed`: deletion failed and the retry task could not be recorded.
 */
export type AvatarCleanupOutcome = 'removed' | 'pending' | 'failed';

export interface RemoveAvatarObjectParams {
  storagePath: string;
  actorUserId: string;
  targetUserId: string;
  reason: AvatarCleanupReason;
}

const MAX_ERROR_LENGTH = 500;

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return message.slice(0, MAX_ERROR_LENGTH);
}

@Injectable()
export class AvatarCleanupService {
  private readonly logger = new Logger(AvatarCleanupService.name);
  private retryInProgress = false;

  constructor(
    @Inject(AVATAR_STORAGE)
    private readonly avatarStorage: AvatarStorage,
    @Inject(AVATAR_CLEANUP_TASK_REPOSITORY)
    private readonly cleanupTaskRepository: AvatarCleanupTaskRepository,
  ) {}

  /**
   * Deletes a no-longer-referenced avatar object. Never throws: failures are
   * logged and recorded for retry, and reported through the outcome.
   */
  async removeObject({
    storagePath,
    actorUserId,
    targetUserId,
    reason,
  }: RemoveAvatarObjectParams): Promise<AvatarCleanupOutcome> {
    try {
      await this.avatarStorage.remove(storagePath);
      this.logCleanup({
        actorUserId,
        targetUserId,
        storagePath,
        reason,
        status: 'removed',
      });
      return 'removed';
    } catch (error) {
      const lastError = describeError(error);

      try {
        await this.cleanupTaskRepository.create({
          storagePath,
          userId: targetUserId,
          reason,
          lastError,
        });
      } catch (recordError) {
        this.logger.error(
          JSON.stringify({
            event: 'AVATAR_CLEANUP',
            actorUserId,
            targetUserId,
            storagePath,
            reason,
            status: 'failed',
            error: lastError,
            recordError: describeError(recordError),
          }),
        );
        return 'failed';
      }

      this.logger.warn(
        JSON.stringify({
          event: 'AVATAR_CLEANUP',
          actorUserId,
          targetUserId,
          storagePath,
          reason,
          status: 'pending',
          error: lastError,
        }),
      );
      return 'pending';
    }
  }

  /**
   * Account-deletion variant: succeeds when the object is removed or a
   * pending cleanup task is recorded, and throws otherwise so the deletion
   * job is not reported as done while the object may silently remain.
   */
  async removeUserAvatar({
    storagePath,
    actorUserId,
    targetUserId,
  }: Omit<RemoveAvatarObjectParams, 'reason' | 'storagePath'> & {
    storagePath: string | null;
  }): Promise<void> {
    if (!storagePath) {
      return;
    }

    const outcome = await this.removeObject({
      storagePath,
      actorUserId,
      targetUserId,
      reason: AvatarCleanupReason.USER_DELETION,
    });

    if (outcome === 'failed') {
      throw new Error('Avatar cleanup could not be completed or recorded');
    }
  }

  /** Retries recorded cleanup tasks; triggered by `AvatarCleanupScheduler`. */
  async retryPendingCleanups(): Promise<void> {
    if (this.retryInProgress) {
      return;
    }

    this.retryInProgress = true;
    try {
      const tasks = await this.cleanupTaskRepository.findRetryable(
        AVATAR_CLEANUP_MAX_ATTEMPTS,
        AVATAR_CLEANUP_BATCH_SIZE,
      );

      for (const task of tasks) {
        try {
          await this.avatarStorage.remove(task.storagePath);
          await this.cleanupTaskRepository.delete(task.id);
          this.logger.log(
            JSON.stringify({
              event: 'AVATAR_CLEANUP_RETRY',
              taskId: task.id,
              targetUserId: task.userId,
              storagePath: task.storagePath,
              reason: task.reason,
              attempts: task.attempts + 1,
              status: 'removed',
            }),
          );
        } catch (error) {
          task.attempts += 1;
          task.lastError = describeError(error);
          await this.cleanupTaskRepository.save(task);

          const exhausted = task.attempts >= AVATAR_CLEANUP_MAX_ATTEMPTS;
          const entry = JSON.stringify({
            event: 'AVATAR_CLEANUP_RETRY',
            taskId: task.id,
            targetUserId: task.userId,
            storagePath: task.storagePath,
            reason: task.reason,
            attempts: task.attempts,
            status: exhausted ? 'exhausted' : 'pending',
            error: task.lastError,
          });

          if (exhausted) {
            this.logger.error(entry);
          } else {
            this.logger.warn(entry);
          }
        }
      }
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'AVATAR_CLEANUP_RETRY',
          status: 'failed',
          error: describeError(error),
        }),
      );
    } finally {
      this.retryInProgress = false;
    }
  }

  private logCleanup(entry: {
    actorUserId: string;
    targetUserId: string;
    storagePath: string;
    reason: AvatarCleanupReason;
    status: AvatarCleanupOutcome;
  }) {
    this.logger.log(JSON.stringify({ event: 'AVATAR_CLEANUP', ...entry }));
  }
}
