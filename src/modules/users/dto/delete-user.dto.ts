import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class DeleteUserDto {
  @ApiPropertyOptional({ description: 'Optional reason for account deletion' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'OTP Challenge ID (Required for Self deletion)',
  })
  @IsOptional()
  @IsUUID()
  challengeId?: string;

  @ApiPropertyOptional({
    description: '6-digit OTP code (Required for Self deletion)',
  })
  @IsOptional()
  @IsString()
  code?: string;
}
