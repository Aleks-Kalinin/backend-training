export const AVATAR_STORAGE = Symbol('AVATAR_STORAGE');

export interface AvatarStorage {
  /** Stores a new object. Must not overwrite an existing key. */
  upload(
    storagePath: string,
    content: Buffer,
    contentType: string,
  ): Promise<void>;
  /** Removes an object. Removing a missing object must succeed. */
  remove(storagePath: string): Promise<void>;
  /** Returns the public read URL for an object key. */
  getPublicUrl(storagePath: string): string;
}
