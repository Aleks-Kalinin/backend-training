import { Module } from '@nestjs/common';
import { ConversionController } from './presentation/conversion.controller';
import { ConversionService } from './application/conversion.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { File } from './infrastructure/entity/file.entity';
import { TransformationHistoryItemEntity } from './infrastructure/entity/transformation-history-item.entity';

@Module({
  controllers: [ConversionController],
  providers: [ConversionService],
  exports: [ConversionService],
  imports: [TypeOrmModule.forFeature([File, TransformationHistoryItemEntity])],
})
export class ConversionModule {}
