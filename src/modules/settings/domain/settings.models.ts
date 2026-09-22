import type { SettingKey } from './settings.constants';

export type SettingValue = boolean | { enabled?: boolean };

export interface SystemSetting {
  key: string;
  value: SettingValue;
}

export interface VerificationSettings {
  registrationVerificationEnabled: boolean;
  passwordResetVerificationEnabled: boolean;
  loginVerificationEnabled: boolean;
}

export interface UpdateVerificationSettings {
  registrationVerificationEnabled?: boolean;
  passwordResetVerificationEnabled?: boolean;
  loginVerificationEnabled?: boolean;
}

export interface SettingUpdate {
  key: string;
  value: SettingValue;
}

export type FeatureSettingKey = SettingKey;
