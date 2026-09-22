import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { VerificationPasswordHasher } from '../application/ports/password-hasher.port';

@Injectable()
export class BcryptVerificationPasswordHasher implements VerificationPasswordHasher {
  hash(value: string): Promise<string> {
    return bcrypt.hash(value, 10);
  }

  compare(value: string, hash: string): Promise<boolean> {
    return bcrypt.compare(value, hash);
  }
}
