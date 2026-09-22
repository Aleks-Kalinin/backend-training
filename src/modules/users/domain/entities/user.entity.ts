import { UserStatus } from '../user-status.enum';

export interface UserRole {
  id: string;
  name: string;
  description?: string;
  grants?: unknown[];
}

/**
 * Framework-independent user model used by application services.
 * Persistence decorators and relations belong to infrastructure entities.
 */
export interface User {
  userId: string;
  email: string;
  password: string;
  status: UserStatus;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  photo: string | null;
  roles: UserRole[];
}
