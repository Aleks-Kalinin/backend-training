import { TextFileFormat } from '../../domain/text-file-format.enum';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

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
