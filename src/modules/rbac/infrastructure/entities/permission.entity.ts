import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Grant } from './grant.entity';

@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  name!: string;

  @Column('text', { array: true, default: [] })
  actions!: string[];

  @OneToMany(() => Grant, (grant) => grant.permission)
  grants!: Grant[];
}
