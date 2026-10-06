import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AvatarCleanupReason } from '../../domain/avatar-cleanup';

/**
 * Storage objects whose deletion failed and must be retried. Rows are kept
 * after the retry budget is exhausted so they remain observable.
 * Deliberately has no foreign key to `users`: tasks must outlive the account.
 */
@Entity('avatar_cleanup_tasks')
export class AvatarCleanupTaskEntity {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_avatar_cleanup_tasks_id',
  })
  id!: string;

  @Column({ type: 'varchar', length: 512 })
  storagePath!: string;

  @Index('IDX_avatar_cleanup_tasks_userId')
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  reason!: AvatarCleanupReason;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  lastError!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
