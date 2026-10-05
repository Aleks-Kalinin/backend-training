const MiB = 1024 * 1024;

/**
 * Avatar-specific upload limits. These are applied per request so they stay
 * independent of the global multipart limits used by file conversion.
 */
export const AVATAR_MAX_FILE_SIZE = 5 * MiB;

/** Maximum width and height of the stored avatar (aspect ratio is preserved). */
export const AVATAR_MAX_DIMENSION = 1024;

/** Upper bound on decoded input pixels to protect against decompression bombs. */
export const AVATAR_MAX_INPUT_PIXELS = 25_000_000;

export const AVATAR_OUTPUT_CONTENT_TYPE = 'image/webp';
export const AVATAR_OUTPUT_EXTENSION = 'webp';

export const AVATAR_MULTIPART_FIELD = 'file';

export enum AvatarSourceFormat {
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
}

export const AVATAR_MIME_TO_FORMAT: Record<string, AvatarSourceFormat> = {
  'image/jpeg': AvatarSourceFormat.JPEG,
  'image/jpg': AvatarSourceFormat.JPEG,
  'image/png': AvatarSourceFormat.PNG,
  'image/webp': AvatarSourceFormat.WEBP,
};
