import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SystemSetting as DomainSystemSetting } from '../../domain/settings.models';
import { SystemSetting } from '../entity/system-setting.entity';
import type { SettingsRepository } from '../../application/ports/settings-repository.port';

@Injectable()
export class TypeOrmSettingsRepository implements SettingsRepository {
  constructor(
    @InjectRepository(SystemSetting)
    private readonly repository: Repository<SystemSetting>,
  ) {}

  async findByKey(key: string): Promise<DomainSystemSetting | null> {
    const setting = await this.repository.findOne({ where: { key } });
    return setting ? this.toDomain(setting) : null;
  }

  async findByKeys(keys: readonly string[]): Promise<DomainSystemSetting[]> {
    const settings = await this.repository.find({
      where: { key: In([...keys]) },
    });
    return settings.map((setting) => this.toDomain(setting));
  }

  async save(settings: DomainSystemSetting[]): Promise<void> {
    await this.repository.save(
      settings.map((setting) => this.repository.create(setting)),
    );
  }

  private toDomain(setting: SystemSetting): DomainSystemSetting {
    return { key: setting.key, value: setting.value };
  }
}
