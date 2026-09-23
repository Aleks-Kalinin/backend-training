import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FILE_CONVERSION_STATUS } from '../../application/constants/file-conversion-status';
import { FILE_TYPE } from '../../application/constants/file-type';
import { ConvertedFileEntity } from './converted-file.entity';

@Entity('file_conversion_history')
@Index('IDX_file_conversion_history_user_created', ['userId', 'createdAt'])
@Index('IDX_file_conversion_history_type', ['type'])
@Index('IDX_file_conversion_history_status', ['status'])
export class TransformationHistoryItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: FILE_TYPE })
  type!: FILE_TYPE;

  @Column({ type: 'varchar', length: 20 })
  sourceFormat!: string;

  @Column({ type: 'varchar', length: 20 })
  targetFormat!: string;

  @Column({ type: 'enum', enum: FILE_CONVERSION_STATUS })
  status!: FILE_CONVERSION_STATUS;

  @Column({ type: 'bigint' })
  fileSize!: number;

  @Column({ type: 'integer' })
  durationMs!: number;

  @Column({ type: 'integer', nullable: true })
  errorCode!: number | null;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date;

  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'file_id', type: 'uuid', nullable: true })
  fileId!: string | null;

  @ManyToOne(() => ConvertedFileEntity, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'file_id' })
  file!: ConvertedFileEntity | null;
}
