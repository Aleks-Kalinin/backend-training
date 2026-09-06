import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Grant } from './infrastructure/entities/grant.entity';
import { Permission } from './infrastructure/entities/permission.entity';
import { Role } from './infrastructure/entities/role.entity';

import { GrantsController } from './presentation/grants.controller';
import { PermissionsController } from './presentation/permissions.controller';
import { RolesController } from './presentation/roles.controller';

import { GrantsService } from './application/grants.service';
import { PermissionsService } from './application/permissions.service';
import { RbacCacheService } from './application/rbac-cache.service';
import { RolesService } from './application/roles.service';
import { RbacGuard } from './rbac.guard';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission, Grant])],
  controllers: [RolesController, PermissionsController, GrantsController],
  providers: [
    RolesService,
    PermissionsService,
    GrantsService,
    RbacCacheService,
    RbacGuard,
  ],
  exports: [
    RbacCacheService,
    RbacGuard,
    RolesService,
    PermissionsService,
    GrantsService,
  ],
})
export class RbacModule {}
