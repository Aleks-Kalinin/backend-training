import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { MailService } from '../../mail/application/mail.service';
import { SettingsService } from '../../settings/application/settings.service';
import { SETTING_KEYS } from '../../settings/dto/settings.dto';
import { UsersService } from '../../users/application/users.service';
import { UserStatus } from '../../users/dto/users.dto';
import { VerificationService } from '../../verification/application/verification.service';
import { VerificationTokenType } from '../../verification/infrastructure/entity/verification-token.entity';

export type SignUpResult =
  | {
      statusCode: HttpStatus.CREATED;
      data: { user: { id: string; email: string }; access_token: string };
    }
  | {
      statusCode: HttpStatus.ACCEPTED;
      data: { message: string; verificationRequired: true; attemptId: string };
    };

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private verificationService: VerificationService,
    private settingsService: SettingsService,
    private mailService: MailService,
  ) {}

  async signUp(email: string, pass: string): Promise<SignUpResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await this.usersService.findOne(normalizedEmail);
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const hashedPassword = await bcrypt.hash(pass, 10);
    const isVerificationRequired = await this.settingsService.isFeatureEnabled(
      SETTING_KEYS.REGISTRATION_VERIFICATION,
    );

    const user = await this.usersService.createUser({
      email: normalizedEmail,
      password: hashedPassword,
      isVerified: !isVerificationRequired,
      status: isVerificationRequired ? UserStatus.PENDING : UserStatus.ACTIVE,
    });

    if (!isVerificationRequired) {
      const payload = { sub: user.userId, email: user.email };
      const access_token = await this.jwtService.signAsync(payload);
      return {
        statusCode: HttpStatus.CREATED,
        data: { user: { id: user.userId, email: user.email }, access_token },
      };
    }

    const { attemptId, rawOtp } =
      await this.verificationService.createVerificationRecord(
        user.userId,
        VerificationTokenType.REGISTRATION,
      );

    await this.mailService.sendVerificationOtp(user.email, rawOtp);

    return {
      statusCode: HttpStatus.ACCEPTED,
      data: {
        message: 'Registration pending email verification.',
        verificationRequired: true,
        attemptId,
      },
    };
  }

  async verifyRegistration(
    attemptId: string,
    otp: string,
  ): Promise<{ access_token: string }> {
    const userId = await this.verificationService.verifyOtp(attemptId, otp);

    // Activate user upon successful verification
    const user = await this.usersService.updateUser(userId, {
      isVerified: true,
      status: UserStatus.ACTIVE,
    });

    const payload = { sub: user.userId, email: user.email };
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  async signIn(email: string, pass: string): Promise<{ access_token: string }> {
    const user = await this.usersService.findOne(email.trim().toLowerCase());
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(pass, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isLoginVerificationRequired =
      await this.settingsService.isFeatureEnabled(
        SETTING_KEYS.LOGIN_VERIFICATION,
      );

    if (!user.isVerified || user.status === UserStatus.PENDING) {
      throw new ForbiddenException(
        'Email address must be verified prior to login',
      );
    }

    if (isLoginVerificationRequired) {
      // Generate OTP and send to user via email/SMS
    }

    const payload = { sub: user.userId, email: user.email };

    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}
