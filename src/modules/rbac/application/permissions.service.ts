import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePermissionDto } from '../dto/create-permission.dto';
import { UpdatePermissionDto } from '../dto/update-permission.dto';
import { Permission } from '../infrastructure/entities/permission.entity';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(): Promise<Permission[]> {
    return this.permissionRepository.find();
  }

  async findOne(id: string): Promise<Permission> {
    const permission = await this.permissionRepository.findOne({
      where: { id },
    });
    if (!permission) {
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }
    return permission;
  }

  async create(createPermissionDto: CreatePermissionDto): Promise<Permission> {
    const existingPermission = await this.permissionRepository.findOne({
      where: { name: createPermissionDto.name },
    });

    if (existingPermission) {
      throw new ConflictException(
        `Permission with name ${existingPermission.name} already exists`,
      );
    }

    const createdPermission =
      await this.permissionRepository.save(createPermissionDto);

    // Spec 1.2: Trigger cache reset whenever RBAC config changes
    this.eventEmitter.emit('rbac.changed');

    return createdPermission;
  }

  async update(
    id: string,
    updatePermissionDto: UpdatePermissionDto,
  ): Promise<Permission> {
    const permission = await this.findOne(id);

    if (
      updatePermissionDto.name &&
      updatePermissionDto.name !== permission.name
    ) {
      const existingPermission = await this.permissionRepository.findOne({
        where: { name: updatePermissionDto.name },
      });

      if (existingPermission) {
        throw new ConflictException(
          `Permission with name ${updatePermissionDto.name} already exists`,
        );
      }
    }

    Object.assign(permission, updatePermissionDto);
    const updatedPermission = await this.permissionRepository.save(permission);

    this.eventEmitter.emit('rbac.changed');

    return updatedPermission;
  }

  async remove(id: string): Promise<void> {
    const permission = await this.permissionRepository.findOne({
      where: { id },
      relations: ['grants'],
    });

    if (!permission) {
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }

    if (permission.grants && permission.grants.length > 0) {
      throw new ConflictException(
        'Cannot delete permission that is currently granted to roles',
      );
    }

    await this.permissionRepository.remove(permission);
    this.eventEmitter.emit('rbac.changed');
  }
}
