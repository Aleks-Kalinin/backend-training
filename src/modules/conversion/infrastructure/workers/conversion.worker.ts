import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { XMLParser } from 'fast-xml-parser';
import XMLBuilder from 'fast-xml-builder';
import yaml from 'yaml';
import { BadRequestException } from '@nestjs/common';

export interface TextTaskData {
  buffer: Uint8Array;
  originalFormat: string;
  targetFormat: string;
}

export interface ImageTaskData {
  buffer: Uint8Array;
  originalFormat: string;
  targetFormat: string;
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

export async function convertImageFile({
  buffer,
  originalFormat,
  targetFormat,
}: ImageTaskData) {
  console.log(buffer);
  console.log(originalFormat);
  console.log(targetFormat);
}
