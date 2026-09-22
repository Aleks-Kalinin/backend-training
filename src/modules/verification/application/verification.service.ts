import {
  Inject,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { VerificationTokenType } from '../domain/verification-token-type.enum';
import type { VerificationToken } from '../domain/verification-token.models';
import {
  VERIFICATION_REPOSITORY,
  type VerificationRepository,
} from './ports/verification-repository.port';
import {
  VERIFICATION_PASSWORD_HASHER,
  type VerificationPasswordHasher,
} from './ports/password-hasher.port';
import {
  VERIFICATION_RUNTIME_ENVIRONMENT,
  type VerificationRuntimeEnvironment,
} from './ports/runtime-environment.port';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private readonly OTP_TTL_MINUTES = 10;
  private readonly MAX_ATTEMPTS = 5;

  constructor(
    @Inject(VERIFICATION_REPOSITORY)
    private readonly verificationRepository: VerificationRepository,
    @Inject(VERIFICATION_PASSWORD_HASHER)
    private readonly passwordHasher: VerificationPasswordHasher,
    @Inject(VERIFICATION_RUNTIME_ENVIRONMENT)
    private readonly runtimeEnvironment: VerificationRuntimeEnvironment,
  ) {}

  generateOtp(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  async createVerificationRecord(
    userId: string,
    type: VerificationTokenType,
    targetEmail?: string,
  ) {
    const otp = this.generateOtp();
    const tokenHash = await this.passwordHasher.hash(otp);
    const expiresAt = new Date(Date.now() + this.OTP_TTL_MINUTES * 60 * 1000);

    await this.verificationRepository.consumeActiveForUser(
      userId,
      type,
      new Date(),
    );

    const record = await this.verificationRepository.create({
      userId,
      type,
      targetEmail,
      tokenHash,
      expiresAt,
    });

    this.logger.log(`Created ${type} verification attempt for user ${userId}`);
    if (!this.runtimeEnvironment.isProduction()) {
      this.logger.debug(`Development ${type} OTP for user ${userId}: ${otp}`);
    }

    return { attemptId: record.verificationTokenId, rawOtp: otp };
  }

  async verifyOtp(
    attemptId: string,
    inputOtp: string,
    expectedType: VerificationTokenType = VerificationTokenType.REGISTRATION,
  ): Promise<VerificationToken> {
    const record = await this.verificationRepository.findActive(
      attemptId,
      expectedType,
    );

    if (!record || new Date() > record.expiresAt) {
      throw new UnprocessableEntityException(
        'Invalid or expired verification code.',
      );
    }

    if (record.attempts >= this.MAX_ATTEMPTS) {
      throw new HttpException(
        'Maximum verification attempts exceeded.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const isValid = await this.passwordHasher.compare(
      inputOtp.trim(),
      record.tokenHash,
    );
    if (!isValid) {
      record.attempts += 1;
      await this.verificationRepository.save(record);

      if (record.attempts >= this.MAX_ATTEMPTS) {
        throw new HttpException(
          'Maximum verification attempts exceeded.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      this.logger.warn('Invalid verification code.');

      throw new UnprocessableEntityException('Invalid verification code.');
    }

    record.consumedAt = new Date();
    await this.verificationRepository.save(record);

    return record;
  }
}
