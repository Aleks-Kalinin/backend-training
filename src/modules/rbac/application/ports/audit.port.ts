import { UUID } from 'node:crypto';

export const RBAC_AUDIT = Symbol('RBAC_AUDIT');

export interface RbacAudit {
  log(payload: {
    actorUserId: UUID;
    operation: string;
    entity: string;
    status: number;
  }): void;
}
