import { type MultipartFile } from '@fastify/multipart';
import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  PayloadTooLargeException,
  RequestTimeoutException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FastifyRequest } from 'fastify';
import { randomUUID, UUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import Piscina from 'piscina';
import { Repository } from 'typeorm';
import { ImageConversionOptions } from '../domain/image-conversion-options';
import { ImageFileFormat } from '../domain/image-file-format.enum';
import { TextFileFormat } from '../domain/text-file-format.enum';
import { TransformationHistoryItemEntity } from '../infrastructure/entity/transformation-history-item.entity';
import { FILE_CONVERSION_STATUS } from './constants/file-conversion-status';
import { FILE_SIZE_LIMITS } from './constants/file-size-limit';
import { FILE_TYPE } from './constants/file-type';
import {
  detectImageFormat,
  detectTextFormat,
} from './constants/mime-to-format.map';

interface LogHistoryParams {
  type: FILE_TYPE;
  sourceFormat: string;
  targetFormat: string;
  status: FILE_CONVERSION_STATUS;
  fileSize: number;
  startTime: number;
  errorCode?: string;
  userId: UUID;
}

@Injectable()
export class ConversionService implements OnModuleDestroy {
  private piscina: Piscina;
  constructor(
    @InjectRepository(TransformationHistoryItemEntity)
    private readonly transformationHistoryRepository: Repository<TransformationHistoryItemEntity>,
  ) {
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

  async convertMultipartRequest(
    req: FastifyRequest,
    fileType: FILE_TYPE,
    userId: UUID,
  ): Promise<{ content: string | Buffer; targetFormat: string }> {
    const startTime = performance.now();
    let sourceFormat: string | null = null;
    let targetFormat: string | null = null;
    let fileSize = 0;
    let streamError: Error | null = null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      let rawFilePart: MultipartFile | undefined;
      let fileBuffer: Buffer | undefined;
      let options: ImageConversionOptions = {};

      // 1. Parse Multipart Stream
      for await (const part of req.parts()) {
        if (part.type === 'field') {
          if (part.fieldname === 'targetFormat') {
            targetFormat = part.value as string;
          } else if (part.fieldname === 'options') {
            try {
              options = JSON.parse(part.value as string);
            } catch {
              streamError = streamError ?? new BadRequestException('Invalid options JSON');
            }
          }
        } else if (part.type === 'file') {
          rawFilePart = part;
          sourceFormat =
            fileType === FILE_TYPE.IMAGE
              ? detectImageFormat(part.mimetype, part.filename)
              : detectTextFormat(part.mimetype, part.filename);

          try {
            fileBuffer = await part.toBuffer();
            fileSize = fileBuffer.length;
          } catch (err: any) {
            fileSize = part.file?.bytesRead ?? 0;

            if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
              streamError = new PayloadTooLargeException('File size exceeds global upload limit');
            } else {
              streamError = err
            };
          }
        }
      }

      if (streamError) {
        throw streamError;
      }

      // 2. Early Input Validations
      if (!rawFilePart || !fileBuffer) {
        throw new BadRequestException('File is required');
      }
      if (!targetFormat) {
        throw new BadRequestException('targetFormat field is required');
      }
      if (fileSize === 0) {
        throw new BadRequestException('File is empty');
      }
      if (!sourceFormat) {
        throw new UnsupportedMediaTypeException(
          'Unsupported source file format',
        );
      }

      const isValidTarget =
        fileType === FILE_TYPE.IMAGE
          ? Object.values(ImageFileFormat).includes(
            targetFormat as ImageFileFormat,
          )
          : Object.values(TextFileFormat).includes(
            targetFormat as TextFileFormat,
          );

      if (!isValidTarget) {
        throw new UnsupportedMediaTypeException('Invalid target format');
      }

      // 3. Size Limit Enforcement
      const fileSizeLimit = FILE_SIZE_LIMITS[targetFormat];
      if (fileSizeLimit && fileSize > fileSizeLimit) {
        throw new PayloadTooLargeException(
          'File size exceeds target format limit',
        );
      }

      // 4. Identity Conversion Guard
      if (sourceFormat === targetFormat) {
        await this.logHistory({
          type: fileType,
          sourceFormat,
          targetFormat,
          status: FILE_CONVERSION_STATUS.SUCCESS,
          fileSize,
          startTime,
          userId,
        });

        return { content: fileBuffer, targetFormat };
      }

      // 5. Off-load Task to Worker Pool
      const isTextFile = fileType === FILE_TYPE.TEXT;
      const workerTaskName = isTextFile
        ? 'convertTextFile'
        : 'convertImageFile';

      const convertedContent = await this.piscina.run(
        {
          buffer: fileBuffer,
          originalFormat: sourceFormat,
          targetFormat,
          options,
        },
        {
          name: workerTaskName,
          signal: controller.signal,
        },
      );

      await this.saveLocally(convertedContent, targetFormat);

      // 6. Record Success
      await this.logHistory({
        type: fileType,
        sourceFormat,
        targetFormat,
        status: FILE_CONVERSION_STATUS.SUCCESS,
        fileSize,
        startTime,
        userId,
      });

      return { content: convertedContent, targetFormat };
    } catch (error: any) {
      let normalizedError: Error;

      if (
        error?.code === 'FST_REQ_FILE_TOO_LARGE' ||
        error instanceof PayloadTooLargeException
      ) {
        normalizedError = new PayloadTooLargeException(
          'File size exceeds global upload limit',
        );
      } else if (error.name === 'AbortError') {
        normalizedError = new RequestTimeoutException(
          'File conversion timed out after 30 seconds',
        );
      } else if (
        error instanceof BadRequestException ||
        error instanceof UnsupportedMediaTypeException
      ) {
        normalizedError = error;
      } else {
        normalizedError = new BadRequestException(
          error.message || 'File conversion failed',
        );
      }

      // Always records DB log, capturing fileSize (if read) and fallback values
      await this.logHistory({
        type: fileType,
        sourceFormat: sourceFormat ?? 'UNKNOWN',
        targetFormat: targetFormat ?? 'UNKNOWN',
        status: FILE_CONVERSION_STATUS.ERROR,
        fileSize,
        startTime,
        errorCode: normalizedError.constructor.name || 'UNKNOWN_ERROR',
        userId,
      });

      throw normalizedError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getHistory(userId: UUID) {
    return this.transformationHistoryRepository.find({ where: { userId } });
  }

  private async logHistory({
    type,
    sourceFormat,
    targetFormat,
    status,
    fileSize,
    startTime,
    errorCode,
    userId,
  }: LogHistoryParams) {
    const durationMs = Math.round(performance.now() - startTime);

    try {
      await this.transformationHistoryRepository.save({
        type,
        sourceFormat,
        targetFormat,
        status,
        fileSize,
        durationMs,
        errorCode,
        createdAt: new Date(),
        userId,
      });
    } catch (dbError) {
      console.error('Failed to log transformation history:', dbError);
    }
  }
}
