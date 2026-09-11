import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConversionService } from '../application/conversion.service';
import { TextFileFormat } from '../domain/text-file-format.enum';
import { ImageFileFormat } from '../domain/image-file-format.enum';
import { type MultipartFile } from '@fastify/multipart';
import { ApiResponse } from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';

@Controller()
export class ConversionController {
  constructor(private readonly conversionService: ConversionService) {}

  @Post('api/convert')
  @ApiResponse({
    status: 200,
    description: 'File converted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid file format or size',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @ApiResponse({
    status: 413,
    description: 'File size exceeds limit',
  })
  @ApiResponse({
    status: 415,
    description: 'Unsupported file format',
  })
  async convertFile(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const file = await req.file();

    if (!file) {
      throw new BadRequestException('File is required');
    }

    const targetFormatField = file.fields['targetFormat'];

    if (
      !targetFormatField ||
      Array.isArray(targetFormatField) ||
      targetFormatField.type !== 'field'
    ) {
      throw new BadRequestException('targetFormat field is required');
    }

    const targetFormat = targetFormatField.value as TextFileFormat;

    if (!Object.values(TextFileFormat).includes(targetFormat)) {
      throw new UnsupportedMediaTypeException('Invalid target format');
    }

    const { content } = await this.conversionService.convertFile(
      file,
      targetFormat,
    );

    const contentTypeMap: Record<string, string> = {
      csv: 'text/csv',
      json: 'application/json',
      xml: 'application/xml',
      yaml: 'application/x-yaml',
    };
    reply
      .header(
        'Content-Type',
        contentTypeMap[targetFormat] ?? 'application/octet-stream',
      )
      .header(
        'Content-Disposition',
        `attachment; filename="converted.${targetFormat}"`,
      );

    return content;
  }

  @Get('api/convert/formats')
  @ApiResponse({
    status: 200,
    description: 'Available formats retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  async getAvailableFormats() {
    return [
      { source: 'csv', target: ['json', 'xml', 'yaml'] },
      { source: 'json', target: ['csv', 'xml', 'yaml'] },
      { source: 'xml', target: ['json', 'csv', 'yaml'] },
      { source: 'yaml', target: ['json', 'csv', 'xml'] },
    ];
  }
}
