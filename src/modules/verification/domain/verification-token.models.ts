import type { VerificationTokenType } from './verification-token-type.enum';

export interface VerificationToken {
  verificationTokenId: string;
  userId: string;
  type: VerificationTokenType;
  targetEmail?: string | null;
  tokenHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface NewVerificationToken {
  userId: string;
  type: VerificationTokenType;
  targetEmail?: string;
  tokenHash: string;
  expiresAt: Date;
}
