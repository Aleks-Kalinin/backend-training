import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { FileStorage } from '../application/ports/file-storage.port';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConvertedFileEntity } from './entity/converted-file.entity';

@Injectable()
export class LocalFileStorage implements FileStorage {
  constructor(
    @InjectRepository(ConvertedFileEntity)
    private readonly fileRepository: Repository<ConvertedFileEntity>,
  ) {}

  async save(
    content: string | Buffer,
    extension: string,
  ): Promise<{ id: string; filePath: string }> {
    const directory = path.join(process.cwd(), 'uploads');
    await fs.mkdir(directory, { recursive: true });
    const filePath = path.join(directory, `${randomUUID()}.${extension}`);
    await fs.writeFile(filePath, content);
    const record = await this.fileRepository.save({ filePath });
    return { id: String(record.id), filePath };
  }

  exists(filePath: string): Promise<boolean> {
    return Promise.resolve(existsSync(filePath));
  }

  open(filePath: string): Readable {
    return createReadStream(filePath);
  }

  remove(filePath: string): Promise<void> {
    return fs.unlink(filePath);
  }
}
