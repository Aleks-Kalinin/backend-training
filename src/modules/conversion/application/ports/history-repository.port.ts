import { FILE_CONVERSION_STATUS } from '../constants/file-conversion-status';
import { FILE_TYPE } from '../constants/file-type';

export interface HistoryQuery {
  userId: string;
  limit: number;
  cursor?: { id: string; createdAt: Date };
  type?: FILE_TYPE;
  sourceFormat?: string;
  targetFormat?: string;
  status?: FILE_CONVERSION_STATUS;
  createdAtFrom?: Date;
  createdAtTo?: Date;
}

export interface HistoryRecord {
  id: string;
  userId: string | null;
  targetFormat: string;
  createdAt: Date;
  file?: { id: string; filePath: string } | null;
}

export const HISTORY_REPOSITORY = Symbol('HISTORY_REPOSITORY');

export interface HistoryRepository {
  find(query: HistoryQuery): Promise<HistoryRecord[]>;
  findFile(userId: string, itemId: string): Promise<HistoryRecord | null>;
  save(entry: {
    type: FILE_TYPE;
    sourceFormat: string;
    targetFormat: string;
    status: FILE_CONVERSION_STATUS;
    fileSize: number;
    durationMs: number;
    errorCode?: number | null;
    userId: string;
    fileId?: string | null;
  }): Promise<void>;
}
