import { AuthGuard } from '@/modules/auth/auth.guard';
import { type AuthenticatedRequest } from '@/modules/auth/dto/auth-request.dto';
import { AllowSelf } from '@/modules/rbac/presentation/decorators/allow-self.decorator';
import { RequirePermission } from '@/modules/rbac/presentation/decorators/require-permission.decorator';
import { RbacGuard } from '@/modules/rbac/rbac.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type UUID } from 'node:crypto';
import { UserMapper } from '../application/mappers/user.mapper';
import { UsersService } from '../application/users.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { GetUsersQueryDto } from '../dto/get-users-query.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserResponseDto } from '../dto/user-response.dto';
import { InitiateEmailChangeDto } from '../dto/initiate-email-change.dto';
import { ConfirmEmailChangeDto } from '../dto/confirm-email-change.dto';
import { DeleteUserDto } from '../dto/delete-user.dto';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Users list')
@UseGuards(AuthGuard, RbacGuard)
@Controller()
export class UsersContoller {
  constructor(private readonly usersService: UsersService) {}

  @Get('admin/users')
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved list of users',
    type: UserResponseDto,
    isArray: true,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @Throttle({ default: { ttl: 10000, limit: 5 } })
  @RequirePermission('users', 'read')
  async getUsers(@Query() query: GetUsersQueryDto) {
    const users = await this.usersService.getUsers(query);
    return users;
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user profile by id' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @Throttle({ default: { ttl: 10000, limit: 5 } })
  @RequirePermission('users', 'read')
  @AllowSelf('id')
  async getUser(@Param('id') id: UUID, @Req() req: AuthenticatedRequest) {
    const user = await this.usersService.getUser(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }
    // Map entity to response DTO based on requester identity
    return UserMapper.toProfileResponseDto(user, req.user!);
  }

  @Post('users')
  @ApiOperation({ summary: 'Create new user' })
  @ApiResponse({
    status: 200,
    description: 'User successfully created',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthenticated',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @RequirePermission('users', 'create')
  async createUser(@Body() createUserDto: CreateUserDto) {
    const user = await this.usersService.createUser(createUserDto);
    return user;
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update an existing user' })
  @ApiResponse({
    status: 200,
    description: 'User successfully updated',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthenticated',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests',
  })
  @Throttle({ default: { ttl: 10000, limit: 5 } })
  @RequirePermission('users', 'update')
  @AllowSelf('id')
  async updateUser(
    @Param('id') id: UUID,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const updatedUser = await this.usersService.updateUser(
      id,
      updateUserDto,
      req.user,
    );

    return UserMapper.toProfileResponseDto(updatedUser, req.user!);
  }

  @Post('users/:id/email-change')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate email change using OTP' })
  @ApiResponse({
    status: 200,
    description: 'Otp verification challenge dispatched successfully',
  })
  @ApiResponse({
    status: 409,
    description: 'Proposed email is already in use',
  })
  @AllowSelf('id')
  async initiateEmailChange(
    @Param('id') id: UUID,
    @Body() emailChangeDto: InitiateEmailChangeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.initiateEmailChange(id, emailChangeDto, req.user!);
  }

  @Post('users/:id/email-change/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm email change using OTP' })
  @ApiResponse({
    status: 200,
    description: 'Email change confirmed successfully',
  })
  @ApiResponse({
    status: 422,
    description: 'Invalid or expired OTP verification code',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests',
  })
  @Throttle({ default: { ttl: 10000, limit: 5 } })
  @AllowSelf('id')
  async confirmEmailChange(
    @Param('id') id: UUID,
    @Body() confirmDto: ConfirmEmailChangeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.confirmEmailChange(id, confirmDto, req.user!);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete user' })
  @ApiResponse({
    status: 200,
    description: 'User deletion initiated or completed successfully',
  })
  @ApiResponse({
    status: 202,
    description:
      'User deletion request accepted and will be processed asynchronously',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthenticated',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 409,
    description: 'User is already deleted',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many attempts. Please try again later',
  })
  @Throttle({ default: { ttl: 10000, limit: 5 } })
  @RequirePermission('users', 'delete')
  @AllowSelf('id')
  async deleteUser(
    @Param('id') id: UUID,
    @Body() deleteUserDto: DeleteUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return await this.usersService.deleteUser(id, deleteUserDto, req.user);
  }

  @Get('users/:id/deletion-status')
  @ApiOperation({ summary: 'Get user deletion status' })
  @ApiResponse({
    status: 200,
    description: 'User deletion status retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthenticated',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 422,
    description: 'Invalid or expired deletion reason',
  })
  @RequirePermission('users', 'read')
  @AllowSelf('id')
  async getUserDeletionStatus(
    @Param('id') id: UUID,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.getUserDeletionStatus(id, req.user);
  }
}
