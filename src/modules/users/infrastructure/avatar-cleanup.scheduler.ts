import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AvatarCleanupService } from '../application/avatar-cleanup.service';

@Injectable()
export class AvatarCleanupScheduler {
  constructor(private readonly avatarCleanupService: AvatarCleanupService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryPendingCleanups() {
    await this.avatarCleanupService.retryPendingCleanups();
  }
}
