import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { TransformationHistoryItemEntity } from '../infrastructure/entity/transformation-history-item.entity';
import { HISTORY_RETENTION_DAYS } from './constants/history-retention-days';
import { ConvertedFileEntity } from '../infrastructure/entity/converted-file.entity';
import * as fs from 'node:fs/promises';
import { type UUID } from 'node:crypto';

@Injectable()
export class HistoryCleanupService {
  private readonly logger = new Logger(HistoryCleanupService.name);

  constructor(
    @InjectRepository(TransformationHistoryItemEntity)
    private readonly transformationHistoryRepository: Repository<TransformationHistoryItemEntity>,
    @InjectRepository(ConvertedFileEntity)
    private readonly fileRepository: Repository<ConvertedFileEntity>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredHistory() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - HISTORY_RETENTION_DAYS);

    const expiredItems = await this.transformationHistoryRepository.find({
      where: {
        createdAt: LessThan(cutoffDate),
      },
      relations: ['file'],
    });

    if (expiredItems.length === 0) return;

    const fileIdsToDelete: UUID[] = [];

    for (const item of expiredItems) {
      if (item.file) {
        fileIdsToDelete.push(item.file.id);
        try {
          await fs.unlink(item.file.filePath);
        } catch (error) {
          this.logger.error(
            `Failed to delete file ${item.file.filePath}`,
            error,
          );
        }
      }
    }

    await this.transformationHistoryRepository.delete({
      createdAt: LessThan(cutoffDate),
    });

    if (fileIdsToDelete.length > 0) {
      await this.fileRepository.delete(fileIdsToDelete);
    }

    this.logger.log(
      `Deleted ${expiredItems.length} transformation history items older than ${HISTORY_RETENTION_DAYS} days`,
    );
  }
}
