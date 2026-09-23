import { ImageFileFormat } from '../../domain/image-file-format.enum';
import { TextFileFormat } from '../../domain/text-file-format.enum';

export const MIN_TO_TEXT_FORMAT: Record<string, TextFileFormat> = {
  'text/csv': TextFileFormat.CSV,
  'text/xml': TextFileFormat.XML,
  'text/yaml': TextFileFormat.YAML,
  'application/json': TextFileFormat.JSON,
  'application/yaml': TextFileFormat.YAML,
  'application/xml': TextFileFormat.XML,
  'application/x-yaml': TextFileFormat.YAML,
  'application/x-yml': TextFileFormat.YAML,
  'application/x-json': TextFileFormat.JSON,
  'application/x-csv': TextFileFormat.CSV,
};

export const EXT_TO_TEXT_FORMAT: Record<string, TextFileFormat> = {
  json: TextFileFormat.JSON,
  csv: TextFileFormat.CSV,
  xml: TextFileFormat.XML,
  yaml: TextFileFormat.YAML,
  yml: TextFileFormat.YAML,
};

export const MIN_TO_IMAGE_FORMAT: Record<string, ImageFileFormat> = {
  'image/jpeg': ImageFileFormat.JPEG,
  'image/png': ImageFileFormat.PNG,
  'image/svg+xml': ImageFileFormat.SVG,
  'image/jpg': ImageFileFormat.JPEG,
};

export const EXT_TO_IMAGE_FORMAT: Record<string, ImageFileFormat> = {
  jpeg: ImageFileFormat.JPEG,
  jpg: ImageFileFormat.JPEG,
  png: ImageFileFormat.PNG,
  svg: ImageFileFormat.SVG,
};

export function detectTextFormat(
  mimetype: string,
  filename: string,
): TextFileFormat | null {
  if (MIN_TO_TEXT_FORMAT[mimetype]) return MIN_TO_TEXT_FORMAT[mimetype];

  const ext = filename.slice(filename.lastIndexOf('.') + 1);
  return EXT_TO_TEXT_FORMAT[ext.toLowerCase()] ?? null;
}

export function detectImageFormat(
  mimetype: string,
  filename: string,
): ImageFileFormat | null {
  if (MIN_TO_IMAGE_FORMAT[mimetype]) return MIN_TO_IMAGE_FORMAT[mimetype];

  const ext = filename.slice(filename.lastIndexOf('.') + 1);
  return EXT_TO_IMAGE_FORMAT[ext.toLowerCase()] ?? null;
}
