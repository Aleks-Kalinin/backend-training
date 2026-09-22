import { UserRole } from '../../domain/entities/user.entity';

export const USER_ROLE_REPOSITORY = Symbol('USER_ROLE_REPOSITORY');

export interface UserRoleRepository {
  findDefaultRole(): Promise<UserRole | null>;
}
