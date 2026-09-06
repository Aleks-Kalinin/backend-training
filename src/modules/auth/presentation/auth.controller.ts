import { UserResponseDto } from '@/modules/users/dto/user-response.dto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { FastifyRequest } from 'fastify';
import { User } from '../../users/infrastructure/entity/user.entity';
import { AuthService } from '../application/auth.service';
import { AuthGuard } from '../auth.guard';
import { AuthResponseDto } from '../dto/auth-response.dto';
import { SignInDto } from '../dto/sign-in.dto';
import { SignUpDto } from '../dto/sign-up.dto';
import { VerifyRegistrationDto } from '../dto/verify-registration.dto';

interface AuthenticatedRequest extends FastifyRequest {
  user: User;
}

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
  verifyRegistration(@Body() verifyRegistrationDto: VerifyRegistrationDto) {
    return this.authService.verifyRegistration(
      verifyRegistrationDto.attemptId,
      verifyRegistrationDto.otp,
    );
  }

  // TODO: Remove this endpoint after testing
  @UseGuards(AuthGuard)
  @Get('profile')
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved user profile',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  getProfile(@Request() req: AuthenticatedRequest) {
    return req.user;
  }
}
