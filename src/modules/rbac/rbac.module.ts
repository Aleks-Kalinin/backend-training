import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GrantsService } from './application/grants.service';
import { PermissionsService } from './application/permissions.service';
import { RbacCacheService } from './application/rbac-cache.service';
import { RolesService } from './application/roles.service';
import { Grant } from './infrastructure/entities/grant.entity';
import { Permission } from './infrastructure/entities/permission.entity';
import { Role } from './infrastructure/entities/role.entity';
import { AuditLogger } from './infrastructure/logging/logAudit';
import { GrantsController } from './presentation/grants.controller';
import { PermissionsController } from './presentation/permissions.controller';
import { RolesController } from './presentation/roles.controller';
import { RbacGuard } from './rbac.guard';
import {
  GRANT_REPOSITORY,
  PERMISSION_REPOSITORY,
  ROLE_REPOSITORY,
} from './application/ports/rbac-repositories.port';
import { RBAC_EVENTS } from './application/ports/rbac-events.port';
import { RBAC_AUDIT } from './application/ports/audit.port';
import {
  TypeOrmGrantRepository,
  TypeOrmPermissionRepository,
  TypeOrmRoleRepository,
} from './infrastructure/repositories/typeorm-rbac.repositories';
import { RbacEventsAdapter } from './infrastructure/rbac-events.adapter';

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
    AuditLogger,
    { provide: ROLE_REPOSITORY, useClass: TypeOrmRoleRepository },
    { provide: PERMISSION_REPOSITORY, useClass: TypeOrmPermissionRepository },
    { provide: GRANT_REPOSITORY, useClass: TypeOrmGrantRepository },
    { provide: RBAC_EVENTS, useClass: RbacEventsAdapter },
    { provide: RBAC_AUDIT, useExisting: AuditLogger },
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
