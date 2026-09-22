import { ImageConversionOptions } from '../../domain/image-conversion-options';

export const CONVERSION_ENGINE = Symbol('CONVERSION_ENGINE');

export interface ConversionEngine {
  convertText(
    buffer: Buffer,
    originalFormat: string,
    targetFormat: string,
    signal?: AbortSignal,
  ): Promise<string>;
  convertImage(
    buffer: Buffer,
    originalFormat: string,
    targetFormat: string,
    options: ImageConversionOptions,
    signal?: AbortSignal,
  ): Promise<Buffer>;
  close(): Promise<void>;
}
