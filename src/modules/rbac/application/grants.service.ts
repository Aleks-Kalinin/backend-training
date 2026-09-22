import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { UUID } from 'node:crypto';
import { CreateGrantDto } from '../dto/create-grant.dto';
import { UpdateGrantDto } from '../dto/update-grant.dto';
import {
  GRANT_REPOSITORY,
  PERMISSION_REPOSITORY,
  ROLE_REPOSITORY,
} from './ports/rbac-repositories.port';
import type {
  GrantRepository,
  PermissionRepository,
  RoleRepository,
} from './ports/rbac-repositories.port';
import { RBAC_EVENTS } from './ports/rbac-events.port';
import type { RbacEvents } from './ports/rbac-events.port';
import { RBAC_AUDIT } from './ports/audit.port';
import type { RbacAudit } from './ports/audit.port';
import type {
  RbacGrant as Grant,
  RbacPermission as Permission,
  RbacRole as Role,
} from '../domain/rbac.models';

@Injectable()
export class GrantsService {
  private readonly logger = new Logger(GrantsService.name);
  constructor(
    @Inject(GRANT_REPOSITORY) private readonly grantRepository: GrantRepository,
    @Inject(ROLE_REPOSITORY) private readonly roleRepository: RoleRepository,
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissionRepository: PermissionRepository,
    @Inject(RBAC_EVENTS) private readonly eventEmitter: RbacEvents,
    @Inject(RBAC_AUDIT) private readonly auditLogger: RbacAudit,
  ) {}

  async findAll(): Promise<Grant[]> {
    return this.grantRepository.findAll();
  }

  async findOne(id: string, actorUserId: UUID): Promise<Grant> {
    const grant = await this.grantRepository.findById(id);

    if (!grant) {
      this.auditLogger.log({
        actorUserId,
        operation: 'read',
        entity: 'grant',
        status: HttpStatus.NOT_FOUND,
      });
      throw new NotFoundException('grant with id not found');
    }

    return grant;
  }

  async create(
    createGrantDto: CreateGrantDto,
    actorUserId: UUID,
  ): Promise<Grant> {
    const { roleId, permissionId, actions } = createGrantDto;

    const role = await this.roleRepository.findById(roleId);
    if (!role) {
      this.auditLogger.log({
        actorUserId,
        operation: 'create',
        entity: 'grant',
        status: HttpStatus.NOT_FOUND,
      });
      throw new NotFoundException(`Role with ID ${roleId} not found`);
    }

    const permission = await this.permissionRepository.findById(permissionId);
    if (!permission) {
      this.auditLogger.log({
        actorUserId,
        operation: 'create',
        entity: 'grant',
        status: HttpStatus.NOT_FOUND,
      });
      throw new NotFoundException(
        `Permission with ID ${permissionId} not found`,
      );
    }

    // Check for duplicate Grant (Role + Permission)
    const existingGrant = await this.grantRepository.findByRoleAndPermission(
      roleId,
      permissionId,
    );

    if (existingGrant) {
      this.auditLogger.log({
        actorUserId,
        operation: 'create',
        entity: 'grant',
        status: HttpStatus.CONFLICT,
      });
      throw new ConflictException(
        'A grant for this Role and Permission already exists',
      );
    }

    // Validate that requested actions are supported by the Permission
    if (actions && actions.length > 0) {
      const invalidActions = actions.filter(
        (act) => !permission.actions.includes(act),
      );
      if (invalidActions.length > 0) {
        this.auditLogger.log({
          actorUserId,
          operation: 'create',
          entity: 'grant',
          status: HttpStatus.BAD_REQUEST,
        });
        throw new BadRequestException(
          `Actions [${invalidActions.join(', ')}] are not valid for permission '${permission.name}'`,
        );
      }
    }

    const grant = this.grantRepository.create({
      role,
      permission,
      actions: actions && actions.length > 0 ? actions : null,
    });

    const savedGrant = await this.grantRepository.save(grant);
    this.eventEmitter.changed();
    this.auditLogger.log({
      actorUserId,
      operation: 'create',
      entity: 'grant',
      status: HttpStatus.OK,
    });

    return savedGrant;
  }

  async update(
    id: string,
    updateGrantDto: UpdateGrantDto,
    actorUserId: UUID,
  ): Promise<Grant> {
    const grant = await this.findOne(id, actorUserId);
    const { actions } = updateGrantDto;

    if (actions && actions.length > 0) {
      const invalidActions = actions.filter(
        (act) => !grant.permission.actions.includes(act),
      );
      if (invalidActions.length > 0) {
        this.auditLogger.log({
          actorUserId,
          operation: 'update',
          entity: 'grant',
          status: HttpStatus.BAD_REQUEST,
        });
        throw new BadRequestException(
          `Actions [${invalidActions.join(', ')}] are not valid for permission '${grant.permission.name}'`,
        );
      }
      grant.actions = actions;
    } else if (actions !== undefined) {
      grant.actions = null;
    }

    const updatedGrant = await this.grantRepository.save(grant);
    this.eventEmitter.changed();
    this.auditLogger.log({
      actorUserId,
      operation: 'update',
      entity: 'grant',
      status: HttpStatus.OK,
    });

    return updatedGrant;
  }

  async remove(id: string, actorUserId: UUID): Promise<void> {
    const grant = await this.findOne(id, actorUserId);
    await this.grantRepository.remove(grant);
    this.eventEmitter.changed();
    this.auditLogger.log({
      actorUserId,
      operation: 'delete',
      entity: 'grant',
      status: HttpStatus.OK,
    });
  }
}
