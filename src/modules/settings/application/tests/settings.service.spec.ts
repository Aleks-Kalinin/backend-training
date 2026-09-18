import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SETTING_KEYS } from '../../dto/settings.dto';
import { SystemSetting } from '../../infrastructure/entity/system-setting.entity';
import { SettingsService } from './../settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let repository: jest.Mocked<Repository<SystemSetting>>;

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((entity) => entity as SystemSetting),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<SystemSetting>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: getRepositoryToken(SystemSetting),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  describe('isFeatureEnabled', () => {
    it('returns false when setting record does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.isFeatureEnabled(
        SETTING_KEYS.REGISTRATION_VERIFICATION,
      );

      expect(result).toBe(false);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { key: SETTING_KEYS.REGISTRATION_VERIFICATION },
      });
    });

    it('returns boolean value directly when setting value is boolean', async () => {
      repository.findOne.mockResolvedValue({
        id: 'setting-1',
        key: SETTING_KEYS.REGISTRATION_VERIFICATION,
        value: true,
      } as SystemSetting);

      const result = await service.isFeatureEnabled(
        SETTING_KEYS.REGISTRATION_VERIFICATION,
      );

      expect(result).toBe(true);
    });

    it('returns false when boolean setting value is false', async () => {
      repository.findOne.mockResolvedValue({
        id: 'setting-1',
        key: SETTING_KEYS.REGISTRATION_VERIFICATION,
        value: false,
      } as SystemSetting);

      const result = await service.isFeatureEnabled(
        SETTING_KEYS.REGISTRATION_VERIFICATION,
      );

      expect(result).toBe(false);
    });

    it('extracts boolean from object value containing enabled property', async () => {
      repository.findOne.mockResolvedValue({
        id: 'setting-1',
        key: SETTING_KEYS.LOGIN_VERIFICATION,
        value: { enabled: true },
      } as SystemSetting);

      const result = await service.isFeatureEnabled(
        SETTING_KEYS.LOGIN_VERIFICATION,
      );

      expect(result).toBe(true);
    });

    it('returns false when object value does not have enabled property', async () => {
      repository.findOne.mockResolvedValue({
        id: 'setting-1',
        key: SETTING_KEYS.LOGIN_VERIFICATION,
        value: { otherProp: 'test' },
      } as SystemSetting);

      const result = await service.isFeatureEnabled(
        SETTING_KEYS.LOGIN_VERIFICATION,
      );

      expect(result).toBe(false);
    });
  });

  describe('getVerificationSettings', () => {
    it('returns default fallback values when no DB records exist', async () => {
      repository.find.mockResolvedValue([]);

      const result = await service.getVerificationSettings();

      expect(result).toEqual({
        registrationVerificationEnabled: true,
        passwordResetVerificationEnabled: true,
        loginVerificationEnabled: false,
      });

      expect(repository.find).toHaveBeenCalledWith({
        where: {
          key: In([
            SETTING_KEYS.REGISTRATION_VERIFICATION,
            SETTING_KEYS.PASSWORD_RESET_VERIFICATION,
            SETTING_KEYS.LOGIN_VERIFICATION,
          ]),
        },
      });
    });

    it('parses boolean settings from DB records correctly', async () => {
      repository.find.mockResolvedValue([
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
      ] as SystemSetting[]);

      const result = await service.getVerificationSettings();

      expect(result).toEqual({
        registrationVerificationEnabled: false,
        passwordResetVerificationEnabled: false,
        loginVerificationEnabled: true,
      });
    });

    it('parses object settings with enabled property correctly', async () => {
      repository.find.mockResolvedValue([
        {
          key: SETTING_KEYS.REGISTRATION_VERIFICATION,
          value: { enabled: false },
        },
        {
          key: SETTING_KEYS.LOGIN_VERIFICATION,
          value: { enabled: true },
        },
      ] as SystemSetting[]);

      const result = await service.getVerificationSettings();

      expect(result).toEqual({
        registrationVerificationEnabled: false,
        passwordResetVerificationEnabled: true, // fallback default
        loginVerificationEnabled: true,
      });
    });

    it('returns false for unexpected non-boolean, non-object values', async () => {
      repository.find.mockResolvedValue([
        {
          key: SETTING_KEYS.REGISTRATION_VERIFICATION,
          value: 'invalid_string_value',
        },
      ] as SystemSetting[]);

      const result = await service.getVerificationSettings();

      expect(result.registrationVerificationEnabled).toBe(false);
    });
  });

  describe('updateVerificationSettings', () => {
    it('creates and saves all settings when complete DTO is provided', async () => {
      repository.find.mockResolvedValue([
        {
          id: '1',
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
      ] as SystemSetting[]);

      const dto = {
        registrationVerificationEnabled: false,
        passwordResetVerificationEnabled: false,
        loginVerificationEnabled: true,
      };

      const result = await service.updateVerificationSettings(dto);

      expect(repository.create).toHaveBeenCalledTimes(3);
      expect(repository.create).toHaveBeenCalledWith({
        key: SETTING_KEYS.REGISTRATION_VERIFICATION,
        value: false,
      });
      expect(repository.create).toHaveBeenCalledWith({
        key: SETTING_KEYS.PASSWORD_RESET_VERIFICATION,
        value: false,
      });
      expect(repository.create).toHaveBeenCalledWith({
        key: SETTING_KEYS.LOGIN_VERIFICATION,
        value: true,
      });

      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        registrationVerificationEnabled: false,
        passwordResetVerificationEnabled: false,
        loginVerificationEnabled: true,
      });
    });

    it('selectively creates and saves only specified settings for partial DTO', async () => {
      repository.find.mockResolvedValue([
        {
          key: SETTING_KEYS.REGISTRATION_VERIFICATION,
          value: true,
        },
        {
          key: SETTING_KEYS.LOGIN_VERIFICATION,
          value: true,
        },
      ] as SystemSetting[]);

      const dto = {
        loginVerificationEnabled: true,
      };

      const result = await service.updateVerificationSettings(dto);

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.create).toHaveBeenCalledWith({
        key: SETTING_KEYS.LOGIN_VERIFICATION,
        value: true,
      });
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(result.loginVerificationEnabled).toBe(true);
    });

    it('does not invoke save when an empty DTO is passed', async () => {
      repository.find.mockResolvedValue([]);

      const result = await service.updateVerificationSettings({});

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
      expect(result).toEqual({
        registrationVerificationEnabled: true,
        passwordResetVerificationEnabled: true,
        loginVerificationEnabled: false,
      });
    });
  });
});
