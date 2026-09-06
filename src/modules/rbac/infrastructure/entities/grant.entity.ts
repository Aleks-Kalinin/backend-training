import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Permission } from './permission.entity';
import { Role } from './role.entity';

@Entity('grants')
@Index(['roleId', 'permissionId'], { unique: true })
export class Grant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @Column({ name: 'permission_id', type: 'uuid' })
  permissionId!: string;

  @ManyToOne(() => Role, (role) => role.grants, {
    onDelete: 'RESTRICT',
    nullable: false,
  })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @ManyToOne(() => Permission, (permission) => permission.grants, {
    onDelete: 'RESTRICT',
    nullable: false,
  })
  @JoinColumn({ name: 'permission_id' })
  permission!: Permission;

  @Column('text', { array: true, nullable: true })
  actions?: string[] | null;
}
