import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DeletionExecutionMode,
  DeletionJobStatus,
} from '../infrastructure/entity/user-deletion-job.entity';

export class DeleteUserResponseDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    description: 'Unique job ID for deletion process',
  })
  jobId!: string;

  @ApiProperty({
    enum: DeletionJobStatus,
    example: DeletionJobStatus.DONE,
    description: 'Current status of the deletion job',
  })
  status!: DeletionJobStatus;

  @ApiPropertyOptional({
    example: 'admin-user-id',
    nullable: true,
    description: 'ID of the user who requested deletion',
  })
  requestedBy!: string | null;

  @ApiProperty({
    example: '2026-09-17T00:00:00.000Z',
    description: 'Job creation timestamp',
  })
  createdAt!: Date;

  @ApiProperty({
    example: '2026-09-17T00:00:00.000Z',
    description: 'Job last update timestamp',
  })
  updatedAt!: Date;

  @ApiProperty({
    enum: DeletionExecutionMode,
    example: DeletionExecutionMode.SYNC,
    description: 'Execution mode of the deletion job (SYNC or ASYNC)',
  })
  mode!: DeletionExecutionMode;
}
