import {
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  RequestTimeoutException,
  OnModuleDestroy,
  BadRequestException,
} from '@nestjs/common';
import Piscina from 'piscina';
import { TextFileFormat } from '../domain/text-file-format.enum';
import { ImageFileFormat } from '../domain/image-file-format.enum';
import { type MultipartFile } from '@fastify/multipart';
import { detectTextFormat } from './constants/mime-to-format.map';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { FILE_SIZE_LIMIT } from './constants/file-size-limit';
import { randomUUID } from 'node:crypto';
import * as os from 'node:os';

@Injectable()
export class ConversionService implements OnModuleDestroy {
  private piscina: Piscina;
  constructor() {
    this.piscina = new Piscina({
      filename: path.resolve(
        __dirname,
        '../infrastructure/workers/conversion.worker.js',
      ),
      maxThreads: Math.max(1, Math.floor(os.cpus().length / 2)),
    });
  }

  async onModuleDestroy() {
    await this.piscina.destroy();
  }

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
    signal: AbortSignal,
  ): Promise<{ content: string | Buffer; filePath: string }> {
    const originalFormat = detectTextFormat(file.mimetype, file.filename);

    if (!originalFormat) {
      throw new UnsupportedMediaTypeException('Unsupported file format');
    }

    if (signal?.aborted) {
      throw new RequestTimeoutException('File conversion timed out');
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

    const workerTaskName = isTextFile ? 'convertTextFile' : 'convertImageFile';

    try {
      const convertedContent = await this.piscina.run(
        {
          buffer,
          originalFormat,
          targetFormat,
        },
        {
          name: workerTaskName,
          signal,
        },
      );

      const savedFilePath = await this.saveLocally(
        convertedContent,
        targetFormat,
      );

      return {
        content: convertedContent,
        filePath: savedFilePath,
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new RequestTimeoutException('File conversion timed out');
      }
      throw new BadRequestException(error.message || 'File conversion failed');
    }
  }
}
