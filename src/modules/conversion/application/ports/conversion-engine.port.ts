import { ImageConversionOptions } from '../../domain/image-conversion-options';

export const CONVERSION_ENGINE = Symbol('CONVERSION_ENGINE');

export interface ConvertTextParams {
  buffer: Buffer;
  originalFormat: string;
  targetFormat: string;
  signal?: AbortSignal;
}

export interface ConvertImageParams extends ConvertTextParams {
  options: ImageConversionOptions;
}

export interface ConversionEngine {
  convertText(params: ConvertTextParams): Promise<string>;
  convertImage(params: ConvertImageParams): Promise<Buffer>;
  close(): Promise<void>;
}
