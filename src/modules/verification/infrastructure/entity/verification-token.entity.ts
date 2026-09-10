import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../../users/infrastructure/entity/user.entity';

export enum VerificationTokenType {
  REGISTRATION = 'REGISTRATION',
  EMAIL_CHANGE = 'EMAIL_CHANGE',
  USER_DELETION = 'USER_DELETION',
}

@Entity('verification_tokens')
@Index(['userId', 'type'])
export class VerificationToken {
  @PrimaryGeneratedColumn('uuid')
  verificationTokenId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @Column({ type: 'enum', enum: VerificationTokenType })
  type!: VerificationTokenType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  targetEmail?: string | null;

  @Column({ type: 'varchar', length: 255 })
  tokenHash!: string;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
