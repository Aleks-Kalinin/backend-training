import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { UserStatus } from '../domain/user-status.enum';

export class GetUsersQueryDto {
  @ApiPropertyOptional({
    description: 'Number of users returned per page',
    minimum: 20,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Search users by email, status, or ID',
    example: 'john',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Filter users by status',
    enum: UserStatus,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({
    description: 'Field used to sort users',
    enum: ['created_at', 'updated_at', 'email'],
    default: 'created_at',
  })
  @IsOptional()
  @IsIn(['created_at', 'updated_at', 'email'])
  sort?: 'created_at' | 'updated_at' | 'email' = 'created_at';

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}
