export const RBAC_EVENTS = Symbol('RBAC_EVENTS');

export interface RbacEvents {
  changed(): void;
}
