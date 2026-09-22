import { Injectable } from '@nestjs/common';
import type { VerificationRuntimeEnvironment } from '../application/ports/runtime-environment.port';

@Injectable()
export class NodeVerificationRuntimeEnvironment implements VerificationRuntimeEnvironment {
  isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }
}
