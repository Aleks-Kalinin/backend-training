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
import { ApiResponse } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { RequirePermission } from '@/modules/rbac/presentation/decorators/require-permission.decorator';
import { RbacGuard } from '@/modules/rbac/rbac.guard';
import { AuthGuard } from '@/modules/auth/auth.guard';
import { FILE_TYPE } from '../application/constants/file-type';
import { AllowSelf } from '@/modules/rbac/presentation/decorators/allow-self.decorator';
import { type AuthenticatedRequest } from '@/modules/auth/dto/auth-request.dto';
import { type UUID } from 'node:crypto';

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

    const mimeTypes: Record<string, string> = {
      csv: 'text/csv',
      json: 'application/json',
      xml: 'application/xml',
      yaml: 'application/x-yaml',
    };

    reply
      .header(
        'Content-Type',
        mimeTypes[targetFormat] ?? 'application/octet-stream',
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
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid image format or size',
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
    description: 'Image size exceeds limit',
  })
  @ApiResponse({
    status: 415,
    description: 'Unsupported image format',
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

    const mimeTypes: Record<string, string> = {
      jpeg: 'image/jpeg',
      jpg: 'image/jpeg',
      png: 'image/png',
      svg: 'image/svg+xml',
    };

    reply
      .header(
        'Content-Type',
        mimeTypes[targetFormat] ?? 'application/octet-stream',
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
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
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
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
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
    status: 404,
    description: 'User not found',
  })
  @RequirePermission('history', 'read')
  getAllTransformationHistory(@Param('userId') userId: UUID) {
    return this.conversionService.getHistory(userId);
  }
}
