import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Grant } from '../infrastructure/entities/grant.entity';

type PermissionMap = Record<string, string[] | '*'>;

type RbacCache = Record<string, PermissionMap>;

@Injectable()
export class RbacCacheService implements OnModuleInit {
  private readonly logger = new Logger(RbacCacheService.name);
  private cache!: RbacCache;

  constructor(
    @InjectRepository(Grant)
    private readonly grantRepository: Repository<Grant>,
  ) {}

  async onModuleInit() {
    await this.reloadCache();
  }

  @OnEvent('rbac.changed')
  async handleRbacChanged() {
    this.logger.log('RBAC mutation detected. Reloading in-memory cache...');
    await this.reloadCache();
  }

  private async reloadCache(): Promise<void> {
    try {
      const grants = await this.grantRepository.find({
        relations: ['role', 'permission'],
      });

      const newCache: RbacCache = {};

      for (const grant of grants) {
        const roleName = grant.role?.name;
        const permName = grant.permission?.name;

        if (!roleName || !permName) continue;

        if (!newCache[roleName]) {
          newCache[roleName] = {};
        }

        const actions =
          grant.actions && grant.actions.length > 0 ? grant.actions : '*';
        newCache[roleName][permName] = actions;
      }

      this.cache = newCache;
      this.logger.log(
        `RBAC cache updated successfully (${Object.keys(this.cache).length} roles cached).`,
      );
    } catch (error) {
      this.logger.error('Failed to reload RBAC cache', error);
    }
  }

  hasPermission(
    userRoles: string[],
    requiredPermission: string,
    requiredAction: string,
  ): boolean {
    if (!userRoles || userRoles.length === 0) return false;

    for (const roleName of userRoles) {
      const rolePermissions = this.cache[roleName];
      if (!rolePermissions) continue;

      const grantedActions = rolePermissions[requiredPermission];
      if (!grantedActions) continue;

      if (grantedActions === '*') return true;

      if (
        Array.isArray(grantedActions) &&
        grantedActions.includes(requiredAction)
      ) {
        return true;
      }
    }

    return false;
  }
}
