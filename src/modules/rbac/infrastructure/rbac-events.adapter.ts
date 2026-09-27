import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RbacEvents } from '../application/ports/rbac-events.port';

@Injectable()
export class RbacEventsAdapter implements RbacEvents {
  constructor(private readonly events: EventEmitter2) {}
  changed() {
    this.events.emit('rbac.changed');
  }
}
