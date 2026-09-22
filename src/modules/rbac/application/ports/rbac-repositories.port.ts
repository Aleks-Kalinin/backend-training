import { RbacGrant, RbacPermission, RbacRole } from '../../domain/rbac.models';

export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');
export const PERMISSION_REPOSITORY = Symbol('PERMISSION_REPOSITORY');
export const GRANT_REPOSITORY = Symbol('GRANT_REPOSITORY');

export interface RoleRepository {
  findAll(): Promise<RbacRole[]>;
  findById(id: string, withGrants?: boolean): Promise<RbacRole | null>;
  findByName(name: string): Promise<RbacRole | null>;
  create(data: Partial<RbacRole>): RbacRole;
  save(role: RbacRole): Promise<RbacRole>;
  remove(role: RbacRole): Promise<void>;
}

export interface PermissionRepository {
  findAll(): Promise<RbacPermission[]>;
  findById(id: string, withGrants?: boolean): Promise<RbacPermission | null>;
  findByName(name: string): Promise<RbacPermission | null>;
  save(
    permission: Partial<RbacPermission> | RbacPermission,
  ): Promise<RbacPermission>;
  remove(permission: RbacPermission): Promise<void>;
}

export interface GrantRepository {
  findAll(): Promise<RbacGrant[]>;
  findById(id: string): Promise<RbacGrant | null>;
  findByRoleAndPermission(
    roleId: string,
    permissionId: string,
  ): Promise<RbacGrant | null>;
  create(data: Partial<RbacGrant>): RbacGrant;
  save(grant: RbacGrant): Promise<RbacGrant>;
  remove(grant: RbacGrant): Promise<void>;
  findForCache(): Promise<
    Array<Pick<RbacGrant, 'actions' | 'role' | 'permission'>>
  >;
}
