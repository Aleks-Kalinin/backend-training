import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { FILE_TYPE } from '../../application/constants/file-type';
import { FILE_CONVERSION_STATUS } from '../../application/constants/file-conversion-status';

@Entity('file_conversion_history')
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

  @Column({ type: 'varchar', length: 255, nullable: true })
  errorCode!: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Index()
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;
}
