import { type MultipartFile } from '@fastify/multipart';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  PayloadTooLargeException,
  RequestTimeoutException,
  StreamableFile,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { UUID } from 'node:crypto';
import { ImageConversionOptions } from '../domain/image-conversion-options';
import { ImageFileFormat } from '../domain/image-file-format.enum';
import { TextFileFormat } from '../domain/text-file-format.enum';
import { GetHistoryQueryDto } from '../dto/get-history-query.dto';
import { FILE_CONVERSION_STATUS } from './constants/file-conversion-status';
import { FILE_SIZE_LIMITS } from './constants/file-size-limit';
import { FILE_TYPE } from './constants/file-type';
import {
  detectImageFormat,
  detectTextFormat,
} from './constants/mime-to-format.map';
import type { ConversionEngine } from './ports/conversion-engine.port';
import { CONVERSION_ENGINE } from './ports/conversion-engine.port';
import type { FileStorage } from './ports/file-storage.port';
import { FILE_STORAGE } from './ports/file-storage.port';
import type { HistoryRepository } from './ports/history-repository.port';
import { HISTORY_REPOSITORY } from './ports/history-repository.port';

interface CursorPayload {
  id: string;
  createdAt: string;
}

interface createHistoryEntryParams {
  type: FILE_TYPE;
  sourceFormat: string;
  targetFormat: string;
  status: FILE_CONVERSION_STATUS;
  fileSize: number;
  startTime: number;
  errorCode?: number | null;
  userId: UUID;
  fileId: UUID | null;
}

@Injectable()
export class ConversionService implements OnModuleDestroy {
  private logger = new Logger(ConversionService.name);
  constructor(
    @Inject(CONVERSION_ENGINE)
    private readonly conversionEngine: ConversionEngine,
    @Inject(FILE_STORAGE)
    private readonly fileStorage: FileStorage,
    @Inject(HISTORY_REPOSITORY)
    private readonly historyRepository: HistoryRepository,
  ) {}

  private logConversionProcess(
    actorUserId: UUID,
    targetFormat: string,
    sourceFormat: string,
    fileSize: number,
    status: HttpStatus,
  ) {
    this.logger.log(
      JSON.stringify({
        event: 'CONVERT_FILE',
        actorUserId,
        targetFormat,
        sourceFormat,
        fileSize,
        status,
      }),
    );
  }

  private enqueueSavedFilePersistence(
    convertedContent: string | Buffer,
    targetFormat: string,
    fileType: FILE_TYPE,
    sourceFormat: string,
    userId: UUID,
    fileSize: number,
    startTime: number,
  ): void {
    void (async () => {
      try {
        const savedFile = await this.fileStorage.save(
          convertedContent,
          targetFormat,
        );

        this.logger.log(
          JSON.stringify({
            type: 'SAVE',
            userId,
            targetFormat,
            fileId: savedFile.id,
            HttpStatus: HttpStatus.OK,
          }),
        );

        await this.createHistoryEntry({
          type: fileType,
          sourceFormat,
          targetFormat,
          status: FILE_CONVERSION_STATUS.SUCCESS,
          fileSize,
          startTime,
          userId,
          fileId: savedFile.id as UUID,
        });
      } catch (error) {
        this.logger.error(
          'Failed to persist converted file asynchronously',
          error,
        );
        await this.createHistoryEntry({
          type: fileType,
          sourceFormat,
          targetFormat,
          status: FILE_CONVERSION_STATUS.ERROR,
          fileSize,
          startTime,
          userId,
          fileId: null,
          errorCode: HttpStatus.INTERNAL_SERVER_ERROR,
        });
      }
    })();
  }

  async onModuleDestroy() {
    await this.conversionEngine.close();
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
    let shouldSave = false;
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
          } else if (part.fieldname === 'save') {
            shouldSave = part.value === 'true';
          } else if (part.fieldname === 'options') {
            try {
              options = JSON.parse(part.value as string);
              if (options.save !== undefined) {
                shouldSave = Boolean(options.save);
              }
            } catch {
              streamError =
                streamError ?? new BadRequestException('Invalid options JSON');
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
              streamError = new PayloadTooLargeException(
                'File size exceeds global upload limit',
              );
            } else {
              streamError = err;
            }
          }
        }
      }

      if (streamError) throw streamError;
      if (!rawFilePart || !fileBuffer) {
        this.logConversionProcess(
          userId,
          targetFormat ?? '',
          sourceFormat ?? '',
          fileSize,
          HttpStatus.BAD_REQUEST,
        );
        throw new BadRequestException('File is required');
      }
      if (!targetFormat) {
        this.logConversionProcess(
          userId,
          targetFormat ?? '',
          sourceFormat ?? '',
          fileSize,
          HttpStatus.BAD_REQUEST,
        );
        throw new BadRequestException('targetFormat field is required');
      }
      if (fileSize === 0) {
        this.logConversionProcess(
          userId,
          targetFormat,
          sourceFormat ?? '',
          fileSize,
          HttpStatus.BAD_REQUEST,
        );
        throw new BadRequestException('File is empty');
      }
      if (!sourceFormat) {
        this.logConversionProcess(
          userId,
          targetFormat,
          sourceFormat ?? '',
          fileSize,
          HttpStatus.BAD_REQUEST,
        );
        throw new UnsupportedMediaTypeException('Unsupported source format');
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
        this.logConversionProcess(
          userId,
          targetFormat,
          sourceFormat,
          fileSize,
          HttpStatus.BAD_REQUEST,
        );
        throw new UnsupportedMediaTypeException('Invalid target format');
      }

      // 3. Size Limit Enforcement
      const fileSizeLimit = FILE_SIZE_LIMITS[targetFormat];
      if (fileSizeLimit && fileSize > fileSizeLimit) {
        this.logConversionProcess(
          userId,
          targetFormat,
          sourceFormat,
          fileSize,
          HttpStatus.PAYLOAD_TOO_LARGE,
        );
        throw new PayloadTooLargeException(
          'File size exceeds target format limit',
        );
      }

      // 4. Identity Conversion Guard
      if (sourceFormat === targetFormat) {
        if (shouldSave) {
          this.enqueueSavedFilePersistence(
            fileBuffer,
            targetFormat,
            fileType,
            sourceFormat,
            userId,
            fileSize,
            startTime,
          );
          return { content: fileBuffer, targetFormat };
        }

        await this.createHistoryEntry({
          type: fileType,
          sourceFormat,
          targetFormat,
          status: FILE_CONVERSION_STATUS.SUCCESS,
          fileSize,
          startTime,
          userId,
          fileId: null,
        });

        return { content: fileBuffer, targetFormat };
      }

      // 5. Off-load Task to Worker Pool
      const convertedContent =
        fileType === FILE_TYPE.TEXT
          ? await this.conversionEngine.convertText(
              fileBuffer,
              sourceFormat,
              targetFormat,
              controller.signal,
            )
          : await this.conversionEngine.convertImage(
              fileBuffer,
              sourceFormat,
              targetFormat,
              options,
              controller.signal,
            );

      if (shouldSave) {
        this.enqueueSavedFilePersistence(
          convertedContent,
          targetFormat,
          fileType,
          sourceFormat,
          userId,
          fileSize,
          startTime,
        );
        return { content: convertedContent, targetFormat };
      }

      // 6. Record Success
      await this.createHistoryEntry({
        type: fileType,
        sourceFormat,
        targetFormat,
        status: FILE_CONVERSION_STATUS.SUCCESS,
        fileSize,
        startTime,
        userId,
        fileId: null,
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
      await this.createHistoryEntry({
        type: fileType,
        sourceFormat: sourceFormat ?? 'UNKNOWN',
        targetFormat: targetFormat ?? 'UNKNOWN',
        status: FILE_CONVERSION_STATUS.ERROR,
        fileSize,
        startTime,
        errorCode:
          normalizedError instanceof HttpException
            ? normalizedError.getStatus()
            : 500,
        userId,
        fileId: null,
      });

      this.logConversionProcess(
        userId,
        targetFormat ?? '',
        sourceFormat ?? '',
        fileSize,
        normalizedError instanceof HttpException
          ? normalizedError.getStatus()
          : 500,
      );
      throw normalizedError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getHistory(
    userId: UUID,
    targetUserId: UUID,
    query: GetHistoryQueryDto,
  ) {
    const {
      cursor,
      limit = 20,
      type,
      sourceFormat,
      targetFormat,
      status,
      createdAtFrom,
      createdAtTo,
    } = query;

    let cursorPayload: CursorPayload | undefined;
    if (cursor) {
      cursorPayload = this.decodeCursor(cursor);
    }
    const res = await this.historyRepository.find({
      userId: String(userId),
      limit,
      cursor: cursorPayload
        ? { id: cursorPayload.id, createdAt: new Date(cursorPayload.createdAt) }
        : undefined,
      type,
      sourceFormat,
      targetFormat,
      status,
      createdAtFrom,
      createdAtTo,
    });
    let nextCursor: string | null = null;
    if (res.length > limit) {
      res.pop();
      if (res.length > 0) {
        const lastItem = res[res.length - 1];
        nextCursor = this.encodeCursor({
          id: lastItem.id,
          createdAt: lastItem.createdAt.toISOString(),
        });
      }
    }
    this.logger.log(
      JSON.stringify({
        type: 'GET_HISTORY',
        userId,
        targetUserId,
        HttpStatus: HttpStatus.OK,
        length: res.length,
      }),
    );
    return { items: res, nextCursor };
  }

  private encodeCursor(payload: CursorPayload): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  private decodeCursor(cursor: string): CursorPayload {
    try {
      const json = Buffer.from(cursor, 'base64').toString('utf-8');
      const payload = JSON.parse(json);

      if (
        !payload.id ||
        !payload.createdAt ||
        isNaN(Date.parse(payload.createdAt))
      ) {
        throw new Error('Invalid cursor keys');
      }

      return payload;
    } catch {
      throw new BadRequestException('Invalid pagination cursor');
    }
  }

  async getFileForDownload(userId: UUID, itemId: UUID) {
    const historyItem = await this.historyRepository.findFile(
      String(userId),
      String(itemId),
    );

    if (!historyItem || !historyItem.file) {
      this.logger.log(`No file found for user ${userId} and item ${itemId}`);
      throw new NotFoundException(
        'Transformation record or associated file not found',
      );
    }

    const filePath = historyItem.file.filePath;
    if (!(await this.fileStorage.exists(filePath))) {
      this.logger.log(`File not found for user ${userId} and item ${itemId}`);
      throw new NotFoundException('Physical file no longer exists on disk');
    }

    const stream = this.fileStorage.open(filePath);
    const result: { stream: StreamableFile; targetFormat: string } = {
      stream: new StreamableFile(stream),
      targetFormat: historyItem.targetFormat,
    };

    this.logger.log(
      JSON.stringify({
        type: 'DOWNLOAD',
        userId,
        itemId,
        targetFormat: historyItem.targetFormat,
        HttpStatus: HttpStatus.OK,
      }),
    );

    return result;
  }

  private async createHistoryEntry({
    type,
    sourceFormat,
    targetFormat,
    status,
    fileSize,
    startTime,
    errorCode,
    userId,
    fileId,
  }: createHistoryEntryParams) {
    const durationMs = Math.round(performance.now() - startTime);

    try {
      await this.historyRepository.save({
        type,
        sourceFormat,
        targetFormat,
        status,
        fileSize,
        durationMs,
        errorCode,
        userId,
        fileId,
      });
    } catch (dbError) {
      this.logger.error('Failed to log transformation history:', dbError);
    }
  }
}
