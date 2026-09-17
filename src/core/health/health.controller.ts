import { ConfigService } from '@/core/config/config.service';
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheck } from '@nestjs/terminus';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Check health status',
    description:
      'Performs health checks on system components including database and memory.',
  })
  @ApiResponse({
    status: 200,
    description: 'System health status retrieved successfully',
  })
  async check() {
    const healthCheckEnabled = this.configService.get('HEALTH_CHECK_ENABLED');

    if (!healthCheckEnabled) {
      return this.healthService.getEmptyResponse();
    }

    return this.healthService.checkHealth();
  }
}
