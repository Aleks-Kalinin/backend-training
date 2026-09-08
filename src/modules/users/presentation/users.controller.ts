import { AuthGuard } from '@/modules/auth/auth.guard';
import { type AuthenticatedRequest } from '@/modules/auth/dto/auth-request.dto';
import { AllowSelf } from '@/modules/rbac/presentation/decorators/allow-self.decorator';
import { RequirePermission } from '@/modules/rbac/presentation/decorators/require-permission.decorator';
import { RbacGuard } from '@/modules/rbac/rbac.guard';
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
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

@ApiTags('Users list')
@UseGuards(AuthGuard, RbacGuard)
@Controller('admin')
export class UsersContoller {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
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

  @Put('users/:id')
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
  @RequirePermission('users', 'update')
  async updateUser(@Body() userId: UUID, updateUserDto: UpdateUserDto) {
    const updatedUser = await this.usersService.updateUser(
      userId,
      updateUserDto,
    );
    return updatedUser;
  }
}
