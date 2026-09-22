export const VERIFICATION_PASSWORD_HASHER = Symbol(
  'VERIFICATION_PASSWORD_HASHER',
);

export interface VerificationPasswordHasher {
  hash(value: string): Promise<string>;
  compare(value: string, hash: string): Promise<boolean>;
}
