import { Injectable, Logger } from '@nestjs/common';
import { UUID } from 'node:crypto';
import type { RbacAudit } from '../../application/ports/audit.port';

export interface AuditLogPayload {
  actorUserId: UUID;
  operation: string;
  entity: string;
  status: number;
}

@Injectable()
export class AuditLogger implements RbacAudit {
  private readonly logger = new Logger('Audit');

  log(payload: AuditLogPayload): void {
    this.logger.log(JSON.stringify(payload));
  }
}
