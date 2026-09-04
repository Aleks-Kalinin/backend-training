import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import { SettingsService } from '../application/settings.service';
import { UpdateVerificationSettingsDto } from '../dto/settings.dto';

@Controller('admin/settings')
// @UseGuards(AuthGuard, RolesGuard) // Restrict access to administrative roles
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('verification')
  async getVerificationSettings() {
    return this.settingsService.getVerificationSettings();
  }

  @Patch('verification')
  @HttpCode(HttpStatus.OK)
  async updateVerificationSettings(@Body() dto: UpdateVerificationSettingsDto) {
    return this.settingsService.updateVerificationSettings(dto);
  }
}
