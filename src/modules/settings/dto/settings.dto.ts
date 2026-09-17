import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export interface VerificationSettings {
  registrationVerificationEnabled: boolean;
  passwordResetVerificationEnabled: boolean;
  loginVerificationEnabled: boolean;
}

export class VerificationSettingsResponseDto implements VerificationSettings {
  @ApiProperty({
    example: true,
    description: 'Whether email verification is required during registration',
  })
  registrationVerificationEnabled!: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether verification is required for password reset',
  })
  passwordResetVerificationEnabled!: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether 2FA verification is required during login',
  })
  loginVerificationEnabled!: boolean;
}

export const SETTING_KEYS = {
  REGISTRATION_VERIFICATION: 'registration_verification_enabled',
  PASSWORD_RESET_VERIFICATION: 'password_reset_verification_enabled',
  LOGIN_VERIFICATION: 'login_verification_enabled',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export class UpdateVerificationSettingsDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Enable or disable registration email verification',
  })
  @IsOptional()
  @IsBoolean()
  registrationVerificationEnabled?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Enable or disable password reset verification',
  })
  @IsOptional()
  @IsBoolean()
  passwordResetVerificationEnabled?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Enable or disable login verification',
  })
  @IsOptional()
  @IsBoolean()
  loginVerificationEnabled?: boolean;
}
