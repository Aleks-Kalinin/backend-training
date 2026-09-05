import { IsBoolean, IsOptional } from 'class-validator';

export interface VerificationSettings {
  registrationVerificationEnabled: boolean;
  passwordResetVerificationEnabled: boolean;
  loginVerificationEnabled: boolean;
}

export const SETTING_KEYS = {
  REGISTRATION_VERIFICATION: 'registration_verification_enabled',
  PASSWORD_RESET_VERIFICATION: 'password_reset_verification_enabled',
  LOGIN_VERIFICATION: 'login_verification_enabled',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export class UpdateVerificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  registrationVerificationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  passwordResetVerificationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  loginVerificationEnabled?: boolean;
}
