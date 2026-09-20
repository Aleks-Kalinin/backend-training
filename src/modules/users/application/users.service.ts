import { AuthTokenPayload } from '@/modules/auth/dto/auth-request.dto';
import { MailService } from '@/modules/mail/application/mail.service';
import { SystemRole } from '@/modules/rbac/domain/system-role.enum';
import { Role } from '@/modules/rbac/infrastructure/entities/role.entity';
import { VerificationService } from '@/modules/verification/application/verification.service';
import { VerificationTokenType } from '@/modules/verification/infrastructure/entity/verification-token.entity';
import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { UUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { ConfirmEmailChangeDto } from '../dto/confirm-email-change.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { DeleteUserResponseDto } from '../dto/delete-user-response.dto';
import { DeleteUserDto } from '../dto/delete-user.dto';
import { GetUsersQueryDto } from '../dto/get-users-query.dto';
import { InitiateEmailChangeDto } from '../dto/initiate-email-change.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import {
  DeletionExecutionMode,
  DeletionJobStatus,
  UserDeletionJob,
} from '../infrastructure/entity/user-deletion-job.entity';
import { User } from '../infrastructure/entity/user.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(UserDeletionJob)
    private readonly userDeletionJobRepository: Repository<UserDeletionJob>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly verificationService: VerificationService,
    private readonly mailService: MailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private logUserUpdateAudit(
    event: 'UPDATE',
    actorUserId: string,
    targetUserId: string,
    fields: string[],
    status: number,
  ): void {
    this.logger.log(
      JSON.stringify({
        event,
        actorUserId,
        targetUserId,
        fields,
        status,
      }),
    );
  }

  private logUserDeleteAudit(
    event: 'DELETE',
    actorUserId: string,
    targetUserId: string,
    operationType: 'self' | 'admin',
    status: number,
  ): void {
    this.logger.log(
      JSON.stringify({
        event,
        actorUserId,
        targetUserId,
        operationType,
        status,
      }),
    );
  }

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

    const userRole = await this.roleRepository.findOne({
      where: { name: SystemRole.USER },
    });
    if (userRole) {
      newUser.roles = [userRole];
    }

    const savedUser = await this.usersRepository.save(newUser);

    this.logger.log(`User with ID ${savedUser.userId} created successfully`);

    return savedUser;
  }

  async updateUser(
    userId: string,
    updateData: UpdateUserDto,
    requestingUser?: AuthTokenPayload,
  ): Promise<User> {
    const actorUserId = requestingUser?.sub
      ? String(requestingUser.sub)
      : userId;
    const user = await this.usersRepository.findOne({ where: { userId } });

    if (!user) {
      this.logUserUpdateAudit(
        'UPDATE',
        actorUserId,
        userId,
        Object.keys(updateData),
        HttpStatus.NOT_FOUND,
      );
      throw new Error('User not found');
    }

    if (requestingUser) {
      const isSelf = userId === String(requestingUser.sub);
      const isAdmin = requestingUser.roles.includes(SystemRole.ADMIN);

      if (!isSelf && !isAdmin) {
        this.logUserUpdateAudit(
          'UPDATE',
          actorUserId,
          userId,
          Object.keys(updateData),
          HttpStatus.FORBIDDEN,
        );
        throw new ForbiddenException('Insufficient permissions');
      }

      if (isSelf && !isAdmin && updateData.email !== undefined) {
        this.logUserUpdateAudit(
          'UPDATE',
          actorUserId,
          userId,
          Object.keys(updateData),
          HttpStatus.FORBIDDEN,
        );
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
        this.logUserUpdateAudit(
          'UPDATE',
          actorUserId,
          userId,
          Object.keys(updateData),
          HttpStatus.CONFLICT,
        );
        throw new ConflictException('Email already exists');
      }

      updateData.email = updateData.email.toLowerCase().trim();
    }

    Object.assign(user, updateData);

    const savedUser = await this.usersRepository.save(user);

    const changedFields = Object.keys(updateData);
    this.logUserUpdateAudit(
      'UPDATE',
      actorUserId,
      userId,
      changedFields,
      HttpStatus.OK,
    );

    return savedUser;
  }

  async getUsers(query: GetUsersQueryDto, actorUserId: UUID) {
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

    this.logger.log(
      JSON.stringify({
        actorUserId: actorUserId,
        query: query,
        status: HttpStatus.OK,
        length: users.length,
      }),
    );

    return users;
  }

  async deleteUser(
    userId: UUID,
    dto: DeleteUserDto = {},
    requestingUser?: AuthTokenPayload,
    isAsync: boolean = false,
  ): Promise<DeleteUserResponseDto> {
    const operationType: 'self' | 'admin' =
      requestingUser?.sub === userId ? 'self' : 'admin';
    const user = await this.usersRepository.findOne({ where: { userId } });

    if (!user) {
      this.logUserDeleteAudit(
        'DELETE',
        userId,
        userId,
        operationType,
        HttpStatus.NOT_FOUND,
      );
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
      const isAdmin = requestingUser.roles.includes(SystemRole.ADMIN);

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

          this.logUserDeleteAudit(
            'DELETE',
            String(userId),
            String(userId),
            operationType,
            HttpStatus.OK,
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
          this.logUserDeleteAudit(
            'DELETE',
            String(userId),
            String(userId),
            operationType,
            HttpStatus.FORBIDDEN,
          );
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
      await this.processUserDeletion(job, user, operationType);
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

  async processUserDeletion(
    job: UserDeletionJob,
    user: User,
    operationType: 'self' | 'admin',
  ) {
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

      if (job.status === DeletionJobStatus.DONE) {
        this.logUserDeleteAudit(
          'DELETE',
          String(user.userId),
          String(user.userId),
          operationType,
          HttpStatus.OK,
        );
      } else if (job.status === DeletionJobStatus.FAILED) {
        this.logUserDeleteAudit(
          'DELETE',
          String(user.userId),
          String(user.userId),
          operationType,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
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
      const isAdmin = requestingUser.roles.includes(SystemRole.ADMIN);

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
