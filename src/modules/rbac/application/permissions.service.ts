import {
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { UUID } from 'node:crypto';
import { CreatePermissionDto } from '../dto/create-permission.dto';
import { UpdatePermissionDto } from '../dto/update-permission.dto';
import { PERMISSION_REPOSITORY } from './ports/rbac-repositories.port';
import type { PermissionRepository } from './ports/rbac-repositories.port';
import { RBAC_EVENTS } from './ports/rbac-events.port';
import type { RbacEvents } from './ports/rbac-events.port';
import { RBAC_AUDIT } from './ports/audit.port';
import type { RbacAudit } from './ports/audit.port';
import type { RbacPermission as Permission } from '../domain/rbac.models';

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);
  constructor(
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissionRepository: PermissionRepository,
    @Inject(RBAC_EVENTS) private readonly eventEmitter: RbacEvents,
    @Inject(RBAC_AUDIT) private readonly auditLogger: RbacAudit,
  ) {}

  async findAll(): Promise<Permission[]> {
    return this.permissionRepository.findAll();
  }

  async findOne(id: string, actorUserId: UUID): Promise<Permission> {
    const permission = await this.permissionRepository.findById(id);
    if (!permission) {
      this.auditLogger.log({
        actorUserId,
        operation: 'read',
        entity: 'permission',
        status: HttpStatus.NOT_FOUND,
      });
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }
    return permission;
  }

  async create(
    createPermissionDto: CreatePermissionDto,
    actorUserId: UUID,
  ): Promise<Permission> {
    const existingPermission = await this.permissionRepository.findByName(
      createPermissionDto.name,
    );

    if (existingPermission) {
      this.auditLogger.log({
        actorUserId,
        operation: 'create',
        entity: 'permission',
        status: HttpStatus.CONFLICT,
      });

      throw new ConflictException(
        `Permission with name ${existingPermission.name} already exists`,
      );
    }

    const createdPermission =
      await this.permissionRepository.save(createPermissionDto);

    this.eventEmitter.changed();

    this.auditLogger.log({
      actorUserId,
      operation: 'create',
      entity: 'permission',
      status: HttpStatus.OK,
    });

    return createdPermission;
  }

  async update(
    id: string,
    updatePermissionDto: UpdatePermissionDto,
    actorUserId: UUID,
  ): Promise<Permission> {
    const permission = await this.findOne(id, actorUserId);

    if (
      updatePermissionDto.name &&
      updatePermissionDto.name !== permission.name
    ) {
      const existingPermission = await this.permissionRepository.findByName(
        updatePermissionDto.name,
      );

      if (existingPermission) {
        this.auditLogger.log({
          actorUserId,
          operation: 'update',
          entity: 'permission',
          status: HttpStatus.CONFLICT,
        });
        throw new ConflictException(
          `Permission with name ${updatePermissionDto.name} already exists`,
        );
      }
    }

    Object.assign(permission, updatePermissionDto);
    const updatedPermission = await this.permissionRepository.save(permission);

    this.eventEmitter.changed();

    this.auditLogger.log({
      actorUserId,
      operation: 'update',
      entity: 'permission',
      status: HttpStatus.OK,
    });

    return updatedPermission;
  }

  async remove(id: string, actorUserId): Promise<void> {
    const permission = await this.permissionRepository.findById(id, true);

    if (!permission) {
      this.auditLogger.log({
        actorUserId,
        operation: 'delete',
        entity: 'permission',
        status: HttpStatus.NOT_FOUND,
      });

      throw new NotFoundException(`Permission with ID ${id} not found`);
    }

    if (permission.grants && permission.grants.length > 0) {
      this.auditLogger.log({
        actorUserId,
        operation: 'delete',
        entity: 'permission',
        status: HttpStatus.CONFLICT,
      });

      throw new ConflictException(
        'Cannot delete permission that is currently granted to roles',
      );
    }

    await this.permissionRepository.remove(permission);

    this.eventEmitter.changed();

    this.auditLogger.log({
      actorUserId,
      operation: 'delete',
      entity: 'permission',
      status: HttpStatus.OK,
    });
  }
}
