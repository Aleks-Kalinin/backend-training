import {
  DeletionExecutionMode,
  DeletionJobStatus,
} from '../infrastructure/entity/user-deletion-job.entity';

export class DeleteUserResponseDto {
  jobId!: string;
  status!: DeletionJobStatus;
  requestedBy!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
  mode!: DeletionExecutionMode;
}
