import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { PasswordHasher } from '../application/ports/password-hasher.port';

@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  hash(value: string): Promise<string> {
    return bcrypt.hash(value, 10);
  }

  compare(value: string, hash: string): Promise<boolean> {
    return bcrypt.compare(value, hash);
  }
}
