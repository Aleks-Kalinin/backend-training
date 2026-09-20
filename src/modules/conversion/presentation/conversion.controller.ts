import { AuthGuard } from '@/modules/auth/auth.guard';
import { type AuthenticatedRequest } from '@/modules/auth/dto/auth-request.dto';
import { AllowSelf } from '@/modules/rbac/presentation/decorators/allow-self.decorator';
import { RequirePermission } from '@/modules/rbac/presentation/decorators/require-permission.decorator';
import { RbacGuard } from '@/modules/rbac/rbac.guard';
import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { type UUID } from 'node:crypto';
import { FILE_TYPE } from '../application/constants/file-type';
import {
  IMAGE_MIME_TYPES,
  TEXT_MIME_TYPES,
} from '../application/constants/mime-types';
import { ConversionService } from '../application/conversion.service';
import { GetHistoryQueryDto } from '../dto/get-history-query.dto';

@ApiTags('Files conversion and download')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, RbacGuard)
export class ConversionController {
  constructor(private readonly conversionService: ConversionService) {}

  private setDownloadHeaders(
    reply: FastifyReply,
    targetFormat: string,
    itemId: UUID,
  ) {
    const ALL_MIME_TYPES = { ...TEXT_MIME_TYPES, ...IMAGE_MIME_TYPES };

    reply.header(
      'Content-Type',
      ALL_MIME_TYPES[targetFormat] ?? 'application/octet-stream',
    );
    reply.header(
      'Content-Disposition',
      `attachment; filename="file-${itemId}.${targetFormat}"`,
    );
  }

  @Post('api/convert')
  @ApiOperation({
    summary: 'Convert text file',
    description:
      'Uploads a text file (CSV, JSON, XML, YAML) via multipart/form-data and returns the converted content.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'targetFormat'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Text file to convert (csv, json, xml, yaml)',
        },
        targetFormat: {
          type: 'string',
          enum: ['csv', 'json', 'xml', 'yaml'],
          description: 'Target format for conversion',
        },
      },
    },
  })
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
    content: {
      'application/json': {
        example: { message: 'Unauthorized' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
    content: {
      'application/json': {
        example: { message: 'Forbidden' },
      },
    },
  })
  @ApiResponse({
    status: 413,
    description: 'File size exceeds limit',
    content: {
      'application/json': {
        example: { message: 'File size exceeds limit' },
      },
    },
  })
  @ApiResponse({
    status: 415,
    description: 'Unsupported file format',
    content: {
      'application/json': {
        example: { message: 'Unsupported file format' },
      },
    },
  })
  @RequirePermission('files', 'create')
  async convertText(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const userId = req.user?.sub;

    if (!userId) {
      throw new UnauthorizedException('User ID is required');
    }

    const { content, targetFormat } =
      await this.conversionService.convertMultipartRequest(
        req,
        FILE_TYPE.TEXT,
        userId,
      );

    reply
      .header(
        'Content-Type',
        TEXT_MIME_TYPES[targetFormat] ?? 'application/octet-stream',
      )
      .header(
        'Content-Disposition',
        `attachment; filename="converted.${targetFormat}"`,
      );

    return content;
  }

  @Get('api/convert/formats')
  @ApiOperation({
    summary: 'Get available text conversion formats',
    description: 'Returns supported source to target text format mappings.',
  })
  @ApiResponse({
    status: 200,
    description: 'Available formats retrieved successfully',
    content: {
      'application/json': {
        example: [
          { source: 'csv', target: ['json', 'xml', 'yaml'] },
          { source: 'json', target: ['csv', 'xml', 'yaml'] },
          { source: 'xml', target: ['json', 'csv', 'yaml'] },
          { source: 'yaml', target: ['json', 'csv', 'xml'] },
        ],
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    content: {
      'application/json': {
        example: { message: 'Unauthorized' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
    content: {
      'application/json': {
        example: { message: 'Forbidden' },
      },
    },
  })
  @RequirePermission('files', 'read')
  getAvailableFormats() {
    return [
      { source: 'csv', target: ['json', 'xml', 'yaml'] },
      { source: 'json', target: ['csv', 'xml', 'yaml'] },
      { source: 'xml', target: ['json', 'csv', 'yaml'] },
      { source: 'yaml', target: ['json', 'csv', 'xml'] },
    ];
  }

  @Post('api/images/convert')
  @ApiOperation({
    summary: 'Convert image file',
    description:
      'Uploads an image file (JPEG, PNG, SVG, JPG) via multipart/form-data and returns the converted image.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'targetFormat'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file to convert',
        },
        targetFormat: {
          type: 'string',
          enum: ['jpeg', 'png', 'svg', 'jpg'],
          description: 'Target image format',
        },
        width: {
          type: 'number',
          description: 'Optional width in pixels',
        },
        height: {
          type: 'number',
          description: 'Optional height in pixels',
        },
        quality: {
          type: 'number',
          description: 'Optional image quality percentage (1-100)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Image converted successfully',
    content: {
      'image/*': {
        example: Buffer.from('image'),
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid image format or size',
    content: {
      'application/json': {
        example: { message: 'Invalid image format or size' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    content: {
      'application/json': {
        example: { message: 'Unauthorized' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
    content: {
      'application/json': {
        example: { message: 'Forbidden' },
      },
    },
  })
  @ApiResponse({
    status: 413,
    description: 'Image size exceeds limit',
    content: {
      'application/json': {
        example: { message: 'Image size exceeds limit' },
      },
    },
  })
  @ApiResponse({
    status: 415,
    description: 'Unsupported image format',
    content: {
      'application/json': {
        example: { message: 'Unsupported image format' },
      },
    },
  })
  @RequirePermission('files', 'create')
  async convertImage(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const userId = req.user?.sub;

    if (!userId) {
      throw new UnauthorizedException('User ID is required');
    }

    const { content, targetFormat } =
      await this.conversionService.convertMultipartRequest(
        req,
        FILE_TYPE.IMAGE,
        userId,
      );

    reply
      .header(
        'Content-Type',
        IMAGE_MIME_TYPES[targetFormat] ?? 'application/octet-stream',
      )
      .header(
        'Content-Disposition',
        `attachment; filename="converted.${targetFormat}"`,
      );

    return content;
  }

  @Get('api/images/convert/formats')
  @ApiOperation({
    summary: 'Get available image conversion formats',
    description: 'Returns supported source to target image format mappings.',
  })
  @ApiResponse({
    status: 200,
    description: 'Available formats retrieved successfully',
    content: {
      'application/json': {
        example: [
          { source: 'jpeg', target: ['png', 'jpg'] },
          { source: 'png', target: ['jpeg', 'jpg'] },
          { source: 'svg', target: ['jpeg', 'png', 'jpg'] },
          { source: 'jpg', target: ['jpeg', 'png'] },
        ],
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    content: {
      'application/json': {
        example: { message: 'Unauthorized' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
    content: {
      'application/json': {
        example: { message: 'Forbidden' },
      },
    },
  })
  @RequirePermission('files', 'read')
  getAvailableImageFormats() {
    return [
      { source: 'jpeg', target: ['png', 'jpg'] },
      { source: 'png', target: ['jpeg', 'jpg'] },
      { source: 'svg', target: ['jpeg', 'png', 'jpg'] },
      { source: 'jpg', target: ['jpeg', 'png'] },
    ];
  }

  @Get('api/transformations/history')
  @ApiOperation({
    summary: 'Get transformation history',
    description:
      'Retrieves the list of previous file conversions performed by the logged-in user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Transformation history retrieved successfully',
    content: {
      'application/json': {
        example: [
          {
            id: '1',
            userId: 'user-id',
            format: 'csv',
            size: 1024,
            createdAt: '2022-01-01T00:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    content: {
      'application/json': {
        example: { message: 'Unauthorized' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
    content: {
      'application/json': {
        example: { message: 'Forbidden' },
      },
    },
  })
  @AllowSelf('userId')
  getTransformationHistory(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetHistoryQueryDto,
  ) {
    const userId = req.user?.sub;

    if (!userId) {
      throw new Error('User ID is required');
    }

    return this.conversionService.getHistory(userId, userId, query);
  }

  @Get('admin/users/:userId/transformations/history')
  @ApiOperation({
    summary: 'Get transformation history for specific user (Admin)',
    description:
      'Allows admin to view conversion history for a target user ID.',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID (UUID)',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Transformation history retrieved successfully',
    content: {
      'application/json': {
        example: [
          {
            id: '1',
            userId: 'user-id',
            format: 'csv',
            size: 1024,
            createdAt: '2022-01-01T00:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    content: {
      'application/json': {
        example: { message: 'Unauthorized' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
    content: {
      'application/json': {
        example: { message: 'Forbidden' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    content: {
      'application/json': {
        example: { message: 'User not found' },
      },
    },
  })
  @RequirePermission('history', 'read')
  getAllTransformationHistory(
    @Param('userId') userId: UUID,
    @Query() query: GetHistoryQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.conversionService.getHistory(userId, req.user?.sub, query);
  }

  @Get('api/transformations/history/:itemId/download')
  @ApiOperation({
    summary: 'Download self-transformed file',
    description:
      'Downloads a converted file from history by item ID for the current user.',
  })
  @ApiParam({
    name: 'itemId',
    description: 'Transformation history item UUID',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Transformation history retrieved successfully',
    content: {
      'application/octet-stream': {
        example: Buffer.from('file content'),
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    content: {
      'application/json': {
        example: { message: 'Unauthorized' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
    content: {
      'application/json': {
        example: { message: 'Forbidden' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Item not found',
    content: {
      'application/json': {
        example: { message: 'Item not found' },
      },
    },
  })
  @RequirePermission('files', 'read')
  @AllowSelf('userId')
  async downloadSelfTransformedFile(
    @Param('itemId') itemId: UUID,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User ID is required');
    }
    const { stream, targetFormat } =
      await this.conversionService.getFileForDownload(userId, itemId);

    this.setDownloadHeaders(reply, targetFormat, itemId);
    return stream;
  }

  @Get('admin/users/:userId/transformations/history/:itemId/download')
  @ApiOperation({
    summary: 'Download transformed file for any user (Admin)',
    description:
      'Allows admin to download a converted file from a specific user history item.',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID (UUID)',
    type: String,
    format: 'uuid',
  })
  @ApiParam({
    name: 'itemId',
    description: 'Transformation history item UUID',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Transformation history retrieved successfully',
    content: {
      'application/octet-stream': {
        example: Buffer.from('file content'),
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    content: {
      'application/json': {
        example: { message: 'Unauthorized' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
    content: {
      'application/json': {
        example: { message: 'Forbidden' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    content: {
      'application/json': {
        example: { message: 'User not found' },
      },
    },
  })
  @RequirePermission('history', 'read')
  async downloadAnyTransformationFile(
    @Param('userId') userId: UUID,
    @Param('itemId') itemId: UUID,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { stream, targetFormat } =
      await this.conversionService.getFileForDownload(userId, itemId);
    this.setDownloadHeaders(reply, targetFormat, itemId);
    return stream;
  }
}
