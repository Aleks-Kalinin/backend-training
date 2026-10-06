import {
  AvatarCleanupReason,
  AvatarCleanupTask,
} from '../../domain/avatar-cleanup';

export const AVATAR_CLEANUP_TASK_REPOSITORY = Symbol(
  'AVATAR_CLEANUP_TASK_REPOSITORY',
);

export interface CreateAvatarCleanupTask {
  storagePath: string;
  userId: string | null;
  reason: AvatarCleanupReason;
  lastError: string | null;
}

export interface AvatarCleanupTaskRepository {
  create(task: CreateAvatarCleanupTask): Promise<AvatarCleanupTask>;
  findRetryable(
    maxAttempts: number,
    limit: number,
  ): Promise<AvatarCleanupTask[]>;
  save(task: AvatarCleanupTask): Promise<AvatarCleanupTask>;
  delete(id: string): Promise<void>;
}
