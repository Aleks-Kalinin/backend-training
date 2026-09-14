import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { XMLParser } from 'fast-xml-parser';
import XMLBuilder from 'fast-xml-builder';
import yaml from 'yaml';
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { ImageFileFormat } from '../../domain/image-file-format.enum';
import { ImageConversionOptions } from '../../domain/image-conversion-options';
import {
  IMAGE_CONVERSION_MAX_SIZE,
  IMAGE_CONVERSION_MIN_QUALITY,
  IMAGE_CONVERSION_MAX_QUALITY,
  IMAGE_CONVERSION_MIN_SIZE,
} from '../../application/constants/image-conversion-restrictions';
import { isString } from 'class-validator';
import DOMPurify from 'isomorphic-dompurify';
import { MAX_PIXEL_LIMIT } from '../../application/constants/max-pixel-limit';

export interface TextTaskData {
  buffer: Uint8Array;
  originalFormat: string;
  targetFormat: string;
}

export interface ImageTaskData {
  buffer: Uint8Array;
  originalFormat: string;
  targetFormat: string;
  options: ImageConversionOptions;
}

function decodeTextBuffer(fileBuffer: Buffer): string {
  // UTF-8 BOM (EF BB BF)
  if (
    fileBuffer[0] === 0xef &&
    fileBuffer[1] === 0xbb &&
    fileBuffer[2] === 0xbf
  ) {
    return fileBuffer.subarray(3).toString('utf8');
  }

  // UTF-16 LE BOM (FF FE)
  if (fileBuffer[0] === 0xff && fileBuffer[1] === 0xfe) {
    return fileBuffer.subarray(2).toString('utf16le');
  }

  // UTF-16 BE BOM (FE FF)
  if (fileBuffer[0] === 0xfe && fileBuffer[1] === 0xff) {
    const payload = fileBuffer.subarray(2);
    // Ensure even byte length before swapping to prevent ERR_INVALID_BUFFER_SIZE
    const safePayload =
      payload.length % 2 === 0
        ? payload
        : payload.subarray(0, payload.length - 1);
    const swapped = Buffer.from(safePayload);
    swapped.swap16();
    return swapped.toString('utf16le');
  }

  // Default fallback: UTF-8 without BOM
  return fileBuffer.toString('utf8');
}

export async function convertTextFile({
  buffer,
  originalFormat,
  targetFormat,
}: TextTaskData): Promise<string> {
  const fileBuffer = Buffer.from(buffer);

  const content = decodeTextBuffer(fileBuffer);

  if (!content.trim()) {
    throw new Error('File content is empty');
  }

  let jsObject: any;

  if (originalFormat === 'csv') {
    jsObject = parseCsv(content, { columns: true, skip_empty_lines: true });
  } else if (originalFormat === 'json') {
    jsObject = JSON.parse(content);
  } else if (originalFormat === 'xml') {
    jsObject = new XMLParser({
      attributeNamePrefix: '@',
      processEntities: false,
      allowBooleanAttributes: false,
    }).parse(content);
  } else if (originalFormat === 'yaml') {
    jsObject = yaml.parse(content, { maxAliasCount: 100 });
  }

  if (typeof jsObject !== 'object' || jsObject === null) {
    throw new Error('Invalid structured data root entity');
  }

  if (targetFormat === 'csv') {
    // CSV requires an array of record objects or a single record object
    let records: any[];

    if (Array.isArray(jsObject)) {
      records = jsObject;
    } else {
      records = [jsObject];
    }

    if (records.length === 0) {
      throw new Error('Cannot convert empty dataset to CSV');
    }

    // Ensure array elements are objects rather than primitive elements
    const hasPrimitiveItem = records.some(
      (item) => typeof item !== 'object' || item === null,
    );
    if (hasPrimitiveItem) {
      throw new BadRequestException(
        'CSV conversion requires rows to be key-value objects',
      );
    }

    return stringifyCsv(records, { header: true });
  }

  if (targetFormat === 'json') {
    return JSON.stringify(jsObject, null, 2);
  }

  if (targetFormat === 'xml') {
    return new XMLBuilder({
      attributeNamePrefix: '@',
      arrayNodeName: 'item',
    }).build(jsObject);
  }

  if (targetFormat === 'yaml') {
    return yaml.stringify(jsObject);
  }

  throw new Error(`Unsupported text target format: ${targetFormat}`);
}

function sanitizeSvgContent(buffer: Uint8Array | Buffer): Buffer {
  const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const svgString = nodeBuffer.toString('utf-8');

  // Strip scripts, event handlers, frames, and embedded active elements
  const cleanSvg = DOMPurify.sanitize(svgString, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: [
      'script',
      'iframe',
      'foreignObject',
      'object',
      'embed',
      'form',
      'input',
    ],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus'],
  });

  // Ban remote assets (external URLs, CSS @import)
  const containsExternalResources =
    /href\s*=\s*["']?\s*https?:\/\//i.test(cleanSvg) ||
    /@import\s+url/i.test(cleanSvg) ||
    /url\s*\(\s*["']?\s*https?:\/\//i.test(cleanSvg);

  if (containsExternalResources) {
    throw new BadRequestException('SVG contains forbidden external resources');
  }

  return Buffer.from(cleanSvg);
}

export async function convertImageFile({
  buffer,
  originalFormat,
  targetFormat,
  options,
}: ImageTaskData) {
  if (
    (originalFormat === ImageFileFormat.PNG ||
      originalFormat === ImageFileFormat.JPEG) &&
    targetFormat === ImageFileFormat.SVG
  ) {
    throw new BadRequestException('Cannot convert raster image to SVG format');
  }

  const width = options?.width;
  const height = options?.height;
  const background = options?.background;
  const quality = options?.quality ?? 100;

  if (
    width &&
    (width < IMAGE_CONVERSION_MIN_SIZE.width ||
      width > IMAGE_CONVERSION_MAX_SIZE.width)
  ) {
    throw new BadRequestException('Invalid image width');
  }

  if (
    height &&
    (height < IMAGE_CONVERSION_MIN_SIZE.height ||
      height > IMAGE_CONVERSION_MAX_SIZE.height)
  ) {
    throw new BadRequestException('Invalid image height');
  }

  if (
    quality &&
    (quality < IMAGE_CONVERSION_MIN_QUALITY ||
      quality > IMAGE_CONVERSION_MAX_QUALITY)
  ) {
    throw new BadRequestException('Invalid image quality');
  }

  if (background && !isString(background)) {
    throw new BadRequestException('Invalid background color');
  }

  let inputBuffer = buffer;
  if (originalFormat === ImageFileFormat.SVG) {
    inputBuffer = sanitizeSvgContent(buffer);
  }

  let pipeline = sharp(inputBuffer, {
    limitInputPixels: MAX_PIXEL_LIMIT,
    density: 300, // Safe default density for rasterizing SVG vector elements
  });

  if (width && height) {
    pipeline = pipeline.resize(width, height, {
      fit: 'cover',
    });
  }

  if (background && originalFormat === ImageFileFormat.SVG) {
    pipeline = pipeline.flatten({
      background,
    });
  }

  if (targetFormat === ImageFileFormat.JPEG) {
    pipeline = pipeline.jpeg({ quality, mozjpeg: true });
  } else if (targetFormat === ImageFileFormat.PNG) {
    pipeline = pipeline.png({ quality, palette: true });
  } else {
    throw new BadRequestException('Unsupported target image format');
  }

  // Executed safely on the background libuv thread pool
  return await pipeline.toBuffer();
}
