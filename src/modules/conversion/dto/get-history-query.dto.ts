import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { FILE_CONVERSION_STATUS } from '../application/constants/file-conversion-status';
import { FILE_TYPE } from '../application/constants/file-type';
import { ImageFileFormat } from '../domain/image-file-format.enum';
import { TextFileFormat } from '../domain/text-file-format.enum';

export const ALLOWED_FORMAT = {
  ...ImageFileFormat,
  ...TextFileFormat,
};

export type ALLOWED_FORMAT = keyof typeof ALLOWED_FORMAT;

export class GetHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Cursor for pagination',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: FILE_TYPE,
    enumName: 'FileType',
    description: 'Filter by file type',
  })
  @IsOptional()
  @IsEnum(FILE_TYPE)
  type?: FILE_TYPE;

  @ApiPropertyOptional({ enum: ALLOWED_FORMAT })
  @IsOptional()
  @IsEnum(ALLOWED_FORMAT)
  sourceFormat?: ALLOWED_FORMAT;

  @ApiPropertyOptional({ enum: ALLOWED_FORMAT })
  @IsOptional()
  @IsEnum(ALLOWED_FORMAT)
  targetFormat?: ALLOWED_FORMAT;

  @ApiPropertyOptional({ enum: FILE_CONVERSION_STATUS })
  @IsOptional()
  @IsEnum(FILE_CONVERSION_STATUS)
  status?: FILE_CONVERSION_STATUS;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Filter by date',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdAtFrom?: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Filter by date',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdAtTo?: Date;
}
