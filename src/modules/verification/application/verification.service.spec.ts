import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { HttpException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import {
  VerificationToken,
  VerificationTokenType,
} from '../infrastructure/entity/verification-token.entity';
import { VerificationService } from './verification.service';

describe('VerificationService', () => {
  let service: VerificationService;
  let repository: jest.Mocked<Repository<VerificationToken>>;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    const save = jest.fn(
      async (entity: VerificationToken): Promise<VerificationToken> => ({
        ...entity,
        verificationTokenId: 'attempt-id',
        attempts: 0,
        consumedAt: null,
      }),
    );

    repository = {
      create: jest.fn((entity) => entity as VerificationToken),
      findOne: jest.fn(),
      save,
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<VerificationToken>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerificationService,
        {
          provide: getRepositoryToken(VerificationToken),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get(VerificationService);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it('persists a hashed 6-digit registration OTP', async () => {
    const result = await service.createVerificationRecord(
      'user-id',
      VerificationTokenType.REGISTRATION,
    );

    expect(result.attemptId).toBe('attempt-id');
    expect(result.rawOtp).toMatch(/^\d{6}$/);
    expect(repository.update).toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-id',
        type: VerificationTokenType.REGISTRATION,
        expiresAt: expect.any(Date),
      }),
    );

    const created = repository.create.mock.calls[0][0] as VerificationToken;
    expect(created.tokenHash).not.toBe(result.rawOtp);
    await expect(
      bcrypt.compare(result.rawOtp, created.tokenHash),
    ).resolves.toBe(true);
  });

  it('logs the raw OTP outside production for local verification testing', async () => {
    process.env.NODE_ENV = 'development';
    const debugSpy = jest
      .spyOn(
        (service as unknown as { logger: { debug: jest.Mock } }).logger,
        'debug',
      )
      .mockImplementation(() => {});

    const result = await service.createVerificationRecord(
      'user-id',
      VerificationTokenType.REGISTRATION,
    );

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining(result.rawOtp),
    );
  });

  it('consumes a valid OTP and returns the user id', async () => {
    const tokenHash = await bcrypt.hash('123456', 10);
    repository.findOne.mockResolvedValue({
      verificationTokenId: 'attempt-id',
      userId: 'user-id',
      type: VerificationTokenType.REGISTRATION,
      tokenHash,
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as VerificationToken);

    const result = await service.verifyOtp('attempt-id', '123456');
    expect(result.userId).toBe('user-id');
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ consumedAt: expect.any(Date) }),
    );
  });

  it('increments attempts for invalid OTP and blocks after the fifth attempt', async () => {
    const tokenHash = await bcrypt.hash('123456', 10);
    repository.findOne.mockResolvedValue({
      verificationTokenId: 'attempt-id',
      userId: 'user-id',
      type: VerificationTokenType.REGISTRATION,
      tokenHash,
      attempts: 4,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as VerificationToken);

    await expect(
      service.verifyOtp('attempt-id', '654321'),
    ).rejects.toMatchObject({
      status: 429,
    } satisfies Partial<HttpException>);
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 5 }),
    );
  });

  it('rejects missing or expired OTP attempts with 422', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.verifyOtp('attempt-id', '123456'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
