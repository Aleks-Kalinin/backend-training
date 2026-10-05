import {
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import {
  AvatarImageProcessor,
  ProcessedAvatarImage,
} from '../../application/ports/avatar-image-processor.port';
import {
  AVATAR_MAX_DIMENSION,
  AVATAR_MAX_INPUT_PIXELS,
  AVATAR_MIME_TO_FORMAT,
  AvatarSourceFormat,
} from '../../domain/avatar.constants';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** Identifies the real image format from its leading bytes. */
export function sniffAvatarFormat(content: Buffer): AvatarSourceFormat | null {
  if (
    content.length >= 3 &&
    content[0] === 0xff &&
    content[1] === 0xd8 &&
    content[2] === 0xff
  ) {
    return AvatarSourceFormat.JPEG;
  }

  if (
    content.length >= PNG_SIGNATURE.length &&
    content.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    return AvatarSourceFormat.PNG;
  }

  if (
    content.length >= 12 &&
    content.toString('ascii', 0, 4) === 'RIFF' &&
    content.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return AvatarSourceFormat.WEBP;
  }

  return null;
}

export interface SharpAvatarImageProcessorOptions {
  maxInputPixels?: number;
  maxDimension?: number;
}

/** Registered through a factory provider because it takes plain options. */
export class SharpAvatarImageProcessor implements AvatarImageProcessor {
  private readonly maxInputPixels: number;
  private readonly maxDimension: number;

  constructor(options: SharpAvatarImageProcessorOptions = {}) {
    this.maxInputPixels = options.maxInputPixels ?? AVATAR_MAX_INPUT_PIXELS;
    this.maxDimension = options.maxDimension ?? AVATAR_MAX_DIMENSION;
  }

  async process(
    content: Buffer,
    declaredMimeType: string,
  ): Promise<ProcessedAvatarImage> {
    const declaredFormat =
      AVATAR_MIME_TO_FORMAT[declaredMimeType.toLowerCase()];
    if (!declaredFormat) {
      throw new UnsupportedMediaTypeException(
        'Unsupported image type. Use JPEG, PNG, or WebP.',
      );
    }

    const actualFormat = sniffAvatarFormat(content);
    if (!actualFormat) {
      // Distinguish "a different, unsupported image" from "not an image".
      if (await this.isDecodableImage(content)) {
        throw new UnsupportedMediaTypeException(
          'Unsupported image type. Use JPEG, PNG, or WebP.',
        );
      }
      throw new BadRequestException('Invalid image data');
    }

    if (actualFormat !== declaredFormat) {
      throw new UnsupportedMediaTypeException(
        'Image content does not match the declared media type',
      );
    }

    try {
      // Sharp drops EXIF/ICC/XMP metadata unless explicitly kept, so the
      // re-encoded output is metadata-free. Orientation is applied first so
      // stripping EXIF does not rotate the picture.
      const { data, info } = await sharp(content, {
        limitInputPixels: this.maxInputPixels,
        failOn: 'warning',
        animated: false,
      })
        .autoOrient()
        .resize(this.maxDimension, this.maxDimension, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp()
        .toBuffer({ resolveWithObject: true });

      return { content: data, width: info.width, height: info.height };
    } catch {
      throw new BadRequestException('Invalid or corrupt image data');
    }
  }

  private async isDecodableImage(content: Buffer): Promise<boolean> {
    try {
      const metadata = await sharp(content, {
        limitInputPixels: this.maxInputPixels,
      }).metadata();
      return Boolean(metadata.format);
    } catch {
      return false;
    }
  }
}
