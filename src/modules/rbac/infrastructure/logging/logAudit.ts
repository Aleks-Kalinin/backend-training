import { Injectable, Logger } from '@nestjs/common';
import { UUID } from 'node:crypto';

export interface AuditLogPayload {
  actorUserId: UUID;
  operation: string;
  entity: string;
  status: number;
}

@Injectable()
export class AuditLogger {
  private readonly logger = new Logger('Audit');

  log(payload: AuditLogPayload): void {
    this.logger.log(JSON.stringify(payload));
  }
}
