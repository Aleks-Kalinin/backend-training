import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { TransformationHistoryItemEntity } from '../infrastructure/entity/transformation-history-item.entity';
import { HISTORY_RETENTION_DAYS } from './constants/history-retention-days';

@Injectable()
export class HistoryCleanupService {
  private readonly logger = new Logger(HistoryCleanupService.name);

  constructor(
    @InjectRepository(TransformationHistoryItemEntity)
    private readonly transformationHistoryRepository: Repository<TransformationHistoryItemEntity>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredHistory() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - HISTORY_RETENTION_DAYS);

    const result = await this.transformationHistoryRepository.delete({
      createdAt: LessThan(cutoffDate),
    });

    this.logger.log(
      `Deleted ${result.affected} transformation history items older than ${HISTORY_RETENTION_DAYS} days`,
    );
  }
}
