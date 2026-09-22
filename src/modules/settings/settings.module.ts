import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSetting } from '../settings/infrastructure/entity/system-setting.entity';
import { SettingsService } from './application/settings.service';
import { SETTINGS_REPOSITORY } from './application/ports/settings-repository.port';
import { TypeOrmSettingsRepository } from './infrastructure/repositories/typeorm-settings.repository';
import { SettingsController } from './presentation/settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SystemSetting])],
  controllers: [SettingsController],
  providers: [
    SettingsService,
    TypeOrmSettingsRepository,
    {
      provide: SETTINGS_REPOSITORY,
      useExisting: TypeOrmSettingsRepository,
    },
  ],
  exports: [SettingsService],
})
export class SettingsModule {}
