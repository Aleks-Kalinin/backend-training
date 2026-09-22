import { AuthTokenPayload } from '@/modules/auth/dto/auth-request.dto';
import { MailService } from '@/modules/mail/application/mail.service';
import { SystemRole } from '@/modules/rbac/domain/system-role.enum';
import { Role } from '@/modules/rbac/infrastructure/entities/role.entity';
import { VerificationService } from '@/modules/verification/application/verification.service';
import { VerificationTokenType } from '@/modules/verification/infrastructure/entity/verification-token.entity';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { type UUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { UserStatus } from '../../domain/user-status.enum';
import { USER_DELETION_JOB_REPOSITORY } from '../ports/deletion-job-repository.port';
import { USER_REPOSITORY } from '../ports/user-repository.port';
import { USER_ROLE_REPOSITORY } from '../ports/role-repository.port';
import { ConfirmEmailChangeDto } from '../../dto/confirm-email-change.dto';
import { CreateUserDto } from '../../dto/create-user.dto';
import { DeleteUserDto } from '../../dto/delete-user.dto';
import { GetUsersQueryDto } from '../../dto/get-users-query.dto';
import { InitiateEmailChangeDto } from '../../dto/initiate-email-change.dto';
import { UpdateUserDto } from '../../dto/update-user.dto';
import {
  DeletionExecutionMode,
  DeletionJobStatus,
  UserDeletionJob,
} from '../../infrastructure/entity/user-deletion-job.entity';
import { User } from '../../infrastructure/entity/user.entity';
import { UsersService } from '../users.service';

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: any;
  let userDeletionJobRepository: any;
  let roleRepository: any;
  let verificationService: jest.Mocked<VerificationService>;
  let mailService: jest.Mocked<MailService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const mockUser: User = {
    userId: '11111111-1111-1111-1111-111111111111',
    email: 'test@example.com',
    password: 'hashedpassword',
    status: UserStatus.ACTIVE,
    isVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    photo: null,
    roles: [
      {
        id: 'role-1',
        name: SystemRole.USER,
        description: 'User Role',
        grants: [],
      } as unknown as Role,
    ],
  };

  const mockAdminUserPayload: AuthTokenPayload = {
    sub: '99999999-9999-9999-9999-999999999999' as UUID,
    email: 'admin@example.com',
    roles: [SystemRole.ADMIN],
  };

  const mockRegularUserPayload: AuthTokenPayload = {
    sub: '11111111-1111-1111-1111-111111111111' as UUID,
    email: 'test@example.com',
    roles: [SystemRole.USER],
  };

  beforeEach(async () => {
    usersRepository = {
      create: jest.fn((entity) => ({ ...entity }) as User),
      findOne: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findMany: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity as User)),
      update: jest.fn(),
      remove: jest.fn((entity) => Promise.resolve(entity as User)),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;

    userDeletionJobRepository = {
      create: jest.fn((entity) => ({ ...entity }) as UserDeletionJob),
      findOne: jest.fn(),
      findLatestByUserId: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity as UserDeletionJob)),
    } as unknown as jest.Mocked<Repository<UserDeletionJob>>;

    roleRepository = {
      findOne: jest.fn(),
      findDefaultRole: jest.fn(),
    } as unknown as jest.Mocked<Repository<Role>>;

    usersRepository.findByEmail = usersRepository.findOne as never;
    usersRepository.findById = usersRepository.findOne as never;
    userDeletionJobRepository.findLatestByUserId =
      userDeletionJobRepository.findOne as never;
    roleRepository.findDefaultRole = roleRepository.findOne as never;

    verificationService = {
      createVerificationRecord: jest.fn(),
      verifyOtp: jest.fn(),
    } as unknown as jest.Mocked<VerificationService>;

    mailService = {
      sendVerificationOtp: jest.fn(),
    } as unknown as jest.Mocked<MailService>;

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: USER_REPOSITORY, useValue: usersRepository },
        {
          provide: USER_DELETION_JOB_REPOSITORY,
          useValue: userDeletionJobRepository,
        },
        { provide: USER_ROLE_REPOSITORY, useValue: roleRepository },
        { provide: VerificationService, useValue: verificationService },
        { provide: MailService, useValue: mailService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiateEmailChange', () => {
    const dto: InitiateEmailChangeDto = { newEmail: 'newemail@example.com' };
    const userId = mockUser.userId as UUID;

    it('throws ForbiddenException when requestingUser is not the account owner', async () => {
      const otherUserPayload: AuthTokenPayload = {
        sub: '22222222-2222-2222-2222-222222222222' as UUID,
        email: 'other@example.com',
        roles: [SystemRole.USER],
      };

      await expect(
        service.initiateEmailChange(userId, dto, otherUserPayload),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException if proposed new email is already in use', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);

      await expect(
        service.initiateEmailChange(userId, dto, mockRegularUserPayload),
      ).rejects.toThrow(ConflictException);
    });

    it('creates verification challenge and emails OTP on successful initiation', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      verificationService.createVerificationRecord.mockResolvedValue({
        attemptId: 'challenge-123',
        rawOtp: '123456',
      });

      const result = await service.initiateEmailChange(
        userId,
        dto,
        mockRegularUserPayload,
      );

      expect(verificationService.createVerificationRecord).toHaveBeenCalledWith(
        userId,
        VerificationTokenType.EMAIL_CHANGE,
        'newemail@example.com',
      );
      expect(mailService.sendVerificationOtp).toHaveBeenCalledWith(
        'newemail@example.com',
        '123456',
      );
      expect(result).toEqual({
        requiresConfirmation: true,
        challengeId: 'challenge-123',
      });
    });
  });

  describe('confirmEmailChange', () => {
    const dto: ConfirmEmailChangeDto = {
      challengeId: 'challenge-123',
      code: '123456',
    };
    const userId = mockUser.userId as UUID;

    it('throws ForbiddenException when requestingUser is not the target user', async () => {
      const otherPayload: AuthTokenPayload = {
        sub: '22222222-2222-2222-2222-222222222222' as UUID,
        email: 'other@example.com',
        roles: [SystemRole.USER],
      };

      await expect(
        service.confirmEmailChange(userId, dto, otherPayload),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if OTP record belongs to another user', async () => {
      verificationService.verifyOtp.mockResolvedValue({
        verificationTokenId: 'challenge-123',
        userId: '22222222-2222-2222-2222-222222222222',
        targetEmail: 'newemail@example.com',
        type: VerificationTokenType.EMAIL_CHANGE,
        attempts: 0,
        expiresAt: new Date(),
        consumedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        tokenHash: 'hash',
        user: mockUser,
      });

      await expect(
        service.confirmEmailChange(userId, dto, mockRegularUserPayload),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException if challenge record lacks a target email', async () => {
      verificationService.verifyOtp.mockResolvedValue({
        verificationTokenId: 'challenge-123',
        userId: userId,
        targetEmail: null,
        type: VerificationTokenType.EMAIL_CHANGE,
        attempts: 0,
        expiresAt: new Date(),
        consumedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        tokenHash: 'hash',
        user: mockUser,
      });

      await expect(
        service.confirmEmailChange(userId, dto, mockRegularUserPayload),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if target email is taken by a different user', async () => {
      verificationService.verifyOtp.mockResolvedValue({
        verificationTokenId: 'challenge-123',
        userId: userId,
        targetEmail: 'taken@example.com',
        type: VerificationTokenType.EMAIL_CHANGE,
        attempts: 0,
        expiresAt: new Date(),
        consumedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        tokenHash: 'hash',
        user: mockUser,
      });

      usersRepository.findOne.mockResolvedValue({
        ...mockUser,
        userId: '33333333-3333-3333-3333-333333333333',
        email: 'taken@example.com',
      });

      await expect(
        service.confirmEmailChange(userId, dto, mockRegularUserPayload),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException if user profile does not exist in DB', async () => {
      verificationService.verifyOtp.mockResolvedValue({
        verificationTokenId: 'challenge-123',
        userId: userId,
        targetEmail: 'newemail@example.com',
        type: VerificationTokenType.EMAIL_CHANGE,
        attempts: 0,
        expiresAt: new Date(),
        consumedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        tokenHash: 'hash',
        user: mockUser,
      });

      usersRepository.findOne.mockResolvedValue(null);

      await expect(
        service.confirmEmailChange(userId, dto, mockRegularUserPayload),
      ).rejects.toThrow(NotFoundException);
    });

    it('successfully updates user email upon valid confirmation', async () => {
      verificationService.verifyOtp.mockResolvedValue({
        verificationTokenId: 'challenge-123',
        userId: userId,
        targetEmail: 'newemail@example.com',
        type: VerificationTokenType.EMAIL_CHANGE,
        attempts: 0,
        expiresAt: new Date(),
        consumedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        tokenHash: 'hash',
        user: mockUser,
      });

      usersRepository.findOne
        .mockResolvedValueOnce(null) // for existing check
        .mockResolvedValueOnce({ ...mockUser }); // for finding target user

      const result = await service.confirmEmailChange(
        userId,
        dto,
        mockRegularUserPayload,
      );

      expect(usersRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'newemail@example.com' }),
      );
      expect(result).toEqual({
        message: 'Email address successfully updated.',
      });
    });
  });

  describe('findOne', () => {
    it('normalizes email and loads roles relation', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne(' TEST@EXAMPLE.COM ');

      expect(usersRepository.findByEmail).toHaveBeenCalledWith(
        ' TEST@EXAMPLE.COM ',
      );
      expect(result).toEqual(mockUser);
    });
  });

  describe('getUser', () => {
    it('fetches user by userId', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.getUser(mockUser.userId);

      expect(usersRepository.findById).toHaveBeenCalledWith(mockUser.userId);
      expect(result).toEqual(mockUser);
    });
  });

  describe('createUser', () => {
    const dto: CreateUserDto = {
      email: ' NewUser@example.com ',
      password: 'password123',
      status: UserStatus.ACTIVE,
      isVerified: true,
    };

    it('creates user and assigns default USER role if found', async () => {
      const mockRole = {
        id: 'role-user-id',
        name: SystemRole.USER,
        description: 'User role',
        grants: [],
      } as Role;

      roleRepository.findOne.mockResolvedValue(mockRole);

      await service.createUser(dto);

      expect(usersRepository.create).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        password: 'password123',
        status: UserStatus.ACTIVE,
        isVerified: true,
        photo: null,
      });
      expect(usersRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'newuser@example.com',
          roles: [mockRole],
        }),
      );
    });
  });

  describe('updateUser', () => {
    const userId = mockUser.userId;

    it('throws Error if user is not found', async () => {
      usersRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateUser(userId, { photo: 'http://pic.jpg' }),
      ).rejects.toThrow('User not found');
    });

    it('throws ForbiddenException if non-owner non-admin attempts update', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);

      const otherUserPayload: AuthTokenPayload = {
        sub: '22222222-2222-2222-2222-222222222222' as UUID,
        email: 'other@example.com',
        roles: [SystemRole.USER],
      };

      await expect(
        service.updateUser(
          userId,
          { photo: 'http://pic.jpg' },
          otherUserPayload,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if non-admin self attempts direct email update', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);

      await expect(
        service.updateUser(
          userId,
          { email: 'directchange@example.com' },
          mockRegularUserPayload,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException if updated email is taken by another user', async () => {
      usersRepository.findOne
        .mockResolvedValueOnce({ ...mockUser }) // target user
        .mockResolvedValueOnce({
          ...mockUser,
          userId: '33333333-3333-3333-3333-333333333333',
        }); // existing user with email

      await expect(
        service.updateUser(
          userId,
          { email: 'existing@example.com' },
          mockAdminUserPayload,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('successfully updates user data as admin or self', async () => {
      usersRepository.findOne.mockResolvedValue({ ...mockUser });

      const updateDto: UpdateUserDto = { photo: 'http://newphoto.png' };

      const result = await service.updateUser(
        userId,
        updateDto,
        mockRegularUserPayload,
      );

      expect(usersRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ photo: 'http://newphoto.png' }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('getUsers', () => {
    it('applies query filters, sorting, and pagination limit', async () => {
      usersRepository.findMany.mockResolvedValue([mockUser]);

      const queryDto: GetUsersQueryDto = {
        limit: 10,
        q: 'test',
        status: UserStatus.ACTIVE,
        sort: 'created_at',
        order: 'desc',
      };

      const result = await service.getUsers(queryDto);

      expect(usersRepository.findMany).toHaveBeenCalledWith({
        limit: 10,
        q: 'test',
        status: UserStatus.ACTIVE,
        sort: 'created_at',
        order: 'desc',
      });
      expect(result).toEqual([mockUser]);
    });
  });

  describe('deleteUser', () => {
    const userId = mockUser.userId as UUID;

    it('throws NotFoundException if user is not found', async () => {
      usersRepository.findOne.mockResolvedValue(null);

      await expect(
        service.deleteUser(userId, {}, mockRegularUserPayload),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if deletion job is already pending or in progress', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);
      userDeletionJobRepository.findOne.mockResolvedValue({
        id: 'job-1',
        userId: userId,
        status: DeletionJobStatus.IN_PROGRESS,
        mode: DeletionExecutionMode.SYNC,
        requestedBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as UserDeletionJob);

      await expect(
        service.deleteUser(userId, {}, mockRegularUserPayload),
      ).rejects.toThrow(ConflictException);
    });

    it('initiates verification OTP process for non-admin self deletion without OTP', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);
      userDeletionJobRepository.findOne.mockResolvedValue(null);
      verificationService.createVerificationRecord.mockResolvedValue({
        attemptId: 'deletion-challenge-1',
        rawOtp: '654321',
      });

      const result = await service.deleteUser(
        userId,
        {},
        mockRegularUserPayload,
      );

      expect(verificationService.createVerificationRecord).toHaveBeenCalledWith(
        userId,
        VerificationTokenType.USER_DELETION,
        mockUser.email,
      );
      expect(mailService.sendVerificationOtp).toHaveBeenCalledWith(
        mockUser.email,
        '654321',
      );
      expect(result).toEqual({
        requiresConfirmation: true,
        challengeId: 'deletion-challenge-1',
        message: expect.any(String),
      });
    });

    it('verifies OTP for non-admin self deletion when challengeId and code are provided', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);
      userDeletionJobRepository.findOne.mockResolvedValue(null);
      verificationService.verifyOtp.mockResolvedValue({
        verificationTokenId: 'deletion-challenge-1',
        userId: userId,
        type: VerificationTokenType.USER_DELETION,
        attempts: 0,
        expiresAt: new Date(),
        consumedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        tokenHash: 'hash',
        user: mockUser,
      });

      const deleteDto: DeleteUserDto = {
        challengeId: 'deletion-challenge-1',
        code: '654321',
        reason: 'No longer needed',
      };

      const result = await service.deleteUser(
        userId,
        deleteDto,
        mockRegularUserPayload,
      );

      expect(verificationService.verifyOtp).toHaveBeenCalledWith(
        'deletion-challenge-1',
        '654321',
        VerificationTokenType.USER_DELETION,
      );
      expect(result.status).toBe(DeletionJobStatus.DONE);
    });

    it('throws ForbiddenException if deletion OTP challenge belongs to another user', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);
      userDeletionJobRepository.findOne.mockResolvedValue(null);
      verificationService.verifyOtp.mockResolvedValue({
        verificationTokenId: 'deletion-challenge-1',
        userId: '22222222-2222-2222-2222-222222222222',
        type: VerificationTokenType.USER_DELETION,
        attempts: 0,
        expiresAt: new Date(),
        consumedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        tokenHash: 'hash',
        user: mockUser,
      });

      const deleteDto: DeleteUserDto = {
        challengeId: 'deletion-challenge-1',
        code: '654321',
      };

      await expect(
        service.deleteUser(userId, deleteDto, mockRegularUserPayload),
      ).rejects.toThrow(ForbiddenException);
    });

    it('handles async deletion mode by emitting user.delete.request event', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);
      userDeletionJobRepository.findOne.mockResolvedValue(null);

      const result = await service.deleteUser(
        userId,
        {},
        mockAdminUserPayload,
        true,
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.delete.request',
        expect.objectContaining({ userId }),
      );
      expect(result.status).toBe(DeletionJobStatus.PENDING);
    });
  });

  describe('processUserDeletion', () => {
    it('processes sync deletion, removes user and sets job status to DONE', async () => {
      const job: UserDeletionJob = {
        id: 'job-1',
        userId: mockUser.userId,
        status: DeletionJobStatus.IN_PROGRESS,
        mode: DeletionExecutionMode.SYNC,
        requestedBy: mockUser.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await service.processUserDeletion(job, mockUser);

      expect(usersRepository.remove).toHaveBeenCalledWith(mockUser);
      expect(userDeletionJobRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: DeletionJobStatus.DONE }),
      );
    });

    it('sets job status to FAILED and rethrows error if remove fails', async () => {
      const job: UserDeletionJob = {
        id: 'job-1',
        userId: mockUser.userId,
        status: DeletionJobStatus.IN_PROGRESS,
        mode: DeletionExecutionMode.SYNC,
        requestedBy: mockUser.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      usersRepository.remove.mockRejectedValue(new Error('DB Error'));

      await expect(service.processUserDeletion(job, mockUser)).rejects.toThrow(
        'DB Error',
      );
      expect(userDeletionJobRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: DeletionJobStatus.FAILED,
          errorMessage: 'DB Error',
        }),
      );
    });
  });

  describe('getUserDeletionStatus', () => {
    const userId = mockUser.userId;

    it('throws NotFoundException if job is not found', async () => {
      userDeletionJobRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getUserDeletionStatus(userId, mockRegularUserPayload),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException if non-owner non-admin checks status', async () => {
      userDeletionJobRepository.findOne.mockResolvedValue({
        id: 'job-1',
        userId,
        status: DeletionJobStatus.DONE,
        mode: DeletionExecutionMode.SYNC,
        requestedBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as UserDeletionJob);

      const otherPayload: AuthTokenPayload = {
        sub: '22222222-2222-2222-2222-222222222222' as UUID,
        email: 'other@example.com',
        roles: [SystemRole.USER],
      };

      await expect(
        service.getUserDeletionStatus(userId, otherPayload),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns deletion job status object successfully', async () => {
      const mockJob: UserDeletionJob = {
        id: 'job-1',
        userId,
        status: DeletionJobStatus.DONE,
        mode: DeletionExecutionMode.SYNC,
        requestedBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      userDeletionJobRepository.findOne.mockResolvedValue(mockJob);

      const result = await service.getUserDeletionStatus(
        userId,
        mockRegularUserPayload,
      );

      expect(result).toEqual({
        jobId: 'job-1',
        status: DeletionJobStatus.DONE,
        requestedBy: userId,
        createdAt: mockJob.createdAt,
        updatedAt: mockJob.updatedAt,
      });
    });
  });
});
