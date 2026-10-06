export const AVATAR_IMAGE_PROCESSOR = Symbol('AVATAR_IMAGE_PROCESSOR');

export interface ProcessedAvatarImage {
  content: Buffer;
  width: number;
  height: number;
}

export interface AvatarImageProcessor {
  /**
   * Verifies the real image format against the declared MIME type, then
   * re-encodes the image to a metadata-free, size-bounded WebP.
   *
   * Throws `UnsupportedMediaTypeException` for unsupported or mismatched
   * formats and `BadRequestException` for corrupt or oversized images.
   */
  process(
    content: Buffer,
    declaredMimeType: string,
  ): Promise<ProcessedAvatarImage>;
}
