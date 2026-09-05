jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

import { ConflictException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from '../../settings/application/settings.service';
import { SETTING_KEYS } from '../../settings/dto/settings.dto';
import { UserStatus } from '../../users/dto/users.dto';
import { UsersService } from '../../users/application/users.service';
import { VerificationService } from '../../verification/application/verification.service';
import { VerificationTokenType } from '../../verification/infrastructure/entity/verification-token.entity';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let settingsService: jest.Mocked<SettingsService>;
  let verificationService: jest.Mocked<VerificationService>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    usersService = {
      findOne: jest.fn(),
      createUser: jest.fn(),
      updateUser: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    settingsService = {
      isFeatureEnabled: jest.fn(),
    } as unknown as jest.Mocked<SettingsService>;

    verificationService = {
      createVerificationRecord: jest.fn(),
      verifyOtp: jest.fn(),
    } as unknown as jest.Mocked<VerificationService>;

    jwtService = {
      signAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: VerificationService, useValue: verificationService },
        { provide: SettingsService, useValue: settingsService },
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
    });
    jwtService.signAsync.mockResolvedValue('token');

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
});
