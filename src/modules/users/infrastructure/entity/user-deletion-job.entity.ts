import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

@Entity('user_deletion_jobs')
export class UserDeletionJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({
    type: 'enum',
    enum: DeletionJobStatus,
    default: DeletionJobStatus.PENDING,
  })
  status!: DeletionJobStatus;

  @Column({
    type: 'enum',
    enum: DeletionExecutionMode,
    default: DeletionExecutionMode.SYNC,
  })
  mode!: DeletionExecutionMode;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  errorMessage?: string;

  @Column({ type: 'uuid', nullable: true })
  requestedBy!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
