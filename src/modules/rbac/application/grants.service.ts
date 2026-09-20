import { AuditLogger } from '@/modules/rbac/infrastructure/logging/logAudit';
import {
  BadRequestException,
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
import { CreateGrantDto } from '../dto/create-grant.dto';
import { UpdateGrantDto } from '../dto/update-grant.dto';
import { Grant } from '../infrastructure/entities/grant.entity';
import { Permission } from '../infrastructure/entities/permission.entity';
import { Role } from '../infrastructure/entities/role.entity';

@Injectable()
export class GrantsService {
  private readonly logger = new Logger(GrantsService.name);
  constructor(
    @InjectRepository(Grant)
    private readonly grantRepository: Repository<Grant>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditLogger: AuditLogger,
  ) {}

  async findAll(): Promise<Grant[]> {
    return this.grantRepository.find({ relations: ['role', 'permission'] });
  }

  async findOne(id: string, actorUserId: UUID): Promise<Grant> {
    const grant = await this.grantRepository.findOne({
      where: { id },
      relations: ['role', 'permission'],
    });

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

    const role = await this.roleRepository.findOne({ where: { id: roleId } });
    if (!role) {
      this.auditLogger.log({
        actorUserId,
        operation: 'create',
        entity: 'grant',
        status: HttpStatus.NOT_FOUND,
      });
      throw new NotFoundException(`Role with ID ${roleId} not found`);
    }

    const permission = await this.permissionRepository.findOne({
      where: { id: permissionId },
    });
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
    const existingGrant = await this.grantRepository.findOne({
      where: {
        role: { id: roleId },
        permission: { id: permissionId },
      },
    });

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
    this.eventEmitter.emit('rbac.changed');
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
    this.eventEmitter.emit('rbac.changed');
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
    this.eventEmitter.emit('rbac.changed');
    this.auditLogger.log({
      actorUserId,
      operation: 'delete',
      entity: 'grant',
      status: HttpStatus.OK,
    });
  }
}
