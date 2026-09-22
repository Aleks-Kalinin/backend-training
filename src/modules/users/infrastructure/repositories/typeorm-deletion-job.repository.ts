import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DeletionExecutionMode,
  DeletionJobStatus,
  UserDeletionJob as DomainJob,
} from '../../domain/deletion';
import { UserDeletionJob } from '../entity/user-deletion-job.entity';
import { UserDeletionJobRepository } from '../../application/ports/deletion-job-repository.port';

@Injectable()
export class TypeOrmDeletionJobRepository implements UserDeletionJobRepository {
  constructor(
    @InjectRepository(UserDeletionJob)
    private readonly repository: Repository<UserDeletionJob>,
  ) {}

  async findLatestByUserId(userId: string): Promise<DomainJob | null> {
    return this.repository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    }) as Promise<DomainJob | null>;
  }

  create(data: {
    userId: string;
    reason?: string;
    requestedBy: string | null;
    status: DeletionJobStatus;
    mode: DeletionExecutionMode;
  }): DomainJob {
    return this.repository.create(data) as DomainJob;
  }

  async save(job: DomainJob): Promise<DomainJob> {
    return this.repository.save(job as UserDeletionJob) as Promise<DomainJob>;
  }
}
