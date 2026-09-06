import { AuthGuard } from '@/modules/auth/auth.guard';
import { RequirePermission } from '@/modules/rbac/presentation/decorators/require-permission.decorator';
import { RbacGuard } from '@/modules/rbac/rbac.guard';

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';

import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { SettingsService } from '../application/settings.service';
import { UpdateVerificationSettingsDto } from '../dto/settings.dto';

@ApiTags('Admin Settings')
@Controller('admin/settings')
@UseGuards(AuthGuard, RbacGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('verification')
  @RequirePermission('settings', 'read')
  @ApiOperation({
    summary: 'Get verification settings',
    description:
      'Retrieves the current verification settings for registration, password reset, and login.',
  })
  @ApiOkResponse({
    description: 'Verification settings retrieved successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'User is not authenticated.',
  })
  @ApiForbiddenResponse({
    description: 'User does not have permission to read settings.',
  })
  async getVerificationSettings() {
    return this.settingsService.getVerificationSettings();
  }

  @Patch('verification')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('settings', 'update')
  @ApiOperation({
    summary: 'Update verification settings',
    description:
      'Updates the verification settings that control whether verification is required for registration, password reset, and login.',
  })
  @ApiOkResponse({
    description: 'Verification settings updated successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'User is not authenticated.',
  })
  @ApiForbiddenResponse({
    description: 'User does not have permission to update settings.',
  })
  async updateVerificationSettings(@Body() dto: UpdateVerificationSettingsDto) {
    return this.settingsService.updateVerificationSettings(dto);
  }
}
