import { Readable } from 'node:stream';
import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnsupportedMediaTypeException,
  PayloadTooLargeException,
  RequestTimeoutException,
  UseGuards,
} from '@nestjs/common';
import { ConversionService } from '../application/conversion.service';
import { TextFileFormat } from '../domain/text-file-format.enum';
import { type MultipartFile } from '@fastify/multipart';
import { ApiResponse } from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { RequirePermission } from '@/modules/rbac/presentation/decorators/require-permission.decorator';
import { RbacGuard } from '@/modules/rbac/rbac.guard';
import { AuthGuard } from '@/modules/auth/auth.guard';

@Controller()
@UseGuards(AuthGuard, RbacGuard)
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
  @RequirePermission('files', 'create')
  async convertFile(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    let rawFilePart: MultipartFile | undefined;
    let fileBuffer: Buffer | undefined;
    let targetFormat: TextFileFormat | undefined;

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        rawFilePart = part;
        try {
          fileBuffer = await part.toBuffer();
        } catch (err: any) {
          if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
            throw new PayloadTooLargeException('File size exceeds limit');
          }
          throw err;
        }
      } else if (part.fieldname === 'targetFormat') {
        targetFormat = part.value as TextFileFormat;
      }
    }

    if (!rawFilePart || !fileBuffer) {
      throw new BadRequestException('File is required');
    }

    if (!targetFormat) {
      throw new BadRequestException('targetFormat field is required');
    }

    if (fileBuffer?.length === 0) {
      throw new BadRequestException('File is empty');
    }

    if (!Object.values(TextFileFormat).includes(targetFormat)) {
      throw new UnsupportedMediaTypeException('Invalid target format');
    }

    // Reconstruct a valid MultipartFile object with preserved metadata and refreshed stream
    const file: MultipartFile = {
      ...rawFilePart,
      file: Readable.from(fileBuffer) as any,
      toBuffer: async () => Promise.resolve(fileBuffer),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    const contentTypeMap: Record<string, string> = {
      csv: 'text/csv',
      json: 'application/json',
      xml: 'application/xml',
      yaml: 'application/x-yaml',
    };

    try {
      const conversionPromise = this.conversionService.convertFile(
        file,
        targetFormat,
        controller.signal, // Pass signal to service
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(
            new RequestTimeoutException(
              'File conversion timed out after 30 seconds',
            ),
          );
        });
      });

      // Race the conversion against the 30-second abort signal
      const { content } = await Promise.race([
        conversionPromise,
        timeoutPromise,
      ]);

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
    } finally {
      clearTimeout(timeoutId); // Prevent memory leaks if task finishes before 30s
    }
  }

  @Get('api/convert/formats')
  @RequirePermission('files', 'read')
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
  getAvailableFormats() {
    return [
      { source: 'csv', target: ['json', 'xml', 'yaml'] },
      { source: 'json', target: ['csv', 'xml', 'yaml'] },
      { source: 'xml', target: ['json', 'csv', 'yaml'] },
      { source: 'yaml', target: ['json', 'csv', 'xml'] },
    ];
  }
}
