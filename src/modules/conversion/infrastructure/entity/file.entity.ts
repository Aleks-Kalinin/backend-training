import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TextFileFormat } from '../../domain/text-file-format.enum';

@Entity('file')
export class File {
  @PrimaryGeneratedColumn('uuid')
  fileId!: string;

  @Column({
    type: 'enum',
    enum: TextFileFormat,
  })
  targetFormat!: TextFileFormat;
}
