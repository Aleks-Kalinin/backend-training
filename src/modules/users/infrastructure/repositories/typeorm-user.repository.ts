import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UserRepository,
  UserSearch,
} from '../../application/ports/user-repository.port';
import { User as DomainUser } from '../../domain/entities/user.entity';
import { User } from '../entity/user.entity';

@Injectable()
export class TypeOrmUserRepository implements UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<DomainUser | null> {
    return this.repository.findOne({
      where: { email: email.trim().toLowerCase() },
      relations: ['roles'],
    }) as Promise<DomainUser | null>;
  }

  async findById(userId: string): Promise<DomainUser | null> {
    return this.repository.findOne({
      where: { userId },
    }) as Promise<DomainUser | null>;
  }

  async findMany(search: UserSearch): Promise<DomainUser[]> {
    const sortFields = {
      created_at: 'user.createdAt',
      updated_at: 'user.updatedAt',
      email: 'user.email',
    };
    const query = this.repository.createQueryBuilder('user');

    if (search.status) {
      query.andWhere('user.status = :status', { status: search.status });
    }

    if (search.q) {
      query.andWhere(
        'user.email ILIKE :q OR CAST(user.userId AS TEXT) ILIKE :q',
        {
          q: `%${search.q}%`,
        },
      );
    }

    if (search.cursor) {
      const cursorComparison =
        search.order === 'desc'
          ? '(user.createdAt < :cursorCreatedAt OR (user.createdAt = :cursorCreatedAt AND user.userId < :cursorId))'
          : '(user.createdAt > :cursorCreatedAt OR (user.createdAt = :cursorCreatedAt AND user.userId > :cursorId))';

      query.andWhere(cursorComparison, {
        cursorCreatedAt: search.cursor.createdAt,
        cursorId: search.cursor.id,
      });
    }

    query.orderBy(
      sortFields[search.sort],
      search.order.toUpperCase() as 'ASC' | 'DESC',
    );
    query.addOrderBy('user.userId', 'ASC');
    query.take(search.limit ?? 20);

    return query.getMany() as Promise<DomainUser[]>;
  }

  create(
    data: Omit<DomainUser, 'userId' | 'createdAt' | 'updatedAt' | 'roles'>,
  ): DomainUser {
    return this.repository.create(data) as DomainUser;
  }

  async save(user: DomainUser): Promise<DomainUser> {
    return this.repository.save(user as User) as Promise<DomainUser>;
  }

  async remove(user: DomainUser): Promise<void> {
    await this.repository.remove(user as User);
  }
}
