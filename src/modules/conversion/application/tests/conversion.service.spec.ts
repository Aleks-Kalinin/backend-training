import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  RequestTimeoutException,
  StreamableFile,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { Repository } from 'typeorm';
import { ImageFileFormat } from '../../domain/image-file-format.enum';
import { TextFileFormat } from '../../domain/text-file-format.enum';
import { ConvertedFileEntity } from '../../infrastructure/entity/converted-file.entity';
import { TransformationHistoryItemEntity } from '../../infrastructure/entity/transformation-history-item.entity';
import { FILE_CONVERSION_STATUS } from '../constants/file-conversion-status';
import { FILE_TYPE } from '../constants/file-type';
import { ConversionService } from '../conversion.service';

const mockPiscinaRun = jest.fn();
const mockPiscinaDestroy = jest.fn();

jest.mock('piscina', () => {
  return jest.fn().mockImplementation(() => ({
    run: mockPiscinaRun,
    destroy: mockPiscinaDestroy,
  }));
});

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  existsSync: jest.fn(),
  createReadStream: jest.fn(),
}));

jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));

describe('ConversionService', () => {
  let service: ConversionService;
  let transformationHistoryRepository: jest.Mocked<
    Repository<TransformationHistoryItemEntity>
  >;
  let convertedFileRepository: jest.Mocked<Repository<ConvertedFileEntity>>;

  const mockUserId = randomUUID();
  const mockFileId = randomUUID();
  const mockItemId = randomUUID();

  beforeEach(async () => {
    jest.clearAllMocks();

    transformationHistoryRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue({ id: mockItemId }),
    } as unknown as jest.Mocked<Repository<TransformationHistoryItemEntity>>;

    convertedFileRepository = {
      save: jest
        .fn()
        .mockResolvedValue({ id: mockFileId, filePath: '/mock/path' }),
    } as unknown as jest.Mocked<Repository<ConvertedFileEntity>>;

    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversionService,
        {
          provide: getRepositoryToken(TransformationHistoryItemEntity),
          useValue: transformationHistoryRepository,
        },
        {
          provide: getRepositoryToken(ConvertedFileEntity),
          useValue: convertedFileRepository,
        },
      ],
    }).compile();

    service = module.get<ConversionService>(ConversionService);
  });

  function createMockRequest(parts: any[]) {
    return {
      parts: async function* () {
        for (const part of parts) {
          yield part;
        }
      },
    } as unknown as FastifyRequest;
  }

  describe('onModuleDestroy', () => {
    it('destroys piscina worker pool on module destruction', async () => {
      await service.onModuleDestroy();
      expect(mockPiscinaDestroy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getHistory', () => {
    it('returns history records for a given user', async () => {
      const mockHistory = [
        {
          id: mockItemId,
          userId: mockUserId,
          status: FILE_CONVERSION_STATUS.SUCCESS,
        },
      ] as TransformationHistoryItemEntity[];

      transformationHistoryRepository.find.mockResolvedValue(mockHistory);

      const result = await service.getHistory(mockUserId);
      expect(result).toEqual(mockHistory);
      expect(transformationHistoryRepository.find).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
    });
  });

  describe('getFileForDownload', () => {
    it('throws NotFoundException if history record or file relation is missing', async () => {
      transformationHistoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getFileForDownload(mockUserId, mockItemId),
      ).rejects.toThrow(
        new NotFoundException(
          'Transformation record or associated file not found',
        ),
      );
    });

    it('throws NotFoundException if history item has no file relation', async () => {
      transformationHistoryRepository.findOne.mockResolvedValue({
        id: mockItemId,
        userId: mockUserId,
        file: null,
      } as TransformationHistoryItemEntity);

      await expect(
        service.getFileForDownload(mockUserId, mockItemId),
      ).rejects.toThrow(
        new NotFoundException(
          'Transformation record or associated file not found',
        ),
      );
    });

    it('throws NotFoundException if file does not exist on disk', async () => {
      transformationHistoryRepository.findOne.mockResolvedValue({
        id: mockItemId,
        userId: mockUserId,
        targetFormat: ImageFileFormat.PNG,
        file: { id: mockFileId, filePath: '/non/existent/path.png' },
      } as TransformationHistoryItemEntity);

      (existsSync as jest.Mock).mockReturnValue(false);

      await expect(
        service.getFileForDownload(mockUserId, mockItemId),
      ).rejects.toThrow(
        new NotFoundException('Physical file no longer exists on disk'),
      );
    });

    it('returns StreamableFile and targetFormat when file exists on disk', async () => {
      const mockStream = new Readable();
      transformationHistoryRepository.findOne.mockResolvedValue({
        id: mockItemId,
        userId: mockUserId,
        targetFormat: ImageFileFormat.PNG,
        file: { id: mockFileId, filePath: '/existent/path.png' },
      } as TransformationHistoryItemEntity);

      (existsSync as jest.Mock).mockReturnValue(true);
      (createReadStream as jest.Mock).mockReturnValue(mockStream);

      const result = await service.getFileForDownload(mockUserId, mockItemId);

      expect(result.targetFormat).toBe(ImageFileFormat.PNG);
      expect(result.stream).toBeInstanceOf(StreamableFile);
      expect(createReadStream).toHaveBeenCalledWith('/existent/path.png');
    });
  });

  describe('convertMultipartRequest', () => {
    it('successfully converts image format and records history', async () => {
      const mockFileBuffer = Buffer.from('fake-jpeg-data');
      const convertedBuffer = Buffer.from('fake-png-data');
      mockPiscinaRun.mockResolvedValue(convertedBuffer);

      const req = createMockRequest([
        {
          type: 'field',
          fieldname: 'targetFormat',
          value: ImageFileFormat.PNG,
        },
        {
          type: 'file',
          fieldname: 'file',
          filename: 'sample.jpg',
          mimetype: 'image/jpeg',
          toBuffer: jest.fn().mockResolvedValue(mockFileBuffer),
        },
      ]);

      const result = await service.convertMultipartRequest(
        req,
        FILE_TYPE.IMAGE,
        mockUserId,
      );

      expect(result).toEqual({
        content: convertedBuffer,
        targetFormat: ImageFileFormat.PNG,
      });

      expect(mockPiscinaRun).toHaveBeenCalledWith(
        {
          buffer: mockFileBuffer,
          originalFormat: ImageFileFormat.JPEG,
          targetFormat: ImageFileFormat.PNG,
          options: {},
        },
        {
          name: 'convertImageFile',
          signal: expect.any(AbortSignal),
        },
      );

      expect(transformationHistoryRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: FILE_TYPE.IMAGE,
          sourceFormat: ImageFileFormat.JPEG,
          targetFormat: ImageFileFormat.PNG,
          status: FILE_CONVERSION_STATUS.SUCCESS,
          fileSize: mockFileBuffer.length,
          userId: mockUserId,
          fileId: null,
        }),
      );
    });

    it('successfully converts text format and parses JSON options', async () => {
      const mockFileBuffer = Buffer.from('{"key":"value"}');
      const convertedContent = 'key: value';
      mockPiscinaRun.mockResolvedValue(convertedContent);

      const req = createMockRequest([
        {
          type: 'field',
          fieldname: 'targetFormat',
          value: TextFileFormat.YAML,
        },
        {
          type: 'field',
          fieldname: 'options',
          value: JSON.stringify({ indent: 2 }),
        },
        {
          type: 'file',
          fieldname: 'file',
          filename: 'data.json',
          mimetype: 'application/json',
          toBuffer: jest.fn().mockResolvedValue(mockFileBuffer),
        },
      ]);

      const result = await service.convertMultipartRequest(
        req,
        FILE_TYPE.TEXT,
        mockUserId,
      );

      expect(result).toEqual({
        content: convertedContent,
        targetFormat: TextFileFormat.YAML,
      });

      expect(mockPiscinaRun).toHaveBeenCalledWith(
        {
          buffer: mockFileBuffer,
          originalFormat: TextFileFormat.JSON,
          targetFormat: TextFileFormat.YAML,
          options: { indent: 2 },
        },
        {
          name: 'convertTextFile',
          signal: expect.any(AbortSignal),
        },
      );
    });

    it('saves file locally when save option field is set to true', async () => {
      const mockFileBuffer = Buffer.from('fake-jpeg-data');
      const convertedBuffer = Buffer.from('fake-png-data');
      mockPiscinaRun.mockResolvedValue(convertedBuffer);

      const req = createMockRequest([
        {
          type: 'field',
          fieldname: 'targetFormat',
          value: ImageFileFormat.PNG,
        },
        { type: 'field', fieldname: 'save', value: 'true' },
        {
          type: 'file',
          fieldname: 'file',
          filename: 'sample.jpg',
          mimetype: 'image/jpeg',
          toBuffer: jest.fn().mockResolvedValue(mockFileBuffer),
        },
      ]);

      const result = await service.convertMultipartRequest(
        req,
        FILE_TYPE.IMAGE,
        mockUserId,
      );

      expect(result.content).toBe(convertedBuffer);
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
      expect(convertedFileRepository.save).toHaveBeenCalled();
      expect(transformationHistoryRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: mockFileId,
        }),
      );
    });

    it('saves file locally when options JSON includes save: true', async () => {
      const mockFileBuffer = Buffer.from('fake-jpeg-data');
      const convertedBuffer = Buffer.from('fake-png-data');
      mockPiscinaRun.mockResolvedValue(convertedBuffer);

      const req = createMockRequest([
        {
          type: 'field',
          fieldname: 'targetFormat',
          value: ImageFileFormat.PNG,
        },
        {
          type: 'field',
          fieldname: 'options',
          value: JSON.stringify({ save: true }),
        },
        {
          type: 'file',
          fieldname: 'file',
          filename: 'sample.jpg',
          mimetype: 'image/jpeg',
          toBuffer: jest.fn().mockResolvedValue(mockFileBuffer),
        },
      ]);

      await service.convertMultipartRequest(req, FILE_TYPE.IMAGE, mockUserId);

      expect(convertedFileRepository.save).toHaveBeenCalled();
      expect(transformationHistoryRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ fileId: mockFileId }),
      );
    });

    it('bypasses worker pool on identity conversion (source equals target)', async () => {
      const mockFileBuffer = Buffer.from('already-png-data');

      const req = createMockRequest([
        {
          type: 'field',
          fieldname: 'targetFormat',
          value: ImageFileFormat.PNG,
        },
        {
          type: 'file',
          fieldname: 'file',
          filename: 'sample.png',
          mimetype: 'image/png',
          toBuffer: jest.fn().mockResolvedValue(mockFileBuffer),
        },
      ]);

      const result = await service.convertMultipartRequest(
        req,
        FILE_TYPE.IMAGE,
        mockUserId,
      );

      expect(result).toEqual({
        content: mockFileBuffer,
        targetFormat: ImageFileFormat.PNG,
      });
      expect(mockPiscinaRun).not.toHaveBeenCalled();
      expect(transformationHistoryRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: FILE_CONVERSION_STATUS.SUCCESS,
          sourceFormat: ImageFileFormat.PNG,
          targetFormat: ImageFileFormat.PNG,
        }),
      );
    });

    it('throws BadRequestException for invalid JSON in options field', async () => {
      const req = createMockRequest([
        {
          type: 'field',
          fieldname: 'targetFormat',
          value: ImageFileFormat.PNG,
        },
        { type: 'field', fieldname: 'options', value: 'invalid-json{' },
        {
          type: 'file',
          fieldname: 'file',
          filename: 'sample.jpg',
          mimetype: 'image/jpeg',
          toBuffer: jest.fn().mockResolvedValue(Buffer.from('data')),
        },
      ]);

      await expect(
        service.convertMultipartRequest(req, FILE_TYPE.IMAGE, mockUserId),
      ).rejects.toThrow(BadRequestException);

      expect(transformationHistoryRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: FILE_CONVERSION_STATUS.ERROR,
          errorCode: 400,
        }),
      );
    });

    it('throws PayloadTooLargeException when toBuffer throws FST_REQ_FILE_TOO_LARGE', async () => {
      const fstError = new Error('File too large');
      (fstError as any).code = 'FST_REQ_FILE_TOO_LARGE';

      const req = createMockRequest([
        {
          type: 'field',
          fieldname: 'targetFormat',
          value: ImageFileFormat.PNG,
        },
        {
          type: 'file',
          fieldname: 'file',
          filename: 'large.jpg',
          mimetype: 'image/jpeg',
          toBuffer: jest.fn().mockRejectedValue(fstError),
          file: { bytesRead: 10485760 },
        },
      ]);

      await expect(
        service.convertMultipartRequest(req, FILE_TYPE.IMAGE, mockUserId),
      ).rejects.toThrow(PayloadTooLargeException);

      expect(transformationHistoryRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: FILE_CONVERSION_STATUS.ERROR,
          fileSize: 10485760,
          errorCode: 413,
        }),
      );
    });

    it('re-throws other stream errors encountered during part buffering', async () => {
      const genericStreamErr = new Error('Read stream failed');

      const req = createMockRequest([
        {
          type: 'field',
          fieldname: 'targetFormat',
          value: ImageFileFormat.PNG,
        },
        {
          type: 'file',
          fieldname: 'file',
          filename: 'sample.jpg',
          mimetype: 'image/jpeg',
          toBuffer: jest.fn().mockRejectedValue(genericStreamErr),
        },
      ]);

      await expect(
        service.convertMultipartRequest(req, FILE_TYPE.IMAGE, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if no file part is provided', async () => {
      const req = createMockRequest([
        {
          type: 'field',
          fieldname: 'targetFormat',
          value: ImageFileFormat.PNG,
        },
      ]);

      await expect(
        service.convertMultipartRequest(req, FILE_TYPE.IMAGE, mockUserId),
      ).rejects.toThrow(new BadRequestException('File is required'));
    });

    it('throws BadRequestException if targetFormat field is missing', async () => {
      const req = createMockRequest([
        {
          type: 'file',
          fieldname: 'file',
          filename: 'sample.jpg',
          mimetype: 'image/jpeg',
          toBuffer: jest.fn().mockResolvedValue(Buffer.from('content')),
        },
      ]);

      await expect(
        service.convertMultipartRequest(req, FILE_TYPE.IMAGE, mockUserId),
      ).rejects.toThrow(
        new BadRequestException('targetFormat field is required'),
      );
    });

    it('throws BadRequestException if file is empty', async () => {
      const req = createMockRequest([
        {
          type: 'field',
          fieldname: 'targetFormat',
          value: ImageFileFormat.PNG,
        },
        {
          type: 'file',
          fieldname: 'file',
          filename: 'sample.jpg',
          mimetype: 'image/jpeg',
          toBuffer: jest.fn().mockResolvedValue(Buffer.from('')),
        },
      ]);

      await expect(
        service.convertMultipartRequest(req, FILE_TYPE.IMAGE, mockUserId),
      ).rejects.toThrow(new BadRequestException('File is empty'));
    });

    it('throws UnsupportedMediaTypeException for unsupported source format', async () => {
      const req = createMockRequest([
        {
          type: 'field',
          fieldname: 'targetFormat',
          value: ImageFileFormat.PNG,
        },
        {
          type: 'file',
          fieldname: 'file',
          filename: 'unknown.xyz',
          mimetype: 'application/octet-stream',
          toBuffer: jest.fn().mockResolvedValue(Buffer.from('content')),
        },
      ]);

      await expect(
        service.convertMultipartRequest(req, FILE_TYPE.IMAGE, mockUserId),
      ).rejects.toThrow(
        new UnsupportedMediaTypeException('Unsupported source format'),
      );
    });

    it('throws UnsupportedMediaTypeException for invalid target format', async () => {
      const req = createMockRequest([
        { type: 'field', fieldname: 'targetFormat', value: 'pdf' },
        {
          type: 'file',
          fieldname: 'file',
          filename: 'sample.jpg',
          mimetype: 'image/jpeg',
          toBuffer: jest.fn().mockResolvedValue(Buffer.from('content')),
        },
      ]);

      await expect(
        service.convertMultipartRequest(req, FILE_TYPE.IMAGE, mockUserId),
      ).rejects.toThrow(
        new UnsupportedMediaTypeException('Invalid target format'),
      );
    });

    it('throws PayloadTooLargeException when file exceeds target format limit', async () => {
      // Limit for JPEG/PNG is 5MB (5 * 1024 * 1024 = 5242880)
      const oversizedBuffer = Buffer.alloc(6 * 1024 * 1024);

      const req = createMockRequest([
        {
          type: 'field',
          fieldname: 'targetFormat',
          value: ImageFileFormat.PNG,
        },
        {
          type: 'file',
          fieldname: 'file',
          filename: 'sample.jpg',
          mimetype: 'image/jpeg',
          toBuffer: jest.fn().mockResolvedValue(oversizedBuffer),
        },
      ]);

      await expect(
        service.convertMultipartRequest(req, FILE_TYPE.IMAGE, mockUserId),
      ).rejects.toThrow(
        new PayloadTooLargeException('File size exceeds global upload limit'),
      );
    });

    it('converts AbortError from worker pool into RequestTimeoutException', async () => {
      const abortError = new Error('Timeout');
      abortError.name = 'AbortError';
      mockPiscinaRun.mockRejectedValue(abortError);

      const req = createMockRequest([
        {
          type: 'field',
          fieldname: 'targetFormat',
          value: ImageFileFormat.PNG,
        },
        {
          type: 'file',
          fieldname: 'file',
          filename: 'sample.jpg',
          mimetype: 'image/jpeg',
          toBuffer: jest.fn().mockResolvedValue(Buffer.from('content')),
        },
      ]);

      await expect(
        service.convertMultipartRequest(req, FILE_TYPE.IMAGE, mockUserId),
      ).rejects.toThrow(
        new RequestTimeoutException(
          'File conversion timed out after 30 seconds',
        ),
      );

      expect(transformationHistoryRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: FILE_CONVERSION_STATUS.ERROR,
          errorCode: 408,
        }),
      );
    });

    it('handles worker errors without explicit error messages', async () => {
      mockPiscinaRun.mockRejectedValue({});

      const req = createMockRequest([
        {
          type: 'field',
          fieldname: 'targetFormat',
          value: ImageFileFormat.PNG,
        },
        {
          type: 'file',
          fieldname: 'file',
          filename: 'sample.jpg',
          mimetype: 'image/jpeg',
          toBuffer: jest.fn().mockResolvedValue(Buffer.from('content')),
        },
      ]);

      await expect(
        service.convertMultipartRequest(req, FILE_TYPE.IMAGE, mockUserId),
      ).rejects.toThrow(new BadRequestException('File conversion failed'));
    });

    it('silently catches database errors inside logHistory', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      transformationHistoryRepository.save.mockRejectedValue(
        new Error('DB connection failed'),
      );

      const mockFileBuffer = Buffer.from('fake-jpeg-data');
      mockPiscinaRun.mockResolvedValue(Buffer.from('fake-png-data'));

      const req = createMockRequest([
        {
          type: 'field',
          fieldname: 'targetFormat',
          value: ImageFileFormat.PNG,
        },
        {
          type: 'file',
          fieldname: 'file',
          filename: 'sample.jpg',
          mimetype: 'image/jpeg',
          toBuffer: jest.fn().mockResolvedValue(mockFileBuffer),
        },
      ]);

      const result = await service.convertMultipartRequest(
        req,
        FILE_TYPE.IMAGE,
        mockUserId,
      );

      expect(result.targetFormat).toBe(ImageFileFormat.PNG);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to log transformation history:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });
});
