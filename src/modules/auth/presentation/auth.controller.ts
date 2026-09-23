import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from '../application/auth.service';
import { SignInDto } from '../dto/sign-in.dto';
import { SignUpDto } from '../dto/sign-up.dto';
import { VerifyRegistrationDto } from '../dto/verify-registration.dto';
import { AUTH_COOKIES, TOKEN_TTL } from './constants/auth.constants';

/** Shared secure cookie options */
const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
} as const;

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  /**
   * Sets both access and refresh token cookies on the reply.
   */
  private setAuthCookies(
    reply: FastifyReply,
    accessToken: string,
    refreshToken: string,
  ): void {
    reply.setCookie(AUTH_COOKIES.ACCESS_TOKEN, accessToken, {
      ...BASE_COOKIE_OPTIONS,
      maxAge: TOKEN_TTL.ACCESS_TOKEN_SECONDS,
    });
    reply.setCookie(AUTH_COOKIES.REFRESH_TOKEN, refreshToken, {
      ...BASE_COOKIE_OPTIONS,
      maxAge: TOKEN_TTL.REFRESH_TOKEN_SECONDS,
    });
  }

  /**
   * Clears both auth cookies (used on logout).
   */
  private clearAuthCookies(reply: FastifyReply): void {
    reply.clearCookie(AUTH_COOKIES.ACCESS_TOKEN, { path: '/' });
    reply.clearCookie(AUTH_COOKIES.REFRESH_TOKEN, { path: '/' });
  }

  @Post('login')
  @ApiOperation({ summary: 'Log in a user' })
  @ApiResponse({
    status: 200,
    description:
      'Successfully authenticated. Tokens are set via HttpOnly cookies.',
  })
  @ApiResponse({
    status: 202,
    description: 'Login verification required — OTP sent to the user email.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid input format',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests',
  })
  @Throttle({ default: { ttl: 10000, limit: 5 } })
  async signIn(
    @Body() signInDto: SignInDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.authService.signIn(
      signInDto.email,
      signInDto.password,
    );

    reply.status(result.statusCode);

    if (result.statusCode === HttpStatus.ACCEPTED) {
      return result.data;
    }

    this.setAuthCookies(
      reply,
      result.tokens.accessToken,
      result.tokens.refreshToken,
    );
    return { message: 'Login successful' };
  }

  @Post('login/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify login email OTP' })
  @ApiResponse({
    status: 200,
    description:
      'Login verified and user authenticated. Tokens are set via HttpOnly cookies.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid input data',
  })
  @ApiResponse({
    status: 422,
    description: 'Invalid or expired verification code',
  })
  @ApiResponse({
    status: 429,
    description: 'Maximum verification attempts exceeded',
  })
  @Throttle({ default: { ttl: 10000, limit: 5 } })
  async verifyLogin(
    @Body() verifyRegistrationDto: VerifyRegistrationDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { tokens } = await this.authService.verifyLogin(
      verifyRegistrationDto.attemptId,
      verifyRegistrationDto.otp,
    );
    this.setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);
    return { message: 'Login verified successfully' };
  }

  @Post('signup')
  @ApiOperation({ summary: 'Sign up a new user' })
  @ApiResponse({
    status: 201,
    description:
      'User successfully registered. Tokens are set via HttpOnly cookies.',
  })
  @ApiResponse({
    status: 202,
    description: 'Email verification required — OTP sent.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid input data',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - user already exists with this email',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests',
  })
  async signUp(
    @Body() signUpDto: SignUpDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.authService.signUp(
      signUpDto.email,
      signUpDto.password,
    );
    reply.status(result.statusCode);

    if (result.statusCode === HttpStatus.CREATED) {
      this.setAuthCookies(
        reply,
        result.tokens.accessToken,
        result.tokens.refreshToken,
      );
      return { message: 'Registration successful', user: result.data.user };
    }

    return result.data;
  }

  @Post('signup/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify registration email OTP' })
  @ApiResponse({
    status: 200,
    description:
      'Email verified and user authenticated. Tokens are set via HttpOnly cookies.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid input data',
  })
  @ApiResponse({
    status: 422,
    description: 'Invalid or expired verification code',
  })
  @ApiResponse({
    status: 429,
    description: 'Maximum verification attempts exceeded',
  })
  @Throttle({ default: { ttl: 10000, limit: 5 } })
  async verifyRegistration(
    @Body() verifyRegistrationDto: VerifyRegistrationDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { tokens } = await this.authService.verifyRegistration(
      verifyRegistrationDto.attemptId,
      verifyRegistrationDto.otp,
    );
    this.setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);
    return { message: 'Email verified successfully' };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(AUTH_COOKIES.REFRESH_TOKEN)
  @ApiOperation({
    summary: 'Rotate token pair using refresh token cookie',
    description:
      'Validates the refresh_token cookie, rotates both tokens, and sets fresh cookies. ' +
      'No server-side state is used — validation is purely cryptographic.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens rotated successfully. New cookies are set.',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing, malformed, or expired refresh token.',
  })
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const refreshToken = (
      request.cookies as Record<string, string | undefined>
    )[AUTH_COOKIES.REFRESH_TOKEN];

    if (!refreshToken) {
      this.logger.warn('Refresh attempt with missing refresh_token cookie');
      throw new UnauthorizedException('Refresh token not provided');
    }

    const { tokens } = await this.authService.refresh(refreshToken);
    this.setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);
    return { message: 'Tokens refreshed successfully' };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(AUTH_COOKIES.ACCESS_TOKEN)
  @ApiOperation({
    summary: 'Log out the current user',
    description:
      'Clears access_token and refresh_token cookies. ' +
      'Client should redirect to login page after receiving 200.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully. Cookies cleared.',
  })
  logout(@Res({ passthrough: true }) reply: FastifyReply) {
    this.clearAuthCookies(reply);
    return { message: 'Logged out successfully' };
  }
}
