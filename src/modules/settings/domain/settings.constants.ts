export const SETTING_KEYS = {
  REGISTRATION_VERIFICATION: 'registration_verification_enabled',
  PASSWORD_RESET_VERIFICATION: 'password_reset_verification_enabled',
  LOGIN_VERIFICATION: 'login_verification_enabled',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];
