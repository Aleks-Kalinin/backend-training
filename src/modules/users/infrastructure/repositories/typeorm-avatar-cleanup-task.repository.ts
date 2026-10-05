import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import {
  AvatarCleanupTaskRepository,
  CreateAvatarCleanupTask,
} from '../../application/ports/avatar-cleanup-task-repository.port';
import { AvatarCleanupTask } from '../../domain/avatar-cleanup';
import { AvatarCleanupTaskEntity } from '../entity/avatar-cleanup-task.entity';

@Injectable()
export class TypeOrmAvatarCleanupTaskRepository implements AvatarCleanupTaskRepository {
  constructor(
    @InjectRepository(AvatarCleanupTaskEntity)
    private readonly repository: Repository<AvatarCleanupTaskEntity>,
  ) {}

  async create(task: CreateAvatarCleanupTask): Promise<AvatarCleanupTask> {
    return this.repository.save(
      this.repository.create({ ...task, attempts: 0 }),
    );
  }

  async findRetryable(
    maxAttempts: number,
    limit: number,
  ): Promise<AvatarCleanupTask[]> {
    return this.repository.find({
      where: { attempts: LessThan(maxAttempts) },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  async save(task: AvatarCleanupTask): Promise<AvatarCleanupTask> {
    return this.repository.save(task);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete({ id });
  }
}
