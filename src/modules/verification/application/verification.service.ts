import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { IsNull, Repository } from 'typeorm';
import {
  VerificationToken,
  VerificationTokenType,
} from '../infrastructure/entity/verification-token.entity';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private readonly OTP_TTL_MINUTES = 10;
  private readonly MAX_ATTEMPTS = 5;

  constructor(
    @InjectRepository(VerificationToken)
    private readonly verificationTokenRepository: Repository<VerificationToken>,
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
    const tokenHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + this.OTP_TTL_MINUTES * 60 * 1000);

    await this.verificationTokenRepository.update(
      { userId, type, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );

    const record = await this.verificationTokenRepository.save(
      this.verificationTokenRepository.create({
        userId,
        type,
        targetEmail,
        tokenHash,
        expiresAt,
      }),
    );

    this.logger.log(`Created ${type} verification attempt for user ${userId}`);
    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(`Development ${type} OTP for user ${userId}: ${otp}`);
    }

    return { attemptId: record.verificationTokenId, rawOtp: otp };
  }

  async verifyOtp(
    attemptId: string,
    inputOtp: string,
    expectedType: VerificationTokenType = VerificationTokenType.REGISTRATION,
  ): Promise<VerificationToken> {
    const record = await this.verificationTokenRepository.findOne({
      where: {
        verificationTokenId: attemptId,
        type: expectedType,
        consumedAt: IsNull(),
      },
    });

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

    const isValid = await bcrypt.compare(inputOtp.trim(), record.tokenHash);
    if (!isValid) {
      record.attempts += 1;
      await this.verificationTokenRepository.save(record);

      if (record.attempts >= this.MAX_ATTEMPTS) {
        throw new HttpException(
          'Maximum verification attempts exceeded.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new UnprocessableEntityException('Invalid verification code.');
    }

    record.consumedAt = new Date();
    await this.verificationTokenRepository.save(record);

    return record;
  }
}
