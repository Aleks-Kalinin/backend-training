import { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/user-status.enum';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserSearch {
  limit?: number;
  q?: string;
  status?: UserStatus;
  sort: 'created_at' | 'updated_at' | 'email';
  order: 'asc' | 'desc';
  cursor?: { id: string; createdAt: Date };
}

export interface AvatarChange {
  photo: string | null;
}

export interface AvatarChangeResult {
  user: User;
  previousStoragePath: string | null;
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(userId: string): Promise<User | null>;
  findMany(search: UserSearch): Promise<User[]>;
  create(
    data: Omit<User, 'userId' | 'createdAt' | 'updatedAt' | 'roles'>,
  ): User;
  save(user: User): Promise<User>;
  remove(user: User): Promise<void>;
  /**
   * Atomically replaces the user's avatar reference, returning the storage path
   * that was referenced before the change. Returns `null` if the user no
   * longer exists.
   */
  updateAvatar(
    userId: string,
    change: AvatarChange,
  ): Promise<AvatarChangeResult | null>;
}
