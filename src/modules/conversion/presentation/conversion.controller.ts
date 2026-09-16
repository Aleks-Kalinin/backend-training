import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
  Param,
} from '@nestjs/common';
import { ConversionService } from '../application/conversion.service';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { RequirePermission } from '@/modules/rbac/presentation/decorators/require-permission.decorator';
import { RbacGuard } from '@/modules/rbac/rbac.guard';
import { AuthGuard } from '@/modules/auth/auth.guard';
import { FILE_TYPE } from '../application/constants/file-type';
import { AllowSelf } from '@/modules/rbac/presentation/decorators/allow-self.decorator';
import { type AuthenticatedRequest } from '@/modules/auth/dto/auth-request.dto';
import { type UUID } from 'node:crypto';
import {
  IMAGE_MIME_TYPES,
  TEXT_MIME_TYPES,
} from '../application/constants/mime-types';
import { ApiBearerAuth } from '@nestjs/swagger';

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
  getTransformationHistory(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.sub;

    if (!userId) {
      throw new Error('User ID is required');
    }

    return this.conversionService.getHistory(userId);
  }

  @Get('admin/users/:userId/transformations/history')
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
  getAllTransformationHistory(@Param('userId') userId: UUID) {
    return this.conversionService.getHistory(userId);
  }

  @Get('api/transformations/history/:itemId/download')
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
