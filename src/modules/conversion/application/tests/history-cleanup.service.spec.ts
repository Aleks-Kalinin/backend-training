import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { LessThan, Repository } from 'typeorm';
import { ConvertedFileEntity } from '../../infrastructure/entity/converted-file.entity';
import { TransformationHistoryItemEntity } from '../../infrastructure/entity/transformation-history-item.entity';
import { HISTORY_RETENTION_DAYS } from '../constants/history-retention-days';
import { HistoryCleanupService } from '../history-cleanup.service';

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => {},
  CronExpression: {
    EVERY_DAY_AT_MIDNIGHT: '0 0 * * *',
  },
}));

jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  unlink: jest.fn(),
}));

describe('HistoryCleanupService', () => {
  let service: HistoryCleanupService;
  let transformationHistoryRepository: jest.Mocked<
    Repository<TransformationHistoryItemEntity>
  >;
  let fileRepository: jest.Mocked<Repository<ConvertedFileEntity>>;

  beforeEach(async () => {
    jest.clearAllMocks();

    transformationHistoryRepository = {
      find: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<TransformationHistoryItemEntity>>;

    fileRepository = {
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<ConvertedFileEntity>>;

    (fs.unlink as jest.Mock).mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoryCleanupService,
        {
          provide: getRepositoryToken(TransformationHistoryItemEntity),
          useValue: transformationHistoryRepository,
        },
        {
          provide: getRepositoryToken(ConvertedFileEntity),
          useValue: fileRepository,
        },
      ],
    }).compile();

    service = module.get<HistoryCleanupService>(HistoryCleanupService);
  });

  describe('cleanupExpiredHistory', () => {
    it('returns early when no expired items are found', async () => {
      transformationHistoryRepository.find.mockResolvedValue([]);

      await service.cleanupExpiredHistory();

      expect(transformationHistoryRepository.find).toHaveBeenCalledWith({
        where: {
          createdAt: LessThan(expect.any(Date)),
        },
        relations: ['file'],
      });

      expect(fs.unlink).not.toHaveBeenCalled();
      expect(transformationHistoryRepository.delete).not.toHaveBeenCalled();
      expect(fileRepository.delete).not.toHaveBeenCalled();
    });

    it('deletes expired history items without associated physical files', async () => {
      const mockItem = {
        id: randomUUID(),
        file: null,
      } as TransformationHistoryItemEntity;

      transformationHistoryRepository.find.mockResolvedValue([mockItem]);

      await service.cleanupExpiredHistory();

      expect(fs.unlink).not.toHaveBeenCalled();
      expect(transformationHistoryRepository.delete).toHaveBeenCalledWith({
        createdAt: LessThan(expect.any(Date)),
      });
      expect(fileRepository.delete).not.toHaveBeenCalled();
    });

    it('unlinks physical files and deletes history and file records from DB', async () => {
      const fileId = randomUUID();
      const filePath = '/uploads/expired-file.png';
      const mockItem = {
        id: randomUUID(),
        file: {
          id: fileId,
          filePath,
        },
      } as TransformationHistoryItemEntity;

      transformationHistoryRepository.find.mockResolvedValue([mockItem]);

      await service.cleanupExpiredHistory();

      expect(fs.unlink).toHaveBeenCalledWith(filePath);
      expect(transformationHistoryRepository.delete).toHaveBeenCalledWith({
        createdAt: LessThan(expect.any(Date)),
      });
      expect(fileRepository.delete).toHaveBeenCalledWith([fileId]);
    });

    it('logs error and proceeds with DB deletion when fs.unlink fails', async () => {
      const errorSpy = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => {});

      const fileId = randomUUID();
      const filePath = '/uploads/missing-file.png';
      const mockItem = {
        id: randomUUID(),
        file: {
          id: fileId,
          filePath,
        },
      } as TransformationHistoryItemEntity;

      transformationHistoryRepository.find.mockResolvedValue([mockItem]);
      (fs.unlink as jest.Mock).mockRejectedValue(new Error('File not found'));

      await service.cleanupExpiredHistory();

      expect(fs.unlink).toHaveBeenCalledWith(filePath);
      expect(errorSpy).toHaveBeenCalledWith(
        `Failed to delete file ${filePath}`,
        expect.any(Error),
      );

      expect(transformationHistoryRepository.delete).toHaveBeenCalledWith({
        createdAt: LessThan(expect.any(Date)),
      });
      expect(fileRepository.delete).toHaveBeenCalledWith([fileId]);

      errorSpy.mockRestore();
    });

    it('calculates the cutoff date based on HISTORY_RETENTION_DAYS', async () => {
      transformationHistoryRepository.find.mockResolvedValue([]);

      const beforeCallDate = new Date();
      await service.cleanupExpiredHistory();
      const afterCallDate = new Date();

      const callArg = (
        transformationHistoryRepository.find.mock.calls[0][0] as any
      ).where.createdAt;

      const cutoffDate = callArg.value as Date;

      const expectedBeforeDate = new Date(beforeCallDate);
      expectedBeforeDate.setDate(
        expectedBeforeDate.getDate() - HISTORY_RETENTION_DAYS,
      );

      const expectedAfterDate = new Date(afterCallDate);
      expectedAfterDate.setDate(
        expectedAfterDate.getDate() - HISTORY_RETENTION_DAYS,
      );

      expect(cutoffDate.getTime()).toBeGreaterThanOrEqual(
        expectedBeforeDate.getTime(),
      );
      expect(cutoffDate.getTime()).toBeLessThanOrEqual(
        expectedAfterDate.getTime(),
      );
    });
  });
});
