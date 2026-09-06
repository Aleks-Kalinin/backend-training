import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Grant } from './grant.entity'; // We will create this later

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  name!: string;

  @Column({ nullable: true })
  description!: string;

  @OneToMany(() => Grant, (grant) => grant.role)
  grants!: Grant[];
}
