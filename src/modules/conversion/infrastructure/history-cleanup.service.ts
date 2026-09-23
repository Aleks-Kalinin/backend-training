import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import * as fs from 'node:fs/promises';
import { ConvertedFileEntity } from './entity/converted-file.entity';
import { TransformationHistoryItemEntity } from './entity/transformation-history-item.entity';
import { HISTORY_RETENTION_DAYS } from '../application/constants/history-retention-days';

@Injectable()
export class HistoryCleanupService {
  private readonly logger = new Logger(HistoryCleanupService.name);

  constructor(
    @InjectRepository(TransformationHistoryItemEntity)
    private readonly historyRepository: Repository<TransformationHistoryItemEntity>,
    @InjectRepository(ConvertedFileEntity)
    private readonly fileRepository: Repository<ConvertedFileEntity>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredHistory(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - HISTORY_RETENTION_DAYS);
    const expiredItems = await this.historyRepository.find({
      where: { createdAt: LessThan(cutoffDate) },
      relations: ['file'],
    });

    const filesToDelete = new Map<string, ConvertedFileEntity>();
    for (const item of expiredItems) {
      if (!item.file) continue;
      filesToDelete.set(String(item.file.id), item.file);
    }

    const oldFiles = await this.fileRepository.find({
      where: { createdAt: LessThan(cutoffDate) },
    });
    const oldFileIds = oldFiles.map((file) => String(file.id));
    const referencedOldFiles =
      oldFileIds.length === 0
        ? []
        : await this.historyRepository.find({
            where: { fileId: In(oldFileIds) },
          });
    const referencedFileIds = new Set(
      referencedOldFiles
        .map((item) => item.fileId)
        .filter((fileId): fileId is string => Boolean(fileId)),
    );

    for (const file of oldFiles) {
      const fileId = String(file.id);
      if (!referencedFileIds.has(fileId)) {
        filesToDelete.set(fileId, file);
      }
    }

    for (const file of filesToDelete.values()) {
      try {
        await fs.unlink(file.filePath);
      } catch (error) {
        this.logger.error(`Failed to delete file ${file.filePath}`, error);
      }
    }

    if (expiredItems.length > 0) {
      await this.historyRepository.delete({ createdAt: LessThan(cutoffDate) });
    }
    if (filesToDelete.size > 0) {
      await this.fileRepository.delete([...filesToDelete.keys()]);
    }
    if (expiredItems.length > 0 || filesToDelete.size > 0) {
      this.logger.log(
        `Deleted ${expiredItems.length} transformation history items and ${filesToDelete.size} converted files older than ${HISTORY_RETENTION_DAYS} days`,
      );
    }
  }
}
