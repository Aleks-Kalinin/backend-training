import { TextFileFormat } from '../../domain/text-file-format.enum';
import { ImageFileFormat } from '../../domain/image-file-format.enum';

const MB = 1024 * 1024;

export const FILE_SIZE_LIMITS: Record<
  TextFileFormat | ImageFileFormat,
  number
> = {
  [TextFileFormat.JSON]: 5 * MB,
  [TextFileFormat.YAML]: 5 * MB,
  [TextFileFormat.XML]: 5 * MB,
  [TextFileFormat.CSV]: 5 * MB,

  [ImageFileFormat.JPEG]: 5 * MB,
  [ImageFileFormat.JPG]: 5 * MB,
  [ImageFileFormat.PNG]: 5 * MB,
  [ImageFileFormat.SVG]: 5 * MB,
};

export const GLOBAL_MAX_FILE_SIZE = Math.max(
  ...Object.values(FILE_SIZE_LIMITS),
);
