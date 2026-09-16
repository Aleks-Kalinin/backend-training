import { type UUID } from 'node:crypto';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('converted_file')
export class ConvertedFileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: UUID;

  @Column({ name: 'file_path', type: 'varchar', length: 500 })
  filePath: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
