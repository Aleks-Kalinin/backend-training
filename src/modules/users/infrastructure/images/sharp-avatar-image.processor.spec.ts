import { describe, expect, it } from '@jest/globals';
import {
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import { AvatarSourceFormat } from '../../domain/avatar.constants';
import {
  SharpAvatarImageProcessor,
  sniffAvatarFormat,
} from './sharp-avatar-image.processor';

const image = (width: number, height: number) =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 50, b: 50 },
    },
  });

describe('SharpAvatarImageProcessor', () => {
  const processor = new SharpAvatarImageProcessor();

  it.each([
    ['image/png', () => image(64, 32).png().toBuffer()],
    ['image/jpeg', () => image(64, 32).jpeg().toBuffer()],
    ['image/webp', () => image(64, 32).webp().toBuffer()],
  ])('re-encodes %s to WebP', async (mimeType, build) => {
    const result = await processor.process(await build(), mimeType);

    const metadata = await sharp(result.content).metadata();
    expect(metadata.format).toBe('webp');
    expect(result).toMatchObject({ width: 64, height: 32 });
  });

  it('downscales to fit 1024x1024 while preserving aspect ratio', async () => {
    const input = await image(2048, 1024).png().toBuffer();

    const result = await processor.process(input, 'image/png');

    expect(result.width).toBe(1024);
    expect(result.height).toBe(512);
  });

  it('does not enlarge small images', async () => {
    const input = await image(100, 200).png().toBuffer();

    const result = await processor.process(input, 'image/png');

    expect(result).toMatchObject({ width: 100, height: 200 });
  });

  it('strips EXIF metadata', async () => {
    const input = await image(40, 40)
      .jpeg()
      .withExif({ IFD0: { Copyright: 'secret-owner', Artist: 'someone' } })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const result = await processor.process(input, 'image/jpeg');

    const metadata = await sharp(result.content).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(result.content.includes(Buffer.from('secret-owner'))).toBe(false);
  });

  it('rejects unsupported declared media types with 415', async () => {
    const input = await image(10, 10).gif().toBuffer();

    await expect(processor.process(input, 'image/gif')).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('rejects a supported declared type whose content is another image format with 415', async () => {
    const gif = await image(10, 10).gif().toBuffer();

    await expect(processor.process(gif, 'image/png')).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('rejects content that does not match the declared type with 415', async () => {
    const jpeg = await image(10, 10).jpeg().toBuffer();

    await expect(processor.process(jpeg, 'image/png')).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('rejects non-image bytes with 400', async () => {
    await expect(
      processor.process(Buffer.from('definitely not an image'), 'image/png'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects truncated image data with 400', async () => {
    const png = await image(256, 256).png().toBuffer();

    await expect(
      processor.process(png.subarray(0, png.length / 2), 'image/png'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects images above the pixel limit with 400', async () => {
    const limited = new SharpAvatarImageProcessor({
      maxInputPixels: 100 * 100,
    });
    const input = await image(101, 100).png().toBuffer();

    await expect(limited.process(input, 'image/png')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('sniffAvatarFormat', () => {
  it('detects formats from magic bytes', async () => {
    expect(sniffAvatarFormat(await image(2, 2).png().toBuffer())).toBe(
      AvatarSourceFormat.PNG,
    );
    expect(sniffAvatarFormat(await image(2, 2).jpeg().toBuffer())).toBe(
      AvatarSourceFormat.JPEG,
    );
    expect(sniffAvatarFormat(await image(2, 2).webp().toBuffer())).toBe(
      AvatarSourceFormat.WEBP,
    );
    expect(sniffAvatarFormat(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffAvatarFormat(Buffer.alloc(0))).toBeNull();
  });
});
