export const FILE_STORAGE = Symbol('FILE_STORAGE');

import { Readable } from 'node:stream';

export interface FileStorage {
  save(
    content: string | Buffer,
    extension: string,
  ): Promise<{ id: string; filePath: string }>;
  exists(filePath: string): Promise<boolean>;
  open(filePath: string): Readable;
  remove(filePath: string): Promise<void>;
}
