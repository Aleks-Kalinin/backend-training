import { ConfigService } from '@/core/config/config.service';
import {
  ConflictException,
  ForbiddenException,
  forwardRef,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { MailService } from '../../mail/application/mail.service';
import { SettingsService } from '../../settings/application/settings.service';
import { SETTING_KEYS } from '../../settings/dto/settings.dto';
import { UsersService } from '../../users/application/users.service';
import { UserStatus } from '../../users/domain/user-status.enum';
import { VerificationService } from '../../verification/application/verification.service';
import { VerificationTokenType } from '../../verification/infrastructure/entity/verification-token.entity';
import { TOKEN_TTL } from '../presentation/constants/auth.constants';

export type SignUpResult =
  | {
      statusCode: HttpStatus.CREATED;
      data: { user: { id: string; email: string } };
      tokens: TokenPair;
    }
  | {
      statusCode: HttpStatus.ACCEPTED;
      data: { message: string; verificationRequired: true; attemptId: string };
    };

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type JwtPayload = {
  sub: string;
  email: string;
  roles: string[];
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private verificationService: VerificationService,
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService,
    private mailService: MailService,
    private configService: ConfigService,
  ) {}

  /**
   * Generate an access + refresh token pair for a given user payload.
   */
  async generateTokenPair(payload: JwtPayload): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: TOKEN_TTL.ACCESS_TOKEN_SECONDS,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: TOKEN_TTL.REFRESH_TOKEN_SECONDS,
      }),
    ]);

    return { accessToken, refreshToken };
  }

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
      const roleNames = user.roles ? user.roles.map((role) => role.name) : [];
      const payload: JwtPayload = {
        sub: user.userId,
        email: user.email,
        roles: roleNames,
      };
      const tokens = await this.generateTokenPair(payload);
      return {
        statusCode: HttpStatus.CREATED,
        data: { user: { id: user.userId, email: user.email } },
        tokens,
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
  ): Promise<{ tokens: TokenPair }> {
    const token = await this.verificationService.verifyOtp(attemptId, otp);

    // Activate user upon successful verification
    const user = await this.usersService.updateUser(token.userId, {
      isVerified: true,
      status: UserStatus.ACTIVE,
    });

    const roleNames = user.roles ? user.roles.map((role) => role.name) : [];
    const payload: JwtPayload = {
      sub: user.userId,
      email: user.email,
      roles: roleNames,
    };
    const tokens = await this.generateTokenPair(payload);
    return { tokens };
  }

  async signIn(email: string, pass: string): Promise<{ tokens: TokenPair }> {
    const user = await this.usersService.findOne(email.trim().toLowerCase());
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(pass, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isVerified || user.status === UserStatus.PENDING) {
      throw new ForbiddenException(
        'Email address must be verified prior to login',
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active');
    }

    const isLoginVerificationRequired =
      await this.settingsService.isFeatureEnabled(
        SETTING_KEYS.LOGIN_VERIFICATION,
      );

    if (isLoginVerificationRequired) {
      // Generate OTP and send to user via email/SMS
    }

    const roleNames = user.roles ? user.roles.map((role) => role.name) : [];
    const payload: JwtPayload = {
      sub: user.userId,
      email: user.email,
      roles: roleNames,
    };

    const tokens = await this.generateTokenPair(payload);
    return { tokens };
  }

  /**
   * Validates a refresh token and returns a new token pair (rotation).
   * No database lookup is performed — validation is purely cryptographic.
   */
  async refresh(refreshToken: string): Promise<{ tokens: TokenPair }> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        { secret: this.configService.get('JWT_REFRESH_SECRET') },
      );

      const tokens = await this.generateTokenPair({
        sub: payload.sub,
        email: payload.email,
        roles: payload.roles,
      });

      return { tokens };
    } catch {
      this.logger.warn('Refresh token validation failed');
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
