import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
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
    if (expiredItems.length === 0) return;

    const fileIds: string[] = [];
    for (const item of expiredItems) {
      if (!item.file) continue;
      fileIds.push(String(item.file.id));
      try {
        await fs.unlink(item.file.filePath);
      } catch (error) {
        this.logger.error(`Failed to delete file ${item.file.filePath}`, error);
      }
    }
    await this.historyRepository.delete({ createdAt: LessThan(cutoffDate) });
    if (fileIds.length > 0) await this.fileRepository.delete(fileIds);
    this.logger.log(
      `Deleted ${expiredItems.length} transformation history items older than ${HISTORY_RETENTION_DAYS} days`,
    );
  }
}
