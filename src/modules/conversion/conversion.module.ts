import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversionService } from './application/conversion.service';
import { HistoryCleanupService } from './infrastructure/history-cleanup.service';
import { ConvertedFileEntity } from './infrastructure/entity/converted-file.entity';
import { TransformationHistoryItemEntity } from './infrastructure/entity/transformation-history-item.entity';
import { ConversionController } from './presentation/conversion.controller';
import { CONVERSION_ENGINE } from './application/ports/conversion-engine.port';
import { FILE_STORAGE } from './application/ports/file-storage.port';
import { HISTORY_REPOSITORY } from './application/ports/history-repository.port';
import { PiscinaConversionEngine } from './infrastructure/piscina-conversion.engine';
import { LocalFileStorage } from './infrastructure/local-file.storage';
import { TypeOrmHistoryRepository } from './infrastructure/typeorm-history.repository';

@Module({
  controllers: [ConversionController],
  providers: [
    ConversionService,
    HistoryCleanupService,
    { provide: CONVERSION_ENGINE, useClass: PiscinaConversionEngine },
    { provide: FILE_STORAGE, useClass: LocalFileStorage },
    { provide: HISTORY_REPOSITORY, useClass: TypeOrmHistoryRepository },
  ],
  exports: [ConversionService],
  imports: [
    TypeOrmModule.forFeature([
      TransformationHistoryItemEntity,
      ConvertedFileEntity,
    ]),
  ],
})
export class ConversionModule {}
