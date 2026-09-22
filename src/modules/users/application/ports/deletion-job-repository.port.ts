import {
  DeletionExecutionMode,
  DeletionJobStatus,
  UserDeletionJob,
} from '../../domain/deletion';

export const USER_DELETION_JOB_REPOSITORY = Symbol(
  'USER_DELETION_JOB_REPOSITORY',
);

export interface UserDeletionJobRepository {
  findLatestByUserId(userId: string): Promise<UserDeletionJob | null>;
  create(data: {
    userId: string;
    reason?: string;
    requestedBy: string | null;
    status: DeletionJobStatus;
    mode: DeletionExecutionMode;
  }): UserDeletionJob;
  save(job: UserDeletionJob): Promise<UserDeletionJob>;
}
