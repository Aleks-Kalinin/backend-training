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
import {
  detectTextFormat,
  detectImageFormat,
} from './constants/mime-to-format.map';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { FILE_SIZE_LIMITS } from './constants/file-size-limit';
import { randomUUID, UUID } from 'node:crypto';
import * as os from 'node:os';
import { FILE_TYPE } from './constants/file-type';
import { ImageConversionOptions } from '../domain/image-conversion-options';
import { TransformationHistoryItemEntity } from '../infrastructure/entity/transformation-history-item.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { FILE_CONVERSION_STATUS } from './constants/file-conversion-status';
import { FastifyRequest } from 'fastify';

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      let rawFilePart: MultipartFile | undefined;
      let fileBuffer: Buffer | undefined;
      let options: ImageConversionOptions = {};

      // 1. Parse Multipart Stream
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          rawFilePart = part;
          sourceFormat =
            fileType === FILE_TYPE.IMAGE
              ? detectImageFormat(part.mimetype, part.filename)
              : detectTextFormat(part.mimetype, part.filename);

          try {
            fileBuffer = await part.toBuffer();
            fileSize = fileBuffer.length;
          } catch (err: any) {
            if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
              throw new PayloadTooLargeException('File size exceeds limit');
            }
            throw err;
          }
        } else if (part.fieldname === 'targetFormat') {
          targetFormat = part.value as string;
        } else if (part.fieldname === 'options') {
          try {
            options = JSON.parse(part.value as string);
          } catch {
            throw new BadRequestException('Invalid options JSON');
          }
        }
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
      const normalizedError =
        error.name === 'AbortError'
          ? new RequestTimeoutException(
              'File conversion timed out after 30 seconds',
            )
          : error instanceof BadRequestException ||
              error instanceof UnsupportedMediaTypeException ||
              error instanceof PayloadTooLargeException
            ? error
            : new BadRequestException(
                error.message || 'File conversion failed',
              );

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
