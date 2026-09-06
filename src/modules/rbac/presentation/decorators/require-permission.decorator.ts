import { SetMetadata } from '@nestjs/common';

export const RBAC_REQUIREMENT_KEY = 'rbac_requirement';

export interface RbacRequirement {
  permission: string;
  action: string;
}

export const RequirePermission = (permission: string, action: string) =>
  SetMetadata(RBAC_REQUIREMENT_KEY, { permission, action });
