import { SystemRole } from '@/modules/rbac/domain/system-role.enum';
import { ConflictException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { MailService } from '../../../mail/application/mail.service';
import { SettingsService } from '../../../settings/application/settings.service';
import { SETTING_KEYS } from '../../../settings/dto/settings.dto';
import { UsersService } from '../../../users/application/users.service';
import { UserStatus } from '../../../users/domain/user-status.enum';
import { VerificationService } from '../../../verification/application/verification.service';
import { VerificationTokenType } from '../../../verification/domain/verification-token-type.enum';
import { AuthService } from '../auth.service';
import { AUTH_TOKEN_SERVICE } from '../ports/token-service.port';
import { PASSWORD_HASHER } from '../ports/password-hasher.port';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let settingsService: jest.Mocked<SettingsService>;
  let verificationService: jest.Mocked<VerificationService>;
  let tokenService: {
    generateTokenPair: jest.Mock;
    verifyRefreshToken: jest.Mock;
  };
  let passwordHasher: {
    hash: jest.Mock;
    compare: jest.Mock;
  };
  let mailService: jest.Mocked<MailService>;

  beforeEach(async () => {
    usersService = {
      findOne: jest.fn(),
      createUser: jest.fn(),
      updateUser: jest.fn(),
      getUser: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    settingsService = {
      isFeatureEnabled: jest.fn(),
    } as unknown as jest.Mocked<SettingsService>;

    verificationService = {
      createVerificationRecord: jest.fn(),
      verifyOtp: jest.fn(),
    } as unknown as jest.Mocked<VerificationService>;

    tokenService = {
      generateTokenPair: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
      verifyRefreshToken: jest.fn(),
    };
    passwordHasher = {
      hash: jest.fn().mockResolvedValue('hashed'),
      compare: jest.fn().mockResolvedValue(true),
    };

    mailService = {
      sendVerificationOtp: jest.fn(),
    } as unknown as jest.Mocked<MailService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: AUTH_TOKEN_SERVICE, useValue: tokenService },
        { provide: PASSWORD_HASHER, useValue: passwordHasher },
        { provide: VerificationService, useValue: verificationService },
        { provide: SettingsService, useValue: settingsService },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('normalizes email before checking uniqueness and creating an active user', async () => {
    usersService.findOne.mockResolvedValue(null);
    settingsService.isFeatureEnabled.mockResolvedValue(false);
    usersService.createUser.mockResolvedValue({
      userId: 'user-id',
      email: 'newuser@example.com',
      password: 'hashed',
      status: UserStatus.ACTIVE,
      isVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      roles: [
        {
          id: randomUUID(),
          name: SystemRole.USER,
          description: 'User role',
          grants: [],
        },
      ],
      photo: null,
    });
    const result = await service.signUp(' NewUser@Example.COM ', 'Password123');

    expect(usersService.findOne).toHaveBeenCalledWith('newuser@example.com');
    expect(settingsService.isFeatureEnabled).toHaveBeenCalledWith(
      SETTING_KEYS.REGISTRATION_VERIFICATION,
    );
    expect(usersService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'newuser@example.com',
        isVerified: true,
        status: UserStatus.ACTIVE,
      }),
    );
    expect(result.statusCode).toBe(HttpStatus.CREATED);
  });

  it('rejects duplicate registration with 409 conflict', async () => {
    usersService.findOne.mockResolvedValue({
      userId: 'existing-id',
      email: 'newuser@example.com',
      password: 'hashed',
      status: UserStatus.ACTIVE,
      isVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      roles: [
        {
          id: randomUUID(),
          name: SystemRole.USER,
          description: 'User role',
          grants: [],
        },
      ],
      photo: null,
    });

    await expect(
      service.signUp(' NewUser@Example.COM ', 'Password123'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a pending user and verification attempt when registration verification is enabled', async () => {
    usersService.findOne.mockResolvedValue(null);
    settingsService.isFeatureEnabled.mockResolvedValue(true);
    usersService.createUser.mockResolvedValue({
      userId: 'user-id',
      email: 'newuser@example.com',
      password: 'hashed',
      status: UserStatus.PENDING,
      isVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      roles: [
        {
          id: randomUUID(),
          name: SystemRole.USER,
          description: 'User role',
          grants: undefined,
        },
      ],
      photo: null,
    });
    verificationService.createVerificationRecord.mockResolvedValue({
      attemptId: 'attempt-id',
      rawOtp: '123456',
    });

    const result = await service.signUp('newuser@example.com', 'Password123');

    expect(usersService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        isVerified: false,
        status: UserStatus.PENDING,
      }),
    );
    expect(verificationService.createVerificationRecord).toHaveBeenCalledWith(
      'user-id',
      VerificationTokenType.REGISTRATION,
    );
    expect(result).toEqual({
      statusCode: HttpStatus.ACCEPTED,
      data: {
        message: 'Registration pending email verification.',
        verificationRequired: true,
        attemptId: 'attempt-id',
      },
    });
  });

  it('requires OTP verification before completing login when login verification is enabled', async () => {
    usersService.findOne.mockResolvedValue({
      userId: 'user-id',
      email: 'user@example.com',
      password: 'hashed',
      status: UserStatus.ACTIVE,
      isVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      roles: [
        {
          id: randomUUID(),
          name: SystemRole.USER,
          description: 'User role',
          grants: [],
        },
      ],
      photo: null,
    });
    passwordHasher.compare.mockResolvedValue(true);
    settingsService.isFeatureEnabled.mockResolvedValue(true);
    verificationService.createVerificationRecord.mockResolvedValue({
      attemptId: 'login-attempt-id',
      rawOtp: '654321',
    });

    const result = await service.signIn('user@example.com', 'Password123');

    expect(verificationService.createVerificationRecord).toHaveBeenCalledWith(
      'user-id',
      VerificationTokenType.LOGIN,
    );
    expect(mailService.sendVerificationOtp).toHaveBeenCalledWith(
      'user@example.com',
      '654321',
    );
    expect(result).toEqual({
      statusCode: HttpStatus.ACCEPTED,
      data: {
        message: 'Login verification required.',
        verificationRequired: true,
        attemptId: 'login-attempt-id',
      },
    });
  });

  it('issues auth tokens after successful login OTP verification', async () => {
    verificationService.verifyOtp.mockResolvedValue({
      userId: 'user-id',
      targetEmail: undefined,
      type: VerificationTokenType.LOGIN,
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 600000),
      attempts: 0,
      consumedAt: null,
      verificationTokenId: 'login-attempt-id',
    });
    usersService.getUser.mockResolvedValue({
      userId: 'user-id',
      email: 'user@example.com',
      password: 'hashed',
      status: UserStatus.ACTIVE,
      isVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      roles: [
        {
          id: randomUUID(),
          name: SystemRole.USER,
          description: 'User role',
          grants: [],
        },
      ],
      photo: null,
    });

    const result = await service.verifyLogin('login-attempt-id', '654321');

    expect(verificationService.verifyOtp).toHaveBeenCalledWith(
      'login-attempt-id',
      '654321',
      VerificationTokenType.LOGIN,
    );
    expect(tokenService.generateTokenPair).toHaveBeenCalled();
    expect(result).toEqual({
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
  });
});
