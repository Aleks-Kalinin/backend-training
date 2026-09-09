import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional } from 'class-validator';

export enum EmailChangeMethod {
  OTP = 'otp',
}

export class InitiateEmailChangeDto {
  @ApiProperty({
    example: 'newemail@example.com',
    description: 'New email address',
  })
  @IsEmail()
  newEmail!: string;

  @ApiPropertyOptional({
    enum: EmailChangeMethod,
    default: EmailChangeMethod.OTP,
    description: 'Method for email change verification',
  })
  @IsOptional()
  @IsEnum(EmailChangeMethod)
  method?: EmailChangeMethod = EmailChangeMethod.OTP;
}
