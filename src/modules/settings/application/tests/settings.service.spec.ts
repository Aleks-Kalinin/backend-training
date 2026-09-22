import { Test, TestingModule } from '@nestjs/testing';
import { SETTING_KEYS } from '../../domain/settings.constants';
import {
  SETTINGS_REPOSITORY,
  SettingsRepository,
} from '../ports/settings-repository.port';
import { SettingsService } from './../settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let repository: jest.Mocked<SettingsRepository>;

  beforeEach(async () => {
    repository = {
      findByKey: jest.fn(),
      findByKeys: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: SETTINGS_REPOSITORY,
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  describe('isFeatureEnabled', () => {
    it('returns false when setting record does not exist', async () => {
      repository.findByKey.mockResolvedValue(null);

      const result = await service.isFeatureEnabled(
        SETTING_KEYS.REGISTRATION_VERIFICATION,
      );

      expect(result).toBe(false);
      expect(repository.findByKey).toHaveBeenCalledWith(
        SETTING_KEYS.REGISTRATION_VERIFICATION,
      );
    });

    it('returns boolean value directly when setting value is boolean', async () => {
      repository.findByKey.mockResolvedValue({
        key: SETTING_KEYS.REGISTRATION_VERIFICATION,
        value: true,
      });

      const result = await service.isFeatureEnabled(
        SETTING_KEYS.REGISTRATION_VERIFICATION,
      );

      expect(result).toBe(true);
    });

    it('returns false when boolean setting value is false', async () => {
      repository.findByKey.mockResolvedValue({
        key: SETTING_KEYS.REGISTRATION_VERIFICATION,
        value: false,
      });

      const result = await service.isFeatureEnabled(
        SETTING_KEYS.REGISTRATION_VERIFICATION,
      );

      expect(result).toBe(false);
    });

    it('extracts boolean from object value containing enabled property', async () => {
      repository.findByKey.mockResolvedValue({
        key: SETTING_KEYS.LOGIN_VERIFICATION,
        value: { enabled: true },
      });

      const result = await service.isFeatureEnabled(
        SETTING_KEYS.LOGIN_VERIFICATION,
      );

      expect(result).toBe(true);
    });

    it('returns false when object value does not have enabled property', async () => {
      repository.findByKey.mockResolvedValue({
        key: SETTING_KEYS.LOGIN_VERIFICATION,
        value: {},
      });

      const result = await service.isFeatureEnabled(
        SETTING_KEYS.LOGIN_VERIFICATION,
      );

      expect(result).toBe(false);
    });
  });

  describe('getVerificationSettings', () => {
    it('returns default fallback values when no DB records exist', async () => {
      repository.findByKeys.mockResolvedValue([]);

      const result = await service.getVerificationSettings();

      expect(result).toEqual({
        registrationVerificationEnabled: true,
        passwordResetVerificationEnabled: true,
        loginVerificationEnabled: false,
      });

      expect(repository.findByKeys).toHaveBeenCalledWith([
        SETTING_KEYS.REGISTRATION_VERIFICATION,
        SETTING_KEYS.PASSWORD_RESET_VERIFICATION,
        SETTING_KEYS.LOGIN_VERIFICATION,
      ]);
    });

    it('parses boolean settings from DB records correctly', async () => {
      repository.findByKeys.mockResolvedValue([
        {
          key: SETTING_KEYS.REGISTRATION_VERIFICATION,
          value: false,
        },
        {
          key: SETTING_KEYS.PASSWORD_RESET_VERIFICATION,
          value: false,
        },
        {
          key: SETTING_KEYS.LOGIN_VERIFICATION,
          value: true,
        },
      ]);

      const result = await service.getVerificationSettings();

      expect(result).toEqual({
        registrationVerificationEnabled: false,
        passwordResetVerificationEnabled: false,
        loginVerificationEnabled: true,
      });
    });

    it('parses object settings with enabled property correctly', async () => {
      repository.findByKeys.mockResolvedValue([
        {
          key: SETTING_KEYS.REGISTRATION_VERIFICATION,
          value: { enabled: false },
        },
        {
          key: SETTING_KEYS.LOGIN_VERIFICATION,
          value: { enabled: true },
        },
      ]);

      const result = await service.getVerificationSettings();

      expect(result).toEqual({
        registrationVerificationEnabled: false,
        passwordResetVerificationEnabled: true, // fallback default
        loginVerificationEnabled: true,
      });
    });

    it('returns false for an object without enabled property', async () => {
      repository.findByKeys.mockResolvedValue([
        {
          key: SETTING_KEYS.REGISTRATION_VERIFICATION,
          value: {},
        },
      ]);

      const result = await service.getVerificationSettings();

      expect(result.registrationVerificationEnabled).toBe(false);
    });
  });

  describe('updateVerificationSettings', () => {
    it('creates and saves all settings when complete DTO is provided', async () => {
      repository.findByKeys.mockResolvedValue([
        {
          key: SETTING_KEYS.REGISTRATION_VERIFICATION,
          value: false,
        },
        {
          key: SETTING_KEYS.PASSWORD_RESET_VERIFICATION,
          value: false,
        },
        {
          key: SETTING_KEYS.LOGIN_VERIFICATION,
          value: true,
        },
      ]);

      const dto = {
        registrationVerificationEnabled: false,
        passwordResetVerificationEnabled: false,
        loginVerificationEnabled: true,
      };

      const result = await service.updateVerificationSettings(dto);

      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(repository.save).toHaveBeenCalledWith([
        {
          key: SETTING_KEYS.REGISTRATION_VERIFICATION,
          value: false,
        },
        {
          key: SETTING_KEYS.PASSWORD_RESET_VERIFICATION,
          value: false,
        },
        {
          key: SETTING_KEYS.LOGIN_VERIFICATION,
          value: true,
        },
      ]);
      expect(result).toEqual({
        registrationVerificationEnabled: false,
        passwordResetVerificationEnabled: false,
        loginVerificationEnabled: true,
      });
    });

    it('selectively creates and saves only specified settings for partial DTO', async () => {
      repository.findByKeys.mockResolvedValue([
        {
          key: SETTING_KEYS.REGISTRATION_VERIFICATION,
          value: true,
        },
        {
          key: SETTING_KEYS.LOGIN_VERIFICATION,
          value: true,
        },
      ]);

      const dto = {
        loginVerificationEnabled: true,
      };

      const result = await service.updateVerificationSettings(dto);

      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(repository.save).toHaveBeenCalledWith([
        {
          key: SETTING_KEYS.LOGIN_VERIFICATION,
          value: true,
        },
      ]);
      expect(result.loginVerificationEnabled).toBe(true);
    });

    it('does not invoke save when an empty DTO is passed', async () => {
      repository.findByKeys.mockResolvedValue([]);

      const result = await service.updateVerificationSettings({});

      expect(repository.save).not.toHaveBeenCalled();
      expect(result).toEqual({
        registrationVerificationEnabled: true,
        passwordResetVerificationEnabled: true,
        loginVerificationEnabled: false,
      });
    });
  });
});
