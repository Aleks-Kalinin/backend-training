import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import {
  HistoryQuery,
  HistoryRecord,
  HistoryRepository,
} from '../application/ports/history-repository.port';
import { TransformationHistoryItemEntity } from './entity/transformation-history-item.entity';

@Injectable()
export class TypeOrmHistoryRepository implements HistoryRepository {
  constructor(
    @InjectRepository(TransformationHistoryItemEntity)
    private readonly repository: Repository<TransformationHistoryItemEntity>,
  ) {}

  async find(query: HistoryQuery): Promise<HistoryRecord[]> {
    const builder = this.repository
      .createQueryBuilder('history')
      .where('history.userId = :userId', { userId: query.userId });
    if (query.type)
      builder.andWhere('history.type = :type', { type: query.type });
    if (query.sourceFormat)
      builder.andWhere('history.sourceFormat = :sourceFormat', {
        sourceFormat: query.sourceFormat,
      });
    if (query.targetFormat)
      builder.andWhere('history.targetFormat = :targetFormat', {
        targetFormat: query.targetFormat,
      });
    if (query.status)
      builder.andWhere('history.status = :status', { status: query.status });
    if (query.createdAtFrom)
      builder.andWhere('history.createdAt >= :createdAtFrom', {
        createdAtFrom: query.createdAtFrom,
      });
    if (query.createdAtTo)
      builder.andWhere('history.createdAt <= :createdAtTo', {
        createdAtTo: query.createdAtTo,
      });
    if (query.cursor) {
      builder.andWhere(
        '(history.createdAt < :cursorCreatedAt OR (history.createdAt = :cursorCreatedAt AND history.id < :cursorId))',
        { cursorCreatedAt: query.cursor.createdAt, cursorId: query.cursor.id },
      );
    }
    return builder
      .orderBy('history.createdAt', 'DESC')
      .addOrderBy('history.id', 'DESC')
      .take(query.limit + 1)
      .leftJoinAndSelect('history.file', 'file')
      .getMany() as Promise<HistoryRecord[]>;
  }

  async findFile(
    userId: string,
    itemId: string,
  ): Promise<HistoryRecord | null> {
    return this.repository.findOne({
      where: { id: itemId, userId },
      relations: ['file'],
    }) as Promise<HistoryRecord | null>;
  }

  async save(entry: {
    type: any;
    sourceFormat: string;
    targetFormat: string;
    status: any;
    fileSize: number;
    durationMs: number;
    errorCode?: number | null;
    userId: string;
    fileId?: string | null;
  }): Promise<void> {
    await this.repository.save(entry);
  }
}
