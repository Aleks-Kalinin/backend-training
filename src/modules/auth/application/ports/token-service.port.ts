import { AuthTokenPayload, TokenPair } from '../../domain/auth.types';

export const AUTH_TOKEN_SERVICE = Symbol('AUTH_TOKEN_SERVICE');

export interface AuthTokenService {
  generateTokenPair(payload: AuthTokenPayload): Promise<TokenPair>;
  verifyRefreshToken(token: string): Promise<AuthTokenPayload>;
}
