export enum AvatarCleanupReason {
  /** A newer upload replaced the object. */
  REPLACE = 'replace',
  /** The avatar was removed through DELETE /users/:id/photo. */
  REMOVE = 'remove',
  /**
   * @deprecated URL-based photos are no longer supported, so this reason is
   * no longer produced. Kept so pending legacy cleanup tasks remain readable.
   */
  PHOTO_URL_UPDATE = 'photo-url-update',
  /** The user record could not be updated after upload; the new object is orphaned. */
  ROLLBACK = 'rollback',
  /** The owning user account was deleted. */
  USER_DELETION = 'user-deletion',
}

export interface AvatarCleanupTask {
  id: string;
  storagePath: string;
  userId: string | null;
  reason: AvatarCleanupReason;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Maximum automatic retries before a task is left for manual follow-up. */
export const AVATAR_CLEANUP_MAX_ATTEMPTS = 10;

export const AVATAR_CLEANUP_BATCH_SIZE = 50;
