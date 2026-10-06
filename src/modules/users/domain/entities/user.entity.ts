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
  /**
   * Bucket-relative storage path of the uploaded avatar (for example
   * `{userId}/{uuid}.webp`), or `null` when no avatar is set. Profile
   * responses expose it as a public URL; see `UserProfile`.
   */
  photo: string | null;
  roles: UserRole[];
}

/**
 * User as exposed in profile responses: `photo` is the public URL resolved
 * from the stored avatar path (or `null`), never the raw storage path.
 */
export type UserProfile = Omit<User, 'photo'> & { photo: string | null };
