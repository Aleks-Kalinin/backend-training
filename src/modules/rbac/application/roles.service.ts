import { AuditLogger } from '@/modules/rbac/infrastructure/logging/logAudit';
import {
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { UUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { Role } from '../infrastructure/entities/role.entity';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditLogger: AuditLogger,
  ) {}

  async findAll(): Promise<Role[]> {
    return this.roleRepository.find();
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.roleRepository.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }
    return role;
  }

  async create(createRoleDto: CreateRoleDto, actorUserId: UUID): Promise<Role> {
    const existingRole = await this.roleRepository.findOne({
      where: { name: createRoleDto.name },
    });

    if (existingRole) {
      throw new ConflictException(
        `Role with name ${createRoleDto.name} already exists`,
      );
    }

    const role = this.roleRepository.create(createRoleDto);
    const savedRole = await this.roleRepository.save(role);

    this.eventEmitter.emit('rbac.changed');

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
      const existingRole = await this.roleRepository.findOne({
        where: { name: updateRoleDto.name },
      });
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

    this.eventEmitter.emit('rbac.changed');

    this.auditLogger.log({
      actorUserId,
      operation: 'update',
      entity: 'role',
      status: HttpStatus.OK,
    });

    return updatedRole;
  }

  async remove(id: string, actorUserId: UUID): Promise<void> {
    const role = await this.roleRepository.findOne({
      where: { id },
      relations: ['grants'],
    });

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

    this.eventEmitter.emit('rbac.changed');
  }
}
