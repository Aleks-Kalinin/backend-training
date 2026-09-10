import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from '../dto/create-user.dto';
import { GetUsersQueryDto } from '../dto/get-users-query.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { User } from '../infrastructure/entity/user.entity';
import { AuthTokenPayload } from '@/modules/auth/auth.guard';
import { VerificationService } from '@/modules/verification/application/verification.service';
import { MailService } from '@/modules/mail/application/mail.service';
import { UUID } from 'node:crypto';
import { InitiateEmailChangeDto } from '../dto/initiate-email-change.dto';
import { VerificationTokenType } from '@/modules/verification/infrastructure/entity/verification-token.entity';
import { ConfirmEmailChangeDto } from '../dto/confirm-email-change.dto';
import { DeleteUserDto } from '../dto/delete-user.dto';
import {
  DeletionExecutionMode,
  DeletionJobStatus,
  UserDeletionJob,
} from '../infrastructure/entity/user-deletion-job.entity';
import { DeleteUserResponseDto } from '../dto/delete-user-response.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(UserDeletionJob)
    private readonly userDeletionJobRepository: Repository<UserDeletionJob>,
    private readonly verificationService: VerificationService,
    private readonly mailService: MailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async initiateEmailChange(
    userId: UUID,
    dto: InitiateEmailChangeDto,
    requestingUser: AuthTokenPayload,
  ) {
    if (String(userId) !== String(requestingUser.sub)) {
      throw new ForbiddenException('You can only change your own profile');
    }

    const targetEmail = dto.newEmail.trim().toLowerCase();
    const existing = await this.findOne(targetEmail);
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const challenge = await this.verificationService.createVerificationRecord(
      userId,
      VerificationTokenType.EMAIL_CHANGE,
      targetEmail,
    );

    await this.mailService.sendVerificationOtp(targetEmail, challenge.rawOtp);

    return {
      requiresConfirmation: true,
      challengeId: challenge.attemptId,
    };
  }

  async confirmEmailChange(
    userId: UUID,
    dto: ConfirmEmailChangeDto,
    requestingUser: AuthTokenPayload,
  ) {
    if (String(userId) !== String(requestingUser.sub)) {
      throw new ForbiddenException('You can only change your own profile');
    }

    const record = await this.verificationService.verifyOtp(
      dto.challengeId,
      dto.code,
      VerificationTokenType.EMAIL_CHANGE,
    );

    if (String(record.userId) !== String(userId)) {
      throw new ForbiddenException('Invalid challenge session for user.');
    }
    if (!record.targetEmail) {
      throw new ConflictException(
        'No pending email address associated with challenge.',
      );
    }

    const targetEmail = record.targetEmail.trim().toLowerCase();
    const existing = await this.findOne(targetEmail);
    if (existing && existing.userId !== userId) {
      throw new ConflictException('Proposed email already exists');
    }

    const user = await this.usersRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.email = targetEmail;
    await this.usersRepository.save(user);

    return { message: 'Email address successfully updated.' };
  }

  async findOne(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.trim().toLowerCase() },
      relations: ['roles'],
    });
  }

  async getUser(userId: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { userId },
    });
  }

  async createUser({
    email,
    password,
    status,
    isVerified,
  }: CreateUserDto): Promise<User> {
    const newUser = this.usersRepository.create({
      email: email.trim().toLowerCase(),
      password,
      status,
      isVerified,
    });
    return this.usersRepository.save(newUser);
  }

  async updateUser(
    userId: string,
    updateData: UpdateUserDto,
    requestingUser?: AuthTokenPayload,
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { userId } });
    if (!user) {
      throw new Error('User not found');
    }

    if (requestingUser) {
      const isSelf = userId === String(requestingUser.sub);

      const isAdmin = requestingUser.roles.includes('ADMIN');

      if (!isSelf && !isAdmin) {
        throw new ForbiddenException('Insufficient permissions');
      }

      if (isSelf && !isAdmin && updateData.email !== undefined) {
        throw new ForbiddenException(
          'Direct email updates are not allowed. Use the dedicated endpoint for email changes.',
        );
      }
    }

    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await this.usersRepository.findOne({
        where: { email: updateData.email.trim().toLowerCase() },
      });
      if (existingUser) {
        throw new ConflictException('Email already exists');
      }

      updateData.email = updateData.email.toLowerCase().trim();
    }

    Object.assign(user, updateData);
    return this.usersRepository.save(user);
  }

  async getUsers(query: GetUsersQueryDto) {
    const { limit, q, status, sort = 'created_at', order = 'desc' } = query;

    const sortFields = {
      created_at: 'user.createdAt',
      updated_at: 'user.updatedAt',
      email: 'user.email',
    };

    const queryBuilder = this.usersRepository.createQueryBuilder('user');

    if (status) {
      queryBuilder.andWhere('user.status = :status', { status });
    }

    if (q) {
      queryBuilder.andWhere(
        `
      user.email ILIKE :q
      OR CAST(user.id AS TEXT) ILIKE :q
      `,
        {
          q: `%${q}%`,
        },
      );
    }

    queryBuilder.orderBy(
      sortFields[sort],
      order.toUpperCase() as 'ASC' | 'DESC',
    );

    queryBuilder.take(limit);

    const users = await queryBuilder.getMany();

    return users;
  }

  async deleteUser(
    userId: UUID,
    dto: DeleteUserDto = {},
    requestingUser?: AuthTokenPayload,
    isAsync: boolean = true,
  ): Promise<DeleteUserResponseDto> {
    const user = await this.usersRepository.findOne({ where: { userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingJob = await this.userDeletionJobRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    if (
      existingJob &&
      [DeletionJobStatus.IN_PROGRESS, DeletionJobStatus.PENDING].includes(
        existingJob.status,
      )
    ) {
      throw new ConflictException(
        'Deletion request is already in progress or pending.',
      );
    }

    if (requestingUser) {
      const isSelf = userId === String(requestingUser.sub);
      const isAdmin = requestingUser.roles.includes('ADMIN');

      if (isSelf && !isAdmin) {
        if (!dto.challengeId || !dto.code) {
          const challenge =
            await this.verificationService.createVerificationRecord(
              String(userId),
              VerificationTokenType.USER_DELETION,
              user.email,
            );

          await this.mailService.sendVerificationOtp(
            user.email,
            challenge.rawOtp,
          );

          return {
            requiresConfirmation: true,
            challengeId: challenge.attemptId,
            message:
              'Verification OTP sent to your email. Please submit request with challengeId and code.',
          } as any;
        }

        const record = await this.verificationService.verifyOtp(
          dto.challengeId,
          dto.code,
          VerificationTokenType.USER_DELETION,
        );

        if (String(record.userId) !== String(userId)) {
          throw new ForbiddenException('Invalid challenge session for user.');
        }
      }
    }

    const requestedBy = requestingUser?.sub ? String(requestingUser.sub) : null;

    const job = this.userDeletionJobRepository.create({
      userId: String(userId),
      reason: dto.reason,
      requestedBy,
      status: isAsync
        ? DeletionJobStatus.PENDING
        : DeletionJobStatus.IN_PROGRESS,
      mode: isAsync ? DeletionExecutionMode.ASYNC : DeletionExecutionMode.SYNC,
    });

    await this.userDeletionJobRepository.save(job);

    if (isAsync) {
      this.eventEmitter.emit('user.delete.request', {
        jobId: job.id,
        userId: String(userId),
      });

      return {
        jobId: job.id,
        status: DeletionJobStatus.PENDING,
        requestedBy: job.requestedBy,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        mode: job.mode,
      };
    } else {
      await this.processUserDeletion(job, user);
      return {
        jobId: job.id,
        status: DeletionJobStatus.DONE,
        requestedBy: job.requestedBy,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        mode: job.mode,
      };
    }
  }

  async processUserDeletion(job: UserDeletionJob, user: User) {
    try {
      job.status = DeletionJobStatus.IN_PROGRESS;
      await this.userDeletionJobRepository.save(job);

      await this.usersRepository.remove(user);

      job.status = DeletionJobStatus.DONE;
    } catch (error) {
      job.status = DeletionJobStatus.FAILED;
      job.errorMessage =
        error instanceof Error ? error.message : 'Failed to delete user';
      throw error;
    } finally {
      await this.userDeletionJobRepository.save(job);
    }
  }

  async getUserDeletionStatus(
    userId: string,
    requestingUser?: AuthTokenPayload,
  ) {
    const job = await this.userDeletionJobRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (requestingUser) {
      const isSelf = userId === String(requestingUser.sub);
      const isAdmin = requestingUser.roles.includes('ADMIN');

      if (!isSelf && !isAdmin) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    return {
      jobId: job.id,
      status: job.status,
      requestedBy: job.requestedBy,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
