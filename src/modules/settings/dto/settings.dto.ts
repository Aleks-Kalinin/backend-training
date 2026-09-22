import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { SETTING_KEYS, SettingKey } from '../domain/settings.constants';
import type { VerificationSettings } from '../domain/settings.models';

export { SETTING_KEYS };
export type { SettingKey };
export type { VerificationSettings };

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
