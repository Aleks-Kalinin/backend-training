import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Grant } from '../entities/grant.entity';
import { Permission } from '../entities/permission.entity';
import { Role } from '../entities/role.entity';
import {
  GrantRepository,
  PermissionRepository,
  RoleRepository,
} from '../../application/ports/rbac-repositories.port';
import { RbacGrant, RbacPermission, RbacRole } from '../../domain/rbac.models';

@Injectable()
export class TypeOrmRoleRepository implements RoleRepository {
  constructor(
    @InjectRepository(Role) private readonly repository: Repository<Role>,
  ) {}
  findAll() {
    return this.repository.find() as Promise<RbacRole[]>;
  }
  findById(id: string, withGrants = false) {
    return this.repository.findOne({
      where: { id },
      ...(withGrants ? { relations: ['grants'] } : {}),
    }) as Promise<RbacRole | null>;
  }
  findByName(name: string) {
    return this.repository.findOne({
      where: { name },
    }) as Promise<RbacRole | null>;
  }
  create(data: Partial<RbacRole>) {
    return this.repository.create(data) as RbacRole;
  }
  async save(role: RbacRole) {
    return this.repository.save(role as Role) as Promise<RbacRole>;
  }
  async remove(role: RbacRole) {
    await this.repository.remove(role as Role);
  }
}

@Injectable()
export class TypeOrmPermissionRepository implements PermissionRepository {
  constructor(
    @InjectRepository(Permission)
    private readonly repository: Repository<Permission>,
  ) {}
  findAll() {
    return this.repository.find() as Promise<RbacPermission[]>;
  }
  findById(id: string, withGrants = false) {
    return this.repository.findOne({
      where: { id },
      ...(withGrants ? { relations: ['grants'] } : {}),
    }) as Promise<RbacPermission | null>;
  }
  findByName(name: string) {
    return this.repository.findOne({
      where: { name },
    }) as Promise<RbacPermission | null>;
  }
  async save(permission: Partial<RbacPermission> | RbacPermission) {
    return this.repository.save(
      permission as Permission,
    ) as Promise<RbacPermission>;
  }
  async remove(permission: RbacPermission) {
    await this.repository.remove(permission as Permission);
  }
}

@Injectable()
export class TypeOrmGrantRepository implements GrantRepository {
  constructor(
    @InjectRepository(Grant) private readonly repository: Repository<Grant>,
  ) {}
  findAll() {
    return this.repository.find({
      relations: ['role', 'permission'],
    }) as Promise<RbacGrant[]>;
  }
  findById(id: string) {
    return this.repository.findOne({
      where: { id },
      relations: ['role', 'permission'],
    }) as Promise<RbacGrant | null>;
  }
  findByRoleAndPermission(roleId: string, permissionId: string) {
    return this.repository.findOne({
      where: { role: { id: roleId }, permission: { id: permissionId } },
    }) as Promise<RbacGrant | null>;
  }
  create(data: Partial<RbacGrant>) {
    return this.repository.create(data) as RbacGrant;
  }
  async save(grant: RbacGrant) {
    return this.repository.save(grant as Grant) as Promise<RbacGrant>;
  }
  async remove(grant: RbacGrant) {
    await this.repository.remove(grant as Grant);
  }
  findForCache() {
    return this.repository.find({
      relations: ['role', 'permission'],
    }) as Promise<Array<Pick<RbacGrant, 'actions' | 'role' | 'permission'>>>;
  }
}
