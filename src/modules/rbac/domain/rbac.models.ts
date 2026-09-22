export interface RbacRole {
  id: string;
  name: string;
  description: string;
  grants: RbacGrant[];
}

export interface RbacPermission {
  id: string;
  name: string;
  actions: string[];
  grants: RbacGrant[];
}

export interface RbacGrant {
  id: string;
  roleId: string;
  permissionId: string;
  role: RbacRole;
  permission: RbacPermission;
  actions: string[] | null;
}
