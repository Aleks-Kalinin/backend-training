import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  SETTING_KEYS,
  SettingKey,
  UpdateVerificationSettingsDto,
  VerificationSettings,
} from '../dto/settings.dto';
import { SystemSetting } from '../infrastructure/entity/system-setting.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(SystemSetting)
    private readonly systemSettingRepository: Repository<SystemSetting>,
  ) {}

  async isFeatureEnabled(key: SettingKey): Promise<boolean> {
    const setting = await this.systemSettingRepository.findOne({
      where: { key },
    });

    if (!setting) return false;

    return typeof setting.value === 'boolean'
      ? setting.value
      : Boolean(setting.value?.enabled);
  }

  async getVerificationSettings(): Promise<VerificationSettings> {
    const keys = [
      SETTING_KEYS.REGISTRATION_VERIFICATION,
      SETTING_KEYS.PASSWORD_RESET_VERIFICATION,
      SETTING_KEYS.LOGIN_VERIFICATION,
    ];

    const records = await this.systemSettingRepository.find({
      where: { key: In(keys) },
    });

    const settingsMap = new Map(records.map((r) => [r.key, r.value]));

    return {
      registrationVerificationEnabled: this.parseBoolean(
        settingsMap.get(SETTING_KEYS.REGISTRATION_VERIFICATION),
        true,
      ),
      passwordResetVerificationEnabled: this.parseBoolean(
        settingsMap.get(SETTING_KEYS.PASSWORD_RESET_VERIFICATION),
        true,
      ),
      loginVerificationEnabled: this.parseBoolean(
        settingsMap.get(SETTING_KEYS.LOGIN_VERIFICATION),
        false,
      ),
    };
  }

  async updateVerificationSettings(
    dto: UpdateVerificationSettingsDto,
  ): Promise<VerificationSettings> {
    const updates: SystemSetting[] = [];

    if (dto.registrationVerificationEnabled !== undefined) {
      updates.push(
        this.systemSettingRepository.create({
          key: SETTING_KEYS.REGISTRATION_VERIFICATION,
          value: dto.registrationVerificationEnabled,
        }),
      );
    }

    if (dto.passwordResetVerificationEnabled !== undefined) {
      updates.push(
        this.systemSettingRepository.create({
          key: SETTING_KEYS.PASSWORD_RESET_VERIFICATION,
          value: dto.passwordResetVerificationEnabled,
        }),
      );
    }

    if (dto.loginVerificationEnabled !== undefined) {
      updates.push(
        this.systemSettingRepository.create({
          key: SETTING_KEYS.LOGIN_VERIFICATION,
          value: dto.loginVerificationEnabled,
        }),
      );
    }

    if (updates.length > 0) {
      await this.systemSettingRepository.save(updates);
    }

    return this.getVerificationSettings();
  }

  private parseBoolean(value: unknown, fallback: boolean): boolean {
    if (!value) {
      return fallback;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'object' && value !== null && 'enabled' in value) {
      return Boolean(value.enabled);
    }

    return false;
  }
}
