import type {
  NewVerificationToken,
  VerificationToken,
} from '../../domain/verification-token.models';
import type { VerificationTokenType } from '../../domain/verification-token-type.enum';

export const VERIFICATION_REPOSITORY = Symbol('VERIFICATION_REPOSITORY');

export interface VerificationRepository {
  consumeActiveForUser(
    userId: string,
    type: VerificationTokenType,
    consumedAt: Date,
  ): Promise<void>;
  create(token: NewVerificationToken): Promise<VerificationToken>;
  findActive(
    attemptId: string,
    type: VerificationTokenType,
  ): Promise<VerificationToken | null>;
  save(token: VerificationToken): Promise<VerificationToken>;
}
