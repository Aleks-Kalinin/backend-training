import {
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { UUID } from 'node:crypto';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { ROLE_REPOSITORY } from './ports/rbac-repositories.port';
import type { RoleRepository } from './ports/rbac-repositories.port';
import { RBAC_EVENTS } from './ports/rbac-events.port';
import type { RbacEvents } from './ports/rbac-events.port';
import { RBAC_AUDIT } from './ports/audit.port';
import type { RbacAudit } from './ports/audit.port';
import type { RbacRole as Role } from '../domain/rbac.models';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roleRepository: RoleRepository,
    @Inject(RBAC_EVENTS) private readonly eventEmitter: RbacEvents,
    @Inject(RBAC_AUDIT) private readonly auditLogger: RbacAudit,
  ) {}

  async findAll(): Promise<Role[]> {
    return this.roleRepository.findAll();
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.roleRepository.findById(id);
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }
    return role;
  }

  async create(createRoleDto: CreateRoleDto, actorUserId: UUID): Promise<Role> {
    const existingRole = await this.roleRepository.findByName(
      createRoleDto.name,
    );

    if (existingRole) {
      throw new ConflictException(
        `Role with name ${createRoleDto.name} already exists`,
      );
    }

    const role = this.roleRepository.create(createRoleDto);
    const savedRole = await this.roleRepository.save(role);

    this.eventEmitter.changed();

    this.auditLogger.log({
      actorUserId,
      operation: 'create',
      entity: 'role',
      status: HttpStatus.CREATED,
    });

    return savedRole;
  }

  async update(
    id: string,
    updateRoleDto: UpdateRoleDto,
    actorUserId: UUID,
  ): Promise<Role> {
    const role = await this.findOne(id);

    // If changing name, ensure it remains unique
    if (updateRoleDto.name && updateRoleDto.name !== role.name) {
      const existingRole = await this.roleRepository.findByName(
        updateRoleDto.name,
      );
      if (existingRole) {
        this.auditLogger.log({
          actorUserId,
          operation: 'update',
          entity: 'role',
          status: HttpStatus.CONFLICT,
        });
        throw new ConflictException(
          `Role with name ${updateRoleDto.name} already exists`,
        );
      }
    }

    Object.assign(role, updateRoleDto);
    const updatedRole = await this.roleRepository.save(role);

    this.eventEmitter.changed();

    this.auditLogger.log({
      actorUserId,
      operation: 'update',
      entity: 'role',
      status: HttpStatus.OK,
    });

    return updatedRole;
  }

  async remove(id: string, actorUserId: UUID): Promise<void> {
    const role = await this.roleRepository.findById(id, true);

    if (!role) {
      this.auditLogger.log({
        actorUserId,
        operation: 'delete',
        entity: 'role',
        status: HttpStatus.NOT_FOUND,
      });
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    // Spec 1.3.2: Cannot delete a role if it has active grants
    if (role.grants && role.grants.length > 0) {
      this.auditLogger.log({
        actorUserId,
        operation: 'delete',
        entity: 'role',
        status: HttpStatus.CONFLICT,
      });
      throw new ConflictException(
        'Cannot delete role with active grants. Remove grants first.',
      );
    }

    await this.roleRepository.remove(role);

    this.auditLogger.log({
      actorUserId,
      operation: 'delete',
      entity: 'role',
      status: HttpStatus.OK,
    });

    this.eventEmitter.changed();
  }
}
