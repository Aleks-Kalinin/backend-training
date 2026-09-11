import {
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { File } from '../infrastructure/entity/file.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TextFileFormat } from '../domain/text-file-format.enum';
import { ImageFileFormat } from '../domain/image-file-format.enum';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { XMLParser } from 'fast-xml-parser';
import XMLBuilder from 'fast-xml-builder';
import yaml from 'yaml';
import { type MultipartFile } from '@fastify/multipart';
import { detectTextFormat } from './constants/mime-to-format.map';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

const FILE_SIZE_LIMIT = 1024 * 1024 * 5; // 5MB

@Injectable()
export class ConversionService {
  constructor() {}
  private async saveLocally(content: string | Buffer, extension: string) {
    const uploadDir = path.join(process.cwd(), 'uploads');

    await fs.mkdir(uploadDir, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    const filePath = path.join(uploadDir, filename);
    await fs.writeFile(filePath, content);
    return filePath;
  }
  async convertFile(
    file: MultipartFile,
    targetFormat: TextFileFormat | ImageFileFormat,
  ): Promise<{ content: string | Buffer; filePath: string }> {
    const originalFormat = detectTextFormat(file.mimetype, file.filename);
    if (!originalFormat) {
      throw new UnsupportedMediaTypeException('Unsupported file format');
    }

    const buffer = await file.toBuffer();
    if (buffer.length > FILE_SIZE_LIMIT) {
      throw new PayloadTooLargeException('File size exceeds limit');
    }

    if (originalFormat === targetFormat) {
      return {
        content: buffer,
        filePath: 'N/A',
      };
    }

    const isTextFile = Object.values(TextFileFormat).includes(originalFormat);
    if (!isTextFile) {
      throw new UnsupportedMediaTypeException('Unsupported file format');
    }

    const convertedTextFile = await this.convertTextFile(
      buffer,
      originalFormat,
      targetFormat as TextFileFormat,
    );
    const savedFilePath = await this.saveLocally(
      convertedTextFile,
      targetFormat,
    );

    return {
      content: convertedTextFile,
      filePath: savedFilePath,
    };

    // if (isImageFile) {
    //     return this.convertImageFile(buffer, originalFormat as ImageFileFormat, targetFormat as ImageFileFormat)
    // }
  }
  async convertTextFile(
    file: Buffer,
    originalFormat: TextFileFormat,
    targetFormat: TextFileFormat,
  ) {
    let jsObject;

    const hasBom = file[0] === 0xef && file[1] === 0xbb && file[2] === 0xbf;
    const content = (hasBom ? file.slice(3) : file).toString('utf8');

    if (originalFormat === TextFileFormat.CSV)
      jsObject = parseCsv(content, { columns: true });
    if (originalFormat === TextFileFormat.JSON) jsObject = JSON.parse(content);
    if (originalFormat === TextFileFormat.XML)
      jsObject = new XMLParser({
        attributeNamePrefix: '@',
        isArray: (_name, _jPath, isLeaf) => !isLeaf,
        processEntities: false,
        allowBooleanAttributes: false,
      }).parse(content);
    if (originalFormat === TextFileFormat.YAML) jsObject = yaml.parse(content);

    if (targetFormat === TextFileFormat.CSV) {
      const records = Array.isArray(jsObject) ? jsObject : [jsObject];
      return stringifyCsv(records, { header: true });
    }
    if (targetFormat === TextFileFormat.JSON) return JSON.stringify(jsObject);
    if (targetFormat === TextFileFormat.XML)
      return new XMLBuilder({
        attributeNamePrefix: '@',
        arrayNodeName: 'item',
      }).build(jsObject);
    if (targetFormat === TextFileFormat.YAML) return yaml.stringify(jsObject);

    // default return original format buffer if no match
    return file;
  }

  async convertImageFile(
    file: Buffer,
    originalFormat: ImageFileFormat,
    targetFormat: ImageFileFormat,
  ) {
    console.log(file);
    console.log(originalFormat);
    console.log(targetFormat);
    // TODO: Implement in a separate branch in phase 2
  }
}
