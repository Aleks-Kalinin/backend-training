export enum DeletionJobStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
  FAILED = 'failed',
}

export enum DeletionExecutionMode {
  SYNC = 'sync',
  ASYNC = 'async',
}

export interface UserDeletionJob {
  id: string;
  userId: string;
  status: DeletionJobStatus;
  mode: DeletionExecutionMode;
  reason?: string;
  errorMessage?: string;
  requestedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
