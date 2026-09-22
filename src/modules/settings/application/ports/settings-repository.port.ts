import type { SystemSetting } from '../../domain/settings.models';

export const SETTINGS_REPOSITORY = Symbol('SETTINGS_REPOSITORY');

export interface SettingsRepository {
  findByKey(key: string): Promise<SystemSetting | null>;
  findByKeys(keys: readonly string[]): Promise<SystemSetting[]>;
  save(settings: SystemSetting[]): Promise<void>;
}
