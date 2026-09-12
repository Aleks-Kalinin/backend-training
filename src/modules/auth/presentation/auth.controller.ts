import { UserResponseDto } from '@/modules/users/dto/user-response.dto';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { AuthService } from '../application/auth.service';
import { AuthResponseDto } from '../dto/auth-response.dto';
import { SignInDto } from '../dto/sign-in.dto';
import { SignUpDto } from '../dto/sign-up.dto';
import { VerifyRegistrationDto } from '../dto/verify-registration.dto';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Log in a user' })
  @ApiResponse({
    status: 200,
    description: 'Successfully authenticated',
    type: AuthResponseDto,
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
  signIn(@Body() signInDto: SignInDto) {
    return this.authService.signIn(signInDto.email, signInDto.password);
  }

  @Post('signup')
  @ApiOperation({ summary: 'Sign up a new user' })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    type: AuthResponseDto,
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
    return result.data;
  }

  @Post('signup/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify registration email OTP' })
  @ApiResponse({
    status: 200,
    description: 'Email verified and user authenticated',
    type: AuthResponseDto,
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
  verifyRegistration(@Body() verifyRegistrationDto: VerifyRegistrationDto) {
    return this.authService.verifyRegistration(
      verifyRegistrationDto.attemptId,
      verifyRegistrationDto.otp,
    );
  }
}
