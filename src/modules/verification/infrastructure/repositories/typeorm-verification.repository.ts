import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type {
  NewVerificationToken,
  VerificationToken as DomainVerificationToken,
} from '../../domain/verification-token.models';
import type { VerificationTokenType } from '../../domain/verification-token-type.enum';
import type { VerificationRepository } from '../../application/ports/verification-repository.port';
import { VerificationToken } from '../entity/verification-token.entity';

@Injectable()
export class TypeOrmVerificationRepository implements VerificationRepository {
  constructor(
    @InjectRepository(VerificationToken)
    private readonly repository: Repository<VerificationToken>,
  ) {}

  async consumeActiveForUser(
    userId: string,
    type: VerificationTokenType,
    consumedAt: Date,
  ): Promise<void> {
    await this.repository.update(
      { userId, type, consumedAt: IsNull() },
      { consumedAt },
    );
  }

  async create(token: NewVerificationToken): Promise<DomainVerificationToken> {
    const record = await this.repository.save(this.repository.create(token));
    return this.toDomain(record);
  }

  async findActive(
    attemptId: string,
    type: VerificationTokenType,
  ): Promise<DomainVerificationToken | null> {
    const record = await this.repository.findOne({
      where: {
        verificationTokenId: attemptId,
        type,
        consumedAt: IsNull(),
      },
    });
    return record ? this.toDomain(record) : null;
  }

  async save(token: DomainVerificationToken): Promise<DomainVerificationToken> {
    const record = await this.repository.save(token);
    return this.toDomain(record);
  }

  private toDomain(record: VerificationToken): DomainVerificationToken {
    return {
      verificationTokenId: record.verificationTokenId,
      userId: record.userId,
      type: record.type,
      targetEmail: record.targetEmail,
      tokenHash: record.tokenHash,
      attempts: record.attempts,
      expiresAt: record.expiresAt,
      consumedAt: record.consumedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
