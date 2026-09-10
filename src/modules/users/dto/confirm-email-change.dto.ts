import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class ConfirmEmailChangeDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Challenge ID received when initiating email change',
  })
  @IsUUID()
  challengeId!: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP verification code',
  })
  @IsString()
  code!: string;
}
