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
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type UUID } from 'node:crypto';
import { AvatarService } from '../application/avatar.service';
import { UserMapper } from '../application/mappers/user.mapper';
import { UsersService } from '../application/users.service';
import { ConfirmEmailChangeDto } from '../dto/confirm-email-change.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { DeleteUserResponseDto } from '../dto/delete-user-response.dto';
import { DeleteUserDto } from '../dto/delete-user.dto';
import { GetUsersQueryDto } from '../dto/get-users-query.dto';
import { InitiateEmailChangeDto } from '../dto/initiate-email-change.dto';
import { PaginatedUsersResponseDto } from '../dto/paginated-users-response.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserResponseDto } from '../dto/user-response.dto';
import { readAvatarUpload } from './avatar-upload.reader';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(AuthGuard, RbacGuard)
@Controller()
export class UsersContoller {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly avatarService: AvatarService,
  ) {}

  @Get('admin/users')
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved list of users',
    type: PaginatedUsersResponseDto,
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
  async getUsers(
    @Query() query: GetUsersQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const { items, nextCursor } = await this.usersService.getUsers(
      query,
      req.user.sub,
    );

    return {
      items: items.map((user) =>
        UserMapper.toProfileResponseDto(
          this.avatarService.withResolvedPhoto(user),
          req.user,
        ),
      ),
      nextCursor,
    };
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user profile by id' })
  @ApiParam({
    name: 'id',
    description: 'User ID (UUID)',
    type: String,
    format: 'uuid',
  })
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
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @Throttle({ default: { ttl: 10000, limit: 5 } })
  @RequirePermission('users', 'read')
  @AllowSelf('id')
  async getUser(@Param('id') id: UUID, @Req() req: AuthenticatedRequest) {
    const user = await this.usersService.getUser(id);

    if (!user) {
      this.logger.log(
        JSON.stringify({
          actorUserId: req.user.sub,
          targetUserId: id,
          status: HttpStatus.NOT_FOUND,
        }),
      );
      throw new NotFoundException('User not found');
    }
    // Map entity to response DTO based on requester identity
    return UserMapper.toProfileResponseDto(
      this.avatarService.withResolvedPhoto(user),
      req.user,
    );
  }

  @Post('users')
  @ApiOperation({ summary: 'Create new user' })
  @ApiResponse({
    status: 201,
    description: 'User successfully created',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid input data',
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
    return this.avatarService.withResolvedPhoto(user);
  }

  @Patch('users/:id')
  @ApiOperation({
    summary: 'Update an existing user',
    description:
      'Updates profile fields. Does not accept `photo` and never changes the current avatar; use PUT/DELETE /users/{id}/photo instead.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID (UUID)',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'User successfully updated',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid input data',
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
    const updatedUser = await this.usersService.updateUser({
      userId: id,
      updateData: updateUserDto,
      requestingUser: req.user,
    });

    return UserMapper.toProfileResponseDto(
      this.avatarService.withResolvedPhoto(updatedUser),
      req.user,
    );
  }

  @Put('users/:id/photo')
  @ApiOperation({
    summary: 'Upload or replace a user avatar',
    description:
      'Accepts one JPEG, PNG, or WebP image (max 5 MiB) in the `file` field. The image is re-encoded to WebP (max 1024x1024, metadata stripped) and replaces any previous avatar.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID (UUID)',
    type: String,
    format: 'uuid',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Avatar image (JPEG, PNG, or WebP, max 5 MiB)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar uploaded or replaced successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Missing, multiple, empty, or invalid image file',
  })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({
    status: 413,
    description: 'Avatar exceeds the 5 MiB size limit',
  })
  @ApiResponse({
    status: 415,
    description: 'Unsupported or mismatched image format',
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Avatar could not be stored' })
  @Throttle({ default: { ttl: 10000, limit: 5 } })
  @RequirePermission('users', 'update')
  @AllowSelf('id')
  async uploadAvatar(@Param('id') id: UUID, @Req() req: AuthenticatedRequest) {
    const user = await this.avatarService.uploadAvatar({
      userId: id,
      requestingUser: req.user,
      readFile: () => readAvatarUpload(req),
    });

    return UserMapper.toProfileResponseDto(user, req.user);
  }

  @Delete('users/:id/photo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove a user avatar',
    description:
      'Clears the uploaded avatar and deletes its stored object. Idempotent.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID (UUID)',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar removed; profile returned with `photo: null`',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @Throttle({ default: { ttl: 10000, limit: 5 } })
  @RequirePermission('users', 'update')
  @AllowSelf('id')
  async removeAvatar(@Param('id') id: UUID, @Req() req: AuthenticatedRequest) {
    const user = await this.avatarService.removeAvatar({
      userId: id,
      requestingUser: req.user,
    });

    return UserMapper.toProfileResponseDto(user, req.user);
  }

  @Post('users/:id/email-change')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate email change using OTP' })
  @ApiParam({
    name: 'id',
    description: 'User ID (UUID)',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Otp verification challenge dispatched successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid email format',
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
    description: 'Proposed email is already in use',
  })
  @AllowSelf('id')
  async initiateEmailChange(
    @Param('id') id: UUID,
    @Body() emailChangeDto: InitiateEmailChangeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.initiateEmailChange({
      userId: id,
      dto: emailChangeDto,
      requestingUser: req.user,
    });
  }

  @Post('users/:id/email-change/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm email change using OTP' })
  @ApiParam({
    name: 'id',
    description: 'User ID (UUID)',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Email change confirmed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid input data',
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
    return this.usersService.confirmEmailChange({
      userId: id,
      dto: confirmDto,
      requestingUser: req.user,
    });
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete user' })
  @ApiParam({
    name: 'id',
    description: 'User ID (UUID)',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'User deletion initiated or completed successfully',
    type: DeleteUserResponseDto,
  })
  @ApiResponse({
    status: 202,
    description:
      'User deletion request accepted and will be processed asynchronously',
    type: DeleteUserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid deletion options',
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
    return await this.usersService.deleteUser({
      userId: id,
      dto: deleteUserDto,
      requestingUser: req.user,
    });
  }

  @Get('users/:id/deletion-status')
  @ApiOperation({ summary: 'Get user deletion status' })
  @ApiParam({
    name: 'id',
    description: 'User ID (UUID)',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'User deletion status retrieved successfully',
    type: DeleteUserResponseDto,
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
