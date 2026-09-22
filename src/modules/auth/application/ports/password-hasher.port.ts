export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

export interface PasswordHasher {
  hash(value: string): Promise<string>;
  compare(value: string, hash: string): Promise<boolean>;
}
