import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserStatus } from '../domain/user-status.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'newuser@gmail.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'strongpassword123' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ enum: UserStatus, default: UserStatus.PENDING })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiProperty()
  @IsBoolean()
  isVerified!: boolean;

  @ApiPropertyOptional({
    example: 'https://example.com/photo.png',
    description: 'Absolute http(s) URL of the profile photo',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  photo?: string;
}
