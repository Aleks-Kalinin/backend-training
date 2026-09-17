import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversionService } from './application/conversion.service';
import { HistoryCleanupService } from './application/history-cleanup.service';
import { ConvertedFileEntity } from './infrastructure/entity/converted-file.entity';
import { TransformationHistoryItemEntity } from './infrastructure/entity/transformation-history-item.entity';
import { ConversionController } from './presentation/conversion.controller';

@Module({
  controllers: [ConversionController],
  providers: [ConversionService, HistoryCleanupService],
  exports: [ConversionService],
  imports: [
    TypeOrmModule.forFeature([
      TransformationHistoryItemEntity,
      ConvertedFileEntity,
    ]),
  ],
})
export class ConversionModule {}
